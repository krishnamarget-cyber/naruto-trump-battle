// Firebase friend-room connection for Naruto Trump Battle.
// Uses the Firebase Web SDK directly; local/computer modes remain in app.js.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getDatabase, ref, set, get, onValue, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBegDbkC06g8FzT5lNbtSCxSYgZZb_18iY",
  authDomain: "narutotrump-5181a.firebaseapp.com",
  databaseURL: "https://narutotrump-5181a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "narutotrump-5181a",
  storageBucket: "narutotrump-5181a.firebasestorage.app",
  messagingSenderId: "552251464572",
  appId: "1:552251464572:web:c4d60a2a082ed81671a2f9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
let currentRoom = "";
let currentRole = "";
let unsubscribeRoom = null;
let currentRoomData = null;

const $ = s => document.querySelector(s);
const randomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => chars[b % chars.length]).join("");
};
async function ensureUser() {
  if (auth.currentUser) return auth.currentUser;
  const result = await signInAnonymously(auth);
  return result.user;
}
function showError(message) {
  const el = $("#online-error");
  if (el) el.textContent = message;
  else alert(message);
}
function stopRoomListener() {
  if (unsubscribeRoom) unsubscribeRoom();
  unsubscribeRoom = null;
}
function roomPage(message = "Connecting…") {
  const appRoot = document.querySelector("#app");
  appRoot.innerHTML = `<section class="page">
    <div class="hero"><h2 class="gold">PRIVATE FRIEND ROOM</h2><p class="muted">Naruto Trump Battle • Online</p></div>
    <div class="panel center">
      <p class="muted">ROOM CODE</p><h1 class="gold" style="font-size:2.5rem;letter-spacing:.18em">${currentRoom}</h1>
      <p id="online-room-status">${message}</p>
      <p class="muted" id="online-player-count">Waiting for players…</p>
      <button class="btn blue" id="copy-room-code">COPY ROOM CODE</button>
    </div>
    <div class="panel"><b>PLAYER 1</b><p id="online-p1">Connecting…</p><b>PLAYER 2</b><p id="online-p2">Waiting to join…</p></div>
    <p id="online-error" class="status danger"></p>
    <button class="btn" onclick="leaveOnlineRoom()">LEAVE ROOM</button>
    <p class="muted center">Share this code only with your friend.</p>
  </section>`;
  $("#copy-room-code")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(currentRoom); $("#copy-room-code").textContent = "COPIED!"; }
    catch { showError("Copy was blocked by the browser. Please copy the code manually."); }
  });
}
function watchRoom(code) {
  stopRoomListener();
  const roomRef = ref(database, `rooms/${code}`);
  unsubscribeRoom = onValue(roomRef, snap => {
    if (!snap.exists()) { showError("This room no longer exists."); return; }
    currentRoomData = snap.val();
    const p1 = currentRoomData.players?.p1;
    const p2 = currentRoomData.players?.p2;
    const joined = Boolean(p1 && p2);
    const status = $("#online-room-status");
    const count = $("#online-player-count");
    const p1el = $("#online-p1"), p2el = $("#online-p2");
    if (status) status.textContent = joined ? "Both players connected. Room is ready." : "Waiting for your friend to join…";
    if (count) count.textContent = joined ? "2 / 2 players connected" : "1 / 2 players connected";
    if (p1el) p1el.textContent = p1 === auth.currentUser?.uid ? "You (Host) ✓" : "Host connected ✓";
    if (p2el) p2el.textContent = p2 ? (p2 === auth.currentUser?.uid ? "You (Player 2) ✓" : "Friend connected ✓") : "Waiting to join…";
  }, err => showError(err.message));
}
window.openOnlineMenu = () => {
  document.querySelector("#app").innerHTML = `<section class="page">
    <div class="hero"><h2 class="gold">PLAY WITH FRIENDS</h2><p class="muted">Create a private room or join your friend's room.</p></div>
    <div class="panel"><h3 class="gold">CREATE ROOM</h3><p class="muted">Create a room and share its six-character code.</p><button class="btn primary" id="create-room">CREATE PRIVATE ROOM</button></div>
    <div class="panel"><h3 class="gold">JOIN ROOM</h3><input id="join-room-code" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="ENTER 6-CHARACTER CODE" style="width:100%;padding:14px;border-radius:10px;background:#111827;color:white;border:1px solid #475569;margin:8px 0"><button class="btn blue" id="join-room">JOIN FRIEND'S ROOM</button></div>
    <p id="online-error" class="status danger"></p><button class="btn" onclick="menu()">BACK</button>
  </section>`;
  $("#create-room").addEventListener("click", createRoom);
  $("#join-room").addEventListener("click", () => joinRoom($("#join-room-code").value));
};
async function createRoom() {
  const button = $("#create-room");
  if (button) { button.disabled = true; button.textContent = "CREATING…"; }
  try {
    const user = await ensureUser();
    let code, roomRef, created = false;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      code = randomCode();
      roomRef = ref(database, `rooms/${code}`);
      try {
        await set(roomRef, { players: { p1: user.uid, p2: null }, status: "waiting", createdAt: Date.now(), gameVersion: 4 });
        created = true;
      } catch (writeError) {
        // A code collision is rejected by the database create-only rule; try another code.
        if (attempt === 4) throw writeError;
      }
    }
    if (!created) throw new Error("Couldn't reserve a room code. Please try again.");
    currentRoom = code; currentRole = "host";
    roomPage("Waiting for your friend to join…"); watchRoom(code);
  } catch (err) { showError(err.message || "Could not create room."); if (button) { button.disabled = false; button.textContent = "CREATE PRIVATE ROOM"; } }
}
async function joinRoom(rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) { showError("Enter a valid six-character room code."); return; }
  const button = $("#join-room");
  if (button) { button.disabled = true; button.textContent = "JOINING…"; }
  try {
    const user = await ensureUser();
    const roomRef = ref(database, `rooms/${code}`);
    // Join by claiming the empty P2 slot. Rules permit only the first authenticated claimant.
    await set(ref(database, `rooms/${code}/players/p2`), user.uid);
    currentRole = "guest";
    currentRoom = code;
    roomPage("Joining room…"); watchRoom(code);
  } catch (err) { showError(err.message || "Could not join room."); if (button) { button.disabled = false; button.textContent = "JOIN FRIEND'S ROOM"; } }
}
window.leaveOnlineRoom = () => {
  stopRoomListener();
  currentRoom = ""; currentRole = ""; currentRoomData = null;
  window.openOnlineMenu();
};
window.narutoOnline = {
  get roomCode() { return currentRoom; },
  get role() { return currentRole; },
  get user() { return auth.currentUser; },
  database,
  auth
};
onAuthStateChanged(auth, user => {
  // Sign-in is intentionally lazy; local play never requires network authentication.
});
