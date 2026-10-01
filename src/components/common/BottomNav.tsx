import { useContext, useEffect, useState } from 'react'
import type { Screen } from '../../types/match'
import Icon from '../Icon'
import { AuthContext } from '../../context/AuthContext'

export interface BottomNavProps {
  active: string
  setScreen: (screen: Screen) => void
}

export function BottomNav({ active, setScreen }: BottomNavProps) {
  const auth = useContext(AuthContext)
  const photoURL = auth?.user?.photoURL
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)

  useEffect(() => {
    const handleViewportChange = () => {
      const vv = window.visualViewport
      if (!vv) return
      // When software keyboard opens, visualViewport height drops significantly (> 140px)
      const heightDiff = window.innerHeight - vv.height
      const isInputFocused =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      setIsKeyboardOpen(heightDiff > 140 && isInputFocused)
    }

    const handleFocusIn = () => {
      // Delay slightly for virtual viewport resize to kick in
      setTimeout(handleViewportChange, 150)
    }

    const handleFocusOut = () => {
      setTimeout(() => {
        const isInputFocused =
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        if (!isInputFocused) {
          setIsKeyboardOpen(false)
        }
      }, 150)
    }

    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', handleViewportChange)
    }
    window.addEventListener('focusin', handleFocusIn)
    window.addEventListener('focusout', handleFocusOut)

    return () => {
      if (vv) {
        vv.removeEventListener('resize', handleViewportChange)
      }
      window.removeEventListener('focusin', handleFocusIn)
      window.removeEventListener('focusout', handleFocusOut)
    }
  }, [])

  if (isKeyboardOpen) {
    return null
  }

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
      <button
        className={active === 'profile' ? 'selected' : ''}
        onClick={() => setScreen('profile')}
      >
        <span className="tab-icon">
          {photoURL ? (
            <img src={photoURL} alt="Profile" className="tab-avatar-img" />
          ) : (
            <Icon name="profile" variant="white" size={20} />
          )}
        </span>
        <b>Profile</b>
      </button>
    </nav>
  )
}

export default BottomNav
