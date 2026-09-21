import type { Screen } from '../../types/match'
import Icon from '../Icon'

export interface BottomNavProps {
  active: string
  setScreen: (screen: Screen) => void
}

export function BottomNav({ active, setScreen }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      <button
        className={active === 'new' ? 'selected' : ''}
        onClick={() => setScreen('setup')}
      >
        <span className="tab-icon">
          <Icon name="new-match-wicket" variant="white" size={20} />
        </span>
        <b>New Match</b>
      </button>
      <button
        className={active === 'teams' ? 'selected' : ''}
        onClick={() => setScreen('teams')}
      >
        <span className="tab-icon">
          <Icon name="teams-crossed-bats" variant="white" size={20} />
        </span>
        <b>Teams</b>
      </button>
      <button
        className={active === 'players' ? 'selected' : ''}
        onClick={() => setScreen('players')}
      >
        <span className="tab-icon">
          <Icon name="players-batsman" variant="white" size={20} />
        </span>
        <b>Players</b>
      </button>
      <button
        className={active === 'history' ? 'selected' : ''}
        onClick={() => setScreen('history')}
      >
        <span className="tab-icon">
          <Icon name="history-scorecard" variant="white" size={20} />
        </span>
        <b>History</b>
      </button>
    </nav>
  )
}

export default BottomNav
