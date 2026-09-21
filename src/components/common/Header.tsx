import type { ReactNode } from 'react'
import { useContext, useState, useEffect } from 'react'
import Icon from '../Icon'
import { SettingsContext } from '../../context/SettingsContext'
import { firebaseAuth } from '../../services/firebase'
import { syncService, type SyncState } from '../../services/syncService'

export interface HeaderProps {
  title: ReactNode
  onBack?: () => void
  action?: string
  onAction?: () => void
}

export function Header({ title, onBack, action, onAction }: HeaderProps) {
  const openSettings = useContext(SettingsContext)
  const [syncState, setSyncState] = useState<SyncState>(syncService.getSyncState())
  const [hasAuthUser, setHasAuthUser] = useState<boolean>(Boolean(firebaseAuth.currentUser?.uid))

  useEffect(() => {
    const unsubAuth = firebaseAuth.onAuthStateChanged((user) => {
      setHasAuthUser(Boolean(user?.uid))
    })
    const unsubSync = syncService.subscribeSyncState((state) => {
      setSyncState(state)
    })
    return () => {
      unsubAuth()
      unsubSync()
    }
  }, [])

  return (
    <header className="topbar">
      {onBack ? (
        <button className="icon-button" onClick={onBack} aria-label="Go back">
          <Icon name="chevron-left" variant="white" size={24} label="Go back" />
        </button>
      ) : (
        <div className="brand-mark">
          <img
            src="/scoremate.png"
            alt="ScoreMate"
            className="brand-logo"
          />
          <span className="brand-status-dot" />
        </div>
      )}
      <h1>{title}</h1>
      <div className="top-actions">
        {hasAuthUser && (
          <button
            type="button"
            className={`sync-indicator-btn sync-${syncState}`}
            onClick={() => void syncService.syncAll()}
            title={`Cloud sync: ${syncState}. Tap to sync now.`}
            aria-label={`Sync state: ${syncState}`}
          >
            <span className={`sync-dot sync-dot-${syncState}`} />
            <span className="sync-label">
              {syncState === 'syncing'
                ? 'Syncing'
                : syncState === 'offline'
                  ? 'Offline'
                  : syncState === 'error'
                    ? 'Sync error'
                    : 'Synced'}
            </span>
          </button>
        )}
        {action && (
          <button className="icon-button" onClick={onAction} aria-label="Open scorecard">
            <Icon name="document" variant="white" size={24} label="Open scorecard" />
          </button>
        )}
        <button className="icon-button" onClick={() => openSettings?.()} aria-label="Open settings">
          <Icon name="settings" variant="white" size={24} label="Open settings" />
        </button>
      </div>
    </header>
  )
}

export default Header

