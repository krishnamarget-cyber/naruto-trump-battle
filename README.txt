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

ONLINE BATTLE ALPHA (Firebase)
------------------------------
This build adds an online two-phone battle flow to the existing browser game:
- Host creates a room; friend joins with six-character code.
- Host starts a match and deals 15 distinct cards to each player (3 each Levels 1-4, 2 Level 5, 1 Level 6).
- Each player selects a different Captain and Vice Captain and locks their team.
- Each player selects a current-level fighter and one of five attack styles.
- Host resolves both attacks together using the same pre-round stats, then both clients receive the shared result.
- Existing local/computer game code and 120-card data are retained.

IMPORTANT SECURITY / TEST STATUS
--------------------------------
This is an integration alpha, not production-secure multiplayer. The currently published Realtime Database rules allow each room member to read the room object, so private selections are hidden by the interface but are not cryptographically/private-rule protected against a technically curious opponent. Do not use this for competitive or sensitive play until the rules and private data paths are redesigned and validated. A trusted server/Cloud Function should validate turns and resolve combat for production fairness.

Deployment:
1. Upload/replace index.html, app.js, style.css, cards.json, firebase-online.js, and assets/portraits/* in the GitHub Pages repository, preserving paths.
2. Keep Firebase Realtime Database rules as currently configured for this alpha.
3. Open the HTTPS site on both phones. Host creates a room; friend joins; host taps Start Online Game.
4. Each player confirms Captain/Vice, then chooses a fighter/style and locks. Host device resolves each round and advances.

The JavaScript syntax and archive integrity were checked. A real two-device end-to-end battle test has NOT been performed in this environment.
