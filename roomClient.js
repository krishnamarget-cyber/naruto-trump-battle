// roomClient.js — Zero-Config Room Code Online Multiplayer Client (PeerJS + BroadcastChannel fallback)
// Enables two devices (or two browser tabs) to join via a short 6-character Room Code without running a custom backend.

const PEERJS_CDN = "https://esm.sh/peerjs@1.5.4";

// ---------------------------------------------------------------------------
// ICE servers (needed for players far apart / behind different routers).
// Passing a custom `config` REPLACES PeerJS's built-in list, so the public
// PeerJS TURN relay is repeated here. It is a free shared relay and can be
// slow or down, so for reliable long-distance play add your own free TURN
// credentials (e.g. Metered Open Relay or Cloudflare Calls) BEFORE this
// module loads, in index.html:
//   <script>window.NTB_ICE_SERVERS = [{ urls: "turn:...", username: "...", credential: "..." }];</script>
// ---------------------------------------------------------------------------
const BASE_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  {
    urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"],
    username: "peerjs",
    credential: "peerjsp",
  },
];

function peerOptions(extra = {}) {
  const custom = Array.isArray(globalThis.NTB_ICE_SERVERS) ? globalThis.NTB_ICE_SERVERS : [];
  return { debug: 0, config: { iceServers: [...custom, ...BASE_ICE_SERVERS] }, ...extra };
}

const CONNECT_TIMEOUT_MS = 20000;
const PING_INTERVAL_MS = 5000;
const PEER_SILENCE_MS = 20000;

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoids confusing 0/O/1/I
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export class RoomMultiplayerClient {
  constructor() {
    this.role = null; // "HOST" | "GUEST"
    this.roomCode = null;
    this.peer = null;
    this.conn = null;
    this.channel = null;
    this.connected = false;
    this._handlers = new Map();
    this._remotePeerId = null;
  }

  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this._handlers.get(event)?.delete(fn);
  }

  _emit(event, payload) {
    this._handlers.get(event)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[RoomClient] handler error for ${event}:`, err);
      }
    });
  }

  _bindChannel(code) {
    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.channel = new BroadcastChannel(`ntb_room_${code}`);
        this.channel.onmessage = (ev) => {
          const msg = ev.data;
          if (!msg || msg.senderRole === this.role) return;
          if (msg.type === "__PEER_HELLO__") {
            if (!this.connected) {
              this.channel.postMessage({ type: "__PEER_HELLO__", senderRole: this.role });
              this.connected = true;
              this._emit("peer_connected", { transport: "broadcast" });
            }
            return;
          }
          if (!this.connected) {
            this.connected = true;
            this._emit("peer_connected", { transport: "broadcast" });
          }
          this._emit("message", msg.payload);
        };
        this.channel.postMessage({ type: "__PEER_HELLO__", senderRole: this.role });
      } catch {
        // BroadcastChannel optional
      }
    }
  }

  async _loadPeerClass() {
    const mod = await import(PEERJS_CDN);
    return mod.Peer || mod.default;
  }

  async createRoom(customCode = null) {
    this.disconnect();
    this.role = "HOST";
    this.roomCode = (customCode || generateRoomCode()).trim().toUpperCase();
    const peerId = `ntb26-${this.roomCode}`;

    this._bindChannel(this.roomCode);

    try {
      const PeerClass = await this._loadPeerClass();
      this.peer = new PeerClass(peerId, peerOptions());

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Signaling server timed out (local/offline fallback ready)")), 7000);
        this.peer.on("open", () => {
          clearTimeout(timer);
          resolve();
        });
        this.peer.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      this.peer.on("connection", (conn) => {
        this._attachDataConnection(conn);
      });

      this.peer.on("disconnected", () => {
        this._emit("status", { state: "reconnecting", detail: "Signaling disconnected; reconnecting..." });
        setTimeout(() => {
          try { if (this.peer && this.peer.disconnected && !this.peer.destroyed) this.peer.reconnect(); } catch {}
        }, 1000);
      });

      this.peer.on("error", (err) => {
        this._emit("error", { message: err?.message || "Peer connection error", nonFatal: true });
      });
    } catch (err) {
      if (err?.type === "unavailable-id") {
        this.disconnect();
        throw new Error(`Room code ${this.roomCode} is already in use. Pick another code.`);
      }
      // Non-fatal: same-device/tab BroadcastChannel still works even offline or behind strict NAT
      this._emit("status", {
        state: "local_ready",
        detail: `Room ${this.roomCode} ready (${err?.message || "local sync mode"}).`,
      });
    }

    return this.roomCode;
  }

  async joinRoom(code) {
    this.disconnect();
    this.role = "GUEST";
    this.roomCode = String(code || "").trim().toUpperCase();
    if (!this.roomCode || this.roomCode.length < 3) {
      throw new Error("Please enter a valid Room Code.");
    }

    const hostPeerId = `ntb26-${this.roomCode}`;
    this._bindChannel(this.roomCode);

    try {
      const PeerClass = await this._loadPeerClass();
      this.peer = new PeerClass(undefined, peerOptions());

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Host lookup timed out")), 8000);
        this.peer.on("open", () => {
          clearTimeout(timer);
          resolve();
        });
        this.peer.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      this.peer.on("error", (e) => {
        this._emit("error", {
          message: e?.type === "peer-unavailable" ? `Room ${this.roomCode} not found. Check the code and make sure the host created it.` : (e?.message || "Peer error"),
          nonFatal: false,
        });
      });
      const conn = this.peer.connect(hostPeerId, { reliable: true });
      this._attachDataConnection(conn);
      this._connectTimer = setTimeout(() => {
        if (!this.connected) {
          this._emit("error", {
            message: "Could not establish a connection to the host. Check the code, then try again. Strict mobile/corporate networks may block peer-to-peer; try another network or add a TURN server.",
            nonFatal: false,
          });
        }
      }, CONNECT_TIMEOUT_MS);
    } catch (err) {
      if (!this.connected) {
        this._emit("status", {
          state: "waiting_host",
          detail: `Joined room ${this.roomCode}. Waiting for host connection...`,
        });
      }
    }

    return this.roomCode;
  }

  _attachDataConnection(conn) {
    this.conn = conn;
    this._remotePeerId = conn.peer;

    conn.on("open", () => {
      clearTimeout(this._connectTimer);
      this.connected = true;
      this._startHeartbeat();
      this._emit("peer_connected", { transport: "webrtc", peer: conn.peer });
    });

    conn.on("data", (data) => {
      this._lastSeen = Date.now();
      if (data && data.type === "__PING__") return;
      if (data && typeof data === "object") {
        this._emit("message", data);
      }
    });

    conn.on("close", () => {
      this._stopHeartbeat();
      this.connected = false;
      this._emit("peer_disconnected", { peer: conn.peer });
    });

    conn.on("error", (err) => {
      this._emit("error", { message: err?.message || "Data channel error", nonFatal: true });
    });
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._lastSeen = Date.now();
    this._pingTimer = setInterval(() => {
      if (this.conn && this.conn.open) {
        try { this.conn.send({ type: "__PING__" }); } catch {}
      }
      if (this.connected && Date.now() - this._lastSeen > PEER_SILENCE_MS) {
        this.connected = false;
        this._stopHeartbeat();
        this._emit("peer_disconnected", { peer: this._remotePeerId, reason: "timeout" });
      }
    }, PING_INTERVAL_MS);
  }

  _stopHeartbeat() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._pingTimer = null;
  }

  send(payload) {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(payload);
      } catch (err) {
        console.error("[RoomClient] WebRTC send failed:", err);
      }
    }
    if (this.channel) {
      try {
        this.channel.postMessage({ senderRole: this.role, payload });
      } catch {
        // ignore closed channel
      }
    }
  }

  disconnect() {
    this._stopHeartbeat();
    clearTimeout(this._connectTimer);
    this.connected = false;
    if (this.conn) {
      try {
        this.conn.close();
      } catch {}
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
    if (this.channel) {
      try {
        this.channel.close();
      } catch {}
      this.channel = null;
    }
  }
}
