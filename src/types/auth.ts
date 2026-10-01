import type { User } from 'firebase/auth'

export type AuthProviderType = 'password' | 'phone' | 'google.com' | 'apple.com' | 'anonymous'

export interface AuthUser {
  uid: string | null
  firebaseUid: string | null
  email: string | null
  emailVerified: boolean
  phoneNumber: string | null
  displayName: string | null
  photoURL: string | null
  isAnonymous: boolean
  isOfflineGuest: boolean
  providerIds: string[]
}

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'offline_guest'

export interface CredentialCollisionInfo {
  email: string | null
  providerId: string
  message: string
}

export function formatFirebaseUser(user: User | null, isOfflineGuest = false): AuthUser | null {
  if (!user) {
    if (isOfflineGuest) {
      let savedDisplayName = 'Guest Player'
      let savedPhotoURL: string | null = null
      if (typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem('scoremate-offline-guest-profile')
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed.displayName) savedDisplayName = parsed.displayName
            if (parsed.photoURL !== undefined) savedPhotoURL = parsed.photoURL
          }
        } catch {
          // ignore corrupted local storage
        }
      }
      return {
        uid: null,
        firebaseUid: null,
        email: null,
        emailVerified: false,
        phoneNumber: null,
        displayName: savedDisplayName,
        photoURL: savedPhotoURL,
        isAnonymous: true,
        isOfflineGuest: true,
        providerIds: ['anonymous'],
      }
    }
    return null
  }

  let photo = user.photoURL
  if (typeof localStorage !== 'undefined') {
    try {
      const localAvatar = localStorage.getItem(`scoremate_avatar_${user.uid}`)
      if (localAvatar) {
        photo = localAvatar
      }
    } catch {
      // ignore local storage read errors
    }
  }

  return {
    uid: user.uid,
    firebaseUid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    phoneNumber: user.phoneNumber,
    displayName: user.displayName,
    photoURL: photo,
    isAnonymous: user.isAnonymous,
    isOfflineGuest: false,
    providerIds: user.providerData.map((p) => p.providerId),
  }
}
