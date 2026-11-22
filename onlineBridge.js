// onlineBridge.js — Room-code online multiplayer bridge for Naruto Trump Battle (120 cards)
import { RoomMultiplayerClient } from "./roomClientAuto.js";

const room = new RoomMultiplayerClient();
let onlineEnabled = false;
let onlineRole = null; // "HOST" | "GUEST"
let pendingGuestMove = null;
let myMoveLocked = false;

function setLobbyMsg(text) {
  const el = document.getElementById("ntbOnlineMsg");
  if (el) el.textContent = text;
  const inlineStatus = document.getElementById("ntbInlineOnlineBanner");
  if (inlineStatus) inlineStatus.textContent = text;
}

function setBadge(text) {
  const el = document.getElementById("ntbRoomBadge");
  if (el) el.textContent = text;
}

function renderInlineOnlineBanner() {
  if (!onlineEnabled) return "";
  const code = room.roomCode || "";
  const roleTxt = onlineRole || "PEER";
  const statusTxt = document.getElementById("ntbOnlineMsg")?.textContent || `Online Room ${code} (${roleTxt})`;
  return `<div id="ntbInlineOnlineBanner" class="panel" style="border-color:#2563eb;background:#10223d;font-size:12px;color:#dbeafe;margin-bottom:10px;">🌐 ONLINE ROOM <b>${code}</b> (${roleTxt}) · ${statusTxt}</div>`;
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
      if (window.G) window.G.mode = "online";
      document.getElementById("ntbRoomInput").value = code;
      setBadge(`HOST · ${code}`);
      setLobbyMsg(`Room ${code} created! Share code with Player 2, then pick a match mode.`);
      if (typeof room.loadState === "function") {
        const saved = await room.loadState();
        if (saved && saved.rosters && saved.rosters[0]?.length && !saved.finished) {
          if (confirm(`Resume saved online match in room ${code} (Round ${saved.round || 0}, Level ${saved.level || 1})?`)) {
            window.G = {
              ...window.G,
              ...saved,
              mode: "online",
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
      if (window.G) window.G.mode = "online";
      setBadge(`GUEST · ${code}`);
      setLobbyMsg(`Joined room ${code}! Waiting for Host to draft & sync teams...`);
      room.send({ type: "NTB_GUEST_READY" });
    } catch (e) {
      setLobbyMsg(e.message);
    }
  };
}

room.on("peer_connected", ({ transport } = {}) => {
  const code = room.roomCode || "";
  setBadge(`CONNECTED (${onlineRole || "PEER"} · ${transport || "firebase"})`);
  if (onlineRole === "GUEST") {
    room.send({ type: "NTB_GUEST_READY" });
  } else if (onlineRole === "HOST" && window.G?.confirmed?.[0]) {
    room.send({ type: "NTB_RESYNC", state: serializeGameState() });
  }
  if (code) setLobbyMsg(`Connected in room ${code}.`);
});

room.on("peer_disconnected", () => {
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
    setLobbyMsg("Player 2 connected! Start a match and confirm your team to sync rosters.");
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
    setLobbyMsg("Host synced rosters! Pick your Captain & Vice Captain, then confirm.");
    if (typeof window.teamScreen === "function") window.teamScreen();
  } else if (msg.type === "NTB_START_BATTLE" && onlineRole === "GUEST") {
    window.G.mode = "online";
    window.G.captain = msg.captain;
    window.G.vice = msg.vice;
    window.G.confirmed = [true, true];
    window.G.currentPlayer = 2;
    myMoveLocked = false;
    setLobbyMsg("Both teams confirmed! Pick your fighter and attack style for Round 1.");
    if (typeof window.battleScreen === "function") window.battleScreen(2, true);
  } else if (msg.type === "NTB_GUEST_MOVE" && onlineRole === "HOST") {
    pendingGuestMove = msg.move;
    if (myMoveLocked && typeof window.resolveRound === "function") {
      window.G.pick[1] = pendingGuestMove.pick;
      window.G.style[1] = pendingGuestMove.style;
      pendingGuestMove = null;
      myMoveLocked = false;
      window.resolveRound();
    } else {
      setLobbyMsg("Player 2 locked their move! Lock your move to resolve the round.");
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
    setLobbyMsg(`Round ${msg.round} resolved! HP: P1 ${msg.hp[0].toFixed(2)} / P2 ${msg.hp[1].toFixed(2)}.`);
    if (window.G.finished && typeof window.endScreen === "function") {
      window.endScreen();
    } else if (typeof window.battleScreen === "function") {
      window.battleScreen(2, true);
    }
  }
});

function hookGameFunctions() {
  ensureRoomPanel();

  if (typeof window.teamScreen === "function" && !window.teamScreen._ntbBannerHooked) {
    const origTeam = window.teamScreen;
    const wrappedTeam = function () {
      const r = origTeam.apply(this, arguments);
      const appEl = document.getElementById("app");
      if (onlineEnabled && appEl && !document.getElementById("ntbInlineOnlineBanner")) {
        appEl.insertAdjacentHTML("afterbegin", renderInlineOnlineBanner());
      }
      return r;
    };
    wrappedTeam._ntbBannerHooked = true;
    window.teamScreen = wrappedTeam;
  }

  if (typeof window.battleScreen === "function" && !window.battleScreen._ntbBannerHooked) {
    const origBattle = window.battleScreen;
    const wrappedBattle = function () {
      const r = origBattle.apply(this, arguments);
      const appEl = document.getElementById("app");
      if (onlineEnabled && appEl && !document.getElementById("ntbInlineOnlineBanner")) {
        appEl.insertAdjacentHTML("afterbegin", renderInlineOnlineBanner());
      }
      return r;
    };
    wrappedBattle._ntbBannerHooked = true;
    window.battleScreen = wrappedBattle;
  }

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
      window.G.mode = "online";

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
        if (typeof window.battleScreen === "function") window.battleScreen(1, true);
      } else {
        room.send({ type: "NTB_START_BATTLE", captain: window.G.captain, vice: window.G.vice });
        window.G.currentPlayer = 2;
        setLobbyMsg("Leaders locked! Entering battle screen...");
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
          const m = document.getElementById("msg");
          if (m) m.textContent = "Move locked! Waiting for Player 2's move...";
        }
      } else {
        room.send({ type: "NTB_GUEST_MOVE", move: { pick: window.G.pick[1], style: window.G.style[1] } });
        setLobbyMsg("Move sent to Host! Waiting for round resolution...");
        const m = document.getElementById("msg");
        if (m) m.textContent = "Move sent to Host! Waiting for round resolution...";
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
