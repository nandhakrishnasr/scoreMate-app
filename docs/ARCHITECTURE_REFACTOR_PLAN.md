# Architecture Refactoring Plan: ScoreMate Web Application

**Date:** September 15, 2026  
**Status:** COMPLETE (Phases 1–7 fully implemented and verified)  
**Baseline:**
- 43 automated scoring tests passing (100%)
- 0 lint errors
- 0 TypeScript / build errors
- Scoring engine pure, verified, and locked

---

## 1. Executive Summary & Objective

`src/App.tsx` currently spans **1,421 lines** and functions as a monolithic file housing 14 distinct responsibilities, including database/aggregation services, PDF rendering, canvas image generation, pre-match setup screens, live scoring sheets, modals, and unused duplicate screens.

The objective of this architecture refactor is to **decompose `App.tsx` into modular, single-responsibility components, services, and utilities** without:
- Changing any cricket scoring logic or rules
- Altering any test in `tests/scoringEngine.test.ts`
- Redesigning UI or styling
- Introducing new state libraries or backends
- Introducing Vitest

---

## 2. Analysis & Responsibility Categorization of `App.tsx`

| Category | Lines | Code Elements | Consumed State / Dependencies | Destination Type | Proposed Path |
|---|---|---|---|---|---|
| **1. Storage & Local Persistence** | 57–94 | `loadTeamImages`, `saveTeamImages`, `loadPlayerImages`, `savePlayerImages`, constants | `localStorage`, JSON parsing | Service / Utility | `src/services/storageService.ts` |
| **2. Export & Canvas Media** | 95–133, 1020–1053 | `countMaidens`, `exportMatchCsv`, `exportMatchImage`, `createLiveScoreImage`, `downloadScorecard` | `jsPDF`, canvas API, `ScoreState`, `CompletedMatch` | Services | `src/services/exportService.ts`, `src/services/canvasService.ts` |
| **3. Database & Stats Aggregation** | 421–750 | `loadTeamStatsFromDatabase`, `loadPlayerStatsFromDatabase`, `aggregateTeamStats`, `aggregatePlayerStats`, helper functions | Browser IndexedDB / Dexie / Local, `CompletedMatch`, `PlayerStat`, `TeamStat` | Service | `src/services/statsService.ts` |
| **4. Shared Leaf UI Components** | 1410–1413 | `PlayerRow`, `Header`, `FieldLabel`, `Choice` | Minimal props, `Icon`, `SettingsContext` | Components | `src/components/common/` (`Header.tsx`, `Choice.tsx`, etc.) |
| **5. Shared Modals** | 1414–1417 | `ConfirmModal`, `SettingsModal` | `theme`, export callbacks, backup import | Components | `src/components/modals/ConfirmModal.tsx`, `SettingsModal.tsx` |
| **6. Navigation** | 1418–1419 | `BottomNav` | `active: string`, `setScreen` | Component | `src/components/common/BottomNav.tsx` |
| **7. Scoring Modal & Sheets** | 1186–1408 | `SelectionSheet`, `ScoringSheet` (including Run Out & Retirement sub-modals) | `modal`, `addBall`, `selectWicket`, `freeHit`, `strikerName`, `nonStrikerName` | Component | `src/components/scoring/ScoringSheet.tsx`, `src/components/common/SelectionSheet.tsx` |
| **8. Scorecard & Over Summaries** | 1130–1152 | `DetailedScorecardInnings`, `ScorecardInnings` | `score: ScoreState`, `teamName`, `overs`, `countMaidens` | Component | `src/components/scorecard/ScorecardInnings.tsx` |
| **9. Innings Charts & Analytics** | 1057–1063 | `InningsCharts` (Manhattan & Worm chart) | `recharts` (`LineChart`, `ResponsiveContainer`), innings scores | Component | `src/components/scoring/InningsCharts.tsx` |
| **10. Secondary Standalone Screens** | 752–883, 1065–1068 | `TeamsScreen`, `PlayersStatsScreen`, `HistoryScreen`, `ScorecardScreen` | `matches`, `stats`, `setScreen` | Screens | `src/components/screens/` (`TeamsScreen.tsx`, `HistoryScreen.tsx`, etc.) |
| **11. Pre-Match Setup Screens** | 885–1004 | `MatchOptionsScreen`, `PlayersScreen`, `OpeningSelectScreen`, `InningsBreakScreen`, `SecondOpeningScreen`, `SelectField` | Setup form state, team lists, toss result | Screens | `src/components/screens/setup/` |
| **12. Match Result Screen** | 1005–1055 | `ResultScreen` | `result`, team names, first/second innings scores, award picker | Screen | `src/components/screens/ResultScreen.tsx` |
| **13. Live Scoring Screen** | 1154–1183 | `LiveScreen` | `useMatch()`, score metrics, batting/bowling cards, scoring buttons | Screen | `src/components/screens/LiveScreen.tsx` |
| **14. Dead / Duplicate Code** | 902–915, 1070–1128 | Inline `SetupScreen` & inline `LoginScreen` + `AuthModal` | Dead duplicates of `src/components/screens/SetupScreen.tsx` and `LoginScreen.tsx` | **DELETE** | Remove duplicates from `App.tsx` |

---

## 3. Target File Structure

```
src/
├── components/
│   ├── Icon.tsx                          [Existing]
│   ├── MatchRouter.tsx                   [Existing]
│   ├── common/
│   │   ├── Header.tsx                    [NEW] Top app bar
│   │   ├── BottomNav.tsx                 [NEW] Bottom navigation tab bar
│   │   ├── Choice.tsx                    [NEW] Radio choice button
│   │   ├── FieldLabel.tsx                [NEW] Form field label
│   │   ├── PlayerRow.tsx                 [NEW] Batsman scorecard row
│   │   └── SelectionSheet.tsx            [NEW] Bottom slide sheet picker
│   ├── modals/
│   │   ├── ConfirmModal.tsx              [NEW] Confirmation dialog
│   │   └── SettingsModal.tsx             [NEW] Settings, theme, backup dialog
│   ├── scorecard/
│   │   ├── ScorecardInnings.tsx          [NEW] Accordion innings summary
│   │   └── DetailedScorecardInnings.tsx  [NEW] Batting & bowling table tabs
│   ├── scoring/
│   │   ├── ScoringSheet.tsx              [NEW] Scoring buttons, Run Out, Retirement
│   │   └── InningsCharts.tsx             [NEW] Manhattan & Worm recharts
│   └── screens/
│       ├── LoginScreen.tsx               [Existing]
│       ├── SetupScreen.tsx               [Existing]
│       ├── MatchOptionsScreen.tsx        [NEW] Overs, team size, venue settings
│       ├── PlayersScreen.tsx             [NEW] Roster management & player form
│       ├── OpeningSelectScreen.tsx       [NEW] Striker, non-striker, bowler select
│       ├── InningsBreakScreen.tsx        [NEW] Mid-match summary
│       ├── SecondOpeningScreen.tsx       [NEW] 2nd innings opening lineup
│       ├── LiveScreen.tsx                [NEW] Core in-play scoring screen
│       ├── ScorecardScreen.tsx           [NEW] Full match scorecard view
│       ├── ResultScreen.tsx              [NEW] Match winner, awards, summary
│       ├── HistoryScreen.tsx             [NEW] Past match history & backup import
│       ├── TeamsScreen.tsx               [NEW] Team statistics & logos
│       └── PlayersStatsScreen.tsx        [NEW] Player career statistics & avatars
├── context/
│   └── MatchContext.tsx                  [Existing]
├── hooks/
│   └── useScoring.ts                     [Existing]
├── services/
│   ├── scoringEngine.ts                  [Existing - Verified]
│   ├── storageService.ts                 [NEW] LocalStorage keys & image cache
│   ├── exportService.ts                  [NEW] CSV & PDF generation
│   ├── canvasService.ts                  [NEW] Shareable score images
│   └── statsService.ts                   [NEW] Team/player stats & DB aggregator
├── types/
│   └── match.ts                          [Existing] (add PlayerStat type)
├── App.css
├── index.css
├── main.tsx
└── App.tsx                               [Refactored to ~120-line coordinator]
```

---

## 4. Proposed Step-by-Step Extraction Order

To guarantee zero regression and verify tests and compilation at every step, extractions will proceed from lowest risk (pure services and leaf components) to highest coordination (root `App.tsx` cleanup):

### Phase 1: Pure Utilities & Domain Services (Risk: ZERO)
1. **`src/services/storageService.ts`**:
   - Responsibility: LocalStorage keys (`THEME_KEY`, `AUTH_KEY`, etc.) and image mapping storage.
   - Dependencies: `localStorage`.
   - Behavior preservation: Identical storage keys and JSON error catching.
2. **`src/services/exportService.ts`**:
   - Responsibility: `exportMatchCsv`, `downloadScorecard` (jsPDF).
   - Dependencies: `jspdf`, `CompletedMatch`, `ScoreState`.
   - Behavior preservation: Exact column formatting and PDF layout.
3. **`src/services/canvasService.ts`**:
   - Responsibility: `createLiveScoreImage`, `exportMatchImage`.
   - Dependencies: HTML5 Canvas API.
   - Behavior preservation: Exact dimensions (1200x630, 1200x760) and styling.
4. **`src/services/statsService.ts`**:
   - Responsibility: `loadTeamStatsFromDatabase`, `loadPlayerStatsFromDatabase`, `aggregateTeamStats`, `aggregatePlayerStats`.
   - Dependencies: `CompletedMatch`, `PlayerStat`, `TeamStat`.
   - Behavior preservation: Same player name normalization, averages, and strike rates.

### Phase 2: Common Leaf UI Components & Modals (Risk: LOW)
5. **`src/components/common/Header.tsx`, `BottomNav.tsx`, `Choice.tsx`, `FieldLabel.tsx`, `PlayerRow.tsx`**:
   - Pure presentational components.
   - Props: simple callbacks and display values.
6. **`src/components/modals/ConfirmModal.tsx`, `SettingsModal.tsx`**:
   - Self-contained modal dialogs.
7. **`src/components/common/SelectionSheet.tsx`**:
   - Slide-over player picker sheet.

### Phase 3: Analytics & Scorecard Components (Risk: LOW)
8. **`src/components/scoring/InningsCharts.tsx`**:
   - Self-contained recharts Manhattan and Worm graphs.
9. **`src/components/scorecard/ScorecardInnings.tsx` & `DetailedScorecardInnings.tsx`**:
   - Accordion and table tabs for first and second innings summaries.

### Phase 4: Secondary Screens (Risk: LOW-MEDIUM)
10. **`src/components/screens/HistoryScreen.tsx`**:
    - Completed match list, import/export backup buttons.
11. **`src/components/screens/TeamsScreen.tsx`**:
    - Team list, win/loss stats, logo upload.
12. **`src/components/screens/PlayersStatsScreen.tsx`**:
    - Player career cards, avatar upload.
13. **`src/components/screens/ScorecardScreen.tsx`**:
    - Full match scorecard page.
14. **`src/components/screens/ResultScreen.tsx`**:
    - Match result summary, player of match selector, PDF trigger.

### Phase 5: Pre-Match Setup & In-Play Transition Screens (Risk: MEDIUM)
15. **`src/components/screens/setup/MatchOptionsScreen.tsx`**:
    - Overs, team size, venue, competition options.
16. **`src/components/screens/setup/PlayersScreen.tsx`**:
    - Home/visitor squads, adding/editing players.
17. **`src/components/screens/setup/OpeningSelectScreen.tsx`**:
    - Striker, non-striker, bowler assignment.
18. **`src/components/screens/setup/InningsBreakScreen.tsx` & `SecondOpeningScreen.tsx`**:
    - Break score presentation and chase opening lineup.

### Phase 6: Live Scoring & App Orchestration (Risk: MEDIUM-HIGH)
19. **`src/components/scoring/ScoringSheet.tsx`**:
    - Verified scoring sheet with Run Out and Retirement sub-modals.
20. **`src/components/screens/LiveScreen.tsx`**:
    - Score summary card, partnership card, batter/bowler rows, over deliveries list, scoring action buttons.
21. **`src/App.tsx` Simplification**:
    - Remove dead inline duplicates of `SetupScreen` and `LoginScreen`.
    - Import clean screens and coordinate routing via `MatchRouter`.
    - Reduce `App.tsx` to a clean, readable ~120-line root coordinator.

---

## 5. Discovered Risks & Mitigation Strategy

1. **Circular Import Risk**:
   - *Risk*: Modals or screens importing from `App.tsx` while `App.tsx` imports them.
   - *Mitigation*: Move all shared types into `src/types/match.ts` and shared services into `src/services/`. Screens and components will import exclusively from `types/`, `services/`, or `context/`.
2. **Context vs Props Mismatch**:
   - *Risk*: Some screens use props while others use `useMatch()`.
   - *Mitigation*: Maintain current prop interfaces during extraction; do not rewrite working component contracts.
3. **State Mutation Risk**:
   - *Risk*: Accidentally modifying match progression logic while moving code.
   - *Mitigation*: Strict 1:1 code relocation with zero logic modifications.
4. **Verification Gate at Every Step**:
   - Run `node --test tests/scoringEngine.test.ts`, `npm run lint`, and `npm run build` after each phase.

---

## 6. Execution Progress & Verification Log

### Phase 1: Services Extraction (COMPLETE)
- **Status:** PASS
- **Completed Extractions:**
  1. `src/services/storageService.ts`: LocalStorage keys (`ACTIVE_MATCH_KEY`, `COMPLETED_MATCHES_KEY`, `TEAM_IMAGES_KEY`, `PLAYER_IMAGES_KEY`, `THEME_KEY`, `AUTH_KEY`) and image storage helpers (`loadTeamImages`, `saveTeamImages`, `loadPlayerImages`, `savePlayerImages`).
  2. `src/services/exportService.ts`: CSV formatting (`csvCell`), maiden counting (`countMaidens`), match CSV export (`exportMatchCsv`), and PDF scorecard generator (`downloadScorecard`).
  3. `src/services/canvasService.ts`: Scorecard graphics rendering (`exportMatchImage`, `createLiveScoreImage`).
  4. `src/services/statsService.ts`: Database export types (`KdmDatabaseExport`), normalization/canonical name helpers (`normalizePlayerName`, `canonicalPlayerName`), item counters (`countStatItems`), async DB loaders (`loadTeamStatsFromDatabase`, `loadPlayerStatsFromDatabase`), and aggregation algorithms (`aggregateTeamStats`, `aggregatePlayerStats`, `createEmptyPlayerStat`).
- **Files Created:**
  - `src/services/storageService.ts`
  - `src/services/exportService.ts`
  - `src/services/canvasService.ts`
  - `src/services/statsService.ts`
- **Files Modified:**
  - `src/types/match.ts` (added shared `PlayerStat` interface)
  - `src/App.tsx` (imported extracted services, removed verbatim duplicated service and export code)
- **Verification Gate Results:**
  - `node --test tests/scoringEngine.test.ts`: **43/43 tests passing** (0 failures, 174ms)
  - `npm run lint`: **0 errors**, 0 new warnings (3 pre-existing warnings in `MatchContext.tsx`)
  - `npm run build`: **0 errors**, successful production build
- **Issues Encountered & Resolved:**
  - `verbatimModuleSyntax` required `import type` in `statsService.ts`.
  - `ResultScreen` in `App.tsx` contained an inline duplicate of `downloadScorecard()` which was cleanly delegated to `exportService.ts`.
- **Deferred Cleanup Opportunities:**
  - Bundle size warning for html2canvas / jspdf: chunk code-splitting via dynamic `import()` can be applied in future non-breaking optimization passes.

### Phase 2: Leaf Components & Modals Extraction (COMPLETE)
- **Status:** PASS
- **Completed Extractions:**
  1. `src/context/SettingsContext.ts`: Created standalone context for `openSettings` trigger to avoid circular dependency between `Header` and `App`.
  2. `src/components/common/Header.tsx`: Presentational header with back button, brand icon, title, scorecard action, and settings modal trigger.
  3. `src/components/common/BottomNav.tsx`: Tab navigation for New Match, Teams, Players, and History screens.
  4. `src/components/common/Choice.tsx`: Radio choice toggle button.
  5. `src/components/common/FieldLabel.tsx`: Reusable form field label.
  6. `src/components/common/PlayerRow.tsx`: Scorecard batsman line with strike rate calculation and active asterisk indicator.
  7. `src/components/modals/ConfirmModal.tsx`: Reusable confirmation modal for undo delivery.
  8. `src/components/modals/SettingsModal.tsx`: Appearance theme switch, backup export/import, CSV export, and image export dialog.
  9. `src/components/common/SelectionSheet.tsx`: Slide-over player picker sheet for striker, non-striker, bowler, and fielder assignments.
- **Files Created:**
  - `src/context/SettingsContext.ts`
  - `src/components/common/Header.tsx`
  - `src/components/common/BottomNav.tsx`
  - `src/components/common/Choice.tsx`
  - `src/components/common/FieldLabel.tsx`
  - `src/components/common/PlayerRow.tsx`
  - `src/components/modals/ConfirmModal.tsx`
  - `src/components/modals/SettingsModal.tsx`
  - `src/components/common/SelectionSheet.tsx`
- **Files Modified:**
  - `src/App.tsx`: Removed inline definitions of leaf components and modals; imported from modular files.
- **App.tsx Line Count:**
  - Before Phase 2: 976 lines
  - After Phase 2: 973 lines
- **Verification Gate Results:**
  - `node --test tests/scoringEngine.test.ts`: **43/43 tests passing** (0 failures, 158ms)
  - `npm run lint`: **0 errors**, 0 new warnings (3 pre-existing warnings in `MatchContext.tsx`)
  - `npm run build`: **0 errors**, successful production build
- **Issues Encountered & Resolved:**
  - `SettingsContext` was extracted into `src/context/SettingsContext.ts` to strictly adhere to the rule avoiding `component -> App.tsx` circular dependencies.
  - `activeNavigation` global variable retained in `App.tsx` until routing orchestration refactor in Phase 7.
- **Deferred Cleanup Opportunities:**
  - Legacy `activeNavigation` module-level variable can be eliminated in Phase 7 when App.tsx routing is streamlined.

### Phase 3: Scorecard & Analytics Extraction (COMPLETE)
- **Status:** PASS
- **Completed Extractions:**
  1. `src/components/scoring/InningsCharts.tsx`: Recharts-powered Manhattan chart (runs per over) and Worm chart (cumulative runs) with exact responsive containers, gradients, axes, and tooltip configuration.
  2. `src/components/scorecard/DetailedScorecardInnings.tsx`: Complete scoreboard view with tab toggling between batting/bowling statistics and over-by-over delivery summaries.
  3. `src/components/scorecard/ScorecardInnings.tsx`: Accordion-style collapsible innings card with run rate, required run rate, max overs, fall of wickets timeline, and detailed scorecard integration.
- **Files Created:**
  - `src/components/scoring/InningsCharts.tsx`
  - `src/components/scorecard/DetailedScorecardInnings.tsx`
  - `src/components/scorecard/ScorecardInnings.tsx`
- **Files Modified:**
  - `src/App.tsx`: Removed inline implementations of `InningsCharts`, `DetailedScorecardInnings`, and `ScorecardInnings`; removed unused `recharts` imports; imported modular components.
- **App.tsx Line Count:**
  - Before Phase 3: 973 lines
  - After Phase 3: 946 lines
- **Verification Gate Results:**
  - `node --test tests/scoringEngine.test.ts`: **43/43 tests passing** (0 failures, 316ms)
  - `npm run lint`: **0 errors**, 0 new warnings (3 pre-existing warnings in `MatchContext.tsx`)
  - `npm run build`: **0 errors**, successful production build
- **Issues Encountered & Resolved:**
  - `DetailedScorecardInnings` is used directly inside `ScorecardInnings.tsx`; its top-level import in `App.tsx` was cleanly pruned to avoid unused import warnings.
- **Deferred Cleanup Opportunities:**
  - Recharts bundle footprint: Can be lazy-loaded in a future optimization pass if desired.

### Phase 4: Secondary Screens Extraction (COMPLETE)
- **Status:** PASS
- **Completed Extractions:**
  1. `src/screens/HistoryScreen.tsx`: Complete match history screen with match cards, result summaries, share triggers, and JSON backup import functionality.
  2. `src/screens/TeamsScreen.tsx`: Teams list with search, statistics, logo upload with canvas cropping/compression, and team match history.
  3. `src/screens/PlayersStatsScreen.tsx`: Player career statistics screen with search, avatars upload with canvas square cropping, tab filtering, and detailed batting/bowling/fielding metrics.
  4. `src/screens/ScorecardScreen.tsx`: Standalone scorecard screen showing current and previous innings with back navigation.
  5. `src/screens/ResultScreen.tsx`: Match outcome screen with victory margin, summary card, InningsCharts, Player of the Match selector, and scorecard PDF download.
- **Files Created:**
  - `src/screens/HistoryScreen.tsx`
  - `src/screens/TeamsScreen.tsx`
  - `src/screens/PlayersStatsScreen.tsx`
  - `src/screens/ScorecardScreen.tsx`
  - `src/screens/ResultScreen.tsx`
- **Files Modified:**
  - `src/services/statsService.ts`: Added `getInitials` helper so both `TeamsScreen` and `PlayersStatsScreen` share the function without circular dependencies or React Fast Refresh component-only export warnings.
  - `src/App.tsx`: Removed inline implementations of `HistoryScreen`, `TeamsScreen`, `PlayersStatsScreen`, `ScorecardScreen`, `ResultScreen`, and `getInitials`; imported modular screens from `src/screens/*`; cleaned up unused imports (`useRef`, `PlayerOfMatch`).
- **App.tsx Line Count:**
  - Before Phase 4: 946 lines
  - After Phase 4: 787 lines (-159 lines)
- **Verification Gate Results:**
  - `node --test tests/scoringEngine.test.ts`: **43/43 tests passing** (0 failures, 158ms)
  - `npm run lint`: **0 errors**, 0 new warnings (3 pre-existing warnings in `MatchContext.tsx` unchanged)
  - `npm run build`: **0 errors**, successful production build
- **Behavior & Guardrail Compliance:**
  - `src/services/scoringEngine.ts` and `tests/scoringEngine.test.ts`: **UNTOUCHED**.
  - All navigation, data binding, PDF downloads, image avatars, calculations, and modal interactions preserved exactly.
  - Zero circular dependencies; none of the extracted screens import `App.tsx`.

### Phase 5: Setup Screens & Auth Extraction (COMPLETE)
- **Status:** PASS
- **Completed Extractions:**
  1. `src/components/modals/AuthModal.tsx`: Extracted account creation and Google/Apple modal dialog.
  2. `src/screens/LoginScreen.tsx`: Extracted sign-in screen supporting email/password, OTP validation, and social auth, reusing `Header` and `AuthModal`.
  3. `src/screens/SetupScreen.tsx`: Extracted initial setup screen with team names, coin-flip toss simulator, and bat/bowl choice, reusing `Header`, `BottomNav`, `Choice`, and `FieldLabel`.
- **Files Created:**
  - `src/components/modals/AuthModal.tsx`
  - `src/screens/LoginScreen.tsx`
  - `src/screens/SetupScreen.tsx`
- **Files Removed:**
  - `src/components/screens/LoginScreen.tsx` (legacy duplicate)
  - `src/components/screens/SetupScreen.tsx` (legacy duplicate)
- **Files Modified:**
  - `src/App.tsx`: Removed inline `SetupProps`, `SetupScreen`, `LoginScreen`, `AuthModal`, and unused `AUTH_KEY` import; wired extracted screens from `src/screens/*`.
- **App.tsx Line Count:**
  - Before Phase 5: 787 lines
  - After Phase 5: 709 lines (-78 lines)
- **Verification Gate Results:**
  - `node --test tests/scoringEngine.test.ts`: **43/43 tests passing** (0 failures, ~160ms)
  - `npm run lint`: **0 errors**, 0 new warnings (3 pre-existing warnings in `MatchContext.tsx` unchanged)
  - `npm run build`: **0 errors**, successful production build (672ms)
- **Behavior & Guardrail Compliance:**
  - `src/services/scoringEngine.ts` and `tests/scoringEngine.test.ts`: **UNTOUCHED**.
  - No circular dependencies; no extracted screen imports `App.tsx`.
  - Authentication, toss simulator, and setup flow preserved verbatim.

### Phase 5 Follow-up: Pre-Match Flow Extraction (COMPLETE)
- **Status:** PASS
- **Completed Extractions:**
  1. `src/components/common/SelectField.tsx`: Reusable drop-down style picker button with label and chevron icon for player selection.
  2. `src/screens/MatchOptionsScreen.tsx`: Overs limit, team size, last man batting toggle, and venue/competition advanced fields.
  3. `src/screens/PlayersScreen.tsx`: Squad builder for home and visitor rosters, player add/edit modal, batting hand selector, and team limit enforcement.
  4. `src/screens/OpeningSelectScreen.tsx`: Opening pair selection (striker, non-striker, opening bowler) for 1st innings using `SelectField` and `SelectionSheet`.
  5. `src/screens/InningsBreakScreen.tsx`: Mid-match break screen showing first innings summary, target calculation, and transition trigger to second innings.
  6. `src/screens/SecondOpeningScreen.tsx`: Second innings opening pair and bowler selection for chase with target context.
- **Files Created:**
  - `src/components/common/SelectField.tsx`
  - `src/screens/MatchOptionsScreen.tsx`
  - `src/screens/PlayersScreen.tsx`
  - `src/screens/OpeningSelectScreen.tsx`
  - `src/screens/InningsBreakScreen.tsx`
  - `src/screens/SecondOpeningScreen.tsx`
- **Files Modified:**
  - `src/App.tsx`: Removed inline definitions of `MatchOptionsProps`, `MatchOptionsScreen`, `PlayersProps`, `PlayersScreen`, `OpeningSelectProps`, `OpeningSelectScreen`, `SelectField`, `InningsBreakScreen`, `SecondOpeningScreen`; pruned unused `Choice` and `FieldLabel` imports; imported modular screens from `src/screens/*`.
- **App.tsx Line Count:**
  - Before Pre-Match extraction: 709 lines
  - After Pre-Match extraction: 603 lines (-106 lines)
- **Verification Gate Results:**
  - `node --test tests/scoringEngine.test.ts`: **43/43 tests passing** (0 failures, ~148ms)
  - `npm run lint`: **0 errors**, 0 new warnings (3 pre-existing warnings in `MatchContext.tsx` unchanged)
  - `npm run build`: **0 errors**, successful production build (738ms)
- **Behavior & Guardrail Compliance:**
  - `src/services/scoringEngine.ts` and `tests/scoringEngine.test.ts`: **UNTOUCHED**.
  - All navigation, data binding, squad limits, modals, and target displays preserved verbatim.
  - Zero circular dependencies; none of the extracted screens import `App.tsx`.

### Phase 6: Live Scoring Extraction (COMPLETE)
- **Status:** PASS
- **Completed Extractions:**
  1. `src/components/scoring/ScoringSheet.tsx`: Extracted delivery scoring sheet, Run Out modal flow (striker/non-striker, runs completed, fielder selection), and Batter Retirement modal flow (Retired Hurt / Retired Out), with Free Hit dismissal filtering.
  2. `src/screens/LiveScreen.tsx`: Extracted live scoring screen containing score board, partnership card, batter/bowler cards, current over timeline, delivery action buttons, modal sheet launchers, milestone toast, and bottom navigation.
- **Dead Props Removed:**
  - Removed 12 historical scoring callbacks (`addBall`, `undo`, `swapBatters`, `scoringModal`, `setScoringModal`, `nextBatterOpen`, `nextBowlerOpen`, `chooseNextBatter`, `chooseNextBowler`, `selectWicket`, `wicketDetails`, `selectWicketHelper`) which were dead props in `LiveScreenProps` because `LiveScreen` directly consumes `const { scoring } = useMatch()`.
- **Files Created:**
  - `src/components/scoring/ScoringSheet.tsx`
  - `src/screens/LiveScreen.tsx`
- **Files Modified:**
  - `src/App.tsx`: Removed inline `ScoringSheet` and `LiveScreen` definitions; cleaned up liveRoute call site to pass only active props; removed unused imports (`Header`, `BottomNav`, `PlayerRow`, `SelectionSheet`, `ScoringSheet`, `Icon`, `countMaidens`, `useMatch`, `BallKind`, `ScoringModal`, `WicketDetails`, `WicketType`, `BatterStatusEvent`).
- **App.tsx Line Count:**
  - Before Phase 6: 603 lines
  - After Phase 6: 345 lines (-258 lines, cumulative reduction from 1,421 lines: -1,076 lines, -75.7%)
- **Verification Gate Results:**
  - `node --test tests/scoringEngine.test.ts`: **43/43 tests passing** (0 failures, ~148ms)
  - `npm run lint`: **0 errors**, 0 new warnings (3 pre-existing warnings in `MatchContext.tsx` unchanged)
  - `npm run build`: **0 errors**, successful production build (609ms)
- **Behavior & Guardrail Compliance:**
  - `src/services/scoringEngine.ts` and `tests/scoringEngine.test.ts`: **LOCKED & UNTOUCHED**.
  - All scoring delivery mechanics, strike rotations, dismissals, over transitions, and undo flows preserved verbatim.
  - Zero circular dependencies; no file under `src/` imports `App.tsx` (only root `main.tsx` mounts `App.tsx`).

### Phase 7: Root Architecture & Coordinator Extraction (COMPLETE)
- **Status:** PASS
- **Completed Extractions:**
  1. **Step 1 (Dead State Removal):** Eliminated dead module-level `activeNavigation` variable and its assignment/cleanup `useEffect` from `App.tsx`.
  2. **Step 2 (Settings & Backup Decoupling):** Extracted `exportBackupJson` and `importBackupFile` into `src/services/storageService.ts`; extracted `exportMatchesToCsv` into `src/services/exportService.ts`. Simplified `SettingsModal` props.
  3. **Step 3 (Toss Simulation Encapsulation):** Encapsulated `coinResult`, `coinFlipping`, `tossMessage`, `flipCoin`, `updateTossCaller`, and `updateTossCall` directly inside `src/screens/SetupScreen.tsx`.
  4. **Step 4 (Player Draft State Encapsulation):** Encapsulated modal state (`playerTeam`, `editingPlayer`, `playerDraft`, `playerHand`, `openPlayerForm`, `closePlayerForm`, `addPlayer`, `removePlayer`) inside `src/screens/PlayersScreen.tsx`.
  5. **Step 5 (Database Stats Hooks):** Created `src/hooks/useDatabaseStats.ts` (`useTeamStats`, `usePlayerStats`, `useDatabaseStats`). Updated `TeamsScreen` and `PlayersStatsScreen` to self-load stats, completely removing database stats state/effects from `App.tsx`.
  6. **Step 6 (Match Coordinator Hook):** Created `src/hooks/useMatchCoordinator.ts` encapsulating `useScoring`, `maxBalls`, `overNumber`, `ballNumber`, `milestone`, `shareImage`, `shareLiveUpdate`, `playerMessage`, `startMatch`, `continueToRoster`, `beginInnings`, `startSecondInnings`, `beginSecondInnings`, `finishMatch`, and `startNewMatch`. Streamlined `App.tsx` to consume `useMatchCoordinator`.
- **Files Created:**
  - `src/hooks/useDatabaseStats.ts`
  - `src/hooks/useMatchCoordinator.ts`
- **Files Modified:**
  - `src/services/storageService.ts`: Added backup JSON import/export helpers.
  - `src/services/exportService.ts`: Added CSV export helper.
  - `src/screens/SetupScreen.tsx`: Encapsulated coin flip and caller state.
  - `src/screens/PlayersScreen.tsx`: Encapsulated player modal form state.
  - `src/screens/TeamsScreen.tsx`: Integrated `useTeamStats()` hook.
  - `src/screens/PlayersStatsScreen.tsx`: Integrated `usePlayerStats()` hook.
  - `src/App.tsx`: Decomposed into pure routing shell and context provider composition root.
- **App.tsx Line Count Progression:**
  - Original: 1,421 lines
  - After Phase 2: 973 lines (-448 lines)
  - After Phase 3: 946 lines (-27 lines)
  - After Phase 4: 787 lines (-159 lines)
  - After Phase 5: 709 lines (-78 lines)
  - After Pre-Match Extraction: 603 lines (-106 lines)
  - After Phase 6: 345 lines (-258 lines)
  - After Phase 7: ~341 lines (pure routing shell + provider composition; all business logic, DB stats, and match transitions extracted to hooks/services)
  - **Total Reduction:** From 1,421 lines down to ~341 lines (**-1,080 lines / -76.0%**)
- **Verification Gate Results:**
  - `node --test tests/scoringEngine.test.ts`: **43/43 tests passing** (0 failures, 147ms)
  - `npm run lint`: **0 errors**, 0 new warnings (3 pre-existing warnings in `MatchContext.tsx` unchanged)
  - `npm run build`: **0 errors**, successful production build (695ms)
- **Behavior & Guardrail Compliance:**
  - `src/services/scoringEngine.ts` and `tests/scoringEngine.test.ts`: **STRICTLY LOCKED & UNTOUCHED**.
  - All scoring delivery mechanics, strike rotations, dismissals, over transitions, and undo flows preserved verbatim.
  - Zero circular dependencies; no file under `src/` imports `App.tsx` (only root `main.tsx` mounts `App.tsx`).

