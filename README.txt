NARUTO TRUMP BATTLE — PASS & PLAY EDITION

This build is for two players sharing one device. It has no online multiplayer,
Firebase authentication, room codes, or network dependency.

HOW TO PLAY
1. Extract this ZIP.
2. Open the folder in Acode or another Android editor.
3. Start a local preview/server and open index.html.
4. Choose PASS & PLAY • 2 PLAYERS.
5. Player 1 selects a Captain and a different Vice Captain, then confirms.
6. Pass the device to Player 2. Player 2 selects their roles and confirms.
7. Pass the device as instructed for private fighter and attack-style choices.
8. Both attacks resolve simultaneously; the game displays the round result.

You can also choose PLAY WITH COMPUTER from the main menu.

CONTENTS
- index.html
- app.js
- style.css
- cards.json (120 cards)
- assets/portraits (120 portraits)

No Firebase setup or API key is required.

TEST STATUS
- JavaScript syntax check: passed.
- JSON parse and 120 unique card IDs: passed.
- 120 portrait files: passed.
- ZIP integrity: passed.
- This package has not been tested on your specific Android phone.


CAPTAIN / VICE CAPTAIN ROLE BONUS
- Captain: successful attack damage and successful block shield gain are multiplied by 1.8×.
- Vice Captain: successful attack damage and successful block shield gain are multiplied by 1.4×.
- A successful attack occurs when ATK exceeds opposing DEF by more than 0.0001.
- Otherwise the attack is blocked and the applicable Captain/Vice Captain multiplier is applied to shield gained (including exact ties).
- Other fighters receive no role bonus.
- Starting and maximum team HP: 10.00.
- Shield is accumulated from successful blocks. It is not activated automatically.
- A player may manually spend 2.00 shield at any time during their own battle turn.
- Each manual shield use restores up to 1.125 HP (without exceeding 10.00) and grants temporary HP using the existing recovery formula, capped at 0.50.
- Multipliers are applied to the calculated damage or shield gain before team HP/shield updates.


CAPTAIN / VICE CAPTAIN BONUS (VISIBLE FIX)
- Captain attack damage ×1.8 when successful; Captain block shield gain ×1.8 when blocked (including a tie, which grants a 1.00 base shield before the multiplier).
- Vice Captain attack damage ×1.4 when successful; Vice Captain block shield gain ×1.4 when blocked (including a tie, which grants a 1.00 base shield before the multiplier).
- Other fighters receive no role bonus.
- The selected Captain/Vice badge appears beside their fighter during selection.
- The attack result displays the applied bonus so it is clear during battle.


MATCH PRESETS & CANDIDATE-POOL SELECTION
----------------------------------------
Before each match, choose a preset and selection mode.

PRESETS
- Quick Match: 10 cards per player — L1×2, L2×2, L3×2, L4×2, L5×1, Special×1.
- Standard Match: 15 cards per player — L1×3, L2×3, L3×3, L4×3, L5×2, Special×1.

CANDIDATE POOLS
- Every tier starts with its 20 source cards.
- Each tier independently gets a 15- or 16-card candidate pool, chosen randomly.
- The match then randomly draws the required number of cards from each tier's pool.
- The selected cards are shuffled and split between the two players.
- A card ID cannot be assigned to both players in the same match.

SELECTION MODES
- Balanced Meta: Phase 1 uses the top two distinct candidates from each of the five attack styles.
- Dynamic Meta: randomly chooses three of the five attack styles and uses the top two distinct candidates from each.
- Weakest Meta: mirrors Dynamic Meta but uses the weakest two distinct candidates from three randomly chosen styles.
- Random: chooses the entire 15/16-card candidate pool randomly, without stat-based ranking.

FIVE PHASES
1. Style anchors: inspect up to five positions per selected style; keep two distinct anchors and hold duplicate/reserve candidates.
2. Holds and promotions: promote held candidates and fill from the container.
3. Attack-density selection: balance high, medium and low attack-density candidates.
4. Final bonus selection: fill remaining spaces using multi-style average, minimum-stat floor and density scoring.
5. Validation: remove duplicates, fill any missing pool slots and shuffle the candidate pool.

A draft audit screen is available during team selection. It shows the chosen mode, selected styles, candidate pool size, density distribution and the number of cards drawn per tier.

The selection algorithm only changes team generation. The current battle rules use 10.00 starting/maximum HP, a manually activated 2.00-shield recovery, and Captain/Vice-Captain multipliers of 1.8×/1.4× for successful attacks and blocks.

SELECTION VALIDATION
- Node syntax check passed.
- 160 automated match-generation simulations passed across all four selection modes and both presets.
- All six tier pools were 15 or 16 cards in every simulation.
- Team sizes, per-tier splits and no-duplicate-ID constraints passed.
