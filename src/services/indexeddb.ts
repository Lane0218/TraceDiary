import type { DiaryEntry } from '../types/diary'

export const TRACE_DIARY_DB_NAME = 'TraceDiary'
export const TRACE_DIARY_DB_VERSION = 1

export const STORE_DIARIES = 'diaries'
export const STORE_METADATA = 'metadata'
export const STORE_CONFIG = 'config'
export const METADATA_RECORD_KEY = 'metadata'
export const CONFIG_RECORD_KEY = 'config'
export const SYNC_BASELINE_KEY_PREFIX = 'sync-baseline:'

export type TraceDiaryStoreName =
  | typeof STORE_DIARIES
  | typeof STORE_METADATA
  | typeof STORE_CONFIG

export const DIARY_INDEX_TYPE = 'type'
export const DIARY_INDEX_DATE = 'date'
export const DIARY_INDEX_YEAR = 'year'
export const DIARY_INDEX_CREATED_AT = 'createdAt'
export const DIARY_INDEX_MODIFIED_AT = 'modifiedAt'

export type DiaryIndexName =
  | typeof DIARY_INDEX_TYPE
  | typeof DIARY_INDEX_DATE
  | typeof DIARY_INDEX_YEAR
  | typeof DIARY_INDEX_CREATED_AT
  | typeof DIARY_INDEX_MODIFIED_AT

export interface DiaryRecord {
  id: string
  type: DiaryEntry['type']
  date: string
  year?: number
  filename?: string
  content?: string
  wordCount?: number
  createdAt: string
  modifiedAt: string
}

interface StoredValue<T = unknown> {
  key: string
  value: T
}

export interface SyncBaselineRecord {
  entryId: string
  fingerprint: string
  syncedAt: string
  remoteSha?: string
}

function assertIndexedDbAvailable(): IDBFactory {
  const factory = globalThis.indexedDB
  if (!factory) {
    throw new Error('当前环境不支持 IndexedDB')
  }
  return factory
}

function createDiaryIndexes(store: IDBObjectStore): void {
  if (!store.indexNames.contains(DIARY_INDEX_TYPE)) {
    store.createIndex(DIARY_INDEX_TYPE, DIARY_INDEX_TYPE, { unique: false })
  }
  if (!store.indexNames.contains(DIARY_INDEX_DATE)) {
    store.createIndex(DIARY_INDEX_DATE, DIARY_INDEX_DATE, { unique: false })
  }
  if (!store.indexNames.contains(DIARY_INDEX_YEAR)) {
    store.createIndex(DIARY_INDEX_YEAR, DIARY_INDEX_YEAR, { unique: false })
  }
  if (!store.indexNames.contains(DIARY_INDEX_CREATED_AT)) {
    store.createIndex(DIARY_INDEX_CREATED_AT, DIARY_INDEX_CREATED_AT, { unique: false })
  }
  if (!store.indexNames.contains(DIARY_INDEX_MODIFIED_AT)) {
    store.createIndex(DIARY_INDEX_MODIFIED_AT, DIARY_INDEX_MODIFIED_AT, { unique: false })
  }
}

function ensureStores(request: IDBOpenDBRequest): void {
  const db = request.result

  if (!db.objectStoreNames.contains(STORE_DIARIES)) {
    const diariesStore = db.createObjectStore(STORE_DIARIES, { keyPath: 'id' })
    createDiaryIndexes(diariesStore)
  } else if (request.transaction) {
    createDiaryIndexes(request.transaction.objectStore(STORE_DIARIES))
  }

  if (!db.objectStoreNames.contains(STORE_METADATA)) {
    db.createObjectStore(STORE_METADATA, { keyPath: 'key' })
  }

  if (!db.objectStoreNames.contains(STORE_CONFIG)) {
    db.createObjectStore(STORE_CONFIG, { keyPath: 'key' })
  }
}

export function openDb(): Promise<IDBDatabase> {
  const indexedDb = assertIndexedDbAvailable()

  return new Promise((resolve, reject) => {
    const request = indexedDb.open(TRACE_DIARY_DB_NAME, TRACE_DIARY_DB_VERSION)

    request.onupgradeneeded = () => {
      ensureStores(request)
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error ?? new Error('打开 IndexedDB 失败'))
    }
  })
}

export async function put<T extends object>(
  storeName: TraceDiaryStoreName,
  value: T,
  key?: IDBValidKey,
): Promise<IDBValidKey> {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB 事务失败'))
    }

    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB 事务已中止'))
    }

    const store = transaction.objectStore(storeName)
    const request = key === undefined ? store.put(value) : store.put(value, key)

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB 写入失败'))
    }
  })
}

export async function get<T>(
  storeName: TraceDiaryStoreName,
  key: IDBValidKey,
): Promise<T | null> {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).get(key)

    request.onsuccess = () => {
      resolve((request.result as T | undefined) ?? null)
    }

    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB 读取失败'))
    }
  })
}

export async function listByIndex<T>(
  storeName: TraceDiaryStoreName,
  indexName: string,
  query?: IDBValidKey | IDBKeyRange,
  direction: IDBCursorDirection = 'next',
  limit?: number,
): Promise<T[]> {
  if (limit !== undefined && limit <= 0) {
    return []
  }

  const db = await openDb()

  return new Promise((resolve, reject) => {
    const result: T[] = []
    const transaction = db.transaction(storeName, 'readonly')
    const index = transaction.objectStore(storeName).index(indexName)
    const request = index.openCursor(query, direction)

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB 索引查询失败'))
    }

    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB 事务已中止'))
    }

    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB 光标读取失败'))
    }

    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(result)
        return
      }

      result.push(cursor.value as T)
      if (limit !== undefined && result.length >= limit) {
        resolve(result)
        return
      }

      cursor.continue()
    }
  })
}

export async function saveDiary(diary: DiaryRecord): Promise<void> {
  await put(STORE_DIARIES, diary)
}

export async function getDiary(id: string): Promise<DiaryRecord | null> {
  return get<DiaryRecord>(STORE_DIARIES, id)
}

export async function listDiariesByIndex(
  indexName: DiaryIndexName,
  query?: IDBValidKey | IDBKeyRange,
  direction: IDBCursorDirection = 'next',
  limit?: number,
): Promise<DiaryRecord[]> {
  return listByIndex<DiaryRecord>(STORE_DIARIES, indexName, query, direction, limit)
}

export async function saveMetadata<T>(
  metadata: T,
  key = METADATA_RECORD_KEY,
): Promise<void> {
  await put<StoredValue<T>>(STORE_METADATA, { key, value: metadata })
}

export async function getMetadata<T>(key = METADATA_RECORD_KEY): Promise<T | null> {
  const stored = await get<StoredValue<T>>(STORE_METADATA, key)
  return stored?.value ?? null
}

function toSyncBaselineKey(entryId: string): string {
  const normalizedEntryId = entryId.trim()
  if (!normalizedEntryId) {
    throw new Error('entryId 不能为空')
  }
  return `${SYNC_BASELINE_KEY_PREFIX}${normalizedEntryId}`
}

export async function saveSyncBaseline(record: SyncBaselineRecord): Promise<void> {
  await saveMetadata<SyncBaselineRecord>(record, toSyncBaselineKey(record.entryId))
}

export async function getSyncBaseline(entryId: string): Promise<SyncBaselineRecord | null> {
  return getMetadata<SyncBaselineRecord>(toSyncBaselineKey(entryId))
}

export async function saveConfig<T>(config: T, key = CONFIG_RECORD_KEY): Promise<void> {
  await put<StoredValue<T>>(STORE_CONFIG, { key, value: config })
}

export async function getConfig<T>(key = CONFIG_RECORD_KEY): Promise<T | null> {
  const stored = await get<StoredValue<T>>(STORE_CONFIG, key)
  return stored?.value ?? null
}
