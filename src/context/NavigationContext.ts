import { createContext, useContext } from 'react'
import type { Screen } from '../types/match.ts'

export const NavigationContext = createContext<((screen: Screen) => void) | null>(null)

export function useNavigation(): ((screen: Screen) => void) | null {
  return useContext(NavigationContext)
}
