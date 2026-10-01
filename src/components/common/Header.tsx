import type { ReactNode } from 'react'
import { useContext, useState, useEffect } from 'react'
import Icon from '../Icon'
import { NavigationContext } from '../../context/NavigationContext.ts'
import { AuthContext } from '../../context/AuthContext'
import { firebaseAuth } from '../../services/firebase.ts'
import { syncService, type SyncState } from '../../services/syncService.ts'
import { getInitials } from '../../services/imageService.ts'
import { formatFirebaseUser, type AuthUser } from '../../types/auth.ts'
import { isOfflineGuestActive } from '../../services/authService.ts'

export interface HeaderProps {
  title: ReactNode
  onBack?: () => void
  action?: string
  onAction?: () => void
  onProfileClick?: () => void
  hideBrand?: boolean
  showProfileAvatar?: boolean
}

export function Header({
  title,
  onBack,
  action,
  onAction,
  onProfileClick,
  hideBrand = false,
  showProfileAvatar = false,
}: HeaderProps) {
  const navigate = useContext(NavigationContext)
  const authContext = useContext(AuthContext)
  const [syncState, setSyncState] = useState<SyncState>(syncService.getSyncState())
  const [localAuthUser, setLocalAuthUser] = useState<AuthUser | null>(() => {
    if (firebaseAuth.currentUser) {
      return formatFirebaseUser(firebaseAuth.currentUser)
    }
    if (isOfflineGuestActive()) {
      return formatFirebaseUser(null, true)
    }
    return null
  })

  useEffect(() => {
    const unsubAuth = firebaseAuth.onAuthStateChanged((user) => {
      if (user) {
        setLocalAuthUser(formatFirebaseUser(user))
      } else if (isOfflineGuestActive()) {
        setLocalAuthUser(formatFirebaseUser(null, true))
      } else {
        setLocalAuthUser(null)
      }
    })
    const unsubSync = syncService.subscribeSyncState((state) => {
      setSyncState(state)
    })
    return () => {
      unsubAuth()
      unsubSync()
    }
  }, [])

  function handleProfileTap() {
    if (onProfileClick) {
      onProfileClick()
    } else if (navigate) {
      navigate('profile')
    }
  }

  const authUser = authContext?.user ?? localAuthUser
  const isGuest = !authUser || authUser.isAnonymous || authUser.isOfflineGuest
  const hasPhoto = Boolean(authUser?.photoURL)
  const hasInitials = Boolean(!isGuest && authUser?.displayName)
  const isOnlineAuth = Boolean(authUser && !isGuest)

  return (
    <header className="topbar">
      {onBack ? (
        <button className="icon-button" onClick={onBack} aria-label="Go back">
          <Icon name="chevron-left" variant="white" size={24} label="Go back" />
        </button>
      ) : hideBrand ? null : (
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
        {isOnlineAuth && (
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
        {showProfileAvatar && (
          <button
            type="button"
            className="header-avatar-button"
            onClick={handleProfileTap}
            aria-label="User profile"
            title={authUser?.displayName || (isGuest ? 'Guest Player' : 'User profile')}
          >
            {hasPhoto ? (
              <img
                src={authUser!.photoURL!}
                alt={authUser!.displayName || 'User profile'}
                className="header-avatar-img"
              />
            ) : hasInitials ? (
              <span className="header-avatar-initials">
                {getInitials(authUser!.displayName)}
              </span>
            ) : (
              <span className="header-avatar-guest" aria-hidden="true">
                <Icon name="user" size={18} />
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  )
}

export default Header

