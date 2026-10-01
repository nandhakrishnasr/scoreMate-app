import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  computeBackAction,
  getParentScreen,
  type BackState,
} from '../src/services/navigationService.ts'

function createDefaultBackState(overrides: Partial<BackState> = {}): BackState {
  return {
    screen: 'setup',
    hasActiveScore: false,
    settingsOpen: false,
    undoPending: false,
    endMatchPending: false,
    leavePending: false,
    hasScoringModal: false,
    isFinishing: false,
    isEndingMatch: false,
    ...overrides,
  }
}

describe('Navigation Policy & Back Button Behavior (Phase 8)', () => {
  it('1. Maps logical parent screens correctly', () => {
    assert.strictEqual(getParentScreen('match-options'), 'setup')
    assert.strictEqual(getParentScreen('roster'), 'match-options')
    assert.strictEqual(getParentScreen('opening-select'), 'roster')
    assert.strictEqual(getParentScreen('second-opening'), 'innings-break')
    assert.strictEqual(getParentScreen('scorecard'), 'live')
    assert.strictEqual(getParentScreen('result'), 'history')

    // Root / forward-only screens have no parent
    assert.strictEqual(getParentScreen('setup'), null)
    assert.strictEqual(getParentScreen('history'), null)
    assert.strictEqual(getParentScreen('teams'), null)
    assert.strictEqual(getParentScreen('players'), null)
    assert.strictEqual(getParentScreen('login'), null)
    assert.strictEqual(getParentScreen('live'), null)
    assert.strictEqual(getParentScreen('innings-break'), null)
  })

  it('2. Priority 0: Ignores Back when persistence is in flight (isFinishing)', () => {
    const state = createDefaultBackState({
      screen: 'live',
      hasActiveScore: true,
      isFinishing: true,
      settingsOpen: true, // even if modal was open
    })
    const action = computeBackAction(state)
    assert.deepStrictEqual(action, { type: 'noop' })
  })

  it('3. Priority 0: Ignores Back when persistence is in flight (isEndingMatch)', () => {
    const state = createDefaultBackState({
      screen: 'live',
      hasActiveScore: true,
      isEndingMatch: true,
      endMatchPending: true,
    })
    const action = computeBackAction(state)
    assert.deepStrictEqual(action, { type: 'noop' })
  })

  it('4. Priority 1: Settings modal intercepts Back first', () => {
    const state = createDefaultBackState({
      screen: 'live',
      hasActiveScore: true,
      settingsOpen: true,
      undoPending: true,
    })
    const action = computeBackAction(state)
    assert.deepStrictEqual(action, { type: 'close-settings' })
  })

  it('5. Priority 2: Undo confirmation intercepts Back', () => {
    const state = createDefaultBackState({
      screen: 'live',
      hasActiveScore: true,
      undoPending: true,
      hasScoringModal: true,
    })
    const action = computeBackAction(state)
    assert.deepStrictEqual(action, { type: 'cancel-undo' })
  })

  it('6. Priority 3: End Match confirmation intercepts Back', () => {
    const state = createDefaultBackState({
      screen: 'live',
      hasActiveScore: true,
      endMatchPending: true,
    })
    const action = computeBackAction(state)
    assert.deepStrictEqual(action, { type: 'close-end-match-confirm' })
  })

  it('7. Priority 4: Leave Match confirmation dismisses on Back', () => {
    const state = createDefaultBackState({
      screen: 'live',
      hasActiveScore: true,
      leavePending: true,
    })
    const action = computeBackAction(state)
    assert.deepStrictEqual(action, { type: 'close-leave-confirm' })
  })

  it('8. Priority 5: Scoring modal / sheet intercepts Back', () => {
    const state = createDefaultBackState({
      screen: 'live',
      hasActiveScore: true,
      hasScoringModal: true,
    })
    const action = computeBackAction(state)
    assert.deepStrictEqual(action, { type: 'close-scoring-modal' })
  })

  it('9. Priority 6: Live screen with active match triggers Leave confirmation (NO silent navigation to opening-select)', () => {
    const state = createDefaultBackState({
      screen: 'live',
      hasActiveScore: true,
    })
    const action = computeBackAction(state)
    assert.deepStrictEqual(action, { type: 'show-leave-confirm' })
  })

  it('10. Sequence: setup -> match-options -> roster -> opening-select -> live, then Back from live', () => {
    // 1. opening-select Back returns to roster
    const openingSelectBack = computeBackAction(createDefaultBackState({ screen: 'opening-select' }))
    assert.deepStrictEqual(openingSelectBack, { type: 'navigate', to: 'roster' })

    // 2. roster Back returns to match-options
    const rosterBack = computeBackAction(createDefaultBackState({ screen: 'roster' }))
    assert.deepStrictEqual(rosterBack, { type: 'navigate', to: 'match-options' })

    // 3. match-options Back returns to setup
    const matchOptionsBack = computeBackAction(createDefaultBackState({ screen: 'match-options' }))
    assert.deepStrictEqual(matchOptionsBack, { type: 'navigate', to: 'setup' })

    // 4. Live with active match NEVER returns to opening-select; it triggers show-leave-confirm
    const liveBack = computeBackAction(createDefaultBackState({ screen: 'live', hasActiveScore: true }))
    assert.deepStrictEqual(liveBack, { type: 'show-leave-confirm' })
  })

  it('11. Scorecard screen Back navigates back to live', () => {
    const state = createDefaultBackState({
      screen: 'scorecard',
      hasActiveScore: true,
    })
    const action = computeBackAction(state)
    assert.deepStrictEqual(action, { type: 'navigate', to: 'live' })
  })

  it('12. Second opening screen Back navigates to innings-break', () => {
    const state = createDefaultBackState({
      screen: 'second-opening',
      hasActiveScore: false,
    })
    const action = computeBackAction(state)
    assert.deepStrictEqual(action, { type: 'navigate', to: 'innings-break' })
  })

  it('13. Result screen Back navigates to history', () => {
    const state = createDefaultBackState({
      screen: 'result',
      hasActiveScore: false,
    })
    const action = computeBackAction(state)
    assert.deepStrictEqual(action, { type: 'navigate', to: 'history' })
  })

  it('14. Root screens exit app or let OS handle', () => {
    const rootScreens = ['setup', 'history', 'teams', 'players', 'login', 'innings-break'] as const
    for (const scr of rootScreens) {
      const state = createDefaultBackState({ screen: scr })
      const action = computeBackAction(state)
      assert.deepStrictEqual(action, { type: 'exit-app' }, `Screen ${scr} should trigger exit-app`)
    }
  })
})
