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
      return {
        uid: null,
        firebaseUid: null,
        email: null,
        emailVerified: false,
        phoneNumber: null,
        displayName: 'Guest (Offline)',
        photoURL: null,
        isAnonymous: true,
        isOfflineGuest: true,
        providerIds: ['anonymous'],
      }
    }
    return null
  }

  return {
    uid: user.uid,
    firebaseUid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    phoneNumber: user.phoneNumber,
    displayName: user.displayName,
    photoURL: user.photoURL,
    isAnonymous: user.isAnonymous,
    isOfflineGuest: false,
    providerIds: user.providerData.map((p) => p.providerId),
  }
}
