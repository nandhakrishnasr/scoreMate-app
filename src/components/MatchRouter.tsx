import type { ReactNode } from 'react'
import type { Screen } from '../types/match'

type MatchRouterProps = {
  screen: Screen
  routes: Partial<Record<Screen, ReactNode>>
  fallback: ReactNode
}

export default function MatchRouter({ screen, routes, fallback }: MatchRouterProps) {
  return routes[screen] ?? fallback
}
