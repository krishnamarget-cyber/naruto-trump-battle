// roomClientFirebase.js — room-code multiplayer over Firebase Realtime Database (free Spark plan).
// Same public API as roomClient.js: on/off, createRoom, joinRoom, send, disconnect, role, roomCode, connected.
// All traffic goes through Google's servers, so NAT / firewalls / distance do not matter.

const FIREBASE_VERSION = "10.12.2";
const CODE_RE = /^[A-Z0-9]{3,8}$/;

// Stable per-browser id: lets a refreshed tab reclaim its own seat in a room.
function getSessionId() {
  try {
    let sid = localStorage.getItem("ntb_sid");
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("ntb_sid", sid);
    }
    return sid;
  } catch {
    globalThis.__ntbSid ??= Math.random().toString(36).slice(2) + Date.now().toString(36);
    return globalThis.__ntbSid;
  }
}

const STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function loadFirebaseBackend(config) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const fb = await import(`${base}/firebase-database.js`);
  const db = fb.getDatabase(initializeApp(config));
  return {
    ref: (path) => fb.ref(db, path),
    get: fb.get, set: fb.set, push: fb.push, remove: fb.remove,
    onValue: fb.onValue, onChildAdded: fb.onChildAdded, onDisconnect: fb.onDisconnect,
  };
}

export class FirebaseRoomClient {
  constructor({ backend = null, config = globalThis.NTB_FIREBASE_CONFIG, sid = null } = {}) {
    this.backend = backend;
    this.config = config;
    this.role = null;
    this.roomCode = null;
    this.connected = false;
    this._handlers = new Map();
    this._unsubs = [];
    this._seen = new Set();
    this._myRef = null;
    this.sid = sid || getSessionId();
  }

  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) { this._handlers.get(event)?.delete(fn); }
  _emit(event, payload) {
    this._handlers.get(event)?.forEach((fn) => {
      try { fn(payload); } catch (err) { console.error(`[FirebaseRoom] handler error for ${event}:`, err); }
    });
  }

  async _getBackend() {
    if (!this.backend) {
      if (!this.config || !this.config.databaseURL) {
        throw new Error("Firebase is not configured. Fill in firebase-config.js (see SETUP_FIREBASE.md).");
      }
      this.backend = await loadFirebaseBackend(this.config);
    }
    return this.backend;
  }

  _normalizeCode(code) {
    const c = String(code || "").trim().toUpperCase();
    if (!CODE_RE.test(c)) throw new Error("Room code must be 3-8 letters/numbers (A-Z, 0-9).");
    return c;
  }

  async createRoom(customCode = null) {
    this.disconnect();
    const b = await this._getBackend();
    const code = this._normalizeCode(customCode || generateRoomCode());
    const host = await b.get(b.ref(`nweb098_rooms/${code}/host`));
    if (host.exists() && host.val()?.sid !== this.sid) {
      throw new Error(`Room code ${code} is already in use. Pick another code.`);
    }
    if (!host.exists()) {
      // Free code. Keep it untouched only if it holds MY saved match; otherwise clear stale leftovers.
      const st = await b.get(b.ref(`nweb098_rooms/${code}/state`));
      const v = st.exists() ? st.val() : null;
      const mine = v && v.sid === this.sid && Date.now() - (v.t || 0) < STATE_MAX_AGE_MS;
      if (!mine) await b.remove(b.ref(`nweb098_rooms/${code}`));
    }
    this.role = "HOST";
    this.roomCode = code;
    await this._attach(b);
    return code;
  }

  async joinRoom(code) {
    this.disconnect();
    const b = await this._getBackend();
    const c = this._normalizeCode(code);
    const host = await b.get(b.ref(`nweb098_rooms/${c}/host`));
    if (!host.exists()) throw new Error(`Room ${c} not found. Check the code and make sure the host created it.`);
    const guest = await b.get(b.ref(`nweb098_rooms/${c}/guest`));
    if (guest.exists() && guest.val()?.sid !== this.sid) {
      throw new Error(`Room ${c} already has two players. If you just lost connection, wait about a minute and try again.`);
    }
    this.role = "GUEST";
    this.roomCode = c;
    await this._attach(b);
    return c;
  }

  async _attach(b) {
    const code = this.roomCode;
    const mine = this.role === "HOST" ? "host" : "guest";
    const other = this.role === "HOST" ? "guest" : "host";
    const myRef = b.ref(`nweb098_rooms/${code}/${mine}`);
    const otherRef = b.ref(`nweb098_rooms/${code}/${other}`);
    const msgsRef = b.ref(`nweb098_rooms/${code}/msgs`);
    this._myRef = myRef;
    this._b = b;
    this._seen = new Set();

    // Ignore anything already in the mailbox when we arrive.
    const existing = await b.get(msgsRef);
    existing.forEach((child) => { this._seen.add(child.key); });

    // Presence: (re)announce on every (re)connection; the server removes it if we vanish.
    const announce = async () => {
      try {
        await b.onDisconnect(myRef).remove();
        await b.set(myRef, { t: Date.now(), sid: this.sid });
      } catch (err) {
        this._emit("error", { message: err?.message || "Could not announce presence", nonFatal: true });
      }
    };
    this._unsubs.push(
      b.onValue(b.ref(".info/connected"), (snap) => {
        if (snap.val() === true) announce();
        else this._emit("status", { state: "reconnecting", detail: "Connection to the game server lost; reconnecting..." });
      })
    );

    // Opponent presence -> connect / disconnect events.
    this._unsubs.push(
      b.onValue(otherRef, (snap) => {
        const present = snap.exists();
        if (present && !this.connected) {
          this.connected = true;
          this._emit("peer_connected", { transport: "firebase" });
        } else if (!present && this.connected) {
          this.connected = false;
          this._emit("peer_disconnected", { reason: "left" });
        }
      })
    );

    // Mailbox: deliver opponent's messages once, then delete them.
    this._unsubs.push(
      b.onChildAdded(msgsRef, (snap) => {
        if (this._seen.has(snap.key)) return;
        this._seen.add(snap.key);
        const v = snap.val();
        if (!v || v.from === this.role) return;
        Promise.resolve(b.remove(snap.ref)).catch(() => {});
        let payload;
        try { payload = JSON.parse(v.p); } catch { return; }
        if (payload && typeof payload === "object") this._emit("message", payload);
      })
    );
  }

  // ---- Saved match (host only) so a refresh / crash can resume ----
  async saveState(obj) {
    if (!this._b || !this.roomCode || this.role !== "HOST") return;
    try {
      await this._b.set(this._b.ref(`nweb098_rooms/${this.roomCode}/state`), {
        sid: this.sid, t: Date.now(), p: JSON.stringify(obj),
      });
    } catch (err) {
      this._emit("error", { message: err?.message || "Could not save match state", nonFatal: true });
    }
  }

  async loadState() {
    if (!this._b || !this.roomCode || this.role !== "HOST") return null;
    try {
      const snap = await this._b.get(this._b.ref(`nweb098_rooms/${this.roomCode}/state`));
      if (!snap.exists()) return null;
      const v = snap.val();
      if (!v || v.sid !== this.sid || Date.now() - (v.t || 0) > STATE_MAX_AGE_MS) return null;
      return JSON.parse(v.p);
    } catch {
      return null;
    }
  }

  async clearState() {
    if (!this._b || !this.roomCode || this.role !== "HOST") return;
    try { await this._b.remove(this._b.ref(`nweb098_rooms/${this.roomCode}/state`)); } catch {}
  }

  send(payload) {
    if (!this._b || !this.roomCode) return;
    const text = JSON.stringify(payload);
    if (text.length > 60000) {
      this._emit("error", { message: "Message too large to send.", nonFatal: true });
      return;
    }
    Promise.resolve(
      this._b.push(this._b.ref(`nweb098_rooms/${this.roomCode}/msgs`), { from: this.role, p: text, t: Date.now() })
    ).catch((err) => this._emit("error", { message: err?.message || "Send failed", nonFatal: true }));
  }

  disconnect() {
    for (const u of this._unsubs) { try { u(); } catch {} }
    this._unsubs = [];
    if (this._b && this._myRef) Promise.resolve(this._b.remove(this._myRef)).catch(() => {});
    this._myRef = null;
    this.connected = false;
    this.role = null;
    this.roomCode = null;
  }
}
