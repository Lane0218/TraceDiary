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
  readRemoteMetadataFromGitee,
  uploadMetadataToGitee,
} from '../sync'
import { encryptWithAesGcm } from '../crypto'
import { decodeBase64Utf8 } from '../gitee'

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

describe('createUploadMetadataExecutor', () => {
  it('CAS 成功时应先读取远端 SHA，再携带 expectedSha 提交上传', async () => {
    const readRemoteMetadata = vi.fn(async () => ({
      missing: false as const,
      encryptedContent: 'unused',
      sha: 'sha-remote-old',
    }))
    const uploadRequest = vi.fn(async () => ({
      ok: true,
      conflict: false,
      remoteSha: 'sha-remote-new',
    }))
    const serializeMetadata = vi.fn(async (metadata: TestMetadata) => {
      return `encrypted:${metadata.version}`
    })

    const dependencies: CreateUploadMetadataDependencies<TestMetadata> = {
      readRemoteMetadata,
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

  it('远端文件不存在时应走创建流程且不携带 expectedSha', async () => {
    const readRemoteMetadata = vi.fn(async () => ({ missing: true as const }))
    const uploadRequest = vi.fn(async (request: unknown) => {
      void request
      return {
        ok: true,
        conflict: false,
        remoteSha: 'sha-created',
      }
    })

    const uploadMetadata = createUploadMetadataExecutor<TestMetadata>({
      readRemoteMetadata,
      uploadRequest,
      serializeMetadata: async () => 'encrypted:created',
      now: () => '2026-02-09T00:01:00.000Z',
    })

    const result = await uploadMetadata({
      metadata: {
        version: '2.1',
        entries: [],
      },
      reason: 'debounced',
    })

    expect(uploadRequest).toHaveBeenCalledTimes(1)
    const uploadCall = uploadRequest.mock.calls[0]?.[0]
    expect(uploadCall).toMatchObject({
      path: 'metadata.json.enc',
      encryptedContent: 'encrypted:created',
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
      readRemoteMetadata: async () => ({
        missing: false,
        encryptedContent: 'ignored',
        sha: 'sha-old',
      }),
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
      readRemoteMetadata: async () => ({ missing: true }),
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

describe('readRemoteMetadataFromGitee', () => {
  it('应通过 Gitee contents API 读取并解码 metadata.json.enc', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          encoding: 'base64',
          content: btoa('encrypted-base64-payload\n'),
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
      encryptedContent: 'encrypted-base64-payload',
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
})

describe('createDiaryUploadExecutor', () => {
  it('默认应使用 master 分支并在更新场景发送 PUT 请求', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('daily-update')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: btoa('# day 1'),
            encoding: 'base64',
            sha: 'sha-old',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
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
    })

    expect(result).toMatchObject({
      ok: true,
      conflict: false,
      remoteSha: 'sha-new',
      syncedAt: '2026-02-09T10:00:00.000Z',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('2026-02-09.md.enc?ref=master')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
    })
    expect(fetchMock.mock.calls[1]?.[0]).toContain('2026-02-09.md.enc?branch=master')
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'PUT',
    })
    const uploadRequestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? '{}')) as {
      content: string
    }
    const uploadedPayload = decodeBase64Utf8(uploadRequestBody.content)
    expect(uploadedPayload).not.toBe('# 日记')
  })

  it('指定 branch 时应覆盖默认分支', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('daily-branch')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }))
      .mockResolvedValueOnce(
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

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('2026-02-10.md.enc?ref=main')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('2026-02-10.md.enc?branch=main')
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
    })
  })

  it('启用 syncMetadata 时应追加 metadata.json.enc 上传请求', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('daily-with-metadata')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }))
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
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('2026-02-13.md.enc?ref=master')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('2026-02-13.md.enc?branch=master')
    expect(fetchMock.mock.calls[2]?.[0]).toContain('metadata.json.enc?ref=master')
    expect(fetchMock.mock.calls[3]?.[0]).toContain('metadata.json.enc?branch=master')
  })

  it('配置分支不存在时应自动回退到可用分支并上传成功', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('daily-fallback')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'The branch master does not exist',
          }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }))
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
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('2026-02-11.md.enc?ref=master')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('2026-02-11.md.enc?branch=master')
    expect(fetchMock.mock.calls[2]?.[0]).toContain('2026-02-11.md.enc?ref=main')
    expect(fetchMock.mock.calls[3]?.[0]).toContain('2026-02-11.md.enc?branch=main')
  })

  it('sha mismatch 冲突分支应解密远端内容后写入 conflictPayload.remote', async () => {
    const dataEncryptionKey = await createDataEncryptionKey('daily-conflict')
    const encryptedRemoteContent = await encryptWithAesGcm('# 远端版本', dataEncryptionKey)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: btoa('old-remote-encrypted'),
            encoding: 'base64',
            sha: 'sha-old',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
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
            content: btoa(encryptedRemoteContent),
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
    })

    expect(result).toBeDefined()
    expect(result?.ok).toBe(false)
    expect(result?.conflict).toBe(true)
    expect(result?.reason).toBe('sha_mismatch')
    expect(result?.conflictPayload?.local).toEqual(localMetadata)
    expect(result?.conflictPayload?.remote).toEqual({
      ...localMetadata,
      content: '# 远端版本',
      modifiedAt: '2026-02-09T13:00:00.000Z',
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PUT' })
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: 'GET' })
  })
})

describe('uploadMetadataToGitee', () => {
  it('expectedSha 存在时应使用 PUT', async () => {
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
        encryptedContent: 'encrypted-content',
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
})
