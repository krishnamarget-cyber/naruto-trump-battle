NARUTO TRUMP BATTLE — V4 ROLE PERSISTENCE + ATTACK EFFECTS

Run:
1. Extract the complete ZIP into a new folder.
2. Open the folder in Acode or another Android editor.
3. Start its local preview/server and open index.html.
   Do not use file:// directly if your browser blocks fetching cards.json.

V4 fixes:
- Captain and Vice Captain selections update without refreshing the page.
- Both selected roles remain visibly highlighted.
- Changing one role correctly re-enables the old card's opposite-role button.
- A card cannot be both Captain and Vice Captain.
- Attack visuals now have distinct animated effects for Taijutsu, Kunai,
  Special, Ninjutsu and Genjutsu.
- Existing HP damage, shield and temporary HP calculations remain unchanged.
- Missing optional core stats are omitted instead of displaying NaN.

The original cards.json and portrait assets are retained.

V5 combat presentation improvements:
- Attack phases last longer so each move is easier to see.
- A travelling attack effect moves from the attacking side toward the opponent.
- Successful damage displays a red HIT mark on the target fighter.
- When the attack deals no damage and earns shield, a blue shield barrier emerges on the target.
- Attack-style choices show emoji icons: 👊 Taijutsu, 🗡️ Kunai, 💥 Special,
  🔥 Ninjutsu and 🌀 Genjutsu.
- Combat math, simultaneous resolution, cards, portraits, and roster rules are unchanged.

Online room multiplayer is NOT included in V5. It is the planned next phase and will
need room creation/join codes plus a real-time backend to synchronize two devices.


ONLINE FRIEND ROOMS — INITIAL FIREBASE INTEGRATION
1. Firebase project: narutotrump-5181a
2. Enable Authentication > Sign-in method > Anonymous.
3. Create Realtime Database in Singapore (asia-southeast1).
4. Open Realtime Database > Rules.
5. Replace the current locked rules with the contents of firebase-database-rules.json, then Publish.
   These rules allow an authenticated host to create a room and one authenticated friend
   to claim the empty Player 2 slot. Room reads are limited to the two room members.
6. Run the game through an HTTPS host or a local web server (not file://).
7. Tap ONLINE WITH FRIENDS > CREATE PRIVATE ROOM. Share the six-character code.
   On the other device, tap ONLINE WITH FRIENDS > enter code > JOIN FRIEND'S ROOM.

NOTE: This build adds Firebase anonymous sign-in and private room creation/joining
with live two-player presence. It is the online lobby foundation; synchronized team
selection and combat are the next integration phase. Local and computer modes are
unchanged. The room state is currently a lobby only; do not treat room connection
as completed online gameplay yet.


ONLINE INTEGRATION BUILD (2026-11-11)
- Replaced firebase-online.js with a room-to-game flow that renders team selection after host start.
- Reuses cards.json and assets/portraits; app.js local/computer modes are unchanged.
- Includes team role selection, level-based fighter selection, attack-style selection, simultaneous damage calculation, HP/shield/temp HP, level progression, and round result sync.
- Firebase rules currently allow room participants to read the shared room. This build stores game selections in the shared room, so choices are not cryptographically/private-path protected. Use only with trusted friends.
- Static validation is not a substitute for a live two-device Firebase test. The Firebase project must have Anonymous Authentication enabled and compatible Realtime Database rules published.


ONLINE START HANDOFF FIX
- The host now reads back the committed room/game state after starting and explicitly renders the team-selection screen.
- The realtime database listener remains active for Player 2 and subsequent synchronization.
- This is a code-level handoff fix; it does not bypass Firebase Authentication configuration errors.
- If Firebase reports auth/api-key-not-valid, verify the Web API key in Firebase Project Settings, that the key is enabled, and that API restrictions allow Identity Toolkit API. Also confirm Anonymous Authentication is enabled.
- Deploy all files from this folder together to the GitHub Pages repository root. Keep assets/portraits intact.
- Testing status: static JavaScript syntax and archive integrity only; no live two-phone Firebase test has been performed.
