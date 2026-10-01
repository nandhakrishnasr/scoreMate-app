import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { firebaseAuth } from '../services/firebase'
import {
  authService,
  isOfflineGuestActive,
  mapAuthError,
  type PhoneOtpResult,
} from '../services/authService'
import type { AuthUser, AuthStatus, CredentialCollisionInfo } from '../types/auth'
import { formatFirebaseUser } from '../types/auth'

import { syncService } from '../services/syncService.ts'

export interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus
  loading: boolean
  isGuest: boolean
  emailVerified: boolean
  error: string | null
  setError: (msg: string | null) => void
  signInWithEmail: (email: string, pass: string) => Promise<AuthUser>
  signUpWithEmail: (email: string, pass: string) => Promise<AuthUser>
  signInWithGoogle: () => Promise<AuthUser>
  signInWithApple: () => Promise<AuthUser>
  sendPhoneOtp: (phone: string, recaptchaId?: string) => Promise<PhoneOtpResult>
  verifyPhoneOtp: (otpResult: PhoneOtpResult, code: string) => Promise<AuthUser>
  continueAsGuest: () => Promise<AuthUser>
  sendPasswordReset: (email: string) => Promise<void>
  signOut: () => Promise<void>
  linkGuestWithEmail: (email: string, pass: string) => Promise<AuthUser | CredentialCollisionInfo>
  linkGuestWithGoogle: () => Promise<AuthUser | CredentialCollisionInfo>
  linkGuestWithApple: () => Promise<AuthUser | CredentialCollisionInfo>
  updateUserProfile: (profile: { displayName?: string; photoURL?: string | null }) => Promise<AuthUser>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    // Safety fallback: ensure loading never hangs indefinitely on mobile cold starts
    timer = setTimeout(() => {
      setStatus((currentStatus) => {
        if (currentStatus === 'loading') {
          if (isOfflineGuestActive()) {
            setUser(formatFirebaseUser(null, true))
            return 'offline_guest'
          }
          return 'unauthenticated'
        }
        return currentStatus
      })
    }, 2500)

    // Persistent auth state observer across cold starts
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (firebaseUser: User | null) => {
        if (timer) clearTimeout(timer)
        if (firebaseUser) {
          setUser(formatFirebaseUser(firebaseUser))
          setStatus('authenticated')
          // Trigger background sync for authenticated user
          void syncService.syncAll()
        } else {
          syncService.invalidateSession()
          if (isOfflineGuestActive()) {
            setUser(formatFirebaseUser(null, true))
            setStatus('offline_guest')
          } else {
            setUser(null)
            setStatus('unauthenticated')
          }
        }
      },
      (err) => {
        console.warn('Firebase onAuthStateChanged error, falling back:', err)
        if (timer) clearTimeout(timer)
        if (isOfflineGuestActive()) {
          setUser(formatFirebaseUser(null, true))
          setStatus('offline_guest')
        } else {
          setUser(null)
          setStatus('unauthenticated')
        }
      }
    )

    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [])

  const signInWithEmail = useCallback(async (email: string, pass: string) => {
    setError(null)
    try {
      const u = await authService.signInWithEmail(email, pass)
      setUser(u)
      setStatus('authenticated')
      return u
    } catch (err) {
      const msg = mapAuthError(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const signUpWithEmail = useCallback(async (email: string, pass: string) => {
    setError(null)
    try {
      const u = await authService.signUpWithEmail(email, pass)
      setUser(u)
      setStatus('authenticated')
      return u
    } catch (err) {
      const msg = mapAuthError(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    setError(null)
    try {
      const u = await authService.signInWithGoogle()
      setUser(u)
      setStatus('authenticated')
      return u
    } catch (err) {
      const msg = mapAuthError(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const signInWithApple = useCallback(async () => {
    setError(null)
    try {
      const u = await authService.signInWithApple()
      setUser(u)
      setStatus('authenticated')
      return u
    } catch (err) {
      const msg = mapAuthError(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const sendPhoneOtp = useCallback(async (phone: string, recaptchaId?: string) => {
    setError(null)
    try {
      return await authService.sendPhoneOtp(phone, recaptchaId)
    } catch (err) {
      const msg = mapAuthError(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const verifyPhoneOtp = useCallback(async (otpResult: PhoneOtpResult, code: string) => {
    setError(null)
    try {
      const u = await authService.verifyPhoneOtp(otpResult, code)
      setUser(u)
      setStatus('authenticated')
      return u
    } catch (err) {
      const msg = mapAuthError(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const continueAsGuest = useCallback(async () => {
    setError(null)
    try {
      const u = await authService.signInAsGuest()
      setUser(u)
      setStatus(u.isOfflineGuest ? 'offline_guest' : 'authenticated')
      return u
    } catch (err) {
      const msg = mapAuthError(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const sendPasswordReset = useCallback(async (email: string) => {
    setError(null)
    try {
      await authService.sendPasswordReset(email)
    } catch (err) {
      const msg = mapAuthError(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const signOut = useCallback(async () => {
    setError(null)
    syncService.invalidateSession()
    try {
      await authService.signOut()
      setUser(null)
      setStatus('unauthenticated')
    } catch (err) {
      const msg = mapAuthError(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const linkGuestWithEmail = useCallback(async (email: string, pass: string) => {
    setError(null)
    try {
      const res = await authService.linkGuestWithEmail(email, pass)
      if ('isAnonymous' in res) {
        setUser(res)
        setStatus('authenticated')
      }
      return res
    } catch (err) {
      const msg = mapAuthError(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const linkGuestWithGoogle = useCallback(async () => {
    setError(null)
    try {
      const res = await authService.linkGuestWithGoogle()
      if ('isAnonymous' in res) {
        setUser(res)
        setStatus('authenticated')
      }
      return res
    } catch (err) {
      const msg = mapAuthError(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const linkGuestWithApple = useCallback(async () => {
    setError(null)
    try {
      const res = await authService.linkGuestWithApple()
      if ('isAnonymous' in res) {
        setUser(res)
        setStatus('authenticated')
      }
      return res
    } catch (err) {
      const msg = mapAuthError(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const updateUserProfile = useCallback(async (profile: { displayName?: string; photoURL?: string | null }) => {
    setError(null)
    try {
      const updated = await authService.updateUserProfile(profile)
      setUser(updated)
      return updated
    } catch (err) {
      const msg = mapAuthError(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const value: AuthContextValue = {
    user,
    status,
    loading: status === 'loading',
    isGuest: Boolean(user?.isAnonymous || user?.isOfflineGuest),
    emailVerified: user?.emailVerified ?? false,
    error,
    setError,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signInWithApple,
    sendPhoneOtp,
    verifyPhoneOtp,
    continueAsGuest,
    sendPasswordReset,
    signOut,
    linkGuestWithEmail,
    linkGuestWithGoogle,
    linkGuestWithApple,
    updateUserProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
