import { DB_NAME, DB_VERSION, STORES } from '../types/database.ts'

export class DatabaseError extends Error {
  readonly cause?: unknown
  readonly code?: string

  constructor(message: string, cause?: unknown, code?: string) {
    super(message)
    this.name = 'DatabaseError'
    this.cause = cause
    this.code = code
  }
}

let dbInstance: IDBDatabase | null = null
let customFactoryOverride: IDBFactory | null = null

export function setDatabaseFactory(factory: IDBFactory | null): void {
  customFactoryOverride = factory
  dbInstance = null
}

export function getIndexedDB(): IDBFactory {
  if (customFactoryOverride) return customFactoryOverride
  if (typeof indexedDB !== 'undefined') return indexedDB
  throw new DatabaseError(
    'IndexedDB is not available in the current environment.',
    null,
    'INDEXEDDB_UNAVAILABLE'
  )
}

export function isIndexedDBAvailable(): boolean {
  try {
    return Boolean(customFactoryOverride || typeof indexedDB !== 'undefined')
  } catch {
    return false
  }
}

export async function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance
  }

  const factory = getIndexedDB()

  return new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = factory.open(DB_NAME, DB_VERSION)
    } catch (err) {
      return reject(new DatabaseError('Failed to open database', err, 'OPEN_FAILED'))
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // 1. Matches store
      if (!db.objectStoreNames.contains(STORES.MATCHES)) {
        const matchesStore = db.createObjectStore(STORES.MATCHES, { keyPath: 'matchId' })
        matchesStore.createIndex('status', 'status', { unique: false })
        matchesStore.createIndex('updatedAt', 'updatedAt', { unique: false })
        matchesStore.createIndex('ownerUid', 'ownerUid', { unique: false })
      }

      // 2. Teams store
      if (!db.objectStoreNames.contains(STORES.TEAMS)) {
        const teamsStore = db.createObjectStore(STORES.TEAMS, { keyPath: 'id' })
        teamsStore.createIndex('name', 'name', { unique: false })
        teamsStore.createIndex('ownerUid', 'ownerUid', { unique: false })
      }

      // 3. Players store
      if (!db.objectStoreNames.contains(STORES.PLAYERS)) {
        const playersStore = db.createObjectStore(STORES.PLAYERS, { keyPath: 'id' })
        playersStore.createIndex('name', 'name', { unique: false })
        playersStore.createIndex('teamId', 'teamId', { unique: false })
        playersStore.createIndex('ownerUid', 'ownerUid', { unique: false })
      }

      // 4. Settings store (v2)
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => {
      dbInstance = request.result
      dbInstance.onversionchange = () => {
        dbInstance?.close()
        dbInstance = null
      }
      resolve(dbInstance)
    }

    request.onerror = () => {
      reject(new DatabaseError('Database open request failed', request.error, 'OPEN_ERROR'))
    }

    request.onblocked = () => {
      reject(new DatabaseError('Database open blocked by another connection', null, 'OPEN_BLOCKED'))
    }
  })
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

export async function withTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T> | IDBRequest<T>
): Promise<T> {
  const db = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = db.transaction(storeName, mode)
    } catch (err) {
      return reject(new DatabaseError(`Failed to create transaction for ${storeName}`, err, 'TRANSACTION_INIT_ERROR'))
    }

    const store = transaction.objectStore(storeName)
    let opResult: Promise<T> | IDBRequest<T>

    try {
      opResult = operation(store)
    } catch (err) {
      return reject(new DatabaseError(`Operation in ${storeName} threw an error`, err, 'OPERATION_THROW'))
    }

    if (opResult instanceof Promise) {
      opResult
        .then((res) => {
          transaction.oncomplete = () => resolve(res)
        })
        .catch((err) => {
          try {
            transaction.abort()
          } catch {
            // Ignore abort failure if transaction ended
          }
          reject(new DatabaseError(`Async operation in ${storeName} failed`, err, 'ASYNC_OP_FAILED'))
        })
    } else {
      opResult.onsuccess = () => {
        resolve(opResult.result)
      }
      opResult.onerror = () => {
        reject(new DatabaseError(`Request in ${storeName} failed`, opResult.error, 'REQUEST_ERROR'))
      }
    }

    transaction.onerror = () => {
      reject(new DatabaseError(`Transaction error on ${storeName}`, transaction.error, 'TRANSACTION_ERROR'))
    }
  })
}
