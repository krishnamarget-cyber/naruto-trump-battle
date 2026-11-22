// app.js — N13_firebase UI + 60fps BattleFxEngine + Online Room Multiplayer for 120-Card Naruto Trump Battle
import { BattleFxEngine } from "./battleFx.js";
import { RoomMultiplayerClient } from "./roomClientAuto.js";

const $ = (id) => document.getElementById(id);
const LEVELS = [1, 2, 3, 4, 5, 6];
const levelName = (l) => (Number(l) === 6 ? "Special" : `L${l}`);
const fmt = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

const STYLES = {
  Taijutsu: { atk: "T_ATK", def: "T_DEF", short: "TAI", fx: "tai" },
  Ninjutsu: { atk: "N_ATK", def: "N_DEF", short: "NIN", fx: "nin" },
  Genjutsu: { atk: "G_ATK", def: "G_DEF", short: "GEN", fx: "gen" },
  Kunai: { atk: "K_ATK", def: "K_DEF", short: "KUN", fx: "kun" },
  Special: { atk: "S_ATK", def: "S_DEF", short: "SPC", fx: "special" },
};

const STAT_KEYS = ["T_ATK", "T_DEF", "N_ATK", "N_DEF", "G_ATK", "G_DEF", "K_ATK", "K_DEF", "S_ATK", "S_DEF"];

const MATCH_PRESETS = {
  Quick: { label: "Quick Match", perPlayer: 10, distribution: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 1, 6: 1 } },
  Standard: { label: "Standard Match", perPlayer: 15, distribution: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 } },
};

const ATTACK_FIELDS = { Taijutsu: "T_ATK", Kunai: "K_ATK", Special: "S_ATK", Ninjutsu: "N_ATK", Genjutsu: "G_ATK" };

let db = [];
let tierAverages = {};
let draftedTeams = null;
let matchState = null;
let lastClashRecord = null;
let animTimers = [];
let sfxEnabled = true;


let intenseMode = "default"; // "default" | "intense"

function isIntenseMode() {
  return (matchState?.intenseMode || intenseMode) === "intense";
}

function getPlayerUsedStyles(player) {
  return Array.isArray(player?.usedStyles) ? player.usedStyles : [];
}

function getIntenseFiveRoundProgress(player) {
  const used = getPlayerUsedStyles(player);
  const blockLen = 5;
  const startIdx = Math.floor(used.length / blockLen) * blockLen;
  const currentBlock = used.slice(startIdx);
  const distinctInBlock = [...new Set(currentBlock)];
  const remainingInBlock = blockLen - currentBlock.length;
  const neededForThree = Math.max(0, 3 - distinctInBlock.length);
  const mustPickNewInBlock = remainingInBlock <= neededForThree && neededForThree > 0;
  return {
    blockNumber: Math.floor(used.length / blockLen) + 1,
    blockStartRound: startIdx + 1,
    blockEndRound: startIdx + blockLen,
    distinctInBlock,
    distinctCount: distinctInBlock.length,
    remainingInBlock,
    mustPickNewInBlock,
  };
}

function getIntenseMatchStyleProgress(player) {
  const used = getPlayerUsedStyles(player);
  const distinctMatchStyles = [...new Set(used)];
  const totalCards = player?.roster?.length || 15;
  const remainingCards = Math.max(0, totalCards - (player?.usedCardIds?.length || 0));
  const neededForFour = Math.max(0, 4 - distinctMatchStyles.length);
  const mustPickNewForMatch = remainingCards <= neededForFour && neededForFour > 0;
  return {
    distinctMatchStyles,
    distinctCount: distinctMatchStyles.length,
    remainingCards,
    mustPickNewForMatch,
  };
}

function isStyleAllowedInIntense(player, styleName) {
  if (!isIntenseMode()) return { allowed: true, reason: "" };
  const r5 = getIntenseFiveRoundProgress(player);
  const mProg = getIntenseMatchStyleProgress(player);
  const isNewInBlock = !r5.distinctInBlock.includes(styleName);
  const isNewInMatch = !mProg.distinctMatchStyles.includes(styleName);

  if (r5.mustPickNewInBlock && !isNewInBlock) {
    return {
      allowed: false,
      reason: `Intense 5-round rule: must explore at least 3 distinct styles by Round ${r5.blockEndRound} (${r5.distinctCount}/3 so far).`,
    };
  }
  if (mProg.mustPickNewForMatch && !isNewInMatch) {
    return {
      allowed: false,
      reason: `Intense match rule: must explore at least 4 distinct styles across the full match (${mProg.distinctCount}/4 so far).`,
    };
  }
  return { allowed: true, reason: "" };
}

// Play mode: "local" | "online" | "computer"
let playMode = "local";
const roomClient = new RoomMultiplayerClient();
let remoteMoveBuffer = null;
let myMoveLockedOnline = false;
let lastAppliedOnlineRound = 0;

// Leader selection temporary state
let leaderDraftStep = "A";
let tempCapA = null;
let tempVcA = null;
let tempCapB = null;
let tempVcB = null;

// Simultaneous turn state (Pass & Play)
let pickStep = "P1_PICK"; // "P1_PICK" | "P2_PICK" | "CLASH_REVEAL"
let selectedCardId = null;
let selectedStyle = "Taijutsu";
let lockedMoveA = null;

const fxEngine = new BattleFxEngine($("fxCanvas"), $("battleStage"));

function isOnline() {
  return playMode === "online";
}
function isComputer() {
  return playMode === "computer";
}
function mySide() {
  if (!isOnline()) return pickStep === "P1_PICK" ? "A" : "B";
  return roomClient.role === "GUEST" ? "B" : "A";
}

function clearAnimTimers() {
  animTimers.forEach((id) => clearTimeout(id));
  animTimers = [];
  fxEngine.clear();
}

function showScreen(screenId) {
  clearAnimTimers();
  ["screenSetup", "screenLeaders", "screenArena"].forEach((id) => {
    $(id).classList.toggle("hidden", id !== screenId);
  });
  $("btnRestartTop").classList.toggle("hidden", screenId === "screenSetup");
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function findCard(id) {
  return db.find((c) => c.id === id);
}

function portraitSrc(card) {
  return `assets/portraits/${card.id}.png`;
}

function computeTierAverages(cards) {
  const avgs = {};
  for (const l of LEVELS) {
    const list = cards.filter((c) => Number(c.level) === l);
    avgs[l] = {};
    for (const k of STAT_KEYS) {
      const sum = list.reduce((acc, c) => acc + Number(c[k] || 0), 0);
      avgs[l][k] = list.length ? sum / list.length : 0;
    }
  }
  return avgs;
}

function formatStatSignal(val, level, statKey) {
  const num = Number(val || 0);
  const avg = tierAverages[level]?.[statKey];
  if (typeof avg !== "number") return `<b>${fmt(num)}</b>`;
  const diff = num - avg;
  let cls = "mid";
  let arrowCls = "sig-mid";
  let symbol = "•";

  if (diff >= 0.4) {
    cls = "star";
    arrowCls = "sig-star";
    symbol = "▲";
  } else if (diff > 0.05) {
    cls = "high";
    arrowCls = "sig-high";
    symbol = "▲";
  } else if (diff < -0.05) {
    cls = "low";
    arrowCls = "sig-low";
    symbol = "▼";
  }

  const sign = diff >= 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
  const tip = `${fmt(num)} vs ${levelName(level)} avg ${fmt(avg)} (${sign})`;
  return `<span class="stat-val ${cls}" title="${tip}">${fmt(num)}<span class="sig-arrow ${arrowCls}">${symbol}</span></span>`;
}

function renderPresetSummary() {
  const key = $("presetSelect").value;
  const p = MATCH_PRESETS[key];
  $("presetSummary").innerHTML = `
    <strong>${p.label}:</strong> ${p.perPlayer} cards/team
    (${LEVELS.map((l) => `${levelName(l)}: ${p.distribution[l]}`).join(", ")}) ·
    <strong>Team HP:</strong> 10.00 HP ·
    <strong>Manual Shield (at 2.00):</strong> Gain +20% HP (+2.00 HP) ·
    <strong>Captain / Vice:</strong> 1.8× / 1.4× ATK &amp; Block Shield
  `;
}

async function initDatabase() {
  try {
    const resp = await fetch("./cards.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status} while loading cards.json`);
    const raw = await resp.json();
    if (!Array.isArray(raw) || raw.length !== 120) {
      throw new Error(`Expected 120 cards in cards.json, got ${raw?.length || 0}`);
    }
    db = raw;
    tierAverages = computeTierAverages(db);
  } catch (err) {
    $("loadError").classList.remove("hidden");
    $("loadError").textContent = `Could not load cards.json: ${err.message}`;
    $("btnDraftTeams").disabled = true;
  }
}

function renderCardMarkup(card, { badgeHtml = "", extraClass = "", footerHtml = "", selectedRibbon = false, popupHtml = "" } = {}) {
  const lvl = Number(card.level);
  const s = (k) => formatStatSignal(card[k], lvl, k);
  const fallbackSvg = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#fbbf24" font-family="sans-serif" font-weight="800" font-size="14">${card.id}</text></svg>`
  )}`;

  return `
    <div class="game-card ${extraClass}" data-id="${card.id}">
      ${selectedRibbon ? '<div class="selected-ribbon">✓ SELECTED</div>' : ""}
      ${popupHtml}
      <div class="card-top-row">
        <img class="card-portrait" src="${portraitSrc(card)}" alt="${card.name}" onerror="this.onerror=null;this.src='${fallbackSvg}'" />
        <div class="card-header-info">
          <div class="card-title">${card.name}${badgeHtml}</div>
          <div class="card-meta">${card.id} · ${levelName(lvl)}</div>
        </div>
      </div>
      <div class="style-grid">
        <div class="style-cell"><span class="st-name">TAI</span><span>${s("T_ATK")} / ${s("T_DEF")}</span></div>
        <div class="style-cell"><span class="st-name">NIN</span><span>${s("N_ATK")} / ${s("N_DEF")}</span></div>
        <div class="style-cell"><span class="st-name">GEN</span><span>${s("G_ATK")} / ${s("G_DEF")}</span></div>
        <div class="style-cell"><span class="st-name">KUN</span><span>${s("K_ATK")} / ${s("K_DEF")}</span></div>
        <div class="style-cell" style="grid-column:span 2"><span class="st-name">SPC</span><span>${s("S_ATK")} / ${s("S_DEF")}</span></div>
      </div>
      ${footerHtml}
    </div>
  `;
}

// ============================================================================
// 5-PHASE SELECTION ALGORITHM (from 120-card Nweb098 build)
// ============================================================================
function average(a) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}
function styleStats(c) {
  return Object.entries(ATTACK_FIELDS).map(([style, key]) => ({ style, key, value: Number(c[key]) || 0 }));
}
function cardMeta(c, tierCards) {
  const styles = styleStats(c);
  const vals = styles.map((x) => x.value);
  const means = Object.keys(ATTACK_FIELDS).map((k) => average(tierCards.map((x) => Number(x[ATTACK_FIELDS[k]]) || 0)));
  const density = styles.filter((x, i) => x.value >= means[i]).length;
  const avg = average(vals);
  const floor = Math.min(...vals);
  return { avg, floor, density, styles };
}
function rankByStyle(tierCards, style, descending = true) {
  const key = ATTACK_FIELDS[style];
  return [...tierCards].sort((a, b) =>
    descending ? Number(b[key]) - Number(a[key]) || a.id.localeCompare(b.id) : Number(a[key]) - Number(b[key]) || a.id.localeCompare(b.id)
  );
}
function rankComposite(tierCards, descending = true) {
  const metas = new Map(tierCards.map((c) => [c.id, cardMeta(c, tierCards)]));
  return [...tierCards].sort((a, b) => {
    const A = metas.get(a.id);
    const B = metas.get(b.id);
    const scoreA = A.avg * 0.7 + A.floor * 0.2 + A.density * 0.1;
    const scoreB = B.avg * 0.7 + B.floor * 0.2 + B.density * 0.1;
    return (descending ? -1 : 1) * (scoreA - scoreB) || a.id.localeCompare(b.id);
  });
}
function buildTierCandidatePool(tier, mode, poolSize) {
  const cards = tier.map((c) => ({ ...c }));
  const target = poolSize;
  const selected = [];
  const selectedIds = new Set();
  const holds = [];
  const container = [];

  if (mode === "Random") {
    const randomPool = shuffle(cards).slice(0, target);
    const counts = { high: 0, medium: 0, low: 0 };
    for (const c of cards) {
      const d = cardMeta(c, cards).density;
      counts[d >= 4 ? "high" : d >= 2 ? "medium" : "low"]++;
    }
    return { cards: randomPool, styles: [], density: counts };
  }

  const add = (c, stage) => {
    if (c && !selectedIds.has(c.id) && selected.length < target) {
      selectedIds.add(c.id);
      selected.push({ card: c, stage });
      return true;
    }
    return false;
  };
  const addHold = (c, reason) => {
    if (c && !selectedIds.has(c.id) && !holds.some((x) => x.card.id === c.id)) holds.push({ card: c, reason });
  };
  const chosenStyles = mode === "Balanced Meta" ? Object.keys(ATTACK_FIELDS) : shuffle(Object.keys(ATTACK_FIELDS)).slice(0, 3);
  const direction = mode !== "Weakest Meta";
  const styleRanks = {};
  for (const style of Object.keys(ATTACK_FIELDS)) styleRanks[style] = rankByStyle(cards, style, true);

  for (const style of chosenStyles) {
    const rank = rankByStyle(cards, style, direction);
    let found = 0;
    for (const c of rank.slice(0, 5)) {
      if (found < 2) {
        if (add(c, `P1 · ${style}`)) found++;
        else addHold(c, `P1 hold · ${style}`);
      } else addHold(c, `P1 reserve · ${style}`);
    }
  }

  const holdsSorted = holds.slice().sort((a, b) => {
    const A = cardMeta(a.card, cards);
    const B = cardMeta(b.card, cards);
    return (direction ? -1 : 1) * (A.avg - B.avg);
  });
  for (const h of holdsSorted) {
    if (selected.length >= Math.min(10, target)) break;
    add(h.card, "P2 · Hold");
  }
  const comp = rankComposite(cards, direction);
  for (const c of comp) {
    if (selected.length >= Math.min(10, target)) break;
    if (!selectedIds.has(c.id)) container.push(c);
  }
  for (const c of container) add(c, "P2 · Container");

  const meta = new Map(cards.map((c) => [c.id, cardMeta(c, cards)]));
  const densityGroups = { high: [], medium: [], low: [] };
  for (const c of cards) {
    const d = meta.get(c.id).density;
    (d >= 4 ? densityGroups.high : d >= 2 ? densityGroups.medium : densityGroups.low).push(c);
  }
  for (const group of Object.values(densityGroups)) group.sort((a, b) => (direction ? -1 : 1) * (meta.get(a.id).avg - meta.get(b.id).avg));
  const densityOrder = mode === "Weakest Meta" ? ["low", "medium", "high"] : ["high", "medium", "low"];
  let cursor = 0;
  while (selected.length < Math.min(13, target)) {
    let moved = false;
    for (const key of densityOrder) {
      const c = densityGroups[key].find((x) => !selectedIds.has(x.id));
      if (c) {
        add(c, `P3 · ${key}`);
        moved = true;
        if (selected.length >= Math.min(13, target)) break;
      }
    }
    if (!moved) break;
    cursor++;
    if (cursor > cards.length) break;
  }

  const bonusRank = cards
    .map((c) => {
      const m = meta.get(c.id);
      const styleRankSum = Object.keys(ATTACK_FIELDS).reduce((sum, style) => {
        const r = styleRanks[style].findIndex((x) => x.id === c.id);
        return sum + (r < 0 ? cards.length : r);
      }, 0);
      return { c, score: (direction ? 1 : -1) * (m.avg * 0.55 + m.floor * 0.25 + m.density * 0.12 + (1 - styleRankSum / (cards.length * 5)) * 0.08) };
    })
    .sort((a, b) => b.score - a.score);
  for (const x of bonusRank) {
    if (selected.length >= target) break;
    add(x.c, "P4 · Bonus");
  }
  if (selected.length < target) {
    const fill = mode === "Random" ? shuffle(cards) : rankComposite(cards, direction);
    for (const c of fill) {
      if (selected.length >= target) break;
      add(c, "P5 · Fill");
    }
  }
  const final = shuffle(selected.map((x) => ({ ...x.card })).slice(0, target));
  return {
    cards: final,
    styles: chosenStyles,
    density: { high: densityGroups.high.length, medium: densityGroups.medium.length, low: densityGroups.low.length },
  };
}

function generateTeamsForMatch(presetKey, mode) {
  const preset = MATCH_PRESETS[presetKey];
  const cardsA = [];
  const cardsB = [];
  const audit = [];
  for (const l of LEVELS) {
    const tier = db.filter((c) => Number(c.level) === l);
    const tierPoolSize = 15 + Math.floor(Math.random() * 2);
    const built = buildTierCandidatePool(tier, mode, tierPoolSize);
    const need = preset.distribution[l] * 2;
    const stack = shuffle(built.cards).slice(0, need);
    for (let k = 0; k < preset.distribution[l]; k++) {
      cardsA.push(stack.shift());
      cardsB.push(stack.shift());
    }
    audit.push({
      level: l,
      pool: built.cards.length,
      styles: built.styles,
      need,
      density: built.density,
      poolCards: built.cards.map((c) => ({ id: c.id, name: c.name })),
    });
  }
  return { cardsA, cardsB, audit };
}

// ============================================================================
// ONLINE MULTIPLAYER SNAPSHOT, RESUME & SYNC (identical to N13_firebase)
// ============================================================================
function snapshotMatchState() {
  const { history, ...rest } = matchState;
  return JSON.parse(JSON.stringify(rest));
}

function restoreMatchState(snap) {
  return { ...snap, history: [] };
}

function persistOnlineState() {
  if (!isOnline() || roomClient.role !== "HOST" || !matchState) return;
  if (matchState.status === "FINISHED") {
    roomClient.clearState?.();
  } else {
    roomClient.saveState?.(snapshotMatchState());
  }
}

function sendResync() {
  if (roomClient.role !== "HOST" || !matchState) return;
  roomClient.send({
    type: "RESYNC_STATE",
    state: snapshotMatchState(),
    remoteLocked: Boolean(remoteMoveBuffer),
  });
}

function handleResync(msg) {
  const snap = msg.state;
  const upToDate = matchState && matchState.round === snap.round && matchState.status === snap.status;
  if (upToDate) {
    if (msg.remoteLocked && !myMoveLockedOnline && snap.status === "IN_PROGRESS") {
      myMoveLockedOnline = true;
      $("turnControls").classList.add("hidden");
      $("turnCurtain").classList.remove("hidden");
      $("btnRevealTurn").classList.add("hidden");
      $("turnCurtainTitle").textContent = "Move Locked Privately!";
      $("turnCurtainSub").textContent = "Reconnected. Waiting for the clash to resolve...";
    }
    return;
  }
  matchState = restoreMatchState(snap);
  lastAppliedOnlineRound = snap.round;
  myMoveLockedOnline = false;
  selectedCardId = null;
  showScreen("screenArena");
  updateHud();
  if (snap.status === "FINISHED") {
    advanceTurn();
    return;
  }
  prepareOnlineTurnUi();
  if (msg.remoteLocked) {
    myMoveLockedOnline = true;
    $("turnControls").classList.add("hidden");
    $("btnRevealTurn").classList.add("hidden");
    $("turnCurtainTitle").textContent = "Move Locked Privately!";
    $("turnCurtainSub").textContent = "Reconnected. Waiting for the clash to resolve...";
  }
  renderHistoryLog();
}

async function offerHostResume() {
  const saved = await roomClient.loadState?.();
  if (!saved || saved.status !== "IN_PROGRESS") return false;
  const where = `Round ${saved.round + 1}, ${saved.players?.A?.name ?? "A"} vs ${saved.players?.B?.name ?? "B"}`;
  if (!confirm(`A saved match was found in this room (${where}).

OK = resume it
Cancel = start fresh`)) {
    await roomClient.clearState?.();
    return false;
  }
  matchState = restoreMatchState(saved);
  lockedMoveA = null;
  remoteMoveBuffer = null;
  myMoveLockedOnline = false;
  selectedCardId = null;
  showScreen("screenArena");
  updateHud();
  prepareOnlineTurnUi();
  renderHistoryLog();
  if (roomClient.connected) sendResync();
  return true;
}

function setRoomStatus(text, ok = false) {
  const el = $("roomConnStatus");
  el.textContent = text;
  el.style.background = ok ? "#065f46" : "#243656";
  el.style.color = ok ? "#a7f3d0" : "#edf2ff";
}

function updateRoomHeaderBadge() {
  const badge = $("roomHeaderBadge");
  if (isOnline() && roomClient.roomCode) {
    badge.classList.remove("hidden");
    badge.textContent = `ROOM: ${roomClient.roomCode} (${roomClient.role || "PEER"})`;
  } else {
    badge.classList.add("hidden");
  }
}

async function handleCreateRoom() {
  const custom = $("roomCodeInput").value.trim().toUpperCase();
  $("btnCreateRoom").disabled = true;
  setRoomStatus("Creating Room...");
  try {
    const code = await roomClient.createRoom(custom || null);
    $("roomCodeInput").value = code;
    updateRoomHeaderBadge();
    setRoomStatus(`HOST · Code: ${code}`, true);
    $("roomLobbyInfo").innerHTML =
      `Room <strong class="gold-text">${code}</strong> created! Share this code with Player 2, or click <b>Draft Teams</b> once they join.`;
    roomClient.send({
      type: "HELLO_HOST",
      hostName: $("playerAName").value.trim() || "Player 1",
    });
    await offerHostResume();
  } catch (err) {
    setRoomStatus("Room Error");
    $("roomLobbyInfo").textContent = err.message;
  } finally {
    $("btnCreateRoom").disabled = false;
  }
}

async function handleJoinRoom() {
  const code = $("roomCodeInput").value.trim().toUpperCase();
  if (!code) {
    $("roomLobbyInfo").textContent = "Enter the 6-letter Room Code from Player 1 first.";
    return;
  }
  $("btnJoinRoom").disabled = true;
  setRoomStatus("Joining...");
  try {
    await roomClient.joinRoom(code);
    updateRoomHeaderBadge();
    setRoomStatus(`GUEST · Code: ${code}`, true);
    $("roomLobbyInfo").innerHTML =
      `Joined room <strong class="blue-text">${code}</strong>! Waiting for Host to draft teams &amp; send rosters...`;
    roomClient.send({
      type: "HELLO_GUEST",
      guestName: $("playerBName").value.trim() || "Player 2",
    });
  } catch (err) {
    setRoomStatus("Join Failed");
    $("roomLobbyInfo").textContent = err.message;
  } finally {
    $("btnJoinRoom").disabled = false;
  }
}

roomClient.on("peer_connected", ({ transport }) => {
  setRoomStatus(`CONNECTED (${roomClient.role} · ${transport})`, true);
  updateRoomHeaderBadge();
  if (roomClient.role === "HOST") {
    $("roomLobbyInfo").innerHTML =
      `Opponent <strong>${$("playerBName").value.trim() || "Player 2"}</strong> connected! Click <b>Draft Teams &amp; Assign Leaders</b> to begin.`;
    roomClient.send({
      type: "HELLO_HOST",
      hostName: $("playerAName").value.trim() || "Player 1",
    });
    if (matchState && matchState.status === "IN_PROGRESS") sendResync();
  } else {
    $("roomLobbyInfo").innerHTML =
      `Connected to Host <strong>${$("playerAName").value.trim() || "Player 1"}</strong>! Waiting for Host to click Draft Teams...`;
    roomClient.send({
      type: "HELLO_GUEST",
      guestName: $("playerBName").value.trim() || "Player 2",
    });
  }
});

roomClient.on("error", ({ message }) => {
  setRoomStatus("Room Error");
  $("roomLobbyInfo").textContent = message;
});

roomClient.on("peer_disconnected", () => {
  setRoomStatus("Peer Disconnected");
});

roomClient.on("message", (msg) => {
  if (!msg || !msg.type) return;

  if (msg.type === "HELLO_GUEST" && roomClient.role === "HOST") {
    if (msg.guestName) $("playerBName").value = msg.guestName;
    setRoomStatus(`CONNECTED (HOST · ${roomClient.roomCode})`, true);
    $("roomLobbyInfo").innerHTML =
      `Opponent <strong>${msg.guestName || "Player 2"}</strong> connected! Click <b>Draft Teams &amp; Assign Leaders</b> to begin.`;
  } else if (msg.type === "HELLO_HOST" && roomClient.role === "GUEST") {
    if (msg.hostName) $("playerAName").value = msg.hostName;
    setRoomStatus(`CONNECTED (GUEST · ${roomClient.roomCode})`, true);
    $("roomLobbyInfo").innerHTML =
      `Connected to Host <strong>${msg.hostName || "Player 1"}</strong>! Waiting for draft...`;
  } else if (msg.type === "TEAM_DRAFT_SYNC" && roomClient.role === "GUEST") {
    intenseMode = msg.intenseMode || "default";
    draftedTeams = {
      presetKey: msg.presetKey,
      mode: msg.mode,
      intenseMode,
      nameA: msg.nameA,
      nameB: msg.nameB,
      cardsA: msg.cardsA,
      cardsB: msg.cardsB,
      audit: msg.audit || [],
    };
    tempCapB = null;
    tempVcB = null;
    $("curtainLeaderTitle").textContent = `Ready, ${draftedTeams.nameB}?`;
    $("curtainLeaderSub").textContent =
      `Host drafted ${draftedTeams.cardsB.length} cards for your team. Pick your Captain (1.8×) and Vice-Captain (1.4×).`;
    $("btnRevealLeaders").classList.remove("hidden");
    showScreen("screenLeaders");
    $("leaderCurtain").classList.remove("hidden");
    $("leaderPickerContent").classList.add("hidden");
  } else if (msg.type === "GUEST_LEADERS_LOCKED" && roomClient.role === "HOST") {
    tempCapB = msg.captainId;
    tempVcB = msg.viceCaptainId;
    if (draftedTeams && tempCapA && tempVcA) {
      startOnlineMatchAsHost();
    }
  } else if (msg.type === "START_ONLINE_MATCH" && roomClient.role === "GUEST") {
    matchState = createNewMatchState({
      presetKey: msg.presetKey,
      teamA: msg.teamA,
      teamB: msg.teamB,
    });
    myMoveLockedOnline = false;
    lastAppliedOnlineRound = 0;
    selectedCardId = null;
    showScreen("screenArena");
    updateHud();
    prepareOnlineTurnUi();
  } else if (msg.type === "GUEST_MOVE_LOCKED" && roomClient.role === "HOST") {
    if (!matchState || remoteMoveBuffer) return;
    if (msg.round !== undefined && msg.round !== matchState.round) return;
    remoteMoveBuffer = msg.move;
    if (myMoveLockedOnline && matchState.status === "IN_PROGRESS") {
      resolveOnlineTurnOnHost();
    } else {
      $("turnCurtainSub").textContent = `${matchState.players.B.name} locked their move! Now lock your move to resolve.`;
    }
  } else if (msg.type === "HOST_ROUND_RESOLVED" && roomClient.role === "GUEST") {
    const rec = msg.record;
    if (rec.round <= lastAppliedOnlineRound) return;
    lastAppliedOnlineRound = rec.round;
    matchState.round = msg.stateAfter.round;
    matchState.level = msg.stateAfter.level;
    matchState.status = msg.stateAfter.status;
    matchState.winner = msg.stateAfter.winner;
    matchState.reason = msg.stateAfter.reason;
    matchState.players.A = msg.stateAfter.players.A;
    matchState.players.B = msg.stateAfter.players.B;
    matchState.history.push(rec);

    myMoveLockedOnline = false;
    selectedCardId = null;
    runAnimatedBattleSimulation(rec);
  } else if (msg.type === "RESYNC_STATE" && roomClient.role === "GUEST") {
    handleResync(msg);
  } else if (msg.type === "SHIELD_SYNC") {
    if (!matchState) return;
    const ev = msg.event;
    const p = matchState.players[ev.playerSide];
    p.shields = ev.remainingShields;
    p.hp = ev.hp;
    p.extraArmorHp = ev.extraArmorHp;
    matchState.history.push(ev);
    persistOnlineState();
    updateHud();
    renderHistoryLog();
  }
});

// ============================================================================
// MATCH ENGINE (Preserves exact 120-card rules: 10 HP, 2.00 Shield, 1.8x/1.4x)
// ============================================================================
function createNewMatchState({ presetKey, intenseMode: modeFlag = "default", teamA, teamB }) {
  return {
    presetKey,
    intenseMode: modeFlag,
    round: 0,
    level: 1,
    status: "IN_PROGRESS",
    winner: null,
    reason: "",
    history: [],
    players: {
      A: {
        name: teamA.name,
        roster: teamA.cards,
        captainId: teamA.captainId,
        viceCaptainId: teamA.viceCaptainId,
        usedStyles: [],
        hp: 10,
        maxHp: 10,
        shields: 0,
        extraArmorHp: 0,
        usedCardIds: [],
      },
      B: {
        name: teamB.name,
        roster: teamB.cards,
        captainId: teamB.captainId,
        viceCaptainId: teamB.viceCaptainId,
        usedStyles: [],
        hp: 10,
        maxHp: 10,
        shields: 0,
        extraArmorHp: 0,
        usedCardIds: [],
      },
    },
  };
}

function calcRawAttack(atk, def) {
  return atk - def > 0.0001
    ? { damage: +(atk - def).toFixed(6), shield_gain: 0 }
    : { damage: 0, shield_gain: +Math.max(def - atk, 0).toFixed(6) };
}

function applyRoleMultiplier(raw, mult, roleLabel) {
  if (mult === 1) {
    return { ...raw, roleBonus: "NONE", roleMult: 1, baseDamage: raw.damage, baseShield: raw.shield_gain };
  }
  if (raw.damage > 0) {
    return {
      ...raw,
      damage: +(raw.damage * mult).toFixed(6),
      roleBonus: `${roleLabel} (${mult}× DMG)`,
      roleMult: mult,
      baseDamage: raw.damage,
      baseShield: raw.shield_gain,
    };
  }
  const baseBlock = raw.shield_gain > 0 ? raw.shield_gain : 1;
  return {
    ...raw,
    shield_gain: +(baseBlock * mult).toFixed(6),
    roleBonus: `${roleLabel} (${mult}× SHIELD)`,
    roleMult: mult,
    baseDamage: raw.damage,
    baseShield: baseBlock,
  };
}

function applyDamageToPlayer(player, incomingDamage) {
  let hp = player.hp;
  let tmp = player.extraArmorHp;
  const absorbed = Math.min(incomingDamage, tmp);
  tmp -= absorbed;
  const lost = Math.min(incomingDamage - absorbed, hp);
  hp -= lost;
  player.hp = +hp.toFixed(6);
  player.extraArmorHp = +tmp.toFixed(6);
  return { absorbed: +absorbed.toFixed(6), hpLost: +lost.toFixed(6) };
}

function executeTurnClash(state, { moveA, moveB }) {
  const pA = state.players.A;
  const pB = state.players.B;
  const cA = pA.roster.find((c) => c.id === moveA.cardId);
  const cB = pB.roster.find((c) => c.id === moveB.cardId);
  const stA = STYLES[moveA.style];
  const stB = STYLES[moveB.style];

  const multA = cA.id === pA.captainId ? 1.8 : cA.id === pA.viceCaptainId ? 1.4 : 1;
  const labelA = cA.id === pA.captainId ? "CAPTAIN" : cA.id === pA.viceCaptainId ? "VICE_CAP" : "NONE";
  const multB = cB.id === pB.captainId ? 1.8 : cB.id === pB.viceCaptainId ? "1.4" : 1;
  const numMultB = Number(multB);
  const labelB = cB.id === pB.captainId ? "CAPTAIN" : cB.id === pB.viceCaptainId ? "VICE_CAP" : "NONE";

  const atkA = Number(cA[stA.atk]);
  const defB = Number(cB[stA.def]);
  const resAtoB = applyRoleMultiplier(calcRawAttack(atkA, defB), multA, labelA);

  const atkB = Number(cB[stB.atk]);
  const defA = Number(cA[stB.def]);
  const resBtoA = applyRoleMultiplier(calcRawAttack(atkB, defA), numMultB, labelB);

  const dmgAppliedToB = applyDamageToPlayer(pB, resAtoB.damage);
  const dmgAppliedToA = applyDamageToPlayer(pA, resBtoA.damage);

  // Shield gained by defender when blocking opponent's attack
  pB.shields = +(pB.shields + resAtoB.shield_gain).toFixed(6);
  pA.shields = +(pA.shields + resBtoA.shield_gain).toFixed(6);

  pA.usedCardIds.push(cA.id);
  pB.usedCardIds.push(cB.id);
  pA.usedStyles = [...(pA.usedStyles || []), moveA.style];
  pB.usedStyles = [...(pB.usedStyles || []), moveB.style];
  state.round += 1;

  const playedLevel = state.level;
  if (pA.hp <= 0 || pB.hp <= 0) {
    state.status = "FINISHED";
    state.reason = "KNOCKOUT";
    if (pA.hp <= 0 && pB.hp <= 0) state.winner = "DRAW";
    else if (pB.hp <= 0) state.winner = "A";
    else state.winner = "B";
  } else {
    while (
      state.level <= 6 &&
      ["A", "B"].some((side) => !state.players[side].roster.some((c) => Number(c.level) === state.level && !state.players[side].usedCardIds.includes(c.id)))
    ) {
      if (state.level === 6) {
        state.status = "FINISHED";
        state.reason = "ALL_ROUNDS_COMPLETE";
        if (Math.abs(pA.hp - pB.hp) <= 0.0001) state.winner = "DRAW";
        else state.winner = pA.hp > pB.hp ? "A" : "B";
        break;
      }
      state.level += 1;
    }
  }

  const record = {
    round: state.round,
    level: playedLevel,
    moveA,
    moveB,
    cardA: cA,
    cardB: cB,
    atkA,
    defB,
    atkB,
    defA,
    resAtoB,
    resBtoA,
    dmgAppliedToA,
    dmgAppliedToB,
  };
  state.history.push(record);
  return record;
}

// ============================================================================
// SCREEN 1 -> SCREEN 2: DRAFT & LEADER SELECTION
// ============================================================================
function startDraft() {
  if (!db.length) return;
  const presetKey = $("presetSelect").value;
  const mode = $("metaSelect").value;

  if (isOnline()) {
    if (!roomClient.roomCode) {
      $("loadError").classList.remove("hidden");
      $("loadError").textContent = "Please Create or Join a Room Code first before drafting teams.";
      return;
    }
    if (roomClient.role === "GUEST") {
      $("loadError").classList.remove("hidden");
      $("loadError").textContent = "Waiting for the Host to click Draft Teams & Assign Leaders.";
      return;
    }
    $("loadError").classList.add("hidden");
    updateRoomHeaderBadge();
  } else {
    $("loadError").classList.add("hidden");
  }

  const { cardsA, cardsB, audit } = generateTeamsForMatch(presetKey, mode);
  intenseMode = $("intenseModeSelect")?.value || "default";
  draftedTeams = {
    presetKey,
    mode,
    intenseMode,
    nameA: $("playerAName").value.trim() || "Player 1",
    nameB: isComputer() ? "Computer" : $("playerBName").value.trim() || "Player 2",
    cardsA,
    cardsB,
    audit,
  };

  tempCapA = null;
  tempVcA = null;
  tempCapB = null;
  tempVcB = null;

  if (isOnline() && roomClient.role === "HOST") {
    roomClient.send({
      type: "TEAM_DRAFT_SYNC",
      presetKey,
      mode,
      intenseMode,
      nameA: draftedTeams.nameA,
      nameB: draftedTeams.nameB,
      cardsA: draftedTeams.cardsA,
      cardsB: draftedTeams.cardsB,
      audit,
    });
    $("curtainLeaderTitle").textContent = `${draftedTeams.nameA} — Pick Your Leaders`;
    $("curtainLeaderSub").textContent = "Select your Captain (1.8×) and Vice-Captain (1.4×) privately on your device.";
    $("btnRevealLeaders").classList.remove("hidden");
    showScreen("screenLeaders");
    $("leaderCurtain").classList.remove("hidden");
    $("leaderPickerContent").classList.add("hidden");
    return;
  }

  if (isComputer()) {
    const r = shuffle(cardsB);
    tempCapB = r[0].id;
    tempVcB = r[1].id;
  }

  openLeaderCurtain("A");
  showScreen("screenLeaders");
}

function openLeaderCurtain(side) {
  leaderDraftStep = side;
  const pName = side === "A" ? draftedTeams.nameA : draftedTeams.nameB;
  $("curtainLeaderTitle").textContent = `Pass Device to ${pName}`;
  $("curtainLeaderSub").textContent =
    "Keep the screen hidden from your opponent while choosing your Captain (1.8×) and Vice-Captain (1.4×).";
  $("btnRevealLeaders").classList.remove("hidden");
  $("leaderCurtain").classList.remove("hidden");
  $("leaderPickerContent").classList.add("hidden");
}

function renderLeaderPicker() {
  const side = isOnline() ? (roomClient.role === "GUEST" ? "B" : "A") : leaderDraftStep;
  const pName = side === "A" ? draftedTeams.nameA : draftedTeams.nameB;
  const cards = side === "A" ? draftedTeams.cardsA : draftedTeams.cardsB;
  const capId = side === "A" ? tempCapA : tempCapB;
  const vcId = side === "A" ? tempVcA : tempVcB;

  $("leaderHeader").textContent = `${pName} — Select Captain & Vice-Captain`;
  $("leaderCountBadge").textContent = `${cards.length} Cards`;

  const capCard = cards.find((c) => c.id === capId);
  const vcCard = cards.find((c) => c.id === vcId);
  $("chosenCapLabel").textContent = capCard ? `${capCard.name} (${capCard.id})` : "None";
  $("chosenVcLabel").textContent = vcCard ? `${vcCard.name} (${vcCard.id})` : "None";

  if (isOnline()) {
    $("btnConfirmLeaders").textContent =
      roomClient.role === "HOST"
        ? "Lock My Leaders & Wait for Player 2"
        : "Lock My Leaders & Enter Arena";
  } else if (isComputer()) {
    $("btnConfirmLeaders").textContent = "Confirm Leaders & Start Battle!";
  } else {
    $("btnConfirmLeaders").textContent =
      side === "A" ? `Confirm & Pass to ${draftedTeams.nameB}` : "Confirm & Start Battle at Level 1!";
  }
  $("btnConfirmLeaders").disabled = !(capId && vcId && capId !== vcId);

  $("leaderRosterGrid").innerHTML = cards
    .map((c) => {
      const isCap = c.id === capId;
      const isVc = c.id === vcId;
      const badge = isCap
        ? '<span class="badge badge-cap">CAP 1.8×</span>'
        : isVc
        ? '<span class="badge badge-vc">VC 1.4×</span>'
        : "";
      const extraClass = isCap ? "cap-card selected" : isVc ? "vc-card selected" : "";
      const footer = `
        <div class="role-actions">
          <button type="button" data-role="cap" data-cid="${c.id}">${isCap ? "✓ Captain" : "Set Captain"}</button>
          <button type="button" data-role="vc" data-cid="${c.id}">${isVc ? "✓ Vice-Cap" : "Set Vice-Cap"}</button>
        </div>
      `;
      return renderCardMarkup(c, { badgeHtml: badge, extraClass, footerHtml: footer, selectedRibbon: isCap || isVc });
    })
    .join("");

  $("leaderRosterGrid").querySelectorAll("button[data-role]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const cid = btn.dataset.cid;
      const role = btn.dataset.role;
      if (side === "A") {
        if (role === "cap") {
          tempCapA = cid;
          if (tempVcA === cid) tempVcA = null;
        } else {
          tempVcA = cid;
          if (tempCapA === cid) tempCapA = null;
        }
      } else {
        if (role === "cap") {
          tempCapB = cid;
          if (tempVcB === cid) tempVcB = null;
        } else {
          tempVcB = cid;
          if (tempCapB === cid) tempCapB = null;
        }
      }
      renderLeaderPicker();
    };
  });
}

function startOnlineMatchAsHost() {
  const teamADef = {
    name: draftedTeams.nameA,
    cards: draftedTeams.cardsA,
    captainId: tempCapA,
    viceCaptainId: tempVcA,
  };
  const teamBDef = {
    name: draftedTeams.nameB,
    cards: draftedTeams.cardsB,
    captainId: tempCapB,
    viceCaptainId: tempVcB,
  };

  matchState = createNewMatchState({ presetKey: draftedTeams.presetKey, intenseMode: draftedTeams.intenseMode || intenseMode, teamA: teamADef, teamB: teamBDef });

  roomClient.send({
    type: "START_ONLINE_MATCH",
    presetKey: draftedTeams.presetKey,
    teamA: teamADef,
    teamB: teamBDef,
  });
  persistOnlineState();

  myMoveLockedOnline = false;
  remoteMoveBuffer = null;
  lastAppliedOnlineRound = 0;
  selectedCardId = null;

  showScreen("screenArena");
  updateHud();
  prepareOnlineTurnUi();
}

function confirmLeaders() {
  if (isOnline()) {
    if (roomClient.role === "GUEST") {
      roomClient.send({
        type: "GUEST_LEADERS_LOCKED",
        captainId: tempCapB,
        viceCaptainId: tempVcB,
      });
      $("leaderPickerContent").classList.add("hidden");
      $("leaderCurtain").classList.remove("hidden");
      $("curtainLeaderTitle").textContent = "Leaders Locked!";
      $("curtainLeaderSub").textContent = "Waiting for Host to start the match...";
      $("btnRevealLeaders").classList.add("hidden");
    } else {
      if (tempCapB && tempVcB) {
        startOnlineMatchAsHost();
      } else {
        $("leaderPickerContent").classList.add("hidden");
        $("leaderCurtain").classList.remove("hidden");
        $("curtainLeaderTitle").textContent = "Leaders Locked!";
        $("curtainLeaderSub").textContent = "Waiting for Player 2 to confirm their Captain & Vice-Captain...";
        $("btnRevealLeaders").classList.add("hidden");
      }
    }
    return;
  }

  if (leaderDraftStep === "A" && !isComputer()) {
    openLeaderCurtain("B");
    return;
  }

  matchState = createNewMatchState({
    presetKey: draftedTeams.presetKey,
    teamA: {
      name: draftedTeams.nameA,
      cards: draftedTeams.cardsA,
      captainId: tempCapA,
      viceCaptainId: tempVcA,
    },
    teamB: {
      name: draftedTeams.nameB,
      cards: draftedTeams.cardsB,
      captainId: tempCapB,
      viceCaptainId: tempVcB,
    },
  });

  pickStep = "P1_PICK";
  lockedMoveA = null;
  selectedCardId = null;

  showScreen("screenArena");
  updateHud();
  prepareTurnCurtain();
}

// ============================================================================
// SCREEN 3: LIVE BATTLE ARENA & HUD
// ============================================================================
function renderTierStepper() {
  const activeLvl = matchState.status === "FINISHED" ? 7 : matchState.level;
  $("tierStepper").innerHTML = LEVELS.map((l) => {
    const cls = l < activeLvl ? "done" : l === activeLvl ? "active" : "";
    const pA = matchState.players.A;
    const totalInTier = pA.roster.filter((c) => Number(c.level) === l).length;
    const usedInTier = pA.roster.filter((c) => Number(c.level) === l && pA.usedCardIds.includes(c.id)).length;
    return `<div class="tier-step ${cls}">${levelName(l)}<br>${usedInTier}/${totalInTier}</div>`;
  }).join("");

  if (matchState.status === "IN_PROGRESS") {
    const pA = matchState.players.A;
    const rem = pA.roster.filter((c) => Number(c.level) === matchState.level && !pA.usedCardIds.includes(c.id)).length;
    $("tierRemainingText").textContent = `Current Stage: ${levelName(matchState.level)} (${rem} clash${rem > 1 ? "es" : ""} left)`;
  } else {
    $("tierRemainingText").textContent = "Match Complete";
  }
}

function updateHud() {
  renderTierStepper();
  ["A", "B"].forEach((side) => {
    const p = matchState.players[side];
    $(`hudName${side}`).textContent = p.name;

    const statusEl = $(`hudStatus${side}`);
    if (isOnline()) {
      const isMe = (roomClient.role === "HOST" && side === "A") || (roomClient.role === "GUEST" && side === "B");
      if (pickStep === "CLASH_REVEAL") {
        statusEl.textContent = "RESOLVED";
        statusEl.className = "role-pill";
      } else if (isMe) {
        statusEl.textContent = myMoveLockedOnline ? "MOVE LOCKED" : "YOUR TURN";
        statusEl.className = `role-pill ${myMoveLockedOnline ? "locked" : "active"}`;
      } else {
        statusEl.textContent = "OPPONENT";
        statusEl.className = "role-pill";
      }
    } else if (pickStep === "P1_PICK") {
      statusEl.textContent = side === "A" ? "PICKING NOW" : "WAITING";
      statusEl.className = `role-pill ${side === "A" ? "active" : ""}`;
    } else if (pickStep === "P2_PICK") {
      statusEl.textContent = side === "A" ? "MOVE LOCKED" : "PICKING NOW";
      statusEl.className = `role-pill ${side === "B" ? "locked" : "active"}`;
    } else {
      statusEl.textContent = "RESOLVED";
      statusEl.className = "role-pill";
    }

    $(`hudHpText${side}`).textContent = `${fmt(p.hp)} / ${fmt(p.maxHp)} HP`;
    const armorEl = $(`hudArmorText${side}`);
    if (p.extraArmorHp > 0.0001) {
      armorEl.textContent = `+${fmt(p.extraArmorHp)} Temp HP`;
      armorEl.classList.remove("hidden");
    } else {
      armorEl.classList.add("hidden");
    }

    const hpPct = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
    $(`hudHpBar${side}`).style.width = `${hpPct}%`;

    $(`hudShieldText${side}`).textContent = `${fmt(p.shields)} / 2.00+`;
    const shPct = Math.max(0, Math.min(100, (p.shields / 2.0) * 100));
    $(`hudShieldBar${side}`).style.width = `${shPct}%`;

    const isAllowedShield =
      !isOnline() ||
      (roomClient.role === "HOST" && side === "A") ||
      (roomClient.role === "GUEST" && side === "B");
    const canUseShield = isAllowedShield && matchState.status === "IN_PROGRESS" && p.shields + 0.000001 >= 2.0 && pickStep !== "CLASH_REVEAL";
    $(`btnShield${side}`).disabled = !canUseShield;

    const remaining = p.roster.length - p.usedCardIds.length;
    $(`hudCardsLeft${side}`).textContent = `Cards Left: ${remaining} / ${p.roster.length}`;
  });
  renderMyRosterStatus();
}

function handleActivateShield(side) {
  if (!matchState || matchState.status !== "IN_PROGRESS") return;
  const p = matchState.players[side];
  if (p.shields + 0.000001 < 2.0) return;

  p.shields = +(p.shields - 2.0).toFixed(6);
  const hpGainAmount = +(p.maxHp * 0.2).toFixed(6); // 20% of maxHp (2.00 HP on 10.00 maxHp)
  const restored = Math.max(0, Math.min(hpGainAmount, p.maxHp - p.hp));
  p.hp = +(p.hp + restored).toFixed(6);
  const overflow = +(hpGainAmount - restored).toFixed(6);
  const gained = overflow > 0 ? Math.min(overflow, 0.5 - p.extraArmorHp) : 0;
  p.extraArmorHp = +(p.extraArmorHp + gained).toFixed(6);

  const ev = {
    type: "SHIELD_ACTIVATED",
    round: matchState.round + 1,
    playerSide: side,
    remainingShields: p.shields,
    hp: p.hp,
    extraArmorHp: p.extraArmorHp,
    restored,
    gained,
  };
  matchState.history.push(ev);

  if (isOnline()) {
    roomClient.send({ type: "SHIELD_SYNC", event: ev });
    persistOnlineState();
  }
  updateHud();
  renderHistoryLog();
  alert(
    gained > 0.0001
      ? `${p.name} spent 2.00 Shield: +${fmt(restored)} HP (20% cap) & +${fmt(gained)} Temp HP!`
      : `${p.name} spent 2.00 Shield: +${fmt(restored)} HP (+20% HP)!`
  );
}

function prepareOnlineTurnUi() {
  const lvl = matchState.level;
  pickStep = "P1_PICK";
  myMoveLockedOnline = false;
  selectedCardId = null;

  $("turnBanner").textContent = `Round ${matchState.round + 1} — ${levelName(lvl)} Online Clash`;
  $("tierLockBadge").textContent = `Active Tier: ${levelName(lvl)}`;

  $("turnCurtainTitle").textContent = `Room ${roomClient.roomCode} — ${levelName(lvl)}`;
  $("turnCurtainSub").textContent = "Reveal your private hand to choose your fighter and Attack Style.";
  $("btnRevealTurn").classList.remove("hidden");

  $("turnCurtain").classList.remove("hidden");
  $("turnControls").classList.add("hidden");
  $("clashRevealPanel").classList.add("hidden");
  $("matchOverPanel").classList.add("hidden");
  updateHud();
}

function prepareTurnCurtain() {
  if (isOnline()) {
    prepareOnlineTurnUi();
    return;
  }
  const lvl = matchState.level;
  const activeSide = pickStep === "P1_PICK" ? "A" : "B";
  const activePlayer = matchState.players[activeSide];

  $("turnBanner").textContent = `Round ${matchState.round + 1} — ${levelName(lvl)} Clash`;
  $("tierLockBadge").textContent = `Active Tier: ${levelName(lvl)}`;

  $("turnCurtainTitle").textContent = `Pass Device to ${activePlayer.name}`;
  $("turnCurtainSub").textContent =
    pickStep === "P1_PICK"
      ? `Choose your ${levelName(lvl)} fighter and Attack Style.`
      : `${matchState.players.A.name} locked a move! Now choose your ${levelName(lvl)} fighter and Attack Style.`;
  $("btnRevealTurn").classList.remove("hidden");

  $("turnCurtain").classList.remove("hidden");
  $("turnControls").classList.add("hidden");
  $("clashRevealPanel").classList.add("hidden");
  $("matchOverPanel").classList.add("hidden");
  updateHud();
}

function refreshMoveSelectorLabels(card) {
  const lvl = card ? Number(card.level) : null;
  const activePlayer = matchState ? matchState.players[mySide()] : null;
  let firstEnabledStyle = null;
  $("styleBtnGroup").querySelectorAll("button").forEach((btn) => {
    const st = btn.dataset.style;
    const meta = STYLES[st];
    const chk = activePlayer ? isStyleAllowedInIntense(activePlayer, st) : { allowed: true, reason: "" };
    btn.disabled = !chk.allowed;
    btn.title = chk.reason || "";
    if (chk.allowed && !firstEnabledStyle) firstEnabledStyle = st;
    if (!card) {
      btn.innerHTML = `<span>${st} (${meta.short})</span>`;
      return;
    }
    const atkHtml = formatStatSignal(card[meta.atk], lvl, meta.atk);
    const defHtml = formatStatSignal(card[meta.def], lvl, meta.def);
    btn.innerHTML = `<span>${st} (${meta.short})</span><span class="btn-stat-sub">ATK ${atkHtml} · DEF ${defHtml}</span>`;
  });
  if (activePlayer && isIntenseMode()) {
    const curChk = isStyleAllowedInIntense(activePlayer, selectedStyle);
    if (!curChk.allowed && firstEnabledStyle) {
      selectedStyle = firstEnabledStyle;
      $("styleBtnGroup").querySelectorAll("button").forEach((b) => {
        b.classList.toggle("active", b.dataset.style === selectedStyle);
      });
    }
  }
}

function updateSelectedPreviewBar(player) {
  const previewEl = $("selectedPreviewBar");
  if (!selectedCardId) {
    previewEl.classList.add("hidden");
    refreshMoveSelectorLabels(null);
    return;
  }
  const card = player.roster.find((c) => c.id === selectedCardId);
  if (!card) return;
  const lvl = Number(card.level);
  const meta = STYLES[selectedStyle];
  const atkHtml = formatStatSignal(card[meta.atk], lvl, meta.atk);
  const defHtml = formatStatSignal(card[meta.def], lvl, meta.def);

  refreshMoveSelectorLabels(card);

  previewEl.classList.remove("hidden");
  previewEl.innerHTML = `
    <img src="${portraitSrc(card)}" alt="${card.name}" />
    <div>
      <div><strong class="gold-text">Marked Fighter:</strong> ${card.name} (${card.id})</div>
      <div class="muted">Active Pick: <b>${selectedStyle}</b> (ATK ${atkHtml} / DEF ${defHtml})</div>
    </div>
  `;
}

function revealActiveHand() {
  const lvl = matchState.level;
  const side = mySide();
  const player = matchState.players[side];

  $("turnCurtain").classList.add("hidden");
  $("turnControls").classList.remove("hidden");

  selectedCardId = null;
  $("selectedPreviewBar").classList.add("hidden");
  refreshMoveSelectorLabels(null);
  $("btnLockMove").disabled = true;
  $("btnLockMove").textContent = "Select a Card Above to Lock Move";

  if (isIntenseMode()) {
    const r5 = getIntenseFiveRoundProgress(player);
    const mp = getIntenseMatchStyleProgress(player);
    $("activeTierPrompt").textContent = `${player.name} — Tap 1 ${levelName(lvl)} fighter · Intense: ${r5.distinctCount}/3 styles in ${r5.blockStartRound}–${r5.blockEndRound} rounds, ${mp.distinctCount}/4 styles in match`;
  } else {
    $("activeTierPrompt").textContent = `${player.name} — Tap 1 available ${levelName(lvl)} fighter:`;
  }

  const tierCards = player.roster.filter((c) => Number(c.level) === lvl);
  $("handGrid").innerHTML = tierCards
    .map((c) => {
      const isUsed = player.usedCardIds.includes(c.id);
      const isCap = c.id === player.captainId;
      const isVc = c.id === player.viceCaptainId;

      let badges = "";
      if (isCap) badges += '<span class="badge badge-cap">CAP 1.8×</span>';
      if (isVc) badges += '<span class="badge badge-vc">VC 1.4×</span>';
      if (isUsed) badges += '<span class="badge badge-used">USED</span>';

      const classes = [isCap ? "cap-card" : isVc ? "vc-card" : "", isUsed ? "used" : ""].filter(Boolean).join(" ");
      return renderCardMarkup(c, { badgeHtml: badges, extraClass: classes, selectedRibbon: false });
    })
    .join("");

  $("handGrid").querySelectorAll(".game-card").forEach((el) => {
    el.onclick = () => {
      const cid = el.dataset.id;
      if (player.usedCardIds.includes(cid)) return;
      selectedCardId = cid;

      $("btnLockMove").disabled = false;
      if (isOnline()) {
        $("btnLockMove").textContent = "Lock My Move Privately & Wait for Opponent";
      } else if (isComputer()) {
        $("btnLockMove").textContent = "Lock Move & Battle Computer!";
      } else {
        $("btnLockMove").textContent =
          pickStep === "P1_PICK"
            ? `Lock ${player.name}'s Move & Pass to ${matchState.players.B.name}`
            : `Lock ${player.name}'s Move & Simulate Clash!`;
      }

      $("handGrid").querySelectorAll(".game-card").forEach((cardEl) => {
        const isThis = cardEl.dataset.id === selectedCardId;
        cardEl.classList.toggle("selected", isThis);
        const existingRibbon = cardEl.querySelector(".selected-ribbon");
        if (isThis && !existingRibbon) {
          cardEl.insertAdjacentHTML("afterbegin", '<div class="selected-ribbon">✓ SELECTED</div>');
        } else if (!isThis && existingRibbon) {
          existingRibbon.remove();
        }
      });

      updateSelectedPreviewBar(player);
    };
  });
}

function resolveOnlineTurnOnHost() {
  if (!lockedMoveA || !remoteMoveBuffer) return;
  const record = executeTurnClash(matchState, {
    moveA: lockedMoveA,
    moveB: remoteMoveBuffer,
  });

  const stateSnapshot = snapshotMatchState();
  roomClient.send({
    type: "HOST_ROUND_RESOLVED",
    record,
    stateAfter: stateSnapshot,
  });
  persistOnlineState();

  lockedMoveA = null;
  remoteMoveBuffer = null;
  myMoveLockedOnline = false;
  pickStep = "CLASH_REVEAL";
  runAnimatedBattleSimulation(record);
}

// ============================================================================
// VISUAL CALCULATION CARDS & 60FPS ANIME VFX SIMULATION (N13_firebase style)
// ============================================================================
function buildCalcCardHtml({ attackerName, defenderName, style, atkVal, defVal, resObj }) {
  const isHit = resObj.damage > 0;
  const branchClass = isHit ? "branch-hit" : "branch-block";
  const branchText = isHit ? "HIT · ATK > DEF" : "BLOCKED · SHIELD GAINED";

  const chips = [`<span class="calc-chip">Style: ${style}</span>`];
  if (resObj.roleBonus !== "NONE") {
    chips.push(`<span class="calc-chip mod-leader">${resObj.roleBonus}</span>`);
  }

  return `
    <div class="calc-card">
      <div class="calc-card-header">
        <strong>${attackerName} → ${defenderName}</strong>
        <span class="branch-tag ${branchClass}">${branchText}</span>
      </div>
      <div class="calc-vs-row">
        <span>ATK (${STYLES[style].short}): <strong class="gold-text">${fmt(atkVal)}</strong></span>
        <span class="muted">vs</span>
        <span>DEF (${STYLES[style].short}): <strong class="blue-text">${fmt(defVal)}</strong></span>
      </div>
      <div class="calc-chips">${chips.join("")}</div>
      <div class="calc-outcome">
        <span>Damage: <span class="${isHit ? "red-text" : "ok"}">${fmt(resObj.damage)} HP</span></span>
        <span>${defenderName} Shield: <span class="blue-text">+${fmt(resObj.shield_gain)}</span></span>
      </div>
    </div>
  `;
}

function runAnimatedBattleSimulation(record) {
  clearAnimTimers();
  lastClashRecord = record;

  const pA = matchState.players.A;
  const pB = matchState.players.B;
  const cardA = record.cardA;
  const cardB = record.cardB;
  const fxA = STYLES[record.moveA.style].fx;
  const fxB = STYLES[record.moveB.style].fx;

  const badgeA = `<span class="badge badge-cap">${pA.name}: ${STYLES[record.moveA.style].short}</span>`;
  const badgeB = `<span class="badge badge-vc">${pB.name}: ${STYLES[record.moveB.style].short}</span>`;

  $("turnControls").classList.add("hidden");
  $("turnCurtain").classList.add("hidden");
  $("clashRevealPanel").classList.remove("hidden");
  $("revealDetailsWrapper").classList.add("hidden");
  $("btnReplayAnim").classList.add("hidden");
  $("revealHeadline").textContent = `Round ${record.round} (${levelName(record.level)}) — Live Anime Battle Sequence`;

  const vfxBadge = $("stageVfxBadge");
  const arrowEl = $("stageArrow");
  const statusEl = $("stageStatusBanner");

  $("stageFighterA").innerHTML = renderCardMarkup(cardA, { badgeHtml: badgeA, extraClass: "anim-enter-left" });
  $("stageFighterB").innerHTML = renderCardMarkup(cardB, { badgeHtml: badgeB, extraClass: "anim-enter-right" });
  vfxBadge.className = "vfx-badge";
  vfxBadge.textContent = "FACE OFF!";
  arrowEl.textContent = "⚔️";
  statusEl.textContent = `${pA.name} vs ${pB.name}`;
  fxEngine.playClashIntro();

  animTimers.push(
    setTimeout(() => {
      $("stageFighterA").innerHTML = renderCardMarkup(cardA, { badgeHtml: badgeA, extraClass: "anim-lunge-right" });
      $("stageFighterB").innerHTML = renderCardMarkup(cardB, { badgeHtml: badgeB });
      vfxBadge.className = `vfx-badge vfx-${fxA}`;
      vfxBadge.textContent = `${pA.name} ${STYLES[record.moveA.style].short}!`;
      arrowEl.textContent = "➔";
      statusEl.textContent = `${pA.name} unleashes ${record.moveA.style}!`;
      fxEngine.playStyleAttack("A", fxA);
    }, 680)
  );

  animTimers.push(
    setTimeout(() => {
      const p1Hit = record.resAtoB.damage > 0;
      const p1Heavy = record.resAtoB.damage >= 1.5 || record.resAtoB.roleBonus !== "NONE";
      const popupB = p1Hit
        ? `<div class="floating-popup popup-dmg">HIT! -${fmt(record.resAtoB.damage)} HP</div>`
        : `<div class="floating-popup popup-block">BLOCKED! +${fmt(record.resAtoB.shield_gain)} SH</div>`;

      $("stageFighterA").innerHTML = renderCardMarkup(cardA, { badgeHtml: badgeA });
      $("stageFighterB").innerHTML = renderCardMarkup(cardB, {
        badgeHtml: badgeB,
        extraClass: p1Hit ? "anim-hit" : "anim-block",
        popupHtml: popupB,
      });
      statusEl.textContent = p1Hit
        ? `${pA.name} LANDS ${fmt(record.resAtoB.damage)} DMG!`
        : `${pB.name} BLOCKED! (+${fmt(record.resAtoB.shield_gain)} Shield)`;

      fxEngine.playImpact("B", { isHit: p1Hit, heavy: p1Heavy, style: fxA, isCounter: false });
    }, 1140)
  );

  animTimers.push(
    setTimeout(() => {
      $("stageFighterA").innerHTML = renderCardMarkup(cardA, { badgeHtml: badgeA });
      $("stageFighterB").innerHTML = renderCardMarkup(cardB, { badgeHtml: badgeB, extraClass: "anim-lunge-left" });
      vfxBadge.className = `vfx-badge vfx-${fxB}`;
      vfxBadge.textContent = `${pB.name} ${STYLES[record.moveB.style].short}!`;
      arrowEl.textContent = "⬅";
      statusEl.textContent = `${pB.name} counters with ${record.moveB.style}!`;
      fxEngine.playStyleAttack("B", fxB);
    }, 2050)
  );

  animTimers.push(
    setTimeout(() => {
      const p2Hit = record.resBtoA.damage > 0;
      const p2Heavy = record.resBtoA.damage >= 1.5 || record.resBtoA.roleBonus !== "NONE";
      const popupA = p2Hit
        ? `<div class="floating-popup popup-dmg">HIT! -${fmt(record.resBtoA.damage)} HP</div>`
        : `<div class="floating-popup popup-block">BLOCKED! +${fmt(record.resBtoA.shield_gain)} SH</div>`;

      $("stageFighterA").innerHTML = renderCardMarkup(cardA, {
        badgeHtml: badgeA,
        extraClass: p2Hit ? "anim-hit" : "anim-block",
        popupHtml: popupA,
      });
      $("stageFighterB").innerHTML = renderCardMarkup(cardB, { badgeHtml: badgeB });
      statusEl.textContent = p2Hit
        ? `${pB.name} LANDS ${fmt(record.resBtoA.damage)} DMG!`
        : `${pA.name} BLOCKED! (+${fmt(record.resBtoA.shield_gain)} Shield)`;

      fxEngine.playImpact("A", { isHit: p2Hit, heavy: p2Heavy, style: fxB, isCounter: false });

      updateHud();
      renderHistoryLog();
    }, 2510)
  );

  animTimers.push(
    setTimeout(() => {
      vfxBadge.className = "vfx-badge";
      vfxBadge.textContent = "CLASH RESOLVED";
      arrowEl.textContent = "✓";
      $("btnReplayAnim").classList.remove("hidden");
      $("revealDetailsWrapper").classList.remove("hidden");

      $("calcCardsGrid").innerHTML =
        buildCalcCardHtml({
          attackerName: pA.name,
          defenderName: pB.name,
          style: record.moveA.style,
          atkVal: record.atkA,
          defVal: record.defB,
          resObj: record.resAtoB,
        }) +
        buildCalcCardHtml({
          attackerName: pB.name,
          defenderName: pA.name,
          style: record.moveB.style,
          atkVal: record.atkB,
          defVal: record.defA,
          resObj: record.resBtoA,
        });

      $("revealNetSummary").innerHTML = `
        <div>${pA.name} HP Lost: <span class="red-text">-${fmt(record.dmgAppliedToA.hpLost)} HP</span> | Shield: <span class="ok">+${fmt(record.resBtoA.shield_gain)}</span></div>
        <div>${pB.name} HP Lost: <span class="red-text">-${fmt(record.dmgAppliedToB.hpLost)} HP</span> | Shield: <span class="ok">+${fmt(record.resAtoB.shield_gain)}</span></div>
      `;

      $("btnNextTurn").textContent =
        matchState.status === "FINISHED"
          ? "View Final Match Result"
          : `Continue to Round ${matchState.round + 1} (${levelName(matchState.level)})`;
    }, 3200)
  );
}

function handleLockMove() {
  if (!selectedCardId) return;

  const chosenMove = {
    cardId: selectedCardId,
    style: selectedStyle,
  };

  if (isOnline()) {
    myMoveLockedOnline = true;
    $("turnControls").classList.add("hidden");
    $("turnCurtain").classList.remove("hidden");
    $("btnRevealTurn").classList.add("hidden");
    $("turnCurtainTitle").textContent = "Move Locked Privately!";
    updateHud();

    if (roomClient.role === "HOST") {
      lockedMoveA = chosenMove;
      if (remoteMoveBuffer) {
        resolveOnlineTurnOnHost();
      } else {
        $("turnCurtainSub").textContent = "Waiting for Player 2 to lock their move in the room...";
      }
    } else {
      roomClient.send({ type: "GUEST_MOVE_LOCKED", move: chosenMove, round: matchState.round });
      $("turnCurtainSub").textContent = "Sent to Host! Waiting for simultaneous clash resolution...";
    }
    return;
  }

  if (isComputer()) {
    const pB = matchState.players.B;
    const availB = pB.roster.filter((c) => Number(c.level) === matchState.level && !pB.usedCardIds.includes(c.id));
    const aiCard = shuffle(availB)[0];
    const aiStyle = shuffle(Object.keys(STYLES))[0];
    const record = executeTurnClash(matchState, {
      moveA: chosenMove,
      moveB: { cardId: aiCard.id, style: aiStyle },
    });
    pickStep = "CLASH_REVEAL";
    runAnimatedBattleSimulation(record);
    return;
  }

  if (pickStep === "P1_PICK") {
    lockedMoveA = chosenMove;
    pickStep = "P2_PICK";
    prepareTurnCurtain();
    return;
  }

  const record = executeTurnClash(matchState, {
    moveA: lockedMoveA,
    moveB: chosenMove,
  });

  pickStep = "CLASH_REVEAL";
  runAnimatedBattleSimulation(record);
}

function advanceTurn() {
  clearAnimTimers();
  if (matchState.status === "FINISHED") {
    $("clashRevealPanel").classList.add("hidden");
    $("matchOverPanel").classList.remove("hidden");
    const w = matchState.winner;
    $("winnerTitle").textContent =
      w === "DRAW" ? "Match Ended in a Draw!" : `${matchState.players[w].name} Wins the Match!`;
    const pA = matchState.players.A;
    const pB = matchState.players.B;
    $("winnerSummary").textContent =
      `${pA.name}: ${fmt(pA.hp)} HP (+${fmt(pA.extraArmorHp)} Temp HP) | ${pB.name}: ${fmt(pB.hp)} HP (+${fmt(pB.extraArmorHp)} Temp HP)`;
    return;
  }

  pickStep = "P1_PICK";
  lockedMoveA = null;
  if (!isOnline()) remoteMoveBuffer = null;
  myMoveLockedOnline = false;
  selectedCardId = null;
  prepareTurnCurtain();
}


function renderMyRosterStatus() {
  const container = $("myRosterStatusBody");
  const pill = $("rosterSummaryPill");
  if (!container || !pill || !matchState) return;

  const side = mySide();
  const player = matchState.players[side];
  if (!player) return;

  const usedSet = new Set(player.usedCardIds || []);
  const playedCards = player.roster.filter((c) => usedSet.has(c.id));
  const unplayedCards = player.roster.filter((c) => !usedSet.has(c.id));

  pill.textContent = `${playedCards.length} Played · ${unplayedCards.length} Not Played`;

  const renderStatusCard = (c, played) => {
    const isCap = c.id === player.captainId;
    const isVc = c.id === player.viceCaptainId;
    const roleTag = isCap
      ? '<span class="badge badge-cap">CAP 1.8×</span>'
      : isVc
      ? '<span class="badge badge-vc">VC 1.4×</span>'
      : "";
    const stateTag = played
      ? '<span class="badge badge-used">PLAYED</span>'
      : '<span class="badge badge-vc" style="background:#065f46;color:#a7f3d0;">NOT PLAYED</span>';
    return renderCardMarkup(c, {
      badgeHtml: roleTag + stateTag,
      extraClass: played ? "used" : isCap ? "cap-card" : isVc ? "vc-card" : "",
    });
  };

  container.innerHTML = `
    <div class="muted" style="margin-bottom:8px;">
      Showing <strong>${player.name}</strong>'s full ${player.roster.length}-card roster.
    </div>
    <h3 class="ok" style="margin:6px 0;">Not Played Yet (${unplayedCards.length})</h3>
    <div class="card-grid">
      ${
        unplayedCards.length
          ? unplayedCards.map((c) => renderStatusCard(c, false)).join("")
          : '<div class="muted">All cards have been played.</div>'
      }
    </div>
    <h3 class="muted" style="margin:12px 0 6px;">Already Played (${playedCards.length})</h3>
    <div class="card-grid">
      ${
        playedCards.length
          ? playedCards.map((c) => renderStatusCard(c, true)).join("")
          : '<div class="muted">No cards played yet.</div>'
      }
    </div>
  `;
}

function renderHistoryLog() {
  if (!matchState) return;
  $("historyLog").innerHTML = matchState.history
    .slice()
    .reverse()
    .map((item) => {
      if (item.type === "SHIELD_ACTIVATED") {
        const p = matchState.players[item.playerSide];
        return `<div class="history-item"><b>[Round ${item.round}]</b> ${p.name} used 2.00 Shield (+${fmt(item.restored)} HP, +${fmt(item.gained)} Temp HP)</div>`;
      }
      const pA = matchState.players.A;
      const pB = matchState.players.B;
      return `<div class="history-item"><b>[Round ${item.round} · ${levelName(item.level)}]</b> ${pA.name} (${item.cardA.name} · ${item.moveA.style}) vs ${pB.name} (${item.cardB.name} · ${item.moveB.style}) → ${pA.name} -${fmt(item.dmgAppliedToA.hpLost)} HP (+${fmt(item.resBtoA.shield_gain)} SH), ${pB.name} -${fmt(item.dmgAppliedToB.hpLost)} HP (+${fmt(item.resAtoB.shield_gain)} SH)</div>`;
    })
    .join("");
}

function renderRulesAndAuditModal() {
  const auditHtml = draftedTeams?.audit?.length
    ? draftedTeams.audit
        .map(
          (r) => `
          <div class="rule-box">
            <h4>${levelName(r.level)} Candidate Pool <span class="rule-badge-branch">${r.pool} Cards</span></h4>
            <div class="rule-line"><b>Styles:</b> ${r.styles.length ? r.styles.join(" · ") : "Random"}</div>
            <div class="rule-line"><b>Density:</b> High ${r.density.high} · Med ${r.density.medium} · Low ${r.density.low}</div>
            <div class="rule-line"><b>Pool Cards:</b> ${r.poolCards.map((c) => `${c.id} ${c.name}`).join(", ")}</div>
          </div>`
        )
        .join("")
    : "";

  $("rulesModalBody").innerHTML = `
    <div class="rule-box">
      <h4>⚔️ Attack &amp; Block Resolution <span class="rule-badge-branch">5 Styles</span></h4>
      <div class="rule-line"><b>Hit:</b> When <code>ATK &gt; DEF</code> (by &gt; 0.0001), attacker deals <code>ATK - DEF</code> damage.</div>
      <div class="rule-line"><b>Block / Tie:</b> When <code>DEF ≥ ATK</code>, defender takes 0 damage and gains <code>max(DEF - ATK, 0)</code> shield (or <code>1.00</code> base shield for Captain/Vice on an exact tie).</div>
    </div>
    <div class="rule-box">
      <h4>★ Captain &amp; Vice-Captain <span class="rule-badge-branch">1.8× / 1.4×</span></h4>
      <div class="rule-line"><b>Captain (1.8×):</b> Multiplies successful attack damage by <b>1.8×</b> and successful block shield gain by <b>1.8×</b>.</div>
      <div class="rule-line"><b>Vice-Captain (1.4×):</b> Multiplies successful attack damage by <b>1.4×</b> and successful block shield gain by <b>1.4×</b>.</div>
    </div>
    <div class="rule-box">
      <h4>🔥 Intense Mode vs Default Mode <span class="rule-badge-branch">${isIntenseMode() ? "INTENSE" : "DEFAULT"}</span></h4>
      <div class="rule-line"><b>Default Mode:</b> No style-exploration restriction across rounds or match.</div>
      <div class="rule-line"><b>Intense Mode:</b> Within every <b>5 rounds</b>, you must explore at least <b>3 distinct combat styles</b>, and across the <b>full match</b> you must explore at least <b>4 distinct combat styles</b>.</div>
    </div>
    <div class="rule-box">
      <h4>🛡️ Manual Shield &amp; HP <span class="rule-badge-branch">10.00 HP</span></h4>
      <div class="rule-line"><b>Starting HP:</b> 10.00 HP per team. Spend <b>2.00 Shield</b> on your turn to gain <b>+20% HP</b> (<b>+2.00 HP</b> on a 10.00 HP pool).</div>
      <div class="rule-line"><b>Tier Progression:</b> Clear all fighters in Level 1 → Level 2 → Level 3 → Level 4 → Level 5 → Special.</div>
    </div>
    ${auditHtml}
  `;
}

// ============================================================================
// WIRE BUTTONS & CHOICE GROUPS (N13_firebase UI bindings)
// ============================================================================
$("modeBtnGroup").querySelectorAll("button").forEach((btn) => {
  btn.onclick = () => {
    $("modeBtnGroup").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    playMode = btn.dataset.mode;
    $("onlineRoomPanel").classList.toggle("hidden", !isOnline());
    updateRoomHeaderBadge();
  };
});

$("btnCreateRoom").onclick = handleCreateRoom;
$("btnJoinRoom").onclick = handleJoinRoom;

$("presetSelect").onchange = renderPresetSummary;
$("btnDraftTeams").onclick = startDraft;
$("btnRevealLeaders").onclick = () => {
  $("btnRevealLeaders").classList.remove("hidden");
  $("leaderCurtain").classList.add("hidden");
  $("leaderPickerContent").classList.remove("hidden");
  renderLeaderPicker();
};
$("btnConfirmLeaders").onclick = confirmLeaders;
$("btnRevealTurn").onclick = revealActiveHand;
$("btnLockMove").onclick = handleLockMove;
$("btnNextTurn").onclick = advanceTurn;
$("btnReplayAnim").onclick = () => lastClashRecord && runAnimatedBattleSimulation(lastClashRecord);
$("btnShieldA").onclick = () => handleActivateShield("A");
$("btnShieldB").onclick = () => handleActivateShield("B");
$("btnRestartTop").onclick = () => showScreen("screenSetup");
$("btnPlayAgain").onclick = () => showScreen("screenSetup");
$("btnToggleSfx").onclick = () => {
  sfxEnabled = !sfxEnabled;
  fxEngine.setSoundEnabled(sfxEnabled);
  $("btnToggleSfx").textContent = sfxEnabled ? "🔊 SFX: ON" : "🔇 SFX: OFF";
};

$("styleBtnGroup").querySelectorAll("button").forEach((btn) => {
  btn.onclick = () => {
    $("styleBtnGroup").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedStyle = btn.dataset.style;
    if (matchState) updateSelectedPreviewBar(matchState.players[mySide()]);
  };
});

const openRulesFn = () => {
  renderRulesAndAuditModal();
  $("rulesModal").classList.remove("hidden");
};
$("btnOpenRules").onclick = openRulesFn;
$("btnViewAudit").onclick = openRulesFn;
$("btnCloseRules").onclick = () => $("rulesModal").classList.add("hidden");
$("rulesModal").onclick = (e) => {
  if (e.target === $("rulesModal")) $("rulesModal").classList.add("hidden");
};

renderPresetSummary();
initDatabase();
