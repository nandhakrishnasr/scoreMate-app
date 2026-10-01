import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import Icon from '../components/Icon'
import { BottomNav } from '../components/common/BottomNav'
import { Header } from '../components/common/Header'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { AuthModal } from '../components/modals/AuthModal'
import { RestoreConfirmModal } from '../components/modals/RestoreConfirmModal'
import { googleDriveService } from '../services/googleDriveService'
import {
  executeDriveBackup,
  executeDriveDownload,
  executeDriveDisconnect,
  executeRestore,
  inspectBackupSummary,
  sanitizeUserFacingError,
  formatLastBackupTime,
  type BackupUIOperation,
  type BackupStatusMessage,
  type BackupInspectionSummary,
} from '../services/backupUIController'
import { settingsRepository } from '../services/repositories/settingsRepository'
import { cropAndCompressImage, uploadProfilePhoto, getInitials } from '../services/imageService'
import type { Screen } from '../types/match'
import type { RestoreMode } from '../types/database'

export interface ProfileScreenProps {
  setScreen: (screen: Screen) => void
  openSettings?: () => void
  onReloadMatches?: () => void | Promise<void>
}

export function ProfileScreen({ setScreen, openSettings: propOpenSettings, onReloadMatches }: ProfileScreenProps) {
  const contextOpenSettings = useSettings()
  const openSettings = propOpenSettings || contextOpenSettings || (() => {})

  const {
    user,
    isGuest,
    signOut,
    updateUserProfile,
    linkGuestWithEmail,
    linkGuestWithGoogle,
    linkGuestWithApple,
  } = useAuth()

  // Cloud & Backup state
  const [operation, setOperation] = useState<BackupUIOperation>('idle')
  const [statusMessage, setStatusMessage] = useState<BackupStatusMessage | null>(null)
  const [driveConnected, setDriveConnected] = useState<boolean>(() => googleDriveService.isConnected())
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null)
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(true)

  // Restore Modal State
  const [restoreModalOpen, setRestoreModalOpen] = useState(false)
  const [pendingRestoreContent, setPendingRestoreContent] = useState<string | null>(null)
  const [pendingRestoreSummary, setPendingRestoreSummary] = useState<BackupInspectionSummary | null>(null)

  // Edit Profile Modal State
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState(user?.displayName || '')
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(user?.photoURL || null)
  const [pendingPhotoBlob, setPendingPhotoBlob] = useState<Blob | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Guest Account Linking Modal State
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [collisionInfo, setCollisionInfo] = useState<string | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)

  const isBusy = operation !== 'idle'

  // Fetch Drive status, last backup, and autoBackup toggle on mount
  useEffect(() => {
    let active = true
    void settingsRepository.getLastSuccessfulDriveBackupAt().then((ts) => {
      if (active) setLastBackupAt(ts)
    }).catch(() => {})

    void settingsRepository.isAutoBackupEnabled().then((enabled) => {
      if (active) setAutoBackupEnabled(enabled)
    }).catch(() => {})

    if (googleDriveService.isConnected()) {
      void googleDriveService.findBackupFile().catch(() => {})
    }
    return () => {
      active = false
    }
  }, [])

  function openEditModal() {
    setEditDisplayName(user?.displayName || (isGuest ? 'Guest Player' : ''))
    setEditPhotoPreview(user?.photoURL || null)
    setPendingPhotoBlob(null)
    setProfileError(null)
    setEditProfileOpen(true)
  }

  // --- Profile Photo Handlers ---

  async function handlePhotoFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setProfileError(null)
      const { blob, dataUrl } = await cropAndCompressImage(file, 512, 0.85)
      setPendingPhotoBlob(blob)
      setEditPhotoPreview(dataUrl)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to process selected image.')
    } finally {
      if (e.target) e.target.value = ''
    }
  }

  function handleRemovePhoto() {
    setPendingPhotoBlob(null)
    setEditPhotoPreview(null)
  }

  async function handleSaveProfile() {
    const trimmedName = editDisplayName.trim()
    if (!trimmedName) {
      setProfileError('Display name cannot be empty.')
      return
    }

    setSavingProfile(true)
    setProfileError(null)

    try {
      let finalPhotoURL = editPhotoPreview

      // If a new photo was selected and user is authenticated, upload to Firebase Storage with quick timeout
      if (pendingPhotoBlob && user?.uid && !user.isOfflineGuest) {
        try {
          const downloadUrl = await uploadProfilePhoto(user.uid, pendingPhotoBlob, 3000)
          finalPhotoURL = downloadUrl
        } catch (uploadErr) {
          console.warn('Firebase Storage upload failed or timed out, keeping local avatar:', uploadErr)
          // Fall back gracefully to dataUrl
        }
      }

      await updateUserProfile({
        displayName: trimmedName,
        photoURL: finalPhotoURL,
      })

      setEditProfileOpen(false)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  // --- Auth Handlers ---

  async function handleSignOut() {
    try {
      googleDriveService.clearToken()
      setDriveConnected(false)
      await signOut()
    } catch {
      // Offline/network failure should not prevent local navigation to login screen
    } finally {
      setScreen('login')
    }
  }

  async function handleLinkEmail(email: string, pass: string) {
    setLinkLoading(true)
    try {
      const res = await linkGuestWithEmail(email, pass)
      if ('message' in res) {
        setCollisionInfo(res.message)
      } else {
        setShowLinkModal(false)
      }
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Failed to link account.')
    } finally {
      setLinkLoading(false)
    }
  }

  async function handleLinkGoogle() {
    setLinkLoading(true)
    try {
      const res = await linkGuestWithGoogle()
      if ('message' in res) {
        setCollisionInfo(res.message)
      }
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Failed to link Google account.')
    } finally {
      setLinkLoading(false)
    }
  }

  async function handleLinkApple() {
    setLinkLoading(true)
    try {
      const res = await linkGuestWithApple()
      if ('message' in res) {
        setCollisionInfo(res.message)
      }
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Failed to link Apple account.')
    } finally {
      setLinkLoading(false)
    }
  }

  // --- Google Drive Backup Handlers ---

  async function handleConnectDrive() {
    if (isBusy) return
    setOperation('connecting')
    setStatusMessage({ type: 'info', text: 'Connecting to Google Drive…' })
    try {
      await googleDriveService.authorize(true)
      setDriveConnected(true)
      setStatusMessage({
        type: 'success',
        text: 'Google Drive connected successfully.',
      })
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: sanitizeUserFacingError(err),
      })
    } finally {
      setOperation('idle')
    }
  }

  async function handleDriveBackup() {
    if (isBusy) return
    setOperation('backing_up_drive')
    setStatusMessage({ type: 'info', text: 'Backing up to Google Drive…' })
    try {
      const res = await executeDriveBackup()
      if (res.success) {
        setDriveConnected(true)
        const ts = await settingsRepository.getLastSuccessfulDriveBackupAt()
        setLastBackupAt(ts)
        setStatusMessage({
          type: 'success',
          text: 'Backup successfully uploaded to Google Drive.',
        })
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Google Drive backup failed.',
        })
      }
    } finally {
      setOperation('idle')
    }
  }

  async function handleDriveRestore() {
    if (isBusy) return
    setOperation('downloading_drive')
    setStatusMessage({ type: 'info', text: 'Downloading backup from Google Drive…' })
    try {
      const res = await executeDriveDownload()
      if (res.success && res.content) {
        const summary = inspectBackupSummary(res.content)
        setPendingRestoreContent(res.content)
        setPendingRestoreSummary(summary)
        setRestoreModalOpen(true)
        setStatusMessage(null)
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to download backup from Google Drive.',
        })
      }
    } finally {
      setOperation('idle')
    }
  }

  async function handleConfirmRestore(mode: RestoreMode) {
    if (!pendingRestoreContent || isBusy) return
    setOperation('restoring')
    setStatusMessage({ type: 'info', text: 'Restoring backup data…' })

    try {
      const isAuthenticated = Boolean(user && !user.isOfflineGuest)
      const res = await executeRestore(pendingRestoreContent, mode, isAuthenticated)

      if (res.localSuccess) {
        if (onReloadMatches) {
          await onReloadMatches()
        }
      }

      setStatusMessage({
        type: res.statusType,
        text: res.message,
      })
      setRestoreModalOpen(false)
      setPendingRestoreContent(null)
      setPendingRestoreSummary(null)
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: sanitizeUserFacingError(err),
      })
    } finally {
      setOperation('idle')
    }
  }

  async function handleDriveDisconnect() {
    if (isBusy) return
    setOperation('connecting')
    try {
      const res = await executeDriveDisconnect()
      setDriveConnected(false)
      if (res.success) {
        setStatusMessage({
          type: 'info',
          text: 'Google Drive disconnected.',
        })
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to disconnect Google Drive.',
        })
      }
    } finally {
      setOperation('idle')
    }
  }

  async function handleAutoBackupToggle(e: ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked
    setAutoBackupEnabled(checked)
    await settingsRepository.setAutoBackupEnabled(checked)
  }

  // Determine provider display badge
  const providerLabel = isGuest
    ? 'Local guest account'
    : user?.providerIds?.includes('google.com')
      ? 'Google account'
      : user?.providerIds?.includes('apple.com')
        ? 'Apple account'
        : user?.providerIds?.includes('password')
          ? 'Email account'
          : user?.providerIds?.includes('phone')
            ? 'Phone account'
            : 'ScoreMate account'

  const displayName = user?.displayName || (isGuest ? 'Guest Player' : 'Player')
  const email = user?.email
  const phoneNumber = user?.phoneNumber
  const photoURL = user?.photoURL

  return (
    <div className="app-shell profile-shell">
      <Header
        title={
          <>
            <strong>User</strong> Profile
          </>
        }
        hideBrand
      />

      <main className="profile-content">
        {/* ==================================================
            1. PROFILE HERO SECTION
            ================================================== */}
        <section className="profile-hero-card">
          <div className="profile-avatar-container">
            <div className="profile-hero-avatar">
              {photoURL ? (
                <img src={photoURL} alt={displayName} className="profile-avatar-image" />
              ) : isGuest ? (
                <div className="profile-avatar-placeholder guest">
                  <Icon name="user" size={44} />
                </div>
              ) : (
                <div className="profile-avatar-placeholder initials">
                  <span>{getInitials(displayName)}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="profile-avatar-edit-badge"
              onClick={openEditModal}
              aria-label="Edit profile photo"
              title="Edit photo"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
          </div>

          <div className="profile-hero-meta">
            <h2 className="profile-display-name">{displayName}</h2>
            {email && <span className="profile-email">{email}</span>}
            {phoneNumber && <span className="profile-phone">{phoneNumber}</span>}
            <div className="profile-provider-badge">
              <span className={`provider-indicator-dot ${isGuest ? 'guest' : 'auth'}`} />
              <span>{providerLabel}</span>
            </div>
          </div>

          <div className="profile-hero-actions">
            <button
              type="button"
              className="primary-button edit-profile-btn"
              onClick={openEditModal}
              disabled={isBusy}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit Profile
            </button>

            <button
              type="button"
              className="danger-outline-button"
              onClick={handleSignOut}
              disabled={isBusy}
            >
              Sign out
            </button>

            {isGuest && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowLinkModal(true)}
                disabled={isBusy || linkLoading}
                style={{ width: '100%', maxWidth: '100%', marginTop: '4px' }}
              >
                Sign in / Create account
              </button>
            )}
          </div>
        </section>

        {/* Status Message Banner */}
        {statusMessage && (
          <div className={`backup-feedback-banner ${statusMessage.type}`} style={{ margin: '14px 0' }}>
            <span>{statusMessage.text}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'currentColor',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '0 4px',
              }}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}

        {/* ==================================================
            2. ACCOUNT SECTION (For Guests to Upgrade)
            ================================================== */}
        {isGuest && (
          <section className="profile-section">
            <div className="section-label-row">
              <span className="section-eyebrow">ACCOUNT</span>
            </div>
            <div className="account-upgrade-card">
              <div className="upgrade-card-text">
                <strong>Save your match data permanently</strong>
                <p>Link your guest session to retain all statistics and matches across devices.</p>
              </div>
              <div className="upgrade-card-buttons">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setShowLinkModal(true)}
                  disabled={linkLoading || isBusy}
                >
                  Create Account
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleLinkGoogle}
                  disabled={linkLoading || isBusy}
                >
                  Link Google
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleLinkApple}
                  disabled={linkLoading || isBusy}
                >
                  Link Apple
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ==================================================
            3. CLOUD & BACKUP SECTION (Google Drive)
            ================================================== */}
        <section className="profile-section">
          <div className="section-label-row">
            <span className="section-eyebrow">CLOUD & BACKUP</span>
            {isBusy && (
              <span className="busy-indicator">
                {operation === 'connecting' && 'Connecting…'}
                {operation === 'backing_up_drive' && 'Backing up…'}
                {operation === 'downloading_drive' && 'Downloading…'}
                {operation === 'restoring' && 'Restoring…'}
              </span>
            )}
          </div>

          <div className="backup-card">
            <div className="backup-card-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                </svg>
                <span className="backup-card-title">Google Drive</span>
              </div>
              <span className={`backup-status-badge ${driveConnected ? 'connected' : 'disconnected'}`}>
                {driveConnected ? 'Connected' : 'Not Connected'}
              </span>
            </div>

            <p className="backup-card-desc">
              {driveConnected
                ? `Last backup: ${formatLastBackupTime(lastBackupAt)}`
                : 'Not connected. Connect Google Drive to securely back up match data across devices.'}
            </p>

            <div className="backup-button-row">
              {!driveConnected ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleConnectDrive}
                  disabled={isBusy}
                  style={{ flex: 1 }}
                >
                  <Icon name="download-cloud" />
                  {operation === 'connecting' ? 'Connecting…' : 'Connect Google Drive'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleDriveBackup}
                    disabled={isBusy}
                    style={{ flex: 1 }}
                  >
                    <Icon name="download-cloud" />
                    {operation === 'backing_up_drive' ? 'Backing up…' : 'Back Up Now'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleDriveRestore}
                    disabled={isBusy}
                    style={{ flex: 1 }}
                  >
                    <Icon name="upload-cloud" />
                    {operation === 'downloading_drive' ? 'Downloading…' : 'Restore Backup'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button disconnect-btn"
                    onClick={handleDriveDisconnect}
                    disabled={isBusy}
                    title="Disconnect Google Drive authorization"
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>

            {/* Automatic Backup Switch */}
            <div className="auto-backup-toggle-row">
              <div>
                <span className="auto-backup-title">Automatic backup</span>
                <p className="auto-backup-subtitle">Periodically back up to Google Drive every 7 days</p>
              </div>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={autoBackupEnabled}
                  onChange={handleAutoBackupToggle}
                  disabled={isBusy}
                  aria-label="Toggle automatic backup"
                />
                <span className="slider round" />
              </label>
            </div>
          </div>
        </section>

        {/* ==================================================
            4. APP SETTINGS ACCESS
            ================================================== */}
        <section className="profile-section">
          <button
            type="button"
            className="app-settings-access-card"
            onClick={openSettings}
            aria-label="Open App Settings"
          >
            <div className="app-settings-left">
              <div className="settings-icon-wrapper">
                <Icon name="settings" size={20} />
              </div>
              <div>
                <strong className="app-settings-title">App Settings</strong>
                <span className="app-settings-desc">Theme, local data management, and about</span>
              </div>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </section>
      </main>

      {/* Hidden File / Camera Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handlePhotoFileSelected}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        style={{ display: 'none' }}
        onChange={handlePhotoFileSelected}
      />

      {/* Edit Profile Modal */}
      {editProfileOpen && (
        <div className="settings-backdrop" onClick={() => !savingProfile && setEditProfileOpen(false)}>
          <div className="settings-modal edit-profile-dialog" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="sheet-close"
              onClick={() => !savingProfile && setEditProfileOpen(false)}
              aria-label="Close"
              disabled={savingProfile}
            >
              <Icon name="x" size={16} />
            </button>

            <div className="settings-head">
              <span className="section-kicker">PROFILE</span>
              <h3>Edit Profile</h3>
            </div>

            {profileError && (
              <div className="backup-feedback-banner error" style={{ marginBottom: '12px' }}>
                <span>{profileError}</span>
              </div>
            )}

            {/* Photo preview and controls */}
            <div className="edit-photo-section">
              <div className="edit-photo-preview-wrapper">
                {editPhotoPreview ? (
                  <img src={editPhotoPreview} alt="Preview" className="edit-photo-preview" />
                ) : (
                  <div className="edit-photo-placeholder">
                    <span>{getInitials(editDisplayName || 'Player')}</span>
                  </div>
                )}
              </div>

              <div className="edit-photo-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={savingProfile}
                  style={{ fontSize: '12px', padding: '8px 12px' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  Choose photo
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={savingProfile}
                  style={{ fontSize: '12px', padding: '8px 12px' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  Take photo
                </button>
                {editPhotoPreview && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleRemovePhoto}
                    disabled={savingProfile}
                    style={{ fontSize: '12px', padding: '8px 12px', color: 'var(--danger)' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Display Name Input */}
            <div className="edit-field" style={{ marginTop: '16px' }}>
              <label htmlFor="edit-name-input" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                DISPLAY NAME
              </label>
              <input
                id="edit-name-input"
                type="text"
                className="edit-text-input"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="Enter your name"
                maxLength={40}
                disabled={savingProfile}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  color: 'var(--soft)',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Read-only account info */}
            {email && (
              <div className="edit-field-readonly" style={{ marginTop: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', display: 'block' }}>
                  EMAIL ADDRESS
                </span>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{email}</span>
              </div>
            )}
            {phoneNumber && (
              <div className="edit-field-readonly" style={{ marginTop: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', display: 'block' }}>
                  PHONE NUMBER
                </span>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{phoneNumber}</span>
              </div>
            )}

            <div className="dialog-button-row" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditProfileOpen(false)}
                disabled={savingProfile}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleSaveProfile}
                disabled={savingProfile}
                style={{ flex: 1 }}
              >
                {savingProfile ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Dialog */}
      <RestoreConfirmModal
        isOpen={restoreModalOpen}
        isRestoring={operation === 'restoring'}
        backupSummary={pendingRestoreSummary}
        onCancel={() => {
          setRestoreModalOpen(false)
          setPendingRestoreContent(null)
          setPendingRestoreSummary(null)
        }}
        onConfirm={handleConfirmRestore}
      />

      {/* Account Linking Modal for Guests */}
      {showLinkModal && (
        <AuthModal
          type="create"
          close={() => setShowLinkModal(false)}
          onSubmitCreate={handleLinkEmail}
        />
      )}

      {/* Collision Modal */}
      {collisionInfo && (
        <AuthModal
          type="collision"
          collisionMessage={collisionInfo}
          close={() => setCollisionInfo(null)}
          onSwitchToSignIn={() => {
            setCollisionInfo(null)
            handleSignOut()
          }}
        />
      )}

      {/* Bottom Navigation */}
      <BottomNav active="profile" setScreen={setScreen} />
    </div>
  )
}

export default ProfileScreen
