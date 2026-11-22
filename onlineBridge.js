// onlineBridge.js — Interactive online lobby & 2-device flow over Firebase RTDB (N13 RoomMultiplayerClient)
import { RoomMultiplayerClient } from "./roomClientAuto.js";

const room = new RoomMultiplayerClient();
let onlineEnabled = false;
let onlineRole = null; // "HOST" | "GUEST"
let peerJoined = false;
let pendingGuestMove = null;
let myMoveLocked = false;

function setLobbyMsg(text) {
  const el = document.getElementById("ntbOnlineMsg");
  if (el) el.textContent = text;
  const liveBanner = document.getElementById("ntbLiveBannerText");
  if (liveBanner) liveBanner.textContent = text;
}

function setBadge(text) {
  const el = document.getElementById("ntbRoomBadge");
  if (el) el.textContent = text;
}

function serializeGameState() {
  const g = window.G || {};
  return {
    mode: "online",
    difficulty: g.difficulty || "Medium",
    rosters: g.rosters,
    captain: g.captain,
    vice: g.vice,
    confirmed: g.confirmed,
    used: [Array.from(g.used?.[0] || []), Array.from(g.used?.[1] || [])],
    hp: g.hp,
    shield: g.shield,
    temp: g.temp,
    level: g.level,
    round: g.round,
    pick: g.pick,
    style: g.style,
    finished: Boolean(g.finished),
    reason: g.reason || "",
    currentPlayer: g.currentPlayer,
  };
}

function renderConnectedLobbyCard() {
  if (!onlineEnabled || !room.roomCode) return;
  const appEl = document.getElementById("app");
  if (!appEl) return;

  // Only show the pre-match lobby card on the initial menu screen so draft/leader/battle screens stay clean
  const hasStartBtn = Boolean(appEl.querySelector('button[onclick*="start("]'));
  if (!hasStartBtn) return;

  const isHost = onlineRole === "HOST";
  const statusLabel = peerJoined ? "OPPONENT CONNECTED" : "WAITING FOR OPPONENT";
  const actionBtnHtml = isHost
    ? `<button type="button" class="btn primary" id="ntbLaunchOnlineDraftBtn" style="width:100%;margin-top:10px;">START ONLINE MATCH (DRAFT TEAMS)</button>`
    : `<div class="panel" style="margin-top:10px;text-align:center;"><span class="tag">GUEST READY</span><p class="muted" style="margin-top:6px;">Connected to room <b>${room.roomCode}</b>. Waiting for Host to start the draft and send your team...</p></div>`;

  appEl.innerHTML = `
    <section class="page">
      <div class="hero">
        <div class="eyebrow">FIREBASE REALTIME ROOM</div>
        <h2 class="gold">ROOM ${room.roomCode}</h2>
        <p class="muted">Role: <b>${onlineRole}</b> · <span class="good">${statusLabel}</span></p>
      </div>
      <div class="panel" style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <b>MATCH CONNECTION</b>
          <span class="tag">${peerJoined ? "2/2 CONNECTED" : "1/2 WAITING"}</span>
        </div>
        <p id="ntbLiveBannerText" class="muted" style="margin-top:8px;">
          ${
            isHost
              ? (peerJoined
                  ? "Player 2 is in the room! Click below to configure match preset & selection mode."
                  : `Share room code <b>${room.roomCode}</b> with Player 2. You can start whenever ready.`)
              : `Joined room <b>${room.roomCode}</b>. Stay on this screen while Host sets up the draft.`
          }
        </p>
        ${actionBtnHtml}
        <button type="button" class="btn" id="ntbLeaveRoomBtn" style="width:100%;margin-top:8px;">LEAVE ROOM</button>
      </div>
    </section>
  `;

  const launchBtn = document.getElementById("ntbLaunchOnlineDraftBtn");
  if (launchBtn) {
    launchBtn.onclick = () => {
      if (typeof room.send === "function") {
        room.send({ type: "NTB_HOST_OPEN_DRAFT" });
      }
      if (typeof window.start === "function") {
        window.start("online", "Medium");
      }
    };
  }

  const leaveBtn = document.getElementById("ntbLeaveRoomBtn");
  if (leaveBtn) {
    leaveBtn.onclick = () => {
      room.disconnect();
      onlineEnabled = false;
      onlineRole = null;
      peerJoined = false;
      pendingGuestMove = null;
      myMoveLocked = false;
      if (typeof window.menu === "function") window.menu();
    };
  }
}

function ensureRoomPanel() {
  if (document.getElementById("ntbOnlineBox")) return;
  const appEl = document.getElementById("app");
  if (!appEl) return;

  const box = document.createElement("div");
  box.id = "ntbOnlineBox";
  box.className = "panel";
  box.style.marginTop = "12px";
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
      <b>ONLINE ROOM CODE (2 DEVICES)</b>
      <span id="ntbRoomBadge" class="tag">OFFLINE</span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
      <input id="ntbRoomInput" maxlength="8" placeholder="ROOM CODE" style="flex:1;min-width:120px;padding:10px;text-transform:uppercase;letter-spacing:2px;font-weight:700;background:#101827;color:#f5f7fb;border:1px solid #35445b;border-radius:8px;" />
      <button type="button" class="btn primary" id="ntbCreateBtn">CREATE ROOM</button>
      <button type="button" class="btn blue" id="ntbJoinBtn">JOIN ROOM</button>
    </div>
    <div id="ntbOnlineMsg" class="muted">Create a room as Player 1 (Host) or join with a code as Player 2 (Guest).</div>
  `;
  appEl.insertAdjacentElement("afterend", box);

  document.getElementById("ntbCreateBtn").onclick = async () => {
    try {
      const code = await room.createRoom(document.getElementById("ntbRoomInput").value.trim().toUpperCase() || null);
      onlineEnabled = true;
      onlineRole = room.role || "HOST";
      document.getElementById("ntbRoomInput").value = code;
      setBadge(`HOST · ${code}`);
      setLobbyMsg(`Room ${code} created! Share code with Player 2.`);
      renderConnectedLobbyCard();
      if (typeof room.loadState === "function") {
        const saved = await room.loadState();
        if (saved && saved.rosters && saved.rosters[0]?.length && !saved.finished) {
          if (confirm(`Resume saved online match in room ${code} (Round ${saved.round || 0}, Level ${saved.level || 1})?`)) {
            window.G = {
              ...window.G,
              ...saved,
              used: [new Set(saved.used?.[0] || []), new Set(saved.used?.[1] || [])],
              history: window.G?.history || [],
            };
            myMoveLocked = false;
            if (typeof window.battleScreen === "function") window.battleScreen(1, true);
          } else if (typeof room.clearState === "function") {
            await room.clearState();
          }
        }
      }
    } catch (e) {
      setLobbyMsg(e.message);
    }
  };

  document.getElementById("ntbJoinBtn").onclick = async () => {
    try {
      const code = document.getElementById("ntbRoomInput").value.trim().toUpperCase();
      await room.joinRoom(code);
      onlineEnabled = true;
      onlineRole = room.role || "GUEST";
      setBadge(`GUEST · ${code}`);
      setLobbyMsg(`Joined room ${code}! Waiting for Host to start match...`);
      room.send({ type: "NTB_GUEST_READY" });
      renderConnectedLobbyCard();
    } catch (e) {
      setLobbyMsg(e.message);
    }
  };
}

room.on("peer_connected", ({ transport } = {}) => {
  peerJoined = true;
  const code = room.roomCode || "";
  setBadge(`CONNECTED (${onlineRole || "PEER"} · ${transport || "firebase"})`);
  if (onlineRole === "GUEST") {
    room.send({ type: "NTB_GUEST_READY" });
  } else if (onlineRole === "HOST" && window.G?.confirmed?.[0]) {
    room.send({ type: "NTB_RESYNC", state: serializeGameState() });
  }
  renderConnectedLobbyCard();
  if (code) setLobbyMsg(`Connected in room ${code}.`);
});

room.on("peer_disconnected", () => {
  peerJoined = false;
  setBadge(`WAITING (${room.roomCode || "ROOM"})`);
  setLobbyMsg("Opponent disconnected. Waiting for reconnection...");
});

room.on("status", (st) => {
  if (st?.detail) setLobbyMsg(st.detail);
});

room.on("error", (err) => {
  if (err?.message) setLobbyMsg(err.message);
});

room.on("message", (msg) => {
  if (!msg || !msg.type || !window.G) return;

  if (msg.type === "NTB_GUEST_READY" && onlineRole === "HOST") {
    peerJoined = true;
    setLobbyMsg("Player 2 connected! Ready to start the online match.");
    renderConnectedLobbyCard();
  } else if (msg.type === "NTB_HOST_OPEN_DRAFT" && onlineRole === "GUEST") {
    const appEl = document.getElementById("app");
    if (appEl) {
      appEl.innerHTML = `
        <section class="page">
          <div class="hero">
            <div class="eyebrow">ROOM ${room.roomCode}</div>
            <h2 class="gold">HOST IS DRAFTING TEAMS</h2>
            <p class="muted">Choosing match preset &amp; selection mode. Your roster will appear as soon as Host confirms.</p>
          </div>
        </section>
      `;
    }
  } else if (msg.type === "NTB_RESYNC" && onlineRole === "GUEST" && msg.state) {
    const s = msg.state;
    window.G.mode = "online";
    window.G.rosters = s.rosters;
    window.G.captain = s.captain;
    window.G.vice = s.vice;
    window.G.confirmed = s.confirmed;
    window.G.used = [new Set(s.used?.[0] || []), new Set(s.used?.[1] || [])];
    window.G.hp = [...s.hp];
    window.G.shield = [...s.shield];
    window.G.temp = [...s.temp];
    window.G.level = s.level || 1;
    window.G.round = s.round || 0;
    window.G.finished = Boolean(s.finished);
    window.G.reason = s.reason || "";
    window.G.currentPlayer = 2;
    myMoveLocked = false;
    if (window.G.finished && typeof window.endScreen === "function") window.endScreen();
    else if (window.G.confirmed?.[1] && typeof window.battleScreen === "function") window.battleScreen(2, true);
    else if (typeof window.teamScreen === "function") window.teamScreen();
  } else if (msg.type === "NTB_TEAM_SYNC" && onlineRole === "GUEST") {
    window.G.mode = "online";
    window.G.rosters = msg.rosters;
    window.G.captain = msg.captain;
    window.G.vice = msg.vice;
    window.G.confirmed = [Boolean(msg.confirmed?.[0]), false];
    window.G.used = [new Set(msg.used?.[0] || []), new Set(msg.used?.[1] || [])];
    window.G.hp = [...msg.hp];
    window.G.shield = [...msg.shield];
    window.G.temp = [...msg.temp];
    window.G.level = msg.level || 1;
    window.G.round = msg.round || 0;
    window.G.history = [];
    window.G.finished = false;
    window.G.reason = "";
    window.G.currentPlayer = 2;
    if (typeof window.teamScreen === "function") window.teamScreen();
  } else if (msg.type === "NTB_START_BATTLE" && onlineRole === "GUEST") {
    window.G.captain = msg.captain;
    window.G.vice = msg.vice;
    window.G.confirmed = [true, true];
    window.G.currentPlayer = 2;
    myMoveLocked = false;
    if (typeof window.battleScreen === "function") window.battleScreen(2, true);
  } else if (msg.type === "NTB_GUEST_MOVE" && onlineRole === "HOST") {
    pendingGuestMove = msg.move;
    if (myMoveLocked && typeof window.resolveRound === "function") {
      window.G.pick[1] = pendingGuestMove.pick;
      window.G.style[1] = pendingGuestMove.style;
      pendingGuestMove = null;
      myMoveLocked = false;
      window.resolveRound();
    }
  } else if (msg.type === "NTB_ROUND_SYNC" && onlineRole === "GUEST") {
    window.G.hp = [...msg.hp];
    window.G.shield = [...msg.shield];
    window.G.temp = [...msg.temp];
    window.G.level = msg.level;
    window.G.round = msg.round;
    window.G.finished = Boolean(msg.finished);
    window.G.reason = msg.reason || "";
    window.G.used = [new Set(msg.used?.[0] || []), new Set(msg.used?.[1] || [])];
    myMoveLocked = false;
    if (window.G.finished && typeof window.endScreen === "function") {
      window.endScreen();
    } else if (typeof window.battleScreen === "function") {
      window.battleScreen(2, true);
    }
  }
});

function hookGameFunctions() {
  ensureRoomPanel();

  if (typeof window.confirmTeam === "function" && !window.confirmTeam._ntbHooked) {
    const origConfirmTeam = window.confirmTeam;
    const wrappedConfirm = function (p) {
      if (!onlineEnabled) return origConfirmTeam.apply(this, arguments);
      const i = p - 1;
      if (!window.G.captain[i] || !window.G.vice[i]) {
        const m = document.getElementById("msg");
        if (m) m.textContent = "Choose both roles first.";
        return;
      }
      if (window.G.captain[i] === window.G.vice[i]) return;
      window.G.confirmed[i] = true;

      if (onlineRole === "HOST") {
        room.send({
          type: "NTB_TEAM_SYNC",
          rosters: window.G.rosters,
          captain: window.G.captain,
          vice: window.G.vice,
          confirmed: window.G.confirmed,
          used: [Array.from(window.G.used[0] || []), Array.from(window.G.used[1] || [])],
          hp: window.G.hp,
          shield: window.G.shield,
          temp: window.G.temp,
          level: window.G.level,
          round: window.G.round,
        });
        if (typeof room.saveState === "function") room.saveState(serializeGameState());
        setLobbyMsg("Team synced to Player 2! Waiting for Player 2 to confirm leaders...");
      } else {
        room.send({ type: "NTB_START_BATTLE", captain: window.G.captain, vice: window.G.vice });
        window.G.currentPlayer = 2;
        if (typeof window.battleScreen === "function") window.battleScreen(2, true);
      }
    };
    wrappedConfirm._ntbHooked = true;
    window.confirmTeam = wrappedConfirm;
  }

  if (typeof window.lockBattle === "function" && !window.lockBattle._ntbHooked) {
    const origLockBattle = window.lockBattle;
    const wrappedLock = function (p) {
      if (!onlineEnabled) return origLockBattle.apply(this, arguments);
      if (!window.G.pick[p - 1]) {
        const m = document.getElementById("msg");
        if (m) m.textContent = "Choose a fighter first.";
        return;
      }
      myMoveLocked = true;

      if (onlineRole === "HOST") {
        if (pendingGuestMove) {
          window.G.pick[1] = pendingGuestMove.pick;
          window.G.style[1] = pendingGuestMove.style;
          pendingGuestMove = null;
          myMoveLocked = false;
          window.resolveRound();
        } else {
          setLobbyMsg("Move locked! Waiting for Player 2's move...");
        }
      } else {
        room.send({ type: "NTB_GUEST_MOVE", move: { pick: window.G.pick[1], style: window.G.style[1] } });
        setLobbyMsg("Move sent to Host! Waiting for round resolution...");
      }
    };
    wrappedLock._ntbHooked = true;
    window.lockBattle = wrappedLock;
  }

  if (typeof window.resolveRound === "function" && !window.resolveRound._ntbHooked) {
    const origResolveRound = window.resolveRound;
    const wrappedResolve = function () {
      const res = origResolveRound.apply(this, arguments);
      if (onlineEnabled && onlineRole === "HOST" && window.G) {
        room.send({
          type: "NTB_ROUND_SYNC",
          hp: window.G.hp,
          shield: window.G.shield,
          temp: window.G.temp,
          level: window.G.level,
          round: window.G.round,
          finished: window.G.finished,
          reason: window.G.reason,
          used: [Array.from(window.G.used[0] || []), Array.from(window.G.used[1] || [])],
        });
        if (window.G.finished && typeof room.clearState === "function") {
          room.clearState();
        } else if (typeof room.saveState === "function") {
          room.saveState(serializeGameState());
        }
      }
      return res;
    };
    wrappedResolve._ntbHooked = true;
    window.resolveRound = wrappedResolve;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  hookGameFunctions();
  const obs = new MutationObserver(() => hookGameFunctions());
  obs.observe(document.body, { childList: true, subtree: true });
});
