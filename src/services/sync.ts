import { getMetadata, saveMetadata } from './indexeddb'
import type { Metadata } from '../types/metadata'

const DEFAULT_GITEE_API_BASE = 'https://gitee.com/api/v5'
const DEFAULT_METADATA_PATH = 'metadata.json.enc'
const DEFAULT_BRANCH = 'main'

export interface MetadataCacheRecord<TMetadata = unknown> {
  key: 'metadata'
  metadata: TMetadata
  remoteSha?: string
  cachedAt: string
}

export interface MetadataStoreApi<TMetadata = unknown> {
  getMetadata: () => Promise<MetadataCacheRecord<TMetadata> | null>
  putMetadata: (record: MetadataCacheRecord<TMetadata>) => Promise<void>
}

export interface RemoteMetadataFileMissing {
  missing: true
}

export interface RemoteMetadataFileFound {
  missing: false
  encryptedContent: string
  sha?: string
}

export type RemoteMetadataFile = RemoteMetadataFileMissing | RemoteMetadataFileFound

export interface PullAndCacheMetadataDependencies<TMetadata = unknown> {
  readRemoteMetadata: () => Promise<RemoteMetadataFile>
  decryptMetadata: (encryptedContent: string) => Promise<string>
  metadataStore: MetadataStoreApi<TMetadata>
  parseMetadata?: (decryptedContent: string) => TMetadata
  now?: () => string
}

export interface PullAndCacheMetadataOptions {
  forceRefresh?: boolean
}

export interface PullAndCacheMetadataResult<TMetadata = unknown> {
  metadata: TMetadata | null
  source: 'cache' | 'remote' | 'empty'
  remoteSha?: string
}

export interface ReadRemoteMetadataFromGiteeParams {
  token: string
  owner: string
  repo: string
  branch?: string
  path?: string
  apiBase?: string
  fetchImpl?: typeof fetch
}

function normalizeApiBase(apiBase?: string): string {
  const envApiBase =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_GITEE_API_BASE
      ? String(import.meta.env.VITE_GITEE_API_BASE)
      : undefined

  return (apiBase ?? envApiBase ?? DEFAULT_GITEE_API_BASE).trim().replace(/\/+$/, '')
}

function toUtf8FromBase64(base64: string): string {
  const normalizedBase64 = base64.replace(/\s+/g, '')

  if (typeof atob !== 'function') {
    throw new Error('当前环境缺少 Base64 解码能力')
  }

  const binary = atob(normalizedBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

function encodePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

async function readRemoteErrorMessage(response: Response): Promise<string | undefined> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

  try {
    if (contentType.includes('application/json')) {
      const body = (await response.json()) as { message?: unknown; error?: unknown }
      if (typeof body.message === 'string' && body.message.trim()) {
        return body.message.trim()
      }
      if (typeof body.error === 'string' && body.error.trim()) {
        return body.error.trim()
      }
      return undefined
    }

    const text = (await response.text()).trim()
    return text || undefined
  } catch {
    return undefined
  }
}

function defaultParseMetadata<TMetadata>(decryptedContent: string): TMetadata {
  try {
    return JSON.parse(decryptedContent) as TMetadata
  } catch {
    throw new Error('metadata 解密后不是有效 JSON')
  }
}

function nowIsoString(): string {
  return new Date().toISOString()
}

export function createIndexedDbMetadataStore<TMetadata = Metadata>(): MetadataStoreApi<TMetadata> {
  return {
    getMetadata: async () => {
      return getMetadata<MetadataCacheRecord<TMetadata>>()
    },
    putMetadata: async (record) => {
      await saveMetadata(record)
    },
  }
}

export async function readRemoteMetadataFromGitee(
  params: ReadRemoteMetadataFromGiteeParams,
): Promise<RemoteMetadataFile> {
  const token = params.token.trim()
  const owner = params.owner.trim()
  const repo = params.repo.trim()
  const branch = (params.branch ?? DEFAULT_BRANCH).trim() || DEFAULT_BRANCH
  const metadataPath = (params.path ?? DEFAULT_METADATA_PATH).trim() || DEFAULT_METADATA_PATH

  if (!token) {
    throw new Error('Gitee Token 不能为空')
  }
  if (!owner || !repo) {
    throw new Error('owner 与 repo 不能为空')
  }

  const fetcher = params.fetchImpl ?? fetch
  const requestUrl = `${normalizeApiBase(params.apiBase)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(metadataPath)}?ref=${encodeURIComponent(branch)}`

  const response = await fetcher(requestUrl, {
    method: 'GET',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/json',
    },
  })

  if (response.status === 404) {
    return { missing: true }
  }

  if (!response.ok) {
    const remoteMessage = await readRemoteErrorMessage(response)
    if (remoteMessage) {
      throw new Error(`读取远端 metadata 失败（${response.status}）：${remoteMessage}`)
    }
    throw new Error(`读取远端 metadata 失败（${response.status}）`)
  }

  const body = (await response.json()) as {
    content?: unknown
    encoding?: unknown
    sha?: unknown
  }

  if (typeof body.content !== 'string' || !body.content.trim()) {
    throw new Error('远端 metadata 文件内容为空')
  }

  const encryptedContent =
    body.encoding === 'base64' ? toUtf8FromBase64(body.content) : body.content

  if (!encryptedContent.trim()) {
    throw new Error('远端 metadata 文件内容为空')
  }

  return {
    missing: false,
    encryptedContent: encryptedContent.trim(),
    sha: typeof body.sha === 'string' ? body.sha : undefined,
  }
}

export function createGiteeMetadataReader(
  params: ReadRemoteMetadataFromGiteeParams,
): () => Promise<RemoteMetadataFile> {
  return () => readRemoteMetadataFromGitee(params)
}

export async function pullAndCacheMetadata<TMetadata = unknown>(
  dependencies: PullAndCacheMetadataDependencies<TMetadata>,
  options: PullAndCacheMetadataOptions = {},
): Promise<PullAndCacheMetadataResult<TMetadata>> {
  const forceRefresh = options.forceRefresh === true
  const cached = await dependencies.metadataStore.getMetadata()

  if (cached && !forceRefresh) {
    return {
      metadata: cached.metadata,
      source: 'cache',
      remoteSha: cached.remoteSha,
    }
  }

  const remoteFile = await dependencies.readRemoteMetadata()
  if (remoteFile.missing) {
    if (cached) {
      return {
        metadata: cached.metadata,
        source: 'cache',
        remoteSha: cached.remoteSha,
      }
    }

    return {
      metadata: null,
      source: 'empty',
    }
  }

  const decryptedContent = await dependencies.decryptMetadata(remoteFile.encryptedContent)
  const parseMetadata = dependencies.parseMetadata ?? defaultParseMetadata<TMetadata>
  const metadata = parseMetadata(decryptedContent)

  const record: MetadataCacheRecord<TMetadata> = {
    key: 'metadata',
    metadata,
    cachedAt: (dependencies.now ?? nowIsoString)(),
  }
  if (remoteFile.sha) {
    record.remoteSha = remoteFile.sha
  }

  await dependencies.metadataStore.putMetadata(record)

  return {
    metadata,
    source: 'remote',
    remoteSha: remoteFile.sha,
  }
}
