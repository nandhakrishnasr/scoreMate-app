/**
 * Phase 8 — Navigation Service
 *
 * Pure navigation policy functions. No React, no DOM dependencies.
 * Fully testable in Node without a browser environment.
 *
 * Design contract:
 *  - ONE sentinel in browser history (managed by useBackNavigation).
 *  - Screen transitions NEVER touch browser history.
 *  - computeBackAction() is the single source of truth for back-press behavior.
 */
import type { Screen } from '../types/match'

// ---------------------------------------------------------------------------
// Logical parent-screen map
// ---------------------------------------------------------------------------

/**
 * Maps each non-root screen to the screen Back should navigate to.
 *
 * Screens deliberately absent from this map:
 *   live         — handled as the "active match" case (leave-confirmation)
 *   innings-break — forward-only checkpoint; Back exits the app on Android or
 *                   is a noop in the browser.
 *   login, setup, history, teams, players, profile — root screens, no parent.
 */
export const PARENT_SCREENS: Partial<Record<Screen, Screen>> = {
  'match-options': 'setup',
  'roster': 'match-options',
  'opening-select': 'roster',
  'second-opening': 'innings-break',
  'scorecard': 'live',
  'result': 'history',
}

/** Returns the logical parent screen for Back navigation, or null if root/handled separately. */
export function getParentScreen(screen: Screen): Screen | null {
  return PARENT_SCREENS[screen] ?? null
}

// ---------------------------------------------------------------------------
// Back-action computation
// ---------------------------------------------------------------------------

/**
 * Flat snapshot of the UI state relevant to back-press handling.
 * All fields are plain primitives — no React dependencies.
 */
export type BackState = {
  screen: Screen
  /** true when score !== null (an active in-progress match is loaded) */
  hasActiveScore: boolean
  settingsOpen: boolean
  undoPending: boolean
  endMatchPending: boolean
  leavePending: boolean
  /** true when ANY scoring sheet/picker/modal is open */
  hasScoringModal: boolean
  /** true while finishMatch IndexedDB write is in flight */
  isFinishing: boolean
  /** true while endMatch IndexedDB write is in flight */
  isEndingMatch: boolean
}

export type BackAction =
  | { type: 'noop' }
  | { type: 'close-settings' }
  | { type: 'cancel-undo' }
  | { type: 'close-end-match-confirm' }
  | { type: 'close-leave-confirm' }
  | { type: 'close-scoring-modal' }
  | { type: 'show-leave-confirm' }
  | { type: 'navigate'; to: Screen }
  | { type: 'exit-app' }

/**
 * Determines the correct back action given the current UI state.
 * Priority order is fixed and matches the Phase 8 specification.
 * This function has no side effects — callers dispatch the returned action.
 */
export function computeBackAction(state: BackState): BackAction {
  // 0. Async persistence in flight — ignore all Back presses
  if (state.isFinishing || state.isEndingMatch) return { type: 'noop' }

  // 1. Settings modal
  if (state.settingsOpen) return { type: 'close-settings' }

  // 2. Undo confirmation
  if (state.undoPending) return { type: 'cancel-undo' }

  // 3. End Match confirmation
  if (state.endMatchPending) return { type: 'close-end-match-confirm' }

  // 4. Leave-match confirmation (already showing — Back dismisses it)
  if (state.leavePending) return { type: 'close-leave-confirm' }

  // 5. Any scoring transient UI (sheet, wicket picker, batter/bowler selector)
  if (state.hasScoringModal) return { type: 'close-scoring-modal' }

  // 6. Live screen with active in-progress match
  if (state.screen === 'live' && state.hasActiveScore) {
    return { type: 'show-leave-confirm' }
  }

  // 7. Logical parent screen
  const parent = getParentScreen(state.screen)
  if (parent) return { type: 'navigate', to: parent }

  // 8. Root screen — let the OS handle (Android: minimize; browser: noop)
  return { type: 'exit-app' }
}
