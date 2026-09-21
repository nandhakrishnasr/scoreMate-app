# ScoreMate Cricket Scoring Engine Audit

**Audit Date:** September 14, 2026  
**Audited Modules:**
- `src/hooks/useScoring.ts`
- `src/types/match.ts`
- `src/context/MatchContext.tsx`
- Relevant scoring interactions in `src/App.tsx`

---

## Executive Summary of Audit

A comprehensive code-level audit of the ScoreMate scoring engine was conducted by tracing all mathematical state transitions and cricket law interactions. The engine supports core linear flows (standard runs, dot balls, basic over completion, deep-clone undo), but contains **critical deviations from official cricket laws (MCC Laws of Cricket / ICC Standard Playing Conditions)**, alongside state desynchronizations in edge cases.

### Key Audit Findings
- **11 Definite Scoring Bugs / Rule Violations** identified (6 High/Critical severity, 5 Medium severity).
- **Major Rule Violations:** Byes and Leg Byes charged against bowler figures; Bowlers credited with Run Out wickets; Striker always dismissed on Run Outs (inability to dismiss non-striker); Strike rotation broken on single/odd runs on ball 6; Strike rotation failing on Wides/Byes/Leg Byes; Boundary runs on No Balls credited as extras rather than batter runs; Free Hit dismissals not restricted; Bowler career/match figures resetting to 0 on returning spells.
- **Undo State Desynchronization:** Selection modal states (`nextBatterOpen`, `nextBowlerOpen`) and post-match transitions are not cleanly rolled back on undo.

---

## Detailed Audit by Scenario

### 1. Normal Scoring (0 through 7 Runs)

#### State Transition Logic (`useScoring.ts:42-88`)
- **Dot Ball (0 runs):**
  - `isLegal = true`, `batterRuns = 0`, `extras = 0`.
  - `striker.balls += 1`, `bowler.balls += 1`.
  - `score.balls += 1`.
  - Strike does not rotate (`oddRun = false`).
  - Correct.
- **1, 3, 5, 7 Runs:**
  - `batterRuns = value`, `extras = 0`.
  - `striker.runs += value`, `bowler.runs += value`.
  - `oddRun = value % 2 === 1` evaluates to `true`.
  - Batters swap ends (`striker` and `nonStriker` switch).
  - *Note on 5 and 7:* In `useScoring.ts:53`, `fours` is only incremented if `value === 4`, and `sixes` if `value === 6`. A 5 or 7 run all-run is correctly recorded as running runs without boundary credit.
  - *Edge Case on Ball 6:* See Section 6 below for single/odd runs on ball 6 (Critical Bug).
- **2, 4, 6 Runs:**
  - `oddRun = false`. Batters do not swap ends.
  - `4`: `striker.fours += 1`.
  - `6`: `striker.sixes += 1`.
  - Correct on balls 1–5.

---

### 2. Wides

#### State Transition Logic
```ts
const isLegal = kind !== 'wide' && kind !== 'noBall'
const batterRuns = kind === 'runs' ? value : 0
const extras = kind === 'wide' || kind === 'noBall' ? 1 + value : ...
```
- **Single Wide (`value = 0`):**
  - `isLegal = false`.
  - `extras = 1`. `score.runs += 1`, `bowler.runs += 1`.
  - `score.balls` and `striker.balls` do NOT increment.
  - Over does NOT advance.
  - Delivery label: `'WD'`.
  - Correct.
- **Wide + Additional Runs (e.g. `value = 1` or `4` byes/overthrows):**
  - `extras = 1 + value`. Total runs added = `1 + value`.
  - Charged to bowler runs conceded (`bowler.runs += extras`). In cricket, wide penalties and byes off wides are charged to bowler.
  - **CRITICAL DEFECT (Strike Rotation):**
    ```ts
    if ((kind === 'runs' && value % 2 === 1 || overComplete) && updated.nonStriker.name)
      updated = { ...updated, striker: updated.nonStriker, nonStriker: updated.striker }
    ```
    Because `kind === 'wide'`, `kind === 'runs'` is `false`. If batters run 1 run on a wide (Wide + 1), the batters **NEVER swap strike**.
- **Wide on 6th Ball of Over:**
  - `isLegal = false` -> `overComplete = isLegal && updated.balls % 6 === 0` is `false`.
  - Over does not end. Correct.
- **Undo After Wide:**
  - `history` snapshot restores previous `score`. `balls`, `runs`, and bowler figures are correctly restored.

---

### 3. No Balls

#### State Transition Logic
```ts
const isLegal = kind !== 'wide' && kind !== 'noBall'
const batterRuns = kind === 'runs' ? value : 0
const extras = kind === 'wide' || kind === 'noBall' ? 1 + value : ...
```
- **No Ball Only (`value = 0`):**
  - `isLegal = false`. Team runs += 1, bowler runs += 1.
  - `freeHit` becomes `true`.
  - Ball count does not increase. Correct.
- **No Ball + Boundary / Bat Runs (`value = 4` or `6`):**
  - **CRITICAL DEFECT:**
    Because `kind === 'noBall'`, `batterRuns = 0` and `extras = 1 + 4 = 5`.
    The 4 runs off the bat are added to **team extras** and **bowler runs**, while **striker runs remain 0** and **fours/sixes do not increment**!
    *Cricket Law (MCC Law 21):* Runs scored off the bat from a No Ball belong to the batter. Only the 1-run penalty is an extra.
- **No Ball + Single Run (`value = 1`):**
  - Batters run 1 run. `kind === 'noBall'`.
  - **Strike fails to rotate** because `kind !== 'runs'`.
- **Free Hit Lifecycle:**
  - `freeHit: kind === 'noBall' ? true : isLegal ? false : Boolean(score.freeHit)`.
  - Next ball legal: `freeHit` returns to `false`.
  - Next ball wide or no-ball: `freeHit` stays `true`.
  - **CRITICAL DEFECT:** Dismissals on a Free Hit are not filtered. If `freeHit === true` and the scorer taps `Out -> Bowled`, the striker is given out and the bowler receives a wicket.

---

### 4. Byes and Leg Byes

#### State Transition Logic
```ts
const isLegal = kind !== 'wide' && kind !== 'noBall'
const extras = kind === 'bye' || kind === 'legBye' ? value : 0
nextBowler.runs += batterRuns + extras
```
- **Single Bye / Leg Bye (`value = 1`):**
  - `isLegal = true`. Ball count increments (`balls += 1`, `striker.balls += 1`, `bowler.balls += 1`).
  - `batterRuns = 0`. Striker score does not increase. Correct.
  - **CRITICAL DEFECT (Bowler Conceded Runs):**
    `nextBowler.runs += batterRuns + extras` adds the Bye/Leg Bye runs directly to the bowler's runs conceded!
    *Cricket Law (MCC Law 21 & 23):* Byes and Leg Byes are fielding extras. They are **never** charged to the bowler.
  - **CRITICAL DEFECT (Strike Rotation):**
    `kind === 'bye'`, so `kind === 'runs'` is `false`. When 1 or 3 byes/leg byes are run, the strike **does not rotate**.

---

### 5. Wickets

#### State Transition Logic (`useScoring.ts:55, 70-75`)
```ts
if (kind === 'wicket') {
  nextBowler.wickets += 1
  nextStriker.out = true
  nextStriker.dismissal = formatDismissal(wicket ?? { type: 'Bowled' }, score.bowler.name)
}
```
- **Bowled, Caught, LBW, Stumped, Hit Wicket:**
  - `nextBowler.wickets += 1`. Correct.
  - Dismissal strings formatted properly (`b Bowler`, `c Fielder b Bowler`, `lbw`, etc.).
- **Run Out:**
  - **CRITICAL DEFECT (Bowler Wicket Credit):** `nextBowler.wickets += 1` increments bowler wickets for Run Outs! Bowlers are never credited with a wicket for a run out.
  - **CRITICAL DEFECT (Non-Striker Dismissal Impossible):** The engine hardcodes `nextStriker.out = true`. There is no way to dismiss the non-striker on a run out.
  - **CRITICAL DEFECT (Runs on Run Out):** The UI and scoring engine only support 0 runs on a wicket delivery. Completed runs prior to a run out cannot be scored.
- **Retired Hurt / Retired Out / Absent:**
  - `nextBowler.wickets += 1` increments bowler wickets. Retired hurt is not a bowler wicket and not even a team wicket (batter retires not out).
- **Partnership on Wicket:**
  - `updated = { ...updated, partnership: { runs: 0, balls: 0, batters: [updated.striker.name, updated.nonStriker.name] } }`
  - When the wicket falls, `updated.striker.name` is `'Choose next batter'`.
  - When `chooseNextBatter(name)` is called:
    ```ts
    function chooseNextBatter(name: string) {
      options.setScore({ ...options.score, striker: emptyPlayer(name), battingStats: [...options.score.battingStats, emptyPlayer(name)] })
    }
    ```
    It never updates `score.partnership.batters`. The partnership displays `Choose next batter & [Non-Striker]` until another wicket or match end!

---

### 6. Strike Rotation

#### Code Under Audit (`useScoring.ts:67-68`)
```ts
const oddRun = kind === 'runs' && value % 2 === 1
const overComplete = isLegal && updated.balls % 6 === 0
if ((kind === 'runs' && value % 2 === 1 || overComplete) && updated.nonStriker.name)
  updated = { ...updated, striker: updated.nonStriker, nonStriker: updated.striker }
```

| Delivery Condition | Expected Cricket Law | Current Code Behavior | Result |
|---|---|---|---|
| **1 run on Ball 1–5** | Batters swap ends | `oddRun=true, overComplete=false` -> 1 swap | **PASS** |
| **2 runs on Ball 1–5** | No swap | `oddRun=false, overComplete=false` -> 0 swaps | **PASS** |
| **1 run on Ball 6** | Batters swap for single (Swap 1), change ends for over (Swap 2) = **Same batter retains strike** | `(true \|\| true)` -> **Only 1 swap** executed | **FAIL (CRITICAL BUG)** |
| **3 runs on Ball 6** | Batters swap for 3 runs (Swap 1), change ends for over (Swap 2) = **Same batter retains strike** | `(true \|\| true)` -> **Only 1 swap** executed | **FAIL (CRITICAL BUG)** |
| **0, 2, 4, 6 on Ball 6** | No swap for runs, change ends for over = **Other batter takes strike** | `(false \|\| true)` -> 1 swap executed | **PASS** (by coincidence of boolean OR) |
| **1 Bye / Leg Bye** | Batters crossed -> Strike rotates | `kind === 'bye'` -> Condition is false | **FAIL (CRITICAL BUG)** |
| **Wide + 1 Run** | Batters crossed -> Strike rotates | `kind === 'wide'` -> Condition is false | **FAIL (CRITICAL BUG)** |
| **Wicket on Ball 6** | Not-out batter takes strike at start of next over | Pre-swaps before replacing striker; sets incoming batter as striker | **FAIL (INCORRECT STRIKE)** |

---

### 7. Overs & Bowler Rotation

- **Over Progression:**
  - `updated.balls % 6 === 0` triggers over completion.
  - `overHistory` receives `{ number, bowler, runs, deliveries }`.
  - `currentOver` resets to `[]`.
- **Next Bowler Spell Bug:**
  ```ts
  function chooseNextBowler(name: string) {
    if (!options.score || !name) return
    options.setScore({
      ...options.score,
      bowler: { name, balls: 0, runs: 0, wickets: 0 },
      bowlerStats: [...options.score.bowlerStats, { name, balls: 0, runs: 0, wickets: 0 }]
    })
    setNextBowlerOpen(false)
  }
  ```
  **CRITICAL DEFECT:** If Bowler A bowled over 1 (figures: 6 balls, 8 runs, 1 wicket), and is selected again for over 3, their stats are re-initialized to `{ balls: 0, runs: 0, wickets: 0 }`, and a **duplicate Bowler A entry** is appended to `bowlerStats`. Cumulative bowler figures are wiped out.
- **Consecutive Over Rule:**
  - In `LiveScreen` (`App.tsx:1258`), `availableBowlers = bowlingRoster.filter(p => p.name !== score.bowler.name)`.
  - UI prevents selecting the same bowler consecutively, but `chooseNextBowler` has no internal validation.
- **Maiden Over Calculation:**
  - `countMaidens` in `App.tsx:116`:
    ```ts
    score.overHistory.filter(over => over.bowler === bowlerName && over.deliveries.filter(d => d.legal).length === 6 && over.deliveries.every(d => d.runs === 0)).length
    ```
    If an over contains 6 dots and 1 Bye (`delivery.runs === 1`), `every(d => d.runs === 0)` returns `false`. The over is not credited as a maiden, even though Byes are not charged to the bowler.

---

### 8. Match Completion

- **Target Reached:**
  - `runsAfter >= (firstInningsScore.runs ?? 0) + 1`.
  - Innings completes immediately on the winning run. Correct.
- **All Out:**
  - `wicketsAfter >= wicketLimit`.
  - Normal: `battingRoster.length - 1` (e.g. 10 wickets for an 11-player squad).
  - Last Man Batting: `battingRoster.length`. Striker continues alone with non-striker cleared.
- **Tied Match:**
  - In `finishMatch` (`App.tsx:450`):
    ```ts
    if (finalScore.runs === target - 1) {
      setMatchResult({ winner: 'Match Drawn', margin: '' })
    }
    ```
    Limited-overs cricket terminates in a **Tie**, not a Draw.

---

### 9. Undo Mechanics

- **Core Undo Operation:**
  - `history` array stores `structuredClone(score)` before each ball.
  - `confirmUndo()` pops the last state: `options.setScore(previous)`.
- **Restored State Elements:**
  - Score, wickets, balls, striker stats, non-striker stats, bowler figures, current over, over history, fall of wickets, partnership, free hit.
- **Undo Desynchronizations:**
  1. `nextBatterOpen` and `nextBowlerOpen` modal states are **not reset** in `confirmUndo()`. If an undo is performed after a wicket or over completion, selection sheets remain open or desynchronized.
  2. If a delivery causes `inningsComplete: true`, the app navigates away to `'innings-break'` or `'result'`. In these screens, the **Undo button is not rendered**, making it impossible for the user to undo a mistakenly entered final ball!

---

# AUDIT DEFECT LOG

---

### SCORE-001
- **Severity:** HIGH
- **Scenario:** Batters take 1 run on a Wide delivery (Wide + 1).
- **Expected Cricket Behavior:** Total score increases by 2 (1 wide penalty + 1 run). Striker and non-striker cross; strike rotates so the non-striker becomes striker.
- **Actual Current Behavior:** Total score increases by 2, but strike **never rotates**. The striker remains on strike.
- **Exact Code Responsible:** `src/hooks/useScoring.ts`, function `addBall()`, line 68:
  ```ts
  if ((kind === 'runs' && value % 2 === 1 || overComplete) && updated.nonStriker.name)
  ```
- **Impact:** Wrong batter faces the next delivery after running an odd number of runs on a wide.
- **Recommended Fix:** Check whether total physical runs taken (`value`) is odd regardless of delivery type (runs, wide, bye, leg-bye, no-ball).
- **Test Case Required:** Score Wide + 1. Assert `score.runs` += 2, `score.striker.name` equals previous `nonStriker.name`.

---

### SCORE-002
- **Severity:** CRITICAL
- **Scenario:** Batter hits runs off the bat on a No Ball (e.g., No Ball + 4).
- **Expected Cricket Behavior:** 1 run added to team extras (No Ball penalty); 4 runs credited to the batter's personal score and 4s count. Bowler charged with 5 runs.
- **Actual Current Behavior:** All 5 runs are credited to Extras. Batter gets 0 runs, 0 balls, and 0 boundary credit.
- **Exact Code Responsible:** `src/hooks/useScoring.ts`, function `addBall()`, lines 47–48:
  ```ts
  const batterRuns = kind === 'runs' ? value : 0
  const extras = kind === 'wide' || kind === 'noBall' ? 1 + value : ...
  ```
- **Impact:** Major distortion of player batting statistics, batting averages, and scorecards.
- **Recommended Fix:** Split No Ball input into `penalty` (always 1) and `batRuns` (runs hit off bat), crediting `batRuns` to `nextStriker.runs`.
- **Test Case Required:** Score No Ball + 4. Assert `striker.runs` increases by 4, `striker.fours` increases by 1, team total increases by 5.

---

### SCORE-003
- **Severity:** HIGH
- **Scenario:** Batters run 1 run on a No Ball (No Ball + 1).
- **Expected Cricket Behavior:** 1 run penalty + 1 run. Batters cross and strike rotates.
- **Actual Current Behavior:** Strike does not rotate because `kind !== 'runs'`.
- **Exact Code Responsible:** `src/hooks/useScoring.ts`, function `addBall()`, line 68.
- **Impact:** Wrong batter faces the subsequent Free Hit delivery.
- **Recommended Fix:** Include odd physical runs from No Balls in strike rotation evaluation.
- **Test Case Required:** Score No Ball + 1. Assert strike swaps.

---

### SCORE-004
- **Severity:** HIGH
- **Scenario:** Batters score Byes or Leg Byes (e.g. 1 Bye, 2 Leg Byes).
- **Expected Cricket Behavior:** Runs are credited to team total as Extras. Bowler's runs conceded must **NOT** increase.
- **Actual Current Behavior:** Bowler runs conceded increases by the bye/leg-bye amount:
  ```ts
  nextBowler.runs += batterRuns + extras
  ```
- **Exact Code Responsible:** `src/hooks/useScoring.ts`, function `addBall()`, line 54.
- **Impact:** Bowler bowling figures and economy rates are artificially worsened by fielding errors.
- **Recommended Fix:** Only charge extras to bowler if `kind === 'wide' || kind === 'noBall'`. Do not charge byes or leg-byes to bowler.
- **Test Case Required:** Score 2 Byes. Assert `score.runs` += 2, `score.bowler.runs` remains unchanged.

---

### SCORE-005
- **Severity:** HIGH
- **Scenario:** Batters run 1 or 3 Byes/Leg Byes.
- **Expected Cricket Behavior:** Batters cross while running; strike rotates.
- **Actual Current Behavior:** Strike does not rotate because `kind !== 'runs'`.
- **Exact Code Responsible:** `src/hooks/useScoring.ts`, function `addBall()`, line 68.
- **Impact:** Wrong batter on strike after running byes or leg-byes.
- **Recommended Fix:** Trigger strike rotation when `value % 2 === 1` for `kind === 'bye'` and `kind === 'legBye'`.
- **Test Case Required:** Score 1 Bye. Assert striker and non-striker swap.

---

### SCORE-006
- **Severity:** CRITICAL
- **Scenario:** Batter takes a single (1 run) on the 6th legal ball of an over.
- **Expected Cricket Behavior:** Single run swaps batters (Swap 1). End of over changes bowling ends (Swap 2). Net result: 2 swaps -> **The batter who took the single retains strike for ball 1 of the next over.**
- **Actual Current Behavior:** The engine uses boolean OR: `(oddRun || overComplete)`. Since `(true || true)` evaluates to true once, it swaps batters only **once**. The batter who took the single is placed at the non-striker end!
- **Exact Code Responsible:** `src/hooks/useScoring.ts`, function `addBall()`, lines 67–68:
  ```ts
  const overComplete = isLegal && updated.balls % 6 === 0
  if ((kind === 'runs' && value % 2 === 1 || overComplete) && updated.nonStriker.name)
    updated = { ...updated, striker: updated.nonStriker, nonStriker: updated.striker }
  ```
- **Impact:** Reverses strike on the first ball of every new over whenever an odd number of runs is scored on the last ball.
- **Recommended Fix:**
  ```ts
  let swapCount = 0
  if (oddRun) swapCount++
  if (overComplete) swapCount++
  if (swapCount % 2 === 1 && updated.nonStriker.name) {
    updated = { ...updated, striker: updated.nonStriker, nonStriker: updated.striker }
  }
  ```
- **Test Case Required:** Enter 5 dot balls followed by 1 run. Assert the batter who scored the single is `striker` at the start of the next over.

---

### SCORE-007
- **Severity:** CRITICAL
- **Scenario:** Bowler concedes a wicket via Run Out.
- **Expected Cricket Behavior:** Team wicket count increases, but bowler is **NOT** credited with a wicket.
- **Actual Current Behavior:** Bowler wickets increments for all wickets:
  ```ts
  if (kind === 'wicket') { nextBowler.wickets += 1; ... }
  ```
- **Exact Code Responsible:** `src/hooks/useScoring.ts`, function `addBall()`, line 55.
- **Impact:** Distorts bowling averages, 5-wicket hauls, and player statistics by awarding run outs to bowlers.
- **Recommended Fix:** Only increment `nextBowler.wickets` if `wicket.type` is Bowled, Caught, Caught Behind, Caught & Bowled, LBW, Stumped, or Hit Wicket.
- **Test Case Required:** Record Run Out. Assert `score.wickets` increases by 1; `bowler.wickets` remains unchanged.

---

### SCORE-008
- **Severity:** CRITICAL
- **Scenario:** Non-striker is run out at the bowler's end.
- **Expected Cricket Behavior:** User selects whether striker or non-striker was dismissed. If non-striker is dismissed, striker remains active.
- **Actual Current Behavior:** Code hardcodes `nextStriker.out = true`. The striker is always dismissed.
- **Exact Code Responsible:** `src/hooks/useScoring.ts`, function `addBall()`, line 55.
- **Impact:** Impossible to record a non-striker run out (or Mankad). The wrong player is marked out and removed from the batting crease.
- **Recommended Fix:** Prompt user during Run Out / Mankad modal to choose which batter was dismissed (`striker` or `nonStriker`).
- **Test Case Required:** Trigger Run Out of non-striker. Assert `nonStriker.out === true` and `striker` remains active.

---

### SCORE-009
- **Severity:** CRITICAL
- **Scenario:** Bowler returns to bowl a second or subsequent over.
- **Expected Cricket Behavior:** Existing figures for that bowler (e.g. 1 over, 6 runs, 1 wicket) are preserved and accumulated.
- **Actual Current Behavior:** Bowler figures are completely reset to 0 balls, 0 runs, 0 wickets, and a duplicate bowler entry is pushed to `bowlerStats`.
- **Exact Code Responsible:** `src/hooks/useScoring.ts`, function `chooseNextBowler()`, line 91:
  ```ts
  options.setScore({
    ...options.score,
    bowler: { name, balls: 0, runs: 0, wickets: 0 },
    bowlerStats: [...options.score.bowlerStats, { name, balls: 0, runs: 0, wickets: 0 }]
  })
  ```
- **Impact:** Destroys bowler statistics for any bowler who bowls more than 1 over. Scorecard displays duplicate rows for the same bowler with fractured stats.
- **Recommended Fix:** Check if bowler already exists in `score.bowlerStats`. If so, restore their existing figures as `score.bowler`.
- **Test Case Required:** Bowl Over 1 with Bowler A (concede 6 runs). Bowl Over 2 with Bowler B. Re-select Bowler A for Over 3. Assert `bowler.balls === 6` and `bowler.runs === 6`.

---

### SCORE-010
- **Severity:** HIGH
- **Scenario:** Bowler bowls to a batter during a Free Hit delivery.
- **Expected Cricket Behavior:** Batter cannot be dismissed Bowled, Caught, Caught Behind, Caught & Bowled, LBW, or Stumped.
- **Actual Current Behavior:** All 12 dismissals are active and functional in the modal during a Free Hit.
- **Exact Code Responsible:** `src/hooks/useScoring.ts`, function `selectWicket()`, lines 95–96, and `ScoringSheet` in `App.tsx:1281`.
- **Impact:** Allows illegal dismissals on free hits, violating ICC T20/ODI playing conditions.
- **Recommended Fix:** Disable Bowled, Caught, LBW, and Stumped in `ScoringSheet` when `score.freeHit === true`.
- **Test Case Required:** Trigger No Ball -> Free Hit is true -> Attempt Bowled. Assert dismissal is rejected or prevented in UI.

---

### SCORE-011
- **Severity:** MEDIUM
- **Scenario:** New batter is selected after a dismissal.
- **Expected Cricket Behavior:** Partnership displays `[New Batter] & [Not-Out Partner]` with 0 runs and 0 balls.
- **Actual Current Behavior:** Partnership displays `Choose next batter & [Not-Out Partner]`. When `chooseNextBatter(name)` is called, `score.partnership.batters` is never updated with the new batter's name.
- **Exact Code Responsible:** `src/hooks/useScoring.ts`, function `chooseNextBatter()`, line 90:
  ```ts
  options.setScore({ ...options.score, striker: emptyPlayer(name), battingStats: [...options.score.battingStats, emptyPlayer(name)] })
  ```
- **Impact:** UI shows "Choose next batter" inside the partnership card during active play.
- **Recommended Fix:** Update `partnership.batters` with `[name, options.score.nonStriker.name]` inside `chooseNextBatter`.
- **Test Case Required:** Take a wicket, select "Alex". Assert `score.partnership.batters` contains `"Alex"`.

---

# SCORING TEST MATRIX

This matrix outlines the test specifications required to validate the cricket scoring engine once refactoring begins.

| Test ID | Category | Initial State | Input / Action | Expected Result | Pass Criteria |
|---|---|---|---|---|---|
| **TC-NORM-01** | Normal | 0/0 (0.0), Striker A on strike | `addBall('runs', 0)` | Score: 0/0 (0.1). Striker A: 0(1). Bowler: 0.1-0-0-0. | Strike unchanged, balls incremented |
| **TC-NORM-02** | Normal | 0/0 (0.1), Striker A on strike | `addBall('runs', 1)` | Score: 1/0 (0.2). Striker A: 1(2). Non-striker B becomes striker. | Strike rotated, 1 run added |
| **TC-NORM-03** | Normal | 1/0 (0.2), Striker B on strike | `addBall('runs', 4)` | Score: 5/0 (0.3). Striker B: 4(1), 1x4. Bowler runs: 5. | Strike unchanged, 4s incremented |
| **TC-NORM-04** | Normal | 5/0 (0.3), Striker B on strike | `addBall('runs', 6)` | Score: 11/0 (0.4). Striker B: 10(2), 1x4, 1x6. | Strike unchanged, 6s incremented |
| **TC-NORM-05** | Normal | 11/0 (0.4), Striker B on strike | `addBall('runs', 3)` | Score: 14/0 (0.5). Striker B: 13(3). Striker A becomes striker. | Strike rotated, 3 runs added |
| **TC-WIDE-01** | Wide | 0/0 (0.0) | `addBall('wide', 0)` | Score: 1/0 (0.0). Bowler runs: 1. Striker balls: 0. | Legal ball count unchanged |
| **TC-WIDE-02** | Wide | 1/0 (0.0), Striker A | `addBall('wide', 1)` | Score: 3/0 (0.0). Bowler runs: 3. Striker: Non-striker B. | Strike rotated on odd run |
| **TC-WIDE-03** | Wide | 0/0 (0.5), Striker A | `addBall('wide', 0)` | Score: 1/0 (0.5). Over does NOT complete. | Over count remains 0.5 |
| **TC-NB-01** | No Ball | 0/0 (0.0) | `addBall('noBall', 0)` | Score: 1/0 (0.0). `freeHit = true`. Bowler runs: 1. | Free hit active, 0 balls |
| **TC-NB-02** | No Ball | 1/0 (0.0), Striker A | `addBall('noBall', 4)` (off bat) | Score: 6/0 (0.0). Striker A: 4(1), 1x4. Extras: 1. | 4 credited to batter, 1 to extras |
| **TC-NB-03** | No Ball | 6/0 (0.0), Striker A | `addBall('noBall', 1)` | Score: 8/0 (0.0). Striker B takes strike. | Strike rotated on odd run |
| **TC-FH-01** | Free Hit | `freeHit = true` | `selectWicket('Bowled')` | Action blocked / rejected. Batter NOT out. | Invalid dismissal prevented |
| **TC-FH-02** | Free Hit | `freeHit = true` | `selectWicket('Run Out')` | Valid dismissal. Wicket falls. | Run out permitted on free hit |
| **TC-BYE-01** | Byes | 0/0 (0.0), Striker A | `addBall('bye', 1)` | Score: 1/0 (0.1). Striker A: 0(1). Bowler: 0.1-0-0-0. Striker B on strike. | Bowler runs 0, strike rotated |
| **TC-BYE-02** | Byes | 1/0 (0.1) | `addBall('bye', 2)` | Score: 3/0 (0.2). Bowler runs: 0. Strike unchanged. | Bowler runs 0, strike unchanged |
| **TC-LBYE-01** | Leg Byes | 0/0 (0.0), Striker A | `addBall('legBye', 1)` | Score: 1/0 (0.1). Striker A: 0(1). Bowler runs: 0. Striker B on strike. | Bowler runs 0, strike rotated |
| **TC-WKT-01** | Wicket | 0/0 (0.0), Striker A | `selectWicket('Bowled')` | Score: 0/1 (0.1). Bowler wickets: 1. Striker A: out. FOW: 1st wkt at 0. | Bowler gets wicket |
| **TC-WKT-02** | Wicket | 0/0 (0.0), Striker A | `selectWicket('Run Out', helper='Fielder')` | Score: 0/1 (0.1). Bowler wickets: 0. FOW recorded. | Bowler does NOT get wicket |
| **TC-WKT-03** | Wicket | 0/0 (0.0), Striker A, Non-Striker B | Run out Non-Striker B | Striker A remains not out. Non-Striker B marked out. | Correct batter dismissed |
| **TC-ROT-01** | Strike | 0/0 (0.5), Striker A | `addBall('runs', 1)` (Ball 6) | Score: 1/0 (1.0). Striker A faces Ball 1 of Over 2. | Single on 6th ball retains strike |
| **TC-ROT-02** | Strike | 0/0 (0.5), Striker A | `addBall('runs', 2)` (Ball 6) | Score: 2/0 (1.0). Non-Striker B faces Ball 1 of Over 2. | Double on 6th ball swaps strike |
| **TC-ROT-03** | Strike | 0/0 (0.5), Striker A | `addBall('runs', 0)` (Ball 6) | Score: 0/0 (1.0). Non-Striker B faces Ball 1 of Over 2. | Dot on 6th ball swaps strike |
| **TC-BOWL-01** | Bowler | Bowler A finished Over 1 (0/6) | Over 3: Select Bowler A | Bowler A: 1.0-0-6-0. Continues accumulating stats. | Career spell accumulated |
| **TC-UNDO-01** | Undo | 0/0 (0.0) -> `addBall('runs', 4)` | `confirmUndo()` | Score restored to 0/0 (0.0). Striker: 0(0). Bowler: 0(0). | Full state restored |
| **TC-UNDO-02** | Undo | 0/0 (0.5) -> `addBall('runs', 1)` (Over complete) | `confirmUndo()` | Score restored to 0/0 (0.5). Over history popped. `nextBowlerOpen = false`. | Modal and over rolled back |
| **TC-UNDO-03** | Undo | 0/0 (0.0) -> Wicket falls | `confirmUndo()` | Wicket restored. `nextBatterOpen = false`. | Dismissal modal rolled back |
| **TC-CHASE-01** | Chase | Target 51, Score 50/3 (9.5) | `addBall('runs', 1)` | Score: 51/3 (10.0). `inningsComplete = true`. Match won by chasing team. | Instant match finish on target |
| **TC-CHASE-02** | Chase | Target 51, Score 50/9 (10.0) | Final ball dot | Score: 50/9. Match Result: **Tied** (not Drawn). | Correct tie result |
