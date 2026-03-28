import { describe, expect, it, vi } from 'vitest'

import type {
  CreateUploadMetadataDependencies,
  MetadataCacheRecord,
  MetadataStoreApi,
  PullAndCacheMetadataDependencies,
} from '../sync'
import {
  createDiaryUploadExecutor,
  createUploadMetadataExecutor,
  pullAndCacheMetadata,
  pullDiaryFromGitee,
  pullRemoteDiariesToIndexedDb,
  readRemoteMetadataFromGitee,
  uploadMetadataToGitee,
} from '../sync'
import { encryptWithAesGcm } from '../crypto'
import { decodeBase64Utf8, encodeBase64Utf8 } from '../gitee'

interface TestMetadata {
  version: string
  entries: Array<{ date: string }>
}

async function createDataEncryptionKey(seed = 'sync-test-data-key'): Promise<CryptoKey> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed))
  return globalThis.crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

function createMockMetadataStore(
  initialValue: MetadataCacheRecord<TestMetadata> | null,
): MetadataStoreApi<TestMetadata> & {
  getMetadata: ReturnType<typeof vi.fn>
  putMetadata: ReturnType<typeof vi.fn>
} {
  let current = initialValue

  const getMetadata = vi.fn(async () => current)
  const putMetadata = vi.fn(async (record: MetadataCacheRecord<TestMetadata>) => {
    current = record
  })

  return {
    getMetadata,
    putMetadata,
  }
}

describe('pullAndCacheMetadata', () => {
  it('首次加载本地无缓存时应拉取远端、解密并写入缓存', async () => {
    const metadataFromRemote: TestMetadata = {
      version: '1.1',
      entries: [{ date: '2026-02-08' }],
    }
    const metadataStore = createMockMetadataStore(null)
    const readRemoteMetadata = vi.fn(async () => ({
      missing: false as const,
      encryptedContent: 'encrypted-metadata-content',
      sha: 'sha-remote-1',
    }))
    const decryptMetadata = vi.fn(async () => JSON.stringify(metadataFromRemote))

    const dependencies: PullAndCacheMetadataDependencies<TestMetadata> = {
      metadataStore,
      readRemoteMetadata,
      decryptMetadata,
    }

    const result = await pullAndCacheMetadata(dependencies)

    expect(result).toEqual({
      metadata: metadataFromRemote,
      source: 'remote',
      remoteSha: 'sha-remote-1',
    })
    expect(readRemoteMetadata).toHaveBeenCalledTimes(1)
    expect(decryptMetadata).toHaveBeenCalledWith('encrypted-metadata-content')
    expect(metadataStore.putMetadata).toHaveBeenCalledTimes(1)
    expect(metadataStore.putMetadata.mock.calls[0]?.[0]).toMatchObject({
      key: 'metadata',
      metadata: metadataFromRemote,
      remoteSha: 'sha-remote-1',
    })
  })

  it('命中本地缓存且非强制刷新时应直接返回缓存', async () => {
    const cachedMetadata: TestMetadata = {
      version: '1.0',
      entries: [{ date: '2026-02-07' }],
    }
    const metadataStore = createMockMetadataStore({
      key: 'metadata',
      metadata: cachedMetadata,
      cachedAt: '2026-02-08T00:00:00.000Z',
      remoteSha: 'sha-local',
    })
    const readRemoteMetadata = vi.fn()
    const decryptMetadata = vi.fn()

    const result = await pullAndCacheMetadata({
      metadataStore,
      readRemoteMetadata,
      decryptMetadata,
    })

    expect(result).toEqual({
      metadata: cachedMetadata,
      source: 'cache',
      remoteSha: 'sha-local',
    })
    expect(readRemoteMetadata).not.toHaveBeenCalled()
    expect(decryptMetadata).not.toHaveBeenCalled()
    expect(metadataStore.putMetadata).not.toHaveBeenCalled()
  })

  it('本地有缓存但 forceRefresh=true 时应强制拉取远端并覆盖缓存', async () => {
    const metadataStore = createMockMetadataStore({
      key: 'metadata',
      metadata: {
        version: '1.0',
        entries: [{ date: '2026-02-06' }],
      },
      cachedAt: '2026-02-08T00:00:00.000Z',
      remoteSha: 'sha-old',
    })
    const remoteMetadata: TestMetadata = {
      version: '1.2',
      entries: [{ date: '2026-02-08' }],
    }
    const readRemoteMetadata = vi.fn(async () => ({
      missing: false as const,
      encryptedContent: 'encrypted-updated',
      sha: 'sha-new',
    }))
    const decryptMetadata = vi.fn(async () => JSON.stringify(remoteMetadata))

    const result = await pullAndCacheMetadata(
      {
        metadataStore,
        readRemoteMetadata,
        decryptMetadata,
      },
      { forceRefresh: true },
    )

    expect(result).toEqual({
      metadata: remoteMetadata,
      source: 'remote',
      remoteSha: 'sha-new',
    })
    expect(readRemoteMetadata).toHaveBeenCalledTimes(1)
    expect(decryptMetadata).toHaveBeenCalledTimes(1)
    expect(metadataStore.putMetadata).toHaveBeenCalledTimes(1)
    expect(metadataStore.putMetadata.mock.calls[0]?.[0]).toMatchObject({
      key: 'metadata',
      metadata: remoteMetadata,
      remoteSha: 'sha-new',
    })
  })

  it('远端 metadata.json.enc 缺失且本地无缓存时应返回 empty', async () => {
    const metadataStore = createMockMetadataStore(null)
    const readRemoteMetadata = vi.fn(async () => ({ missing: true as const }))
    const decryptMetadata = vi.fn()

    const result = await pullAndCacheMetadata({
      metadataStore,
      readRemoteMetadata,
      decryptMetadata,
    })

    expect(result).toEqual({
      metadata: null,
      source: 'empty',
    })
    expect(readRemoteMetadata).toHaveBeenCalledTimes(1)
    expect(decryptMetadata).not.toHaveBeenCalled()
    expect(metadataStore.putMetadata).not.toHaveBeenCalled()
  })
})

describe('pullRemoteDiariesToIndexedDb', () => {
  it('远端 metadata 缺失时应返回空结果且不报错', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('pull-empty')

    const result = await pullRemoteDiariesToIndexedDb(
      {
        token: 'test-token',
        owner: 'owner',
        repo: 'repo',
        branch: 'master',
        dataEncryptionKey,
      },
      {
        readRemoteMetadata: async () => ({ missing: true }),
      },
    )

    expect(result).toEqual({
      total: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      conflicted: 0,
      failed: 0,
      downloaded: 0,
      conflicts: [],
      failedItems: [],
      metadataMissing: true,
    })
  })

  it('metadata 无法解密时应抛出明确错误信息', async () => {
    const localKey = await createDataEncryptionKey('pull-metadata-local-key')
    const remoteKey = await createDataEncryptionKey('pull-metadata-remote-key')
    const encryptedMetadata = await encryptWithAesGcm(
      JSON.stringify({
        version: '1',
        lastSync: '2100-01-04T00:00:00.000Z',
        entries: [],
      }),
      remoteKey,
    )

    await expect(() =>
      pullRemoteDiariesToIndexedDb(
        {
          token: 'test-token',
          owner: 'owner',
          repo: 'repo',
          branch: 'master',
          dataEncryptionKey: localKey,
        },
        {
          readRemoteMetadata: async () => ({
            missing: false,
            encryptedContent: encryptedMetadata,
            sha: 'sha-metadata',
          }),
        },
      ),
    ).rejects.toThrow('云端内容解密失败，请确认主密码是否与该仓库数据一致')
  })

  it('应按 modifiedAt 决策插入/覆盖/跳过本地记录', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('pull-upsert')
    const remoteMetadata = {
      version: '1',
      lastSync: '2100-01-04T00:00:00.000Z',
      entries: [
        {
          type: 'daily' as const,
          date: '2100-01-01',
          filename: '2100-01-01.md.enc',
          wordCount: 3,
          createdAt: '2100-01-01T00:00:00.000Z',
          modifiedAt: '2100-01-01T01:00:00.000Z',
        },
        {
          type: 'daily' as const,
          date: '2100-01-02',
          filename: '2100-01-02.md.enc',
          wordCount: 3,
          createdAt: '2100-01-02T00:00:00.000Z',
          modifiedAt: '2100-01-02T03:00:00.000Z',
        },
        {
          type: 'daily' as const,
          date: '2100-01-03',
          filename: '2100-01-03.md.enc',
          wordCount: 3,
          createdAt: '2100-01-03T00:00:00.000Z',
          modifiedAt: '2100-01-03T01:00:00.000Z',
        },
      ],
    }
    const encryptedMetadata = await encryptWithAesGcm(
      JSON.stringify(remoteMetadata),
      dataEncryptionKey,
    )
    const encryptedDiaryByPath = {
      '2100-01-01.md.enc': await encryptWithAesGcm('remote-new-1', dataEncryptionKey),
      '2100-01-02.md.enc': await encryptWithAesGcm('remote-new-2', dataEncryptionKey),
      '2100-01-03.md.enc': await encryptWithAesGcm('remote-new-3', dataEncryptionKey),
    } as const

    const localStore = new Map<string, {
      id: string
      type: 'daily'
      date: string
      content: string
      createdAt: string
      modifiedAt: string
      wordCount: number
      filename: string
    }>([
      [
        'daily:2100-01-02',
        {
          id: 'daily:2100-01-02',
          type: 'daily',
          date: '2100-01-02',
          content: 'local-old-2',
          createdAt: '2100-01-02T00:00:00.000Z',
          modifiedAt: '2100-01-02T00:30:00.000Z',
          wordCount: 2,
          filename: '2100-01-02.md.enc',
        },
      ],
      [
        'daily:2100-01-03',
        {
          id: 'daily:2100-01-03',
          type: 'daily',
          date: '2100-01-03',
          content: 'local-newer-3',
          createdAt: '2100-01-03T00:00:00.000Z',
          modifiedAt: '2100-01-03T05:00:00.000Z',
          wordCount: 2,
          filename: '2100-01-03.md.enc',
        },
      ],
    ])
    const saveLocalDiary = vi.fn(async (record: {
      id: string
      type: 'daily' | 'yearly_summary'
      date: string
      content?: string
      createdAt: string
      modifiedAt: string
      wordCount?: number
      filename?: string
      year?: number
    }) => {
      if (record.type === 'daily') {
        localStore.set(record.id, {
          id: record.id,
          type: 'daily',
          date: record.date,
          content: record.content ?? '',
          createdAt: record.createdAt,
          modifiedAt: record.modifiedAt,
          wordCount: record.wordCount ?? 0,
          filename: record.filename ?? `${record.date}.md.enc`,
        })
      }
    })

    const readRemoteDiaryFile = vi.fn(async (path: string) => ({
      exists: true,
      content: encryptedDiaryByPath[path as keyof typeof encryptedDiaryByPath],
    }))

    const result = await pullRemoteDiariesToIndexedDb(
      {
        token: 'test-token',
        owner: 'owner',
        repo: 'repo',
        branch: 'master',
        dataEncryptionKey,
      },
      {
        readRemoteMetadata: async () => ({
          missing: false,
          encryptedContent: encryptedMetadata,
          sha: 'sha-metadata',
        }),
        readRemoteDiaryFile,
        loadLocalDiary: async (entryId) => localStore.get(entryId) ?? null,
        saveLocalDiary,
      },
    )

    expect(result).toEqual({
      total: 3,
      inserted: 1,
      updated: 1,
      skipped: 1,
      conflicted: 0,
      failed: 0,
      downloaded: 2,
      conflicts: [],
      failedItems: [],
      metadataMissing: false,
    })
    expect(readRemoteDiaryFile).toHaveBeenCalledTimes(2)
    expect(saveLocalDiary).toHaveBeenCalledTimes(2)
    expect(localStore.get('daily:2100-01-01')?.content).toBe('remote-new-1')
    expect(localStore.get('daily:2100-01-02')?.content).toBe('remote-new-2')
    expect(localStore.get('daily:2100-01-03')?.content).toBe('local-newer-3')
    expect(localStore.get('daily:2100-01-01')?.wordCount).toBe(12)
    expect(localStore.get('daily:2100-01-02')?.wordCount).toBe(12)
  })

  it('本地存在未同步改动时应标记冲突并跳过覆盖', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('pull-conflicted')
    const remoteMetadata = {
      version: '1',
      lastSync: '2100-02-02T00:00:00.000Z',
      entries: [
        {
          type: 'daily' as const,
          date: '2100-02-01',
          filename: '2100-02-01.md.enc',
          wordCount: 3,
          createdAt: '2100-02-01T00:00:00.000Z',
          modifiedAt: '2100-02-01T02:00:00.000Z',
        },
      ],
    }
    const encryptedMetadata = await encryptWithAesGcm(
      JSON.stringify(remoteMetadata),
      dataEncryptionKey,
    )
    const readRemoteDiaryFile = vi.fn(async () => ({
      exists: true,
      content: await encryptWithAesGcm('remote-new', dataEncryptionKey),
    }))
    const saveLocalDiary = vi.fn(async () => undefined)

    const result = await pullRemoteDiariesToIndexedDb(
      {
        token: 'test-token',
        owner: 'owner',
        repo: 'repo',
        branch: 'master',
        dataEncryptionKey,
      },
      {
        readRemoteMetadata: async () => ({
          missing: false,
          encryptedContent: encryptedMetadata,
          sha: 'sha-metadata',
        }),
        readRemoteDiaryFile,
        loadLocalDiary: async () => ({
          id: 'daily:2100-02-01',
          type: 'daily',
          date: '2100-02-01',
          content: 'local-dirty',
          createdAt: '2100-02-01T00:00:00.000Z',
          modifiedAt: '2100-02-01T01:30:00.000Z',
          wordCount: 3,
          filename: '2100-02-01.md.enc',
        }),
        loadBaseline: async () => ({
          entryId: 'daily:2100-02-01',
          fingerprint: 'baseline-fingerprint',
          syncedAt: '2100-02-01T01:00:00.000Z',
          remoteSha: 'sha-old',
        }),
        saveLocalDiary,
      },
    )

    expect(result).toEqual({
      total: 1,
      inserted: 0,
      updated: 0,
      skipped: 0,
      conflicted: 1,
      failed: 0,
      downloaded: 0,
      conflicts: [
        {
          entryId: 'daily:2100-02-01',
          reason: '本地存在未同步改动，已跳过覆盖',
        },
      ],
      failedItems: [],
      metadataMissing: false,
    })
    expect(readRemoteDiaryFile).not.toHaveBeenCalled()
    expect(saveLocalDiary).not.toHaveBeenCalled()
  })

})

describe('createUploadMetadataExecutor', () => {
  it('传入 expectedSha 时应直接携带到上传请求', async () => {
    const uploadRequest = vi.fn(async () => ({
      ok: true,
      conflict: false,
      remoteSha: 'sha-remote-new',
    }))
    const serializeMetadata = vi.fn(async (metadata: TestMetadata) => {
      return `encrypted:${metadata.version}`
    })

    const dependencies: CreateUploadMetadataDependencies<TestMetadata> = {
      uploadRequest,
      serializeMetadata,
      now: () => '2026-02-09T00:00:00.000Z',
      buildCommitMessage: ({ reason }) => `sync:${reason}`,
    }
    const uploadMetadata = createUploadMetadataExecutor(dependencies)

    const result = await uploadMetadata({
      metadata: {
        version: '2.0',
        entries: [{ date: '2026-02-09' }],
      },
      reason: 'manual',
      expectedSha: 'sha-remote-old',
    })

    expect(uploadRequest).toHaveBeenCalledTimes(1)
    expect(uploadRequest).toHaveBeenCalledWith({
      path: 'metadata.json.enc',
      encryptedContent: 'encrypted:2.0',
      message: 'sync:manual',
      branch: 'master',
      expectedSha: 'sha-remote-old',
    })
    expect(result).toEqual({
      ok: true,
      conflict: false,
      remoteSha: 'sha-remote-new',
      syncedAt: '2026-02-09T00:00:00.000Z',
    })
  })

  it('未传 expectedSha 时应走创建语义且不携带 expectedSha', async () => {
    const uploadRequest = vi.fn(async (request: unknown) => {
      void request
      return {
        ok: true,
        conflict: false,
        remoteSha: 'sha-created',
      }
    })

    const uploadMetadata = createUploadMetadataExecutor<TestMetadata>({
      uploadRequest,
      serializeMetadata: async () => 'encrypted:created',
      now: () => '2026-02-09T00:01:00.000Z',
    })

    const result = await uploadMetadata({
      metadata: {
        version: '2.1',
        entries: [],
      },
      reason: 'manual',
    })

    expect(uploadRequest).toHaveBeenCalledTimes(1)
    const uploadCall = uploadRequest.mock.calls[0]?.[0]
    expect(uploadCall).toMatchObject({
      path: 'metadata.json.enc',
      encryptedContent: 'encrypted:created',
      message: 'chore: metadata @ 2026-02-09T08:01:00+08:00',
      branch: 'master',
    })
    expect(Object.prototype.hasOwnProperty.call(uploadCall, 'expectedSha')).toBe(false)
    expect(result).toEqual({
      ok: true,
      conflict: false,
      remoteSha: 'sha-created',
      syncedAt: '2026-02-09T00:01:00.000Z',
    })
  })

  it('出现 sha mismatch 时应返回冲突信号', async () => {
    const uploadMetadata = createUploadMetadataExecutor<TestMetadata>({
      uploadRequest: async () => {
        throw new Error('更新远端 metadata 失败（409）：sha does not match')
      },
      serializeMetadata: async () => 'encrypted',
    })

    const result = await uploadMetadata({
      metadata: {
        version: '2.2',
        entries: [],
      },
      reason: 'manual',
    })

    expect(result).toEqual({
      ok: false,
      conflict: true,
      reason: 'sha_mismatch',
    })
  })

  it('网络异常应映射为 reason=network', async () => {
    const uploadMetadata = createUploadMetadataExecutor<TestMetadata>({
      uploadRequest: async () => {
        throw new TypeError('Failed to fetch')
      },
      serializeMetadata: async () => 'encrypted',
    })

    const result = await uploadMetadata({
      metadata: {
        version: '2.3',
        entries: [],
      },
      reason: 'manual',
    })

    expect(result).toEqual({
      ok: false,
      conflict: false,
      reason: 'network',
    })
  })
})

describe('pullDiaryFromGitee', () => {
  it('本地已有内容且与远端不同应返回冲突并携带远端版本', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('pull-conflict')
    const encryptedRemoteContent = await encryptWithAesGcm('remote-content', dataEncryptionKey)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: btoa(encryptedRemoteContent),
          encoding: 'base64',
          sha: 'sha-remote',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const result = await pullDiaryFromGitee({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      branch: 'master',
      dataEncryptionKey,
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => '2026-02-11T10:00:00.000Z',
      metadata: {
        type: 'daily',
        entryId: 'daily:2026-02-11',
        date: '2026-02-11',
        content: 'local-content',
        modifiedAt: '2026-02-11T09:00:00.000Z',
      },
    })

    expect(result).toEqual({
      ok: false,
      conflict: true,
      remoteSha: 'sha-remote',
      conflictPayload: {
        local: {
          type: 'daily',
          entryId: 'daily:2026-02-11',
          date: '2026-02-11',
          content: 'local-content',
          modifiedAt: '2026-02-11T09:00:00.000Z',
        },
        remote: {
          type: 'daily',
          entryId: 'daily:2026-02-11',
          date: '2026-02-11',
          content: 'remote-content',
          modifiedAt: '2026-02-11T10:00:00.000Z',
        },
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' })
  })

  it('本地内容为空时应直接返回远端内容', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('pull-success')
    const encryptedRemoteContent = await encryptWithAesGcm('remote-only-content', dataEncryptionKey)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: btoa(encryptedRemoteContent),
          encoding: 'base64',
          sha: 'sha-pulled',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const result = await pullDiaryFromGitee({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      dataEncryptionKey,
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => '2026-02-11T11:00:00.000Z',
      metadata: {
        type: 'daily',
        entryId: 'daily:2026-02-12',
        date: '2026-02-12',
        content: '',
        modifiedAt: '2026-02-12T09:00:00.000Z',
      },
    })

    expect(result).toEqual({
      ok: true,
      conflict: false,
      remoteSha: 'sha-pulled',
      syncedAt: '2026-02-11T11:00:00.000Z',
      pulledMetadata: {
        type: 'daily',
        entryId: 'daily:2026-02-12',
        date: '2026-02-12',
        content: 'remote-only-content',
        modifiedAt: '2026-02-11T11:00:00.000Z',
      },
    })
  })

  it('远端文件不存在时应返回 not_found', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('pull-not-found')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await pullDiaryFromGitee({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      dataEncryptionKey,
      fetchImpl: fetchMock as unknown as typeof fetch,
      metadata: {
        type: 'yearly_summary',
        entryId: 'summary:2026',
        year: 2026,
        content: 'local',
        modifiedAt: '2026-02-12T09:00:00.000Z',
      },
    })

    expect(result).toEqual({
      ok: false,
      conflict: false,
      reason: 'not_found',
    })
  })

  it('远端内容无法解密时应抛出明确错误信息', async () => {
    const localKey = await createDataEncryptionKey('pull-diary-local-key')
    const remoteKey = await createDataEncryptionKey('pull-diary-remote-key')
    const encryptedRemoteContent = await encryptWithAesGcm('remote-content', remoteKey)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: btoa(encryptedRemoteContent),
          encoding: 'base64',
          sha: 'sha-remote',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    await expect(() =>
      pullDiaryFromGitee({
        token: 'test-token',
        owner: 'owner',
        repo: 'repo',
        branch: 'master',
        dataEncryptionKey: localKey,
        fetchImpl: fetchMock as unknown as typeof fetch,
        metadata: {
          type: 'daily',
          entryId: 'daily:2100-02-13',
          date: '2100-02-13',
          content: 'local-content',
          modifiedAt: '2100-02-13T09:00:00.000Z',
        },
      }),
    ).rejects.toThrow('云端内容解密失败，请确认主密码是否与该仓库数据一致')
  })
})

describe('readRemoteMetadataFromGitee', () => {
  it('应通过 Gitee contents API 读取并解码 metadata.json.enc（含 UTF-8 文本）', async () => {
    const rawContent = 'encrypted-中文🚀\n'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          encoding: 'base64',
          content: encodeBase64Utf8(rawContent),
          sha: 'sha-file-1',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    )

    const result = await readRemoteMetadataFromGitee({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(result).toEqual({
      missing: false,
      encryptedContent: 'encrypted-中文🚀',
      sha: 'sha-file-1',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gitee.com/api/v5/repos/owner/repo/contents/metadata.json.enc?ref=master',
      {
        method: 'GET',
        headers: {
          Authorization: 'token test-token',
          Accept: 'application/json',
        },
      },
    )
  })

  it('contents API 缺少 content 但提供 sha 时应通过 blob API 读取 metadata', async () => {
    const rawContent = 'encrypted-large-metadata\n'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sha: 'sha-large-meta',
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: encodeBase64Utf8(rawContent),
            encoding: 'base64',
            size: 8192,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )

    const result = await readRemoteMetadataFromGitee({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(result).toEqual({
      missing: false,
      encryptedContent: 'encrypted-large-metadata',
      sha: 'sha-large-meta',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://gitee.com/api/v5/repos/owner/repo/git/blobs/sha-large-meta',
    )
  })

  it('404 时应返回 missing=true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await readRemoteMetadataFromGitee({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(result).toEqual({ missing: true })
  })

  it('鉴权失败时应透传 auth 错误信息与状态码', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: '401 Unauthorized',
        }),
        {
          status: 401,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    )

    await expect(
      readRemoteMetadataFromGitee({
        token: 'bad-token',
        owner: 'owner',
        repo: 'repo',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('鉴权失败'),
    })
  })
})

describe('createDiaryUploadExecutor', () => {
  it('默认应使用 master 分支，且传入 expectedSha 时发送 PUT 请求', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('daily-update')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: { sha: 'sha-new' },
            commit: { sha: 'commit-new' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

    const uploadDiary = createDiaryUploadExecutor({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      dataEncryptionKey,
      syncMetadata: false,
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => '2026-02-09T10:00:00.000Z',
    })

    const result = await uploadDiary({
      metadata: {
        type: 'daily',
        entryId: 'daily:2026-02-09',
        date: '2026-02-09',
        content: '# 日记',
        modifiedAt: '2026-02-09T09:00:00.000Z',
      },
      reason: 'manual',
      expectedSha: 'sha-old',
    })

    expect(result).toMatchObject({
      ok: true,
      conflict: false,
      remoteSha: 'sha-new',
      syncedAt: '2026-02-09T10:00:00.000Z',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('2026-02-09.md.enc?branch=master')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
    })
    const uploadRequestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}')) as {
      content: string
      message: string
    }
    expect(uploadRequestBody.message).toBe('chore: 日记 2026-02-09 @ 2026-02-09T18:00:00+08:00')
    const uploadedPayload = decodeBase64Utf8(uploadRequestBody.content)
    expect(uploadedPayload).not.toBe('# 日记')
  })

  it('指定 branch 时应覆盖默认分支', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('daily-branch')
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: { sha: 'sha-created' },
          commit: { sha: 'commit-created' },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    )

    const uploadDiary = createDiaryUploadExecutor({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      dataEncryptionKey,
      syncMetadata: false,
      branch: 'main',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await uploadDiary({
      metadata: {
        type: 'daily',
        entryId: 'daily:2026-02-10',
        date: '2026-02-10',
        content: 'hello',
        modifiedAt: '2026-02-10T09:00:00.000Z',
      },
      reason: 'manual',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('2026-02-10.md.enc?branch=main')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
    })
  })

  it('启用 syncMetadata 时应追加 metadata.json.enc 上传请求', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('daily-with-metadata')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: { sha: 'sha-diary-created' },
            commit: { sha: 'commit-diary-created' },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: { sha: 'sha-metadata-created' },
            commit: { sha: 'commit-metadata-created' },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      )

    const uploadDiary = createDiaryUploadExecutor({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      dataEncryptionKey,
      syncMetadata: true,
      branch: 'master',
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => '2026-02-09T15:00:00.000Z',
    })

    const result = await uploadDiary({
      metadata: {
        type: 'daily',
        entryId: 'daily:2026-02-13',
        date: '2026-02-13',
        content: 'with metadata',
        modifiedAt: '2026-02-13T08:00:00.000Z',
      },
      reason: 'manual',
    })

    expect(result).toMatchObject({
      ok: true,
      conflict: false,
      remoteSha: 'sha-diary-created',
      syncedAt: '2026-02-09T15:00:00.000Z',
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('2026-02-13.md.enc?branch=master')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('metadata.json.enc?ref=master')
    expect(fetchMock.mock.calls[2]?.[0]).toContain('metadata.json.enc?branch=master')
    const metadataUploadBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body ?? '{}')) as {
      message: string
    }
    expect(metadataUploadBody.message).toBe('chore: metadata @ 2026-02-09T23:00:00+08:00')
  })

  it('远端 metadata 解密失败时不应按空 metadata 覆盖写回', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('daily-metadata-corrupt')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: { sha: 'sha-diary-created' },
            commit: { sha: 'commit-diary-created' },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: encodeBase64Utf8('not-encrypted-metadata'),
            encoding: 'base64',
            sha: 'sha-metadata-old',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

    const uploadDiary = createDiaryUploadExecutor({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      dataEncryptionKey,
      syncMetadata: true,
      branch: 'master',
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => '2026-02-09T15:00:00.000Z',
    })

    const result = await uploadDiary({
      metadata: {
        type: 'daily',
        entryId: 'daily:2026-02-13',
        date: '2026-02-13',
        content: 'with metadata',
        modifiedAt: '2026-02-13T08:00:00.000Z',
      },
      reason: 'manual',
    })

    expect(result).toMatchObject({
      ok: true,
      conflict: false,
      remoteSha: 'sha-diary-created',
      syncedAt: '2026-02-09T15:00:00.000Z',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('2026-02-13.md.enc?branch=master')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('metadata.json.enc?ref=master')
  })

  it('配置分支不存在时应自动回退到可用分支并上传成功', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('daily-fallback')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'The branch master does not exist',
          }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: { sha: 'sha-main-created' },
            commit: { sha: 'commit-main-created' },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      )

    const uploadDiary = createDiaryUploadExecutor({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      dataEncryptionKey,
      syncMetadata: false,
      branch: 'master',
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => '2026-02-09T12:00:00.000Z',
    })

    const result = await uploadDiary({
      metadata: {
        type: 'daily',
        entryId: 'daily:2026-02-11',
        date: '2026-02-11',
        content: 'fallback',
        modifiedAt: '2026-02-11T08:00:00.000Z',
      },
      reason: 'manual',
    })

    expect(result).toMatchObject({
      ok: true,
      conflict: false,
      remoteSha: 'sha-main-created',
      syncedAt: '2026-02-09T12:00:00.000Z',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('2026-02-11.md.enc?branch=master')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('2026-02-11.md.enc?branch=main')
  })

  it('sha mismatch 冲突分支应解密远端内容后写入 conflictPayload.remote', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('daily-conflict')
    const encryptedRemoteContent = await encryptWithAesGcm('# 远端版本', dataEncryptionKey)
    const encryptedRemoteContentWithWhitespace = `${encryptedRemoteContent.slice(0, 20)}\n${encryptedRemoteContent.slice(20)}  `
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'sha does not match',
          }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: btoa(encryptedRemoteContentWithWhitespace),
            encoding: 'base64',
            sha: 'sha-remote-latest',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

    const uploadDiary = createDiaryUploadExecutor({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      dataEncryptionKey,
      syncMetadata: false,
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => '2026-02-09T13:00:00.000Z',
    })

    const localMetadata = {
      type: 'daily' as const,
      entryId: 'daily:2026-02-12',
      date: '2026-02-12',
      content: '# 本地版本',
      modifiedAt: '2026-02-12T09:00:00.000Z',
    }
    const result = await uploadDiary({
      metadata: localMetadata,
      reason: 'manual',
      expectedSha: 'sha-old',
    })

    expect(result).toBeDefined()
    expect(result?.ok).toBe(false)
    expect(result?.conflict).toBe(true)
    expect(result?.reason).toBe('sha_mismatch')
    expect(result?.remoteSha).toBe('sha-remote-latest')
    expect(result?.conflictPayload?.local).toEqual(localMetadata)
    expect(result?.conflictPayload?.remote).toEqual({
      ...localMetadata,
      content: '# 远端版本',
      modifiedAt: '2026-02-09T13:00:00.000Z',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'GET' })
  })
})

describe('uploadMetadataToGitee', () => {
  it('expectedSha 存在时应使用 PUT 且保持 UTF-8 编码上传', async () => {
    const encryptedContent = '加密内容-中文🚀'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: { sha: 'sha-new' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await uploadMetadataToGitee({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      fetchImpl: fetchMock as unknown as typeof fetch,
      request: {
        path: 'metadata.json.enc',
        encryptedContent,
        message: 'sync metadata',
        branch: 'master',
        expectedSha: 'sha-old',
      },
    })

    expect(result).toEqual({
      ok: true,
      conflict: false,
      remoteSha: 'sha-new',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' })
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}')) as {
      content?: string
    }
    expect(decodeBase64Utf8(requestBody.content ?? '')).toBe(encryptedContent)
  })

  it('expectedSha 不存在时应使用 POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: { sha: 'sha-created' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await uploadMetadataToGitee({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      fetchImpl: fetchMock as unknown as typeof fetch,
      request: {
        path: 'metadata.json.enc',
        encryptedContent: 'encrypted-content',
        message: 'create metadata',
        branch: 'master',
      },
    })

    expect(result).toEqual({
      ok: true,
      conflict: false,
      remoteSha: 'sha-created',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
  })

  it('鉴权失败时应返回 auth reason', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: '401 Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await uploadMetadataToGitee({
      token: 'bad-token',
      owner: 'owner',
      repo: 'repo',
      fetchImpl: fetchMock as unknown as typeof fetch,
      request: {
        path: 'metadata.json.enc',
        encryptedContent: 'encrypted-content',
        message: 'sync metadata',
        branch: 'master',
        expectedSha: 'sha-old',
      },
    })

    expect(result).toEqual({
      ok: false,
      conflict: false,
      reason: 'auth',
    })
  })

  it('sha mismatch 时应返回 conflict 与 sha_mismatch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'sha does not match' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await uploadMetadataToGitee({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      fetchImpl: fetchMock as unknown as typeof fetch,
      request: {
        path: 'metadata.json.enc',
        encryptedContent: 'encrypted-content',
        message: 'sync metadata',
        branch: 'master',
        expectedSha: 'sha-old',
      },
    })

    expect(result).toEqual({
      ok: false,
      conflict: true,
      reason: 'sha_mismatch',
    })
  })

  it('非鉴权类 API 错误时应保持兼容返回 ok=false 且 conflict=false', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await uploadMetadataToGitee({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      fetchImpl: fetchMock as unknown as typeof fetch,
      request: {
        path: 'metadata.json.enc',
        encryptedContent: 'encrypted-content',
        message: 'sync metadata',
        branch: 'master',
      },
    })

    expect(result).toEqual({
      ok: false,
      conflict: false,
    })
  })
})
