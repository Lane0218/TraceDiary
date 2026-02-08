import { describe, expect, it, vi } from 'vitest'

import type {
  MetadataCacheRecord,
  MetadataStoreApi,
  PullAndCacheMetadataDependencies,
} from '../sync'
import {
  pullAndCacheMetadata,
  readRemoteMetadataFromGitee,
} from '../sync'

interface TestMetadata {
  version: string
  entries: Array<{ date: string }>
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
      'https://gitee.com/api/v5/repos/owner/repo/contents/metadata.json.enc?ref=main',
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
