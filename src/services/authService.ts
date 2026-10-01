import { Capacitor } from '@capacitor/core'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  signInAnonymously,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  linkWithCredential,
  EmailAuthProvider,
  PhoneAuthProvider,
  type AuthCredential,
  type UserCredential,
  type ConfirmationResult,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
} from 'firebase/auth'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { firebaseAuth, isFirebaseConfigured } from './firebase'
import type { AuthUser, CredentialCollisionInfo } from '../types/auth'
import { formatFirebaseUser } from '../types/auth'
import { normalizePhoneNumber } from '../utils/phoneUtils'

export const OFFLINE_GUEST_KEY = 'scoremate-offline-guest'

export interface PhoneOtpResult {
  verificationId?: string
  confirmationResult?: ConfirmationResult
}

// Convert raw Firebase error codes into human-readable user messages
export function mapAuthError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'An unexpected error occurred. Please try again.'
  const code = (err as { code?: string }).code ?? ''
  const message = (err as { message?: string }).message ?? ''

  switch (code) {
    case 'auth/admin-restricted-operation':
      return 'Anonymous sign-in is disabled in Firebase Console. Please enable Anonymous provider under Authentication > Sign-in method.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.'
    case 'auth/network-request-failed':
      return 'Network unavailable. Please check your internet connection.'
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.'
    case 'auth/invalid-phone-number':
      return 'Please enter a valid phone number with country code (e.g. +1 555 123 4567).'
    case 'auth/invalid-verification-code':
      return 'Invalid or expired OTP code. Please check and try again.'
    case 'auth/code-expired':
      return 'OTP has expired. Please request a new code.'
    case 'auth/quota-exceeded':
      return 'SMS quota exceeded for today. Please try again later.'
    case 'auth/credential-already-in-use':
      return 'This credential is already linked to another account.'
    case 'auth/popup-closed-by-user':
      return 'Sign-in window was closed before completing.'
    case 'auth/requires-recent-login':
      return 'Please re-authenticate and try again.'
    default:
      if (message.includes('16') || message.includes('Account reauth failed')) {
        return 'Google Sign-In failed [16]. Please ensure the Android SHA-1 fingerprint is registered in Firebase Console.'
      }
      if (message.includes('format of the phone number') || message.includes('E.164')) {
        return 'Please enter a valid phone number with country code (e.g. +91 98765 43210).'
      }
      if (message.includes('BILLING_NOT_ENABLED') || message.includes('billing')) {
        return 'Phone authentication requires enabling Phone Provider or adding test numbers in Firebase Console.'
      }
      if (message.includes('offline') || message.includes('network')) {
        return 'Network error. Please verify your connection.'
      }
      return message || 'Authentication failed. Please try again.'
  }
}

// Check if device is in offline guest mode
export function isOfflineGuestActive(): boolean {
  return localStorage.getItem(OFFLINE_GUEST_KEY) === 'true'
}

export function setOfflineGuestActive(active: boolean): void {
  if (active) {
    localStorage.setItem(OFFLINE_GUEST_KEY, 'true')
  } else {
    localStorage.removeItem(OFFLINE_GUEST_KEY)
  }
}

export const authService = {
  // 1. Email & Password Sign In
  async signInWithEmail(email: string, pass: string): Promise<AuthUser> {
    setOfflineGuestActive(false)
    const result = await signInWithEmailAndPassword(firebaseAuth, email.trim(), pass)
    return formatFirebaseUser(result.user)!
  },

  // 2. Email & Password Sign Up
  async signUpWithEmail(email: string, pass: string): Promise<AuthUser> {
    setOfflineGuestActive(false)
    const result = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), pass)
    return formatFirebaseUser(result.user)!
  },

  // 3. Google Sign-In with Native-to-JS Bridge
  async signInWithGoogle(): Promise<AuthUser> {
    setOfflineGuestActive(false)
    if (Capacitor.isNativePlatform()) {
      // Step A: Native Google Play / iOS sign-in (skipNativeAuth ensures native plugin returns tokens without creating a duplicate native session)
      const nativeResult = await FirebaseAuthentication.signInWithGoogle({
        skipNativeAuth: true,
        useCredentialManager: false,
      })
      const idToken = nativeResult.credential?.idToken
      if (!idToken) throw new Error('Failed to retrieve native Google credential token.')

      // Step B: Bridge credential to Firebase JS SDK session (canonical session)
      const credential = GoogleAuthProvider.credential(idToken, nativeResult.credential?.accessToken)
      const jsResult = await signInWithCredential(firebaseAuth, credential)
      return formatFirebaseUser(jsResult.user)!
    } else {
      // Web / Dev mode fallback
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(firebaseAuth, provider)
      return formatFirebaseUser(result.user)!
    }
  },

  // 4. Apple Sign-In with Native-to-JS Bridge
  async signInWithApple(): Promise<AuthUser> {
    setOfflineGuestActive(false)
    if (Capacitor.isNativePlatform()) {
      // Step A: Native iOS Apple Sign-In sheet (skipNativeAuth ensures tokens are returned for JS SDK bridging)
      const nativeResult = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true })
      const idToken = nativeResult.credential?.idToken
      if (!idToken) throw new Error('Failed to retrieve native Apple credential token.')

      // Step B: Bridge credential to Firebase JS SDK session
      const provider = new OAuthProvider('apple.com')
      const credential = provider.credential({
        idToken,
        rawNonce: nativeResult.credential?.nonce,
      })
      const jsResult = await signInWithCredential(firebaseAuth, credential)
      return formatFirebaseUser(jsResult.user)!
    } else {
      // Web / Dev mode fallback
      const provider = new OAuthProvider('apple.com')
      const result = await signInWithPopup(firebaseAuth, provider)
      return formatFirebaseUser(result.user)!
    }
  },

  // 5. Send Phone OTP
  async sendPhoneOtp(
    phoneNumber: string,
    recaptchaElementId?: string
  ): Promise<PhoneOtpResult> {
    const validation = normalizePhoneNumber(phoneNumber)
    if (!validation.valid) {
      throw new Error(validation.error || 'Please enter a valid phone number.')
    }
    const cleanPhone = validation.normalized
    if (Capacitor.isNativePlatform()) {
      // Native phone auth uses Play Services SMS Retriever / APNs via phoneCodeSent event
      return new Promise((resolve, reject) => {
        let codeSentListener: { remove: () => void } | undefined
        let failedListener: { remove: () => void } | undefined

        const cleanup = () => {
          codeSentListener?.remove?.()
          failedListener?.remove?.()
        }

        FirebaseAuthentication.addListener('phoneCodeSent', (event) => {
          cleanup()
          resolve({ verificationId: event.verificationId })
        }).then((handle) => {
          codeSentListener = handle
        }).catch((err) => {
          cleanup()
          reject(err)
        })

        FirebaseAuthentication.addListener('phoneVerificationFailed', (event) => {
          cleanup()
          reject(new Error(event.message || 'Phone verification failed.'))
        }).then((handle) => {
          failedListener = handle
        }).catch((err) => {
          cleanup()
          reject(err)
        })

        FirebaseAuthentication.signInWithPhoneNumber({
          phoneNumber: cleanPhone,
        }).catch((err) => {
          cleanup()
          reject(err)
        })
      })
    } else {
      // Web / Dev mode fallback with invisible or visible reCAPTCHA
      if (!recaptchaElementId) {
        throw new Error('reCAPTCHA container required for web phone authentication.')
      }
      const appVerifier = new RecaptchaVerifier(firebaseAuth, recaptchaElementId, {
        size: 'invisible',
      })
      const confirmationResult = await signInWithPhoneNumber(
        firebaseAuth,
        cleanPhone,
        appVerifier
      )
      return { confirmationResult }
    }
  },

  // 6. Verify Phone OTP
  async verifyPhoneOtp(
    otpResult: PhoneOtpResult,
    verificationCode: string
  ): Promise<AuthUser> {
    setOfflineGuestActive(false)
    const cleanCode = verificationCode.trim()
    if (Capacitor.isNativePlatform()) {
      if (!otpResult.verificationId) throw new Error('Missing verificationId.')
      // Confirm on native side
      await FirebaseAuthentication.confirmVerificationCode({
        verificationId: otpResult.verificationId,
        verificationCode: cleanCode,
      })
      // Bridge credential to Firebase JS SDK session (canonical session)
      const credential = PhoneAuthProvider.credential(otpResult.verificationId, cleanCode)
      const jsResult = await signInWithCredential(firebaseAuth, credential)
      return formatFirebaseUser(jsResult.user)!
    } else {
      if (!otpResult.confirmationResult) throw new Error('Missing confirmationResult.')
      const result: UserCredential = await otpResult.confirmationResult.confirm(cleanCode)
      return formatFirebaseUser(result.user)!
    }
  },

  // 7. Anonymous / Guest Sign-In
  async signInAsGuest(): Promise<AuthUser> {
    // If Firebase is not configured or network request fails, enter offline guest mode gracefully
    try {
      if (!isFirebaseConfigured()) {
        setOfflineGuestActive(true)
        return formatFirebaseUser(null, true)!
      }
      setOfflineGuestActive(false)
      const result = await signInAnonymously(firebaseAuth)
      return formatFirebaseUser(result.user)!
    } catch (err) {
      // If offline or anonymous auth is restricted/disabled, activate local offline guest
      const code = (err as { code?: string }).code
      if (
        code === 'auth/network-request-failed' ||
        code === 'auth/admin-restricted-operation' ||
        !navigator.onLine
      ) {
        setOfflineGuestActive(true)
        return formatFirebaseUser(null, true)!
      }
      throw err
    }
  },

  // 8. Password Reset Email
  async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(firebaseAuth, email.trim())
  },

  // 9. Sign Out
  async signOut(): Promise<void> {
    setOfflineGuestActive(false)
    if (Capacitor.isNativePlatform()) {
      try {
        await FirebaseAuthentication.signOut()
      } catch {
        // Continue even if native signOut encounters local state warning
      }
    }
    await firebaseSignOut(firebaseAuth)
  },

  // 10. Account Linking: Upgrade Guest to Permanent Email Account
  async linkGuestWithEmail(email: string, pass: string): Promise<AuthUser | CredentialCollisionInfo> {
    const currentUser = firebaseAuth.currentUser
    if (!currentUser) throw new Error('No active user session to link.')

    const credential = EmailAuthProvider.credential(email.trim(), pass)
    try {
      const result = await linkWithCredential(currentUser, credential)
      setOfflineGuestActive(false)
      return formatFirebaseUser(result.user)!
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
        return {
          email: email.trim(),
          providerId: 'password',
          message: 'An account with this email already exists. Sign in to merge or retain existing data.',
        }
      }
      throw err
    }
  },

  // 11. Account Linking: Upgrade Guest to Google Account
  async linkGuestWithGoogle(): Promise<AuthUser | CredentialCollisionInfo> {
    const currentUser = firebaseAuth.currentUser
    if (!currentUser) throw new Error('No active user session to link.')

    let credential: AuthCredential
    if (Capacitor.isNativePlatform()) {
      const nativeResult = await FirebaseAuthentication.signInWithGoogle({
        skipNativeAuth: true,
        useCredentialManager: false,
      })
      const idToken = nativeResult.credential?.idToken
      if (!idToken) throw new Error('Failed to retrieve native Google credential.')
      credential = GoogleAuthProvider.credential(idToken, nativeResult.credential?.accessToken)
    } else {
      const provider = new GoogleAuthProvider()
      const popupResult = await signInWithPopup(firebaseAuth, provider)
      credential = GoogleAuthProvider.credentialFromResult(popupResult)!
    }

    try {
      const result = await linkWithCredential(currentUser, credential)
      setOfflineGuestActive(false)
      return formatFirebaseUser(result.user)!
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/credential-already-in-use') {
        return {
          email: null,
          providerId: 'google.com',
          message: 'This Google account is already registered. Sign in to that account directly.',
        }
      }
      throw err
    }
  },

  // 12. Account Linking: Upgrade Guest to Apple Account
  async linkGuestWithApple(): Promise<AuthUser | CredentialCollisionInfo> {
    const currentUser = firebaseAuth.currentUser
    if (!currentUser) throw new Error('No active user session to link.')

    let credential: AuthCredential
    if (Capacitor.isNativePlatform()) {
      const nativeResult = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true })
      const idToken = nativeResult.credential?.idToken
      if (!idToken) throw new Error('Failed to retrieve native Apple credential.')
      const provider = new OAuthProvider('apple.com')
      credential = provider.credential({
        idToken,
        rawNonce: nativeResult.credential?.nonce,
      })
    } else {
      const provider = new OAuthProvider('apple.com')
      const popupResult = await signInWithPopup(firebaseAuth, provider)
      credential = OAuthProvider.credentialFromResult(popupResult)!
    }

    try {
      const result = await linkWithCredential(currentUser, credential)
      setOfflineGuestActive(false)
      return formatFirebaseUser(result.user)!
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/credential-already-in-use') {
        return {
          email: null,
          providerId: 'apple.com',
          message: 'This Apple ID is already registered. Sign in to that account directly.',
        }
      }
      throw err
    }
  },

  // 13. Update User Profile (Display Name & Photo URL)
  async updateUserProfile(profile: { displayName?: string; photoURL?: string | null }): Promise<AuthUser> {
    const currentUser = firebaseAuth.currentUser
    if (currentUser) {
      // Save local avatar cache immediately
      if (typeof localStorage !== 'undefined') {
        try {
          if (profile.photoURL) {
            localStorage.setItem(`scoremate_avatar_${currentUser.uid}`, profile.photoURL)
          } else if (profile.photoURL === null) {
            localStorage.removeItem(`scoremate_avatar_${currentUser.uid}`)
          }
        } catch {
          // ignore local storage errors
        }
      }

      const updateData: { displayName?: string; photoURL?: string | null } = {}
      if (profile.displayName !== undefined) {
        updateData.displayName = profile.displayName
      }
      // Firebase Auth photoURL requires a valid HTTP(S) URL of <= 2048 chars.
      // Base64 data URLs exceed 2048 chars and will cause Firebase Auth to fail.
      const isHttpUrl =
        Boolean(profile.photoURL) &&
        (profile.photoURL!.startsWith('http://') || profile.photoURL!.startsWith('https://')) &&
        profile.photoURL!.length <= 2048

      if (isHttpUrl) {
        updateData.photoURL = profile.photoURL
      } else if (profile.photoURL === null) {
        updateData.photoURL = null
      }

      try {
        const { updateProfile } = await import('firebase/auth')
        await updateProfile(currentUser, updateData)
      } catch (authErr) {
        console.warn('Firebase Auth updateProfile non-fatal warning:', authErr)
      }

      const formatted = formatFirebaseUser(currentUser)!
      if (profile.displayName !== undefined) formatted.displayName = profile.displayName
      if (profile.photoURL !== undefined) formatted.photoURL = profile.photoURL
      return formatted
    }

    if (isOfflineGuestActive()) {
      let savedDisplayName = profile.displayName ?? 'Guest Player'
      let savedPhotoURL = profile.photoURL ?? null
      try {
        const raw = localStorage.getItem('scoremate-offline-guest-profile')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (profile.displayName === undefined && parsed.displayName) savedDisplayName = parsed.displayName
          if (profile.photoURL === undefined && parsed.photoURL !== undefined) savedPhotoURL = parsed.photoURL
        }
      } catch {}
      localStorage.setItem('scoremate-offline-guest-profile', JSON.stringify({
        displayName: savedDisplayName,
        photoURL: savedPhotoURL,
      }))
      return formatFirebaseUser(null, true)!
    }

    throw new Error('No active user session to update profile.')
  },
}
