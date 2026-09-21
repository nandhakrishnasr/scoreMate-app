import { createContext, useContext } from 'react'

export const SettingsContext = createContext<(() => void) | null>(null)

export function useSettings(): (() => void) | null {
  return useContext(SettingsContext)
}
