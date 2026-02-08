import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DIARY_INDEX_MODIFIED_AT,
  DIARY_INDEX_TYPE,
  DIARY_INDEX_YEAR,
  type DiaryRecord,
  STORE_CONFIG,
  STORE_DIARIES,
  STORE_METADATA,
  TRACE_DIARY_DB_NAME,
  TRACE_DIARY_DB_VERSION,
  get,
  getConfig,
  getDiary,
  getMetadata,
  listByIndex,
  listDiariesByIndex,
  openDb,
  put,
  saveConfig,
  saveDiary,
  saveMetadata,
} from '../indexeddb'

interface FakeIndexState {
  keyPath: string
}

interface FakeStoreState {
  keyPath?: string
  records: Map<IDBValidKey, Record<string, unknown>>
  indexes: Map<string, FakeIndexState>
}

interface FakeDbState {
  name: string
  version: number
  stores: Map<string, FakeStoreState>
}

interface CursorEntry {
  key: IDBValidKey
  primaryKey: IDBValidKey
  value: Record<string, unknown>
}

interface InternalRequest<T> extends IDBRequest<T> {
  _succeed: (result: T) => void
  _fail: (error: DOMException) => void
}

function createDomStringList(getValues: () => string[]): DOMStringList {
  return {
    get length() {
      return getValues().length
    },
    item(index: number): string | null {
      return getValues()[index] ?? null
    },
    contains(value: string): boolean {
      return getValues().includes(value)
    },
    [Symbol.iterator](): IterableIterator<string> {
      return getValues()[Symbol.iterator]()
    },
    toString(): string {
      return getValues().join(',')
    },
  } as unknown as DOMStringList
}

function createRequest<T>(transaction: IDBTransaction | null = null): InternalRequest<T> {
  const request = {
    result: undefined as T,
    error: null,
    source: null,
    transaction,
    readyState: 'pending',
    onsuccess: null,
    onerror: null,
  } as unknown as InternalRequest<T>

  request._succeed = (result: T) => {
    ;(request as { result: T }).result = result
    ;(request as { readyState: IDBRequestReadyState }).readyState = 'done'
    request.onsuccess?.(new Event('success'))
  }

  request._fail = (error: DOMException) => {
    ;(request as { error: DOMException }).error = error
    ;(request as { readyState: IDBRequestReadyState }).readyState = 'done'
    request.onerror?.(new Event('error'))
  }

  return request
}

function assertStoreExists(stores: Map<string, FakeStoreState>, storeName: string): FakeStoreState {
  const store = stores.get(storeName)
  if (!store) {
    throw new DOMException(`NotFoundError: ${storeName}`, 'NotFoundError')
  }
  return store
}

function assertValidKey(value: unknown, label: string): IDBValidKey {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    value instanceof Date ||
    Array.isArray(value)
  ) {
    return value as IDBValidKey
  }

  throw new DOMException(`${label} 必须是可比较键`, 'DataError')
}

function compareKeys(a: IDBValidKey, b: IDBValidKey): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  const aText = a instanceof Date ? String(a.getTime()) : String(a)
  const bText = b instanceof Date ? String(b.getTime()) : String(b)
  if (aText === bText) {
    return 0
  }
  return aText < bText ? -1 : 1
}

function isKeyRange(query: IDBValidKey | IDBKeyRange | undefined): query is IDBKeyRange {
  if (!query || typeof query !== 'object') {
    return false
  }

  return (
    'includes' in query &&
    typeof (query as { includes: unknown }).includes === 'function'
  )
}

function matchesQuery(key: IDBValidKey, query: IDBValidKey | IDBKeyRange | undefined): boolean {
  if (query === undefined) {
    return true
  }

  if (isKeyRange(query)) {
    return query.includes(key)
  }

  return key === query
}

function createCursorRequest(
  entries: CursorEntry[],
  direction: IDBCursorDirection,
  transaction: IDBTransaction,
): IDBRequest<IDBCursorWithValue | null> {
  const request = createRequest<IDBCursorWithValue | null>(transaction)
  let pointer = 0

  const emit = (): void => {
    if (pointer >= entries.length) {
      request._succeed(null)
      return
    }

    const current = entries[pointer]
    const cursor = {
      direction,
      key: current.key,
      primaryKey: current.primaryKey,
      source: null,
      request,
      value: current.value,
      advance(count: number): void {
        pointer += count
        setTimeout(emit, 0)
      },
      continue(): void {
        pointer += 1
        setTimeout(emit, 0)
      },
      continuePrimaryKey(): void {
        throw new DOMException('NotSupportedError', 'NotSupportedError')
      },
      delete(): IDBRequest<undefined> {
        throw new DOMException('NotSupportedError', 'NotSupportedError')
      },
      update(): IDBRequest<IDBValidKey> {
        throw new DOMException('NotSupportedError', 'NotSupportedError')
      },
    } as unknown as IDBCursorWithValue

    request._succeed(cursor)
  }

  setTimeout(emit, 0)
  return request
}

function createObjectStore(
  transaction: IDBTransaction,
  storeName: string,
  storeState: FakeStoreState,
): IDBObjectStore {
  const makeIndexEntries = (
    keyPath: string,
    query: IDBValidKey | IDBKeyRange | undefined,
    direction: IDBCursorDirection,
  ): CursorEntry[] => {
    const entries: CursorEntry[] = []

    for (const [primaryKey, value] of storeState.records.entries()) {
      const indexValue = assertValidKey(value[keyPath], `索引 ${keyPath}`)
      if (!matchesQuery(indexValue, query)) {
        continue
      }

      entries.push({
        key: indexValue,
        primaryKey,
        value,
      })
    }

    entries.sort((left, right) => {
      const keyCompare = compareKeys(left.key, right.key)
      if (keyCompare !== 0) {
        return keyCompare
      }
      return compareKeys(left.primaryKey, right.primaryKey)
    })

    if (direction === 'prev' || direction === 'prevunique') {
      entries.reverse()
    }

    return entries
  }

  return {
    name: storeName,
    indexNames: createDomStringList(() => Array.from(storeState.indexes.keys())),
    keyPath: storeState.keyPath ?? null,
    autoIncrement: false,
    transaction,
    add(): IDBRequest<IDBValidKey> {
      throw new DOMException('NotSupportedError', 'NotSupportedError')
    },
    clear(): IDBRequest<undefined> {
      storeState.records.clear()
      const request = createRequest<undefined>(transaction)
      setTimeout(() => request._succeed(undefined), 0)
      return request
    },
    count(): IDBRequest<number> {
      const request = createRequest<number>(transaction)
      setTimeout(() => request._succeed(storeState.records.size), 0)
      return request
    },
    createIndex(name: string, keyPath: string | string[]): IDBIndex {
      if (Array.isArray(keyPath)) {
        throw new DOMException('只支持字符串索引键', 'NotSupportedError')
      }
      storeState.indexes.set(name, { keyPath })
      return this.index(name)
    },
    delete(): IDBRequest<undefined> {
      throw new DOMException('NotSupportedError', 'NotSupportedError')
    },
    deleteIndex(name: string): void {
      storeState.indexes.delete(name)
    },
    get(key: IDBValidKey): IDBRequest<unknown> {
      const request = createRequest<unknown>(transaction)
      setTimeout(() => {
        request._succeed(storeState.records.get(key))
      }, 0)
      return request
    },
    getAll(): IDBRequest<unknown[]> {
      const request = createRequest<unknown[]>(transaction)
      setTimeout(() => {
        request._succeed(Array.from(storeState.records.values()))
      }, 0)
      return request
    },
    getAllKeys(): IDBRequest<IDBValidKey[]> {
      const request = createRequest<IDBValidKey[]>(transaction)
      setTimeout(() => {
        request._succeed(Array.from(storeState.records.keys()))
      }, 0)
      return request
    },
    getKey(): IDBRequest<IDBValidKey | undefined> {
      throw new DOMException('NotSupportedError', 'NotSupportedError')
    },
    index(name: string): IDBIndex {
      const indexState = storeState.indexes.get(name)
      if (!indexState) {
        throw new DOMException(`NotFoundError: ${name}`, 'NotFoundError')
      }

      return {
        name,
        objectStore: this,
        keyPath: indexState.keyPath,
        multiEntry: false,
        unique: false,
        get(): IDBRequest<unknown> {
          throw new DOMException('NotSupportedError', 'NotSupportedError')
        },
        getAll(): IDBRequest<unknown[]> {
          throw new DOMException('NotSupportedError', 'NotSupportedError')
        },
        getAllKeys(): IDBRequest<IDBValidKey[]> {
          throw new DOMException('NotSupportedError', 'NotSupportedError')
        },
        getKey(): IDBRequest<IDBValidKey | undefined> {
          throw new DOMException('NotSupportedError', 'NotSupportedError')
        },
        count(): IDBRequest<number> {
          throw new DOMException('NotSupportedError', 'NotSupportedError')
        },
        openCursor(
          query?: IDBValidKey | IDBKeyRange,
          direction: IDBCursorDirection = 'next',
        ): IDBRequest<IDBCursorWithValue | null> {
          return createCursorRequest(
            makeIndexEntries(indexState.keyPath, query, direction),
            direction,
            transaction,
          )
        },
        openKeyCursor(): IDBRequest<IDBCursor | null> {
          throw new DOMException('NotSupportedError', 'NotSupportedError')
        },
      } as IDBIndex
    },
    openCursor(
      query?: IDBValidKey | IDBKeyRange,
      direction: IDBCursorDirection = 'next',
    ): IDBRequest<IDBCursorWithValue | null> {
      const entries: CursorEntry[] = []
      for (const [primaryKey, value] of storeState.records.entries()) {
        if (!matchesQuery(primaryKey, query)) {
          continue
        }
        entries.push({
          key: primaryKey,
          primaryKey,
          value,
        })
      }

      entries.sort((left, right) => compareKeys(left.primaryKey, right.primaryKey))
      if (direction === 'prev' || direction === 'prevunique') {
        entries.reverse()
      }

      return createCursorRequest(entries, direction, transaction)
    },
    openKeyCursor(): IDBRequest<IDBCursor | null> {
      throw new DOMException('NotSupportedError', 'NotSupportedError')
    },
    put(value: Record<string, unknown>, key?: IDBValidKey): IDBRequest<IDBValidKey> {
      const request = createRequest<IDBValidKey>(transaction)

      setTimeout(() => {
        try {
          const primaryKey =
            key ??
            (typeof storeState.keyPath === 'string'
              ? assertValidKey(value[storeState.keyPath], '主键')
              : null)

          if (primaryKey === null) {
            throw new DOMException('缺少主键', 'DataError')
          }

          storeState.records.set(primaryKey, { ...value })
          request._succeed(primaryKey)
        } catch (error) {
          request._fail(
            error instanceof DOMException
              ? error
              : new DOMException('写入失败', 'UnknownError'),
          )
        }
      }, 0)

      return request
    },
  } as IDBObjectStore
}

function createTransaction(
  db: IDBDatabase,
  state: FakeDbState,
  storeNames: string[],
  mode: IDBTransactionMode,
): IDBTransaction {
  return {
    db,
    durability: 'default',
    error: null,
    mode,
    objectStoreNames: createDomStringList(() => [...storeNames]),
    onabort: null,
    oncomplete: null,
    onerror: null,
    abort(): void {
      this.onabort?.(new Event('abort'))
    },
    commit(): void {
      this.oncomplete?.(new Event('complete'))
    },
    objectStore(storeName: string): IDBObjectStore {
      return createObjectStore(this, storeName, assertStoreExists(state.stores, storeName))
    },
  } as IDBTransaction
}

function createDatabase(state: FakeDbState): IDBDatabase {
  const db = {
    get name(): string {
      return state.name
    },
    get version(): number {
      return state.version
    },
    get objectStoreNames(): DOMStringList {
      return createDomStringList(() => Array.from(state.stores.keys()))
    },
    onabort: null,
    onclose: null,
    onerror: null,
    onversionchange: null,
    close(): void {
      // no-op
    },
    createObjectStore(name: string, options?: IDBObjectStoreParameters): IDBObjectStore {
      if (state.stores.has(name)) {
        throw new DOMException(`ConstraintError: ${name}`, 'ConstraintError')
      }

      const nextStore: FakeStoreState = {
        keyPath: typeof options?.keyPath === 'string' ? options.keyPath : undefined,
        records: new Map(),
        indexes: new Map(),
      }
      state.stores.set(name, nextStore)

      const transaction = createTransaction(this, state, [name], 'versionchange')
      return createObjectStore(transaction, name, nextStore)
    },
    deleteObjectStore(name: string): void {
      state.stores.delete(name)
    },
    transaction(storeNames: string | string[], mode: IDBTransactionMode = 'readonly'): IDBTransaction {
      const normalized = Array.isArray(storeNames) ? storeNames : [storeNames]
      return createTransaction(this, state, normalized, mode)
    },
  } as IDBDatabase

  return db
}

function createOpenRequest(): IDBOpenDBRequest & InternalRequest<IDBDatabase> {
  const request = createRequest<IDBDatabase>(null) as IDBOpenDBRequest &
    InternalRequest<IDBDatabase>
  ;(request as { onblocked: ((event: Event) => unknown) | null }).onblocked = null
  ;(request as { onupgradeneeded: ((event: IDBVersionChangeEvent) => unknown) | null }).onupgradeneeded =
    null
  ;(request as { transaction: IDBTransaction | null }).transaction = null
  return request
}

function createFakeIndexedDbFactory(): IDBFactory {
  const databases = new Map<string, FakeDbState>()

  return {
    cmp(first: IDBValidKey, second: IDBValidKey): number {
      return compareKeys(first, second)
    },
    databases: undefined,
    deleteDatabase(name: string): IDBOpenDBRequest {
      const request = createOpenRequest()
      setTimeout(() => {
        databases.delete(name)
        request._succeed(createDatabase({ name, version: 1, stores: new Map() }))
      }, 0)
      return request
    },
    open(name: string, version?: number): IDBOpenDBRequest {
      const request = createOpenRequest()

      setTimeout(() => {
        const previous = databases.get(name)
        const requestedVersion = version ?? previous?.version ?? 1

        if (previous && requestedVersion < previous.version) {
          request._fail(new DOMException('VersionError', 'VersionError'))
          return
        }

        let state = previous
        let shouldUpgrade = false
        if (!state) {
          state = {
            name,
            version: requestedVersion,
            stores: new Map(),
          }
          databases.set(name, state)
          shouldUpgrade = true
        } else if (requestedVersion > state.version) {
          state.version = requestedVersion
          shouldUpgrade = true
        }

        const db = createDatabase(state)
        request._succeed(db)

        if (shouldUpgrade) {
          const upgradeStores = Array.from(state.stores.keys())
          const upgradeTransaction = createTransaction(db, state, upgradeStores, 'versionchange')
          ;(request as { transaction: IDBTransaction | null }).transaction = upgradeTransaction
          request.onupgradeneeded?.(new Event('upgradeneeded') as IDBVersionChangeEvent)
        }

        ;(request as { transaction: IDBTransaction | null }).transaction = null
        request.onsuccess?.(new Event('success'))
      }, 0)

      return request
    },
  } as unknown as IDBFactory
}

let originalIndexedDb: IDBFactory | undefined

beforeEach(() => {
  originalIndexedDb = globalThis.indexedDB
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    writable: true,
    value: createFakeIndexedDbFactory(),
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    writable: true,
    value: originalIndexedDb,
  })
})

describe('indexeddb service', () => {
  it('应初始化 TraceDiary v1 与三类对象仓库及日记索引', async () => {
    const db = await openDb()

    expect(db.name).toBe(TRACE_DIARY_DB_NAME)
    expect(db.version).toBe(TRACE_DIARY_DB_VERSION)
    expect(db.objectStoreNames.contains(STORE_DIARIES)).toBe(true)
    expect(db.objectStoreNames.contains(STORE_METADATA)).toBe(true)
    expect(db.objectStoreNames.contains(STORE_CONFIG)).toBe(true)

    const diariesStore = db.transaction(STORE_DIARIES, 'readonly').objectStore(STORE_DIARIES)
    expect(diariesStore.indexNames.contains(DIARY_INDEX_TYPE)).toBe(true)
    expect(diariesStore.indexNames.contains('date')).toBe(true)
    expect(diariesStore.indexNames.contains(DIARY_INDEX_YEAR)).toBe(true)
    expect(diariesStore.indexNames.contains('createdAt')).toBe(true)
    expect(diariesStore.indexNames.contains(DIARY_INDEX_MODIFIED_AT)).toBe(true)
  })

  it('put/get 与 saveDiary/getDiary 应可往返读取', async () => {
    const diary: DiaryRecord = {
      id: 'd-1',
      type: 'daily',
      date: '2026-02-08',
      year: 2026,
      createdAt: '2026-02-08T10:00:00.000Z',
      modifiedAt: '2026-02-08T10:00:00.000Z',
      content: '第一篇',
    }

    await put(STORE_DIARIES, diary)
    const stored = await get<typeof diary>(STORE_DIARIES, diary.id)
    expect(stored).toEqual(diary)

    await saveDiary({
      ...diary,
      id: 'd-2',
      content: '第二篇',
      modifiedAt: '2026-02-08T11:00:00.000Z',
    })

    const restored = await getDiary('d-2')
    expect(restored?.content).toBe('第二篇')
  })

  it('listByIndex 与 listDiariesByIndex 应支持索引过滤、顺序和 limit', async () => {
    const diaries = [
      {
        id: 'd-100',
        type: 'daily',
        date: '2026-02-07',
        year: 2026,
        createdAt: '2026-02-07T08:00:00.000Z',
        modifiedAt: '2026-02-07T08:30:00.000Z',
      },
      {
        id: 'd-101',
        type: 'yearly_summary',
        date: '2025-12-31',
        year: 2025,
        createdAt: '2025-12-31T09:00:00.000Z',
        modifiedAt: '2025-12-31T10:00:00.000Z',
      },
      {
        id: 'd-102',
        type: 'daily',
        date: '2026-02-08',
        year: 2026,
        createdAt: '2026-02-08T09:00:00.000Z',
        modifiedAt: '2026-02-08T12:00:00.000Z',
      },
    ] as const

    for (const diary of diaries) {
      await saveDiary({ ...diary })
    }

    const byType = await listByIndex<{ id: string }>(STORE_DIARIES, DIARY_INDEX_TYPE, 'daily')
    expect(byType.map((item) => item.id)).toEqual(['d-100', 'd-102'])

    const byYear = await listDiariesByIndex(DIARY_INDEX_YEAR, 2026)
    expect(byYear.map((item) => item.id)).toEqual(['d-100', 'd-102'])

    const latestOne = await listDiariesByIndex(
      DIARY_INDEX_MODIFIED_AT,
      undefined,
      'prev',
      1,
    )
    expect(latestOne).toHaveLength(1)
    expect(latestOne[0].id).toBe('d-102')
  })

  it('saveMetadata/getMetadata 与 saveConfig/getConfig 应可默认键和自定义键读取', async () => {
    await saveMetadata({ lastSyncAt: '2026-02-08T12:00:00.000Z' })
    expect(await getMetadata<{ lastSyncAt: string }>()).toEqual({
      lastSyncAt: '2026-02-08T12:00:00.000Z',
    })

    await saveMetadata({ cursor: 'cursor-1' }, 'sync')
    expect(await getMetadata<{ cursor: string }>('sync')).toEqual({
      cursor: 'cursor-1',
    })

    await saveConfig({ lang: 'zh-CN', theme: 'light' })
    expect(await getConfig<{ lang: string; theme: string }>()).toEqual({
      lang: 'zh-CN',
      theme: 'light',
    })

    await saveConfig({ retries: 3 }, 'network')
    expect(await getConfig<{ retries: number }>('network')).toEqual({
      retries: 3,
    })
  })
})
