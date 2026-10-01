import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

export interface FirebaseClientConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket?: string
  messagingSenderId?: string
  appId: string
  measurementId?: string
}

// Safe environment variable accessor compatible with Vite and Node.js test runners
const globalProcess =
  typeof globalThis !== 'undefined' && 'process' in globalThis
    ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    : undefined

const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env as unknown as Record<string, string | undefined>)
    : globalProcess?.env ?? {}

// Fallback configuration using standard placeholders when environment variables are not yet provided
const firebaseConfig: FirebaseClientConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyDemoScoreMateKeyPlaceholder',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'scoremate-app.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'scoremate-app',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'scoremate-app.appspot.com',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789012',
  appId: env.VITE_FIREBASE_APP_ID || '1:123456789012:web:demoScoreMateAppId',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
}

export function isFirebaseConfigured(): boolean {
  return (
    Boolean(env.VITE_FIREBASE_API_KEY) &&
    env.VITE_FIREBASE_API_KEY !== 'AIzaSyDemoScoreMateKeyPlaceholder'
  )
}

let app: FirebaseApp
if (!getApps().length) {
  app = initializeApp(firebaseConfig)
} else {
  app = getApp()
}

export const firebaseApp = app
export const firebaseAuth: Auth = getAuth(app)
