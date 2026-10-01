import { STORES, type PersistedTeamRecord } from '../../types/database.ts'
import { withTransaction, openDatabase, DatabaseError } from '../localDatabase.ts'

export const teamRepository = {
  async saveTeam(team: PersistedTeamRecord): Promise<void> {
    const record: PersistedTeamRecord = {
      ...team,
      updatedAt: team.updatedAt || new Date().toISOString(),
    }
    await withTransaction(STORES.TEAMS, 'readwrite', (store) => {
      return store.put(record)
    })
  },

  async getTeam(teamId: string): Promise<PersistedTeamRecord | null> {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.TEAMS, 'readonly')
      const store = transaction.objectStore(STORES.TEAMS)
      const request = store.get(teamId)

      request.onsuccess = () => {
        resolve((request.result as PersistedTeamRecord) || null)
      }
      request.onerror = () => {
        reject(new DatabaseError(`Failed to retrieve team ${teamId}`, request.error))
      }
    })
  },

  async getTeamByName(name: string): Promise<PersistedTeamRecord | null> {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.TEAMS, 'readonly')
      const store = transaction.objectStore(STORES.TEAMS)
      const index = store.index('name')
      const request = index.get(name)

      request.onsuccess = () => {
        resolve((request.result as PersistedTeamRecord) || null)
      }
      request.onerror = () => {
        reject(new DatabaseError(`Failed to get team by name ${name}`, request.error))
      }
    })
  },

  async listTeams(filter?: { ownerUid?: string | null }): Promise<PersistedTeamRecord[]> {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.TEAMS, 'readonly')
      const store = transaction.objectStore(STORES.TEAMS)
      const request = store.getAll()

      request.onsuccess = () => {
        let results = (request.result as PersistedTeamRecord[]) || []
        if (filter?.ownerUid !== undefined) {
          results = results.filter((t) => t.ownerUid === filter.ownerUid)
        }
        results.sort((a, b) => a.name.localeCompare(b.name))
        resolve(results)
      }
      request.onerror = () => {
        reject(new DatabaseError('Failed to list teams', request.error))
      }
    })
  },

  async deleteTeam(teamId: string): Promise<void> {
    await withTransaction(STORES.TEAMS, 'readwrite', (store) => {
      return store.delete(teamId)
    })
  },
}
