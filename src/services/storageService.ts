import type { CompletedMatch } from '../types/match'

export const ACTIVE_MATCH_KEY = 'gully-scorer-active-match'
export const COMPLETED_MATCHES_KEY = 'gully-scorer-completed-matches'
export const TEAM_IMAGES_KEY = 'gully-scorer-team-images'
export const PLAYER_IMAGES_KEY = 'gully-scorer-player-images'
export const THEME_KEY = 'gully-scorer-theme'
export const AUTH_KEY = 'gully-scorer-auth'

export function loadTeamImages(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TEAM_IMAGES_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

export function saveTeamImages(map: Record<string, string>) {
  localStorage.setItem(TEAM_IMAGES_KEY, JSON.stringify(map))
}

export function loadPlayerImages(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PLAYER_IMAGES_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

export function savePlayerImages(map: Record<string, string>) {
  localStorage.setItem(PLAYER_IMAGES_KEY, JSON.stringify(map))
}

export function exportBackupJson(completedMatches: CompletedMatch[]) {
  const payload = {
    active: localStorage.getItem(ACTIVE_MATCH_KEY),
    completed: completedMatches,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'scoremate-backup.json'
  link.click()
  URL.revokeObjectURL(link.href)
}

export function importBackupFile(
  file: File,
  onLoaded?: (completed: CompletedMatch[]) => void,
) {
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result))
      let payload: { active?: string | null; completed?: CompletedMatch[] } = {}
      if (Array.isArray(data)) payload = { completed: data }
      else payload = data as { active?: string | null; completed?: CompletedMatch[] }
      if (payload.active) localStorage.setItem(ACTIVE_MATCH_KEY, payload.active)
      if (payload.completed) {
        localStorage.setItem(COMPLETED_MATCHES_KEY, JSON.stringify(payload.completed))
        onLoaded?.(payload.completed)
      }
      window.location.reload()
    } catch {
      window.alert('This backup file is not valid.')
    }
  }
  reader.readAsText(file)
}
