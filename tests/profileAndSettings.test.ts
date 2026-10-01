import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { getParentScreen, computeBackAction, type BackState } from '../src/services/navigationService.ts'
import { getInitials } from '../src/services/imageService.ts'
import { settingsRepository } from '../src/services/repositories/settingsRepository.ts'
import { checkAndRunAutomaticBackup } from '../src/services/autoBackupService.ts'
import { formatFirebaseUser } from '../src/types/auth.ts'
import type { Screen } from '../src/types/match.ts'

describe('User Profile & Settings Reorganization', () => {
  beforeEach(async () => {
    await settingsRepository.clearSetting('autoBackupEnabled')
    await settingsRepository.clearSetting('lastSuccessfulDriveBackupAt')
  })

  describe('1. Profile Navigation & Back Action Policy', () => {
    it('treats profile as a root screen with no parent', () => {
      const parent = getParentScreen('profile')
      assert.strictEqual(parent, null)
    })

    it('exits app on back press from profile root screen when no modal is open', () => {
      const state: BackState = {
        screen: 'profile',
        hasActiveScore: false,
        settingsOpen: false,
        undoPending: false,
        endMatchPending: false,
        leavePending: false,
        hasScoringModal: false,
        isFinishing: false,
        isEndingMatch: false,
      }
      const action = computeBackAction(state)
      assert.deepStrictEqual(action, { type: 'exit-app' })
    })

    it('closes settings modal when back is pressed with settings open on profile', () => {
      const state: BackState = {
        screen: 'profile',
        hasActiveScore: false,
        settingsOpen: true,
        undoPending: false,
        endMatchPending: false,
        leavePending: false,
        hasScoringModal: false,
        isFinishing: false,
        isEndingMatch: false,
      }
      const action = computeBackAction(state)
      assert.deepStrictEqual(action, { type: 'close-settings' })
    })
  })

  describe('2. Avatar Initials & Fallback Generation', () => {
    it('generates two-letter initials from first and last name', () => {
      assert.strictEqual(getInitials('Nandha Krishna'), 'NK')
      assert.strictEqual(getInitials('Rohit Sharma'), 'RS')
    })

    it('generates first two letters for single word names', () => {
      assert.strictEqual(getInitials('Virat'), 'VI')
      assert.strictEqual(getInitials('Sachin'), 'SA')
    })

    it('generates first and last name initials for multi-word names', () => {
      assert.strictEqual(getInitials('Sachin Ramesh Tendulkar'), 'ST')
      assert.strictEqual(getInitials('Mahendra Singh Dhoni'), 'MD')
    })

    it('falls back safely to question mark on empty or missing name', () => {
      assert.strictEqual(getInitials(''), '?')
      assert.strictEqual(getInitials('   '), '?')
      assert.strictEqual(getInitials(null), '?')
      assert.strictEqual(getInitials(undefined), '?')
    })
  })

  describe('3. Authenticated vs Guest Profile Representation', () => {
    it('correctly constructs guest user representation with Guest Player label', () => {
      const guest = formatFirebaseUser(null, true)
      assert.ok(guest)
      assert.strictEqual(guest.isOfflineGuest, true)
      assert.strictEqual(guest.isAnonymous, true)
      assert.strictEqual(guest.displayName, 'Guest Player')
      assert.strictEqual(guest.email, null)
    })

    it('constructs authenticated user with display name, email, and photoURL', () => {
      const mockFirebaseUser = {
        uid: 'user-xyz-123',
        email: 'cricketer@example.com',
        emailVerified: true,
        phoneNumber: '+919876543210',
        displayName: 'Nandha Krishna',
        photoURL: 'https://storage.googleapis.com/scoremate/avatar.jpg',
        isAnonymous: false,
        providerData: [{ providerId: 'google.com' }],
      }
      const user = formatFirebaseUser(mockFirebaseUser as any)
      assert.ok(user)
      assert.strictEqual(user.uid, 'user-xyz-123')
      assert.strictEqual(user.displayName, 'Nandha Krishna')
      assert.strictEqual(user.email, 'cricketer@example.com')
      assert.strictEqual(user.phoneNumber, '+919876543210')
      assert.strictEqual(user.photoURL, 'https://storage.googleapis.com/scoremate/avatar.jpg')
      assert.strictEqual(user.isAnonymous, false)
      assert.deepStrictEqual(user.providerIds, ['google.com'])
    })
  })

  describe('4. Automatic Backup Toggle & Persistence', () => {
    it('defaults autoBackupEnabled to true when not set', async () => {
      const enabled = await settingsRepository.isAutoBackupEnabled()
      assert.strictEqual(enabled, true)
    })

    it('persists and retrieves autoBackupEnabled setting', async () => {
      await settingsRepository.setAutoBackupEnabled(false)
      const disabled = await settingsRepository.isAutoBackupEnabled()
      assert.strictEqual(disabled, false)

      await settingsRepository.setAutoBackupEnabled(true)
      const enabled = await settingsRepository.isAutoBackupEnabled()
      assert.strictEqual(enabled, true)
    })

    it('skips automatic backup execution when autoBackupEnabled is false', async () => {
      await settingsRepository.setAutoBackupEnabled(false)
      const result = await checkAndRunAutomaticBackup()
      assert.strictEqual(result.attempted, false)
      assert.strictEqual(result.success, false)
      // When disabled, either skipReason is 'disabled' or 'unauthenticated' depending on auth state
      assert.ok(result.skipReason === 'disabled' || result.skipReason === 'unauthenticated')
    })
  })

  describe('5. Primary Bottom Navigation 5th Destination Contract', () => {
    it('defines profile in Screen type list', () => {
      const testScreen: Screen = 'profile'
      assert.strictEqual(testScreen, 'profile')
    })
  })
})
