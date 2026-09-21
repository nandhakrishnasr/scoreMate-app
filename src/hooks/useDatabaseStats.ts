import { useEffect, useState } from 'react'
import {
  type TeamStat,
  loadTeamStatsFromDatabase,
  loadPlayerStatsFromDatabase,
} from '../services/statsService'
import type { PlayerStat } from '../types/match'

export function useTeamStats(): TeamStat[] {
  const [teamStats, setTeamStats] = useState<TeamStat[]>([])
  useEffect(() => {
    void loadTeamStatsFromDatabase().then(setTeamStats)
  }, [])
  return teamStats
}

export function usePlayerStats(): PlayerStat[] {
  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([])
  useEffect(() => {
    void loadPlayerStatsFromDatabase().then(setPlayerStats)
  }, [])
  return playerStats
}

export function useDatabaseStats() {
  const teamStats = useTeamStats()
  const playerStats = usePlayerStats()
  return { teamStats, playerStats }
}
