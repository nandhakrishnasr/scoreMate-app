import { STORES, type PersistedSettingRecord } from '../../types/database.ts'
import { withTransaction } from '../localDatabase.ts'

export const SETTING_KEYS = {
  LAST_SUCCESSFUL_DRIVE_BACKUP_AT: 'lastSuccessfulDriveBackupAt',
} as const

export const settingsRepository = {
  /**
   * Retrieves a setting value by key from IndexedDB.
   */
  async getSetting<T>(key: string): Promise<T | null> {
    const record = await withTransaction<PersistedSettingRecord<T> | undefined>(
      STORES.SETTINGS,
      'readonly',
      (store) => store.get(key)
    )
    return record ? record.value : null
  },

  /**
   * Stores a setting value by key in IndexedDB with an updated timestamp.
   */
  async setSetting<T>(key: string, value: T): Promise<void> {
    const record: PersistedSettingRecord<T> = {
      key,
      value,
      updatedAt: new Date().toISOString(),
    }
    await withTransaction(STORES.SETTINGS, 'readwrite', (store) => store.put(record))
  },

  /**
   * Retrieves the ISO timestamp of the last successful Google Drive backup.
   */
  async getLastSuccessfulDriveBackupAt(): Promise<string | null> {
    return this.getSetting<string>(SETTING_KEYS.LAST_SUCCESSFUL_DRIVE_BACKUP_AT)
  },

  /**
   * Records the ISO timestamp of a successful Google Drive backup.
   * MUST only be called after uploadBackup() has successfully completed.
   */
  async setLastSuccessfulDriveBackupAt(timestamp: string): Promise<void> {
    return this.setSetting<string>(SETTING_KEYS.LAST_SUCCESSFUL_DRIVE_BACKUP_AT, timestamp)
  },

  /**
   * Deletes a setting record by key.
   */
  async clearSetting(key: string): Promise<void> {
    await withTransaction(STORES.SETTINGS, 'readwrite', (store) => store.delete(key))
  },
}
