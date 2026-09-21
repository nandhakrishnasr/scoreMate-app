import { useEffect, useRef } from 'react'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { App } from '@capacitor/app'

/**
 * Phase 8 — Back Navigation Hook
 *
 * Installs a SINGLE browser-history sentinel and (on native platforms) a single
 * Capacitor hardware-back listener. Calls onBack() whenever either fires.
 *
 * Browser history strategy:
 *   - On mount: history.replaceState(sentinel) — ONE slot, no new entry.
 *   - On every Back press: history.pushState(sentinel) is called FIRST so the
 *     NEXT press is also catchable, then onBack() is called.
 *   - Screen transitions NEVER call history.pushState/replaceState — there are
 *     no duplicate entries and no navigation loops.
 *
 * StrictMode safety:
 *   - Each effect invocation uses a local `cancelled` flag captured in the async
 *     closure. When StrictMode unmounts and remounts, the first invocation's
 *     Capacitor handle is removed via the `cancelled` flag even if the async
 *     registration resolves after the cleanup runs.
 *   - The popstate listener is stored in a closure; cleanup removes the exact
 *     function reference, preventing duplicate listeners after remount.
 */
export function useBackNavigation(onBack: () => void): void {
  // Keep latest onBack in a ref so the effect never re-runs when the callback
  // changes — the ref update is synchronous and always current by the time any
  // user interaction fires.
  const onBackRef = useRef(onBack)
  useEffect(() => {
    onBackRef.current = onBack
  })

  useEffect(() => {
    // Plant the single sentinel (replaceState — not a new history entry)
    history.replaceState({ scoremate: true }, '')

    function handlePopState() {
      // Re-plant sentinel BEFORE handling so the next Back press is still catchable
      history.pushState({ scoremate: true }, '')
      onBackRef.current()
    }

    window.addEventListener('popstate', handlePopState)

    // Capacitor hardware Back (Android only)
    let cancelled = false
    let capHandle: PluginListenerHandle | null = null

    void (async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const handle = await App.addListener('backButton', () => {
            onBackRef.current()
          })
          if (cancelled) {
            // StrictMode unmounted before async resolved — clean up immediately
            void handle.remove()
            return
          }
          capHandle = handle
        } catch {
          // Capacitor plugin not available on this platform — graceful no-op
        }
      }
    })()

    return () => {
      cancelled = true
      window.removeEventListener('popstate', handlePopState)
      void capHandle?.remove()
      capHandle = null
    }
  }, []) // Runs once. onBack changes are handled via onBackRef, not as a dep.
}
