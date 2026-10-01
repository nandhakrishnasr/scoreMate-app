import { useState } from 'react'
import Icon from '../Icon'
import { isDismissalAllowedOnFreeHit } from '../../services/scoringEngine'
import type {
  BallKind,
  BatterStatusEvent,
  ScoringModal,
  WicketType,
} from '../../types/match'

export interface ScoringSheetProps {
  modal: Exclude<ScoringModal, null>
  addBall: (kind: BallKind, value?: number, label?: string) => void
  close: () => void
  selectWicket: (
    type: WicketType,
    dismissedBatter?: 'striker' | 'nonStriker',
    runsCompleted?: number
  ) => void
  freeHit?: boolean
  strikerName: string
  nonStrikerName: string
  onRetireBatter: (name: string, status?: BatterStatusEvent) => void
}

export function ScoringSheet({
  modal,
  addBall,
  close,
  selectWicket,
  freeHit,
  strikerName,
  nonStrikerName,
  onRetireBatter,
}: ScoringSheetProps) {
  const [runOutStep, setRunOutStep] = useState<{
    dismissedBatter: 'striker' | 'nonStriker'
    runsCompleted: number
  } | null>(null)
  const [retireEvent, setRetireEvent] = useState<BatterStatusEvent | null>(null)

  const titles = {
    runs: 'Runs scored by running',
    wide: 'Wide ball',
    noBall: 'No ball',
    bye: 'Bye runs',
    legBye: 'Leg bye runs',
    wicket: 'Select out type',
  }
  const wicketTypes: WicketType[] = [
    'Bowled',
    'Caught',
    'Caught Behind',
    'Caught & Bowled',
    'Run Out',
    'LBW',
    'Stumped',
    'Retired Hurt',
    'Run Out (Mankaded)',
    'Hit Wicket',
    'Absent',
    'Retired Out',
  ]
  const wicketIcons: Record<WicketType, string> = {
    Bowled: 'out-bowled',
    Caught: 'out-caught',
    'Caught Behind': 'out-caught-behind',
    'Caught & Bowled': 'out-caught-bowled',
    'Run Out': 'out-run-out',
    LBW: 'out-lbw',
    Stumped: 'out-stumped',
    'Retired Hurt': 'out-retired-hurt',
    'Run Out (Mankaded)': 'out-run-out-mankaded',
    'Hit Wicket': 'out-hit-wicket',
    Absent: 'out-absent',
    'Retired Out': 'out-retired-out',
  }

  if (modal === 'wicket') {
    if (runOutStep) {
      return (
        <div className="scoring-backdrop">
          <section className="scoring-sheet">
            <button className="sheet-close" onClick={() => setRunOutStep(null)}>
              ×
            </button>
            <h3>Run Out Details</h3>
            <p style={{ margin: '4px 0 8px', fontSize: '0.85rem', opacity: 0.85 }}>
              Who was run out?
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginBottom: '12px',
              }}
            >
              <button
                type="button"
                className={
                  runOutStep.dismissedBatter === 'striker'
                    ? 'primary-button'
                    : 'secondary-button'
                }
                onClick={() =>
                  setRunOutStep({ ...runOutStep, dismissedBatter: 'striker' })
                }
              >
                Striker: {strikerName}
              </button>
              <button
                type="button"
                className={
                  runOutStep.dismissedBatter === 'nonStriker'
                    ? 'primary-button'
                    : 'secondary-button'
                }
                onClick={() =>
                  setRunOutStep({ ...runOutStep, dismissedBatter: 'nonStriker' })
                }
              >
                Non-Striker: {nonStrikerName}
              </button>
            </div>
            <p style={{ margin: '4px 0 8px', fontSize: '0.85rem', opacity: 0.85 }}>
              Completed runs before run out:
            </p>
            <div className="sheet-run-grid" style={{ marginBottom: '12px' }}>
              {[0, 1, 2].map((r) => (
                <button
                  key={r}
                  type="button"
                  className={
                    runOutStep.runsCompleted === r ? 'primary-button' : ''
                  }
                  onClick={() =>
                    setRunOutStep({ ...runOutStep, runsCompleted: r })
                  }
                >
                  {r} {r === 1 ? 'Run' : 'Runs'}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="primary-button wide-button"
              onClick={() => {
                selectWicket(
                  'Run Out',
                  runOutStep.dismissedBatter,
                  runOutStep.runsCompleted
                )
              }}
            >
              Continue to Fielder ›
            </button>
          </section>
        </div>
      )
    }

    if (retireEvent) {
      return (
        <div className="scoring-backdrop">
          <section className="scoring-sheet">
            <button className="sheet-close" onClick={() => setRetireEvent(null)}>
              ×
            </button>
            <h3>{retireEvent}</h3>
            <p
              style={{
                margin: '4px 0 12px',
                fontSize: '0.85rem',
                opacity: 0.85,
              }}
            >
              Select batter leaving the field:
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
              }}
            >
              <button
                type="button"
                className="secondary-button"
                onClick={() => onRetireBatter(strikerName, retireEvent)}
              >
                Striker: {strikerName}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onRetireBatter(nonStrikerName, retireEvent)}
              >
                Non-Striker: {nonStrikerName}
              </button>
            </div>
          </section>
        </div>
      )
    }

    return (
      <div className="scoring-backdrop">
        <section className="scoring-sheet">
          <button className="sheet-close" onClick={close}>
            ×
          </button>
          <h3>{titles[modal]}</h3>
          {freeHit && (
            <p
              style={{
                color: '#f59e0b',
                fontSize: '0.85rem',
                marginBottom: '8px',
              }}
            >
              ⚡ Free Hit Active — Bowler dismissals disabled (Run Out /
              Retired Out permitted)
            </p>
          )}
          <div className="wicket-grid">
            {wicketTypes.map((type) => {
              const allowed = !freeHit || isDismissalAllowedOnFreeHit(type)
              return (
                <button
                  key={type}
                  disabled={!allowed}
                  style={
                    !allowed
                      ? { opacity: 0.35, cursor: 'not-allowed' }
                      : undefined
                  }
                  onClick={() => {
                    if (type === 'Run Out') {
                      setRunOutStep({
                        dismissedBatter: 'striker',
                        runsCompleted: 0,
                      })
                    } else if (type === 'Retired Hurt' || type === 'Absent') {
                      setRetireEvent(type)
                    } else {
                      selectWicket(type)
                    }
                  }}
                >
                  <Icon name={wicketIcons[type]} size={24} />
                  {type}
                </button>
              )
            })}
          </div>
        </section>
      </div>
    )
  }

  if (modal === 'runs')
    return (
      <div className="scoring-backdrop">
        <section className="scoring-sheet">
          <button className="sheet-close" onClick={close}>
            ×
          </button>
          <h3>{titles[modal]}</h3>
          <div className="sheet-run-grid">
            <button onClick={() => addBall('runs', 5, '5')}>5 Runs</button>
            <button onClick={() => addBall('runs', 7, '7')}>7 Runs</button>
          </div>
        </section>
      </div>
    )

  const kind = modal
  const prefix =
    modal === 'wide'
      ? 'WD'
      : modal === 'noBall'
      ? 'NB'
      : modal === 'bye'
      ? 'BYE'
      : 'LB'
  const isExtraDelivery = modal === 'wide' || modal === 'noBall'

  return (
    <div className="scoring-backdrop">
      <section className="scoring-sheet">
        <button className="sheet-close" onClick={close}>
          ×
        </button>
        <h3>{titles[modal]}</h3>
        <div className="sheet-run-grid">
          {[0, 1, 2, 3, 4, 5, 6].map((run) => (
            <button
              key={run}
              onClick={() =>
                addBall(
                  kind,
                  isExtraDelivery ? run : Math.max(1, run),
                  `${prefix}+${run}`
                )
              }
            >
              {prefix} + {run}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

export default ScoringSheet
