import { getMetadata, saveMetadata } from './indexeddb'
import { GiteeApiError, readGiteeFileContents, upsertGiteeFile } from './gitee'
import type { Metadata } from '../types/metadata'

const DEFAULT_GITEE_API_BASE = 'https://gitee.com/api/v5'
const DEFAULT_METADATA_PATH = 'metadata.json.enc'
const DEFAULT_BRANCH = 'master'

export type SyncTriggerReason = 'debounced' | 'manual'

export type UploadFailureReason = 'sha_mismatch' | 'network' | 'auth'

export interface UploadRequest {
  path: string
  encryptedContent: string
  message: string
  branch: string
  expectedSha?: string
}

export interface UploadConflictPayload<TMetadata = unknown> {
  local: TMetadata
  remote?: TMetadata
}

export interface UploadResult {
  ok: boolean
  conflict: boolean
  remoteSha?: string
  reason?: UploadFailureReason
}

export interface UploadMetadataPayload<TMetadata = unknown> {
  metadata: TMetadata
  reason: SyncTriggerReason
}

export interface UploadMetadataResult<TMetadata = unknown> {
  syncedAt?: string
  ok?: boolean
  conflict?: boolean
  remoteSha?: string
  reason?: UploadFailureReason
  conflictPayload?: UploadConflictPayload<TMetadata>
}

export type UploadMetadataFn<TMetadata = unknown> = (
  payload: UploadMetadataPayload<TMetadata>,
) => Promise<UploadMetadataResult<TMetadata> | void>

export interface CreateUploadMetadataDependencies<TMetadata = unknown> {
  uploadMetadata?: UploadMetadataFn<TMetadata>
  readRemoteMetadata?: () => Promise<RemoteMetadataFile>
  uploadRequest?: (request: UploadRequest) => Promise<UploadResult>
  serializeMetadata?: (metadata: TMetadata) => Promise<string> | string
  buildCommitMessage?: (payload: UploadMetadataPayload<TMetadata>) => string
  path?: string
  branch?: string
  now?: () => string
}

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

export interface UploadMetadataToGiteeParams extends ReadRemoteMetadataFromGiteeParams {
  request: UploadRequest
}

export type DiarySyncMetadata =
  | {
      type: 'daily'
      entryId: string
      date: string
      content: string
      modifiedAt: string
    }
  | {
      type: 'yearly_summary'
      entryId: string
      year: number
      content: string
      modifiedAt: string
    }

export interface CreateDiaryUploadExecutorParams {
  token: string
  owner: string
  repo: string
  dataEncryptionKey: CryptoKey
  branch?: string
  apiBase?: string
  fetchImpl?: typeof fetch
  useAccessTokenQuery?: boolean
  now?: () => string
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

function assertCryptoAvailable(): Crypto {
  if (typeof globalThis.crypto?.subtle === 'undefined') {
    throw new Error('当前环境缺少 Web Crypto 能力')
  }
  return globalThis.crypto
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa !== 'function') {
    throw new Error('当前环境缺少 Base64 编码能力')
  }

  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob !== 'function') {
    throw new Error('当前环境缺少 Base64 解码能力')
  }

  const normalizedBase64 = base64.replace(/\s+/g, '')
  const binary = atob(normalizedBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function encryptDiaryContent(content: string, key: CryptoKey): Promise<string> {
  const cryptoApi = assertCryptoAvailable()
  const iv = cryptoApi.getRandomValues(new Uint8Array(12))
  const plaintextBytes = new TextEncoder().encode(content)
  const encrypted = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    plaintextBytes,
  )
  const encryptedBytes = new Uint8Array(encrypted)
  const payload = new Uint8Array(iv.length + encryptedBytes.length)
  payload.set(iv, 0)
  payload.set(encryptedBytes, iv.length)
  return bytesToBase64(payload)
}

async function decryptDiaryContent(encryptedContent: string, key: CryptoKey): Promise<string> {
  const cryptoApi = assertCryptoAvailable()
  const payload = base64ToBytes(encryptedContent)
  if (payload.byteLength <= 12) {
    throw new Error('远端日记密文格式无效')
  }

  const iv = payload.subarray(0, 12)
  const encryptedBytes = payload.subarray(12)
  const decrypted = await cryptoApi.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(encryptedBytes),
  )
  return new TextDecoder().decode(decrypted)
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

function defaultBuildCommitMessage<TMetadata>(payload: UploadMetadataPayload<TMetadata>): string {
  if (payload.reason === 'manual') {
    return 'chore: 手动同步 metadata'
  }
  return 'chore: 自动同步 metadata'
}

function looksLikeShaMismatch(status?: number, message?: string): boolean {
  if (status === 409) {
    return true
  }
  if (!message) {
    return false
  }

  const normalized = message.toLowerCase()
  if (!normalized.includes('sha')) {
    return false
  }

  return /(mismatch|not\s+match|does\s+not\s+match|冲突|不一致)/i.test(message)
}

function pickStatusFromError(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const status = (error as { status?: unknown }).status
  if (typeof status === 'number') {
    return status
  }

  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') {
    return undefined
  }

  const matched = message.match(/[（(](\d{3})[）)]/)
  if (!matched) {
    return undefined
  }

  return Number(matched[1])
}

function inferUploadFailureReason(error: unknown): UploadFailureReason | undefined {
  const status = pickStatusFromError(error)
  if (status === 401 || status === 403) {
    return 'auth'
  }

  if (error instanceof TypeError) {
    return 'network'
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (/(401|403|unauthorized|forbidden|token|auth|权限|鉴权|认证)/i.test(message)) {
      return 'auth'
    }

    if (
      /(network|failed to fetch|fetch failed|timeout|timed out|econn|enotfound|offline|连接|网络)/i.test(
        message,
      )
    ) {
      return 'network'
    }
  }

  return undefined
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

export async function placeholderUploadMetadata<TMetadata = unknown>(
  payload: UploadMetadataPayload<TMetadata>,
): Promise<UploadMetadataResult<TMetadata>> {
  void payload
  return {
    ok: true,
    conflict: false,
    syncedAt: nowIsoString(),
  }
}

export function createUploadMetadataExecutor<TMetadata = unknown>(
  dependencies: CreateUploadMetadataDependencies<TMetadata> = {},
): UploadMetadataFn<TMetadata> {
  if (dependencies.uploadMetadata) {
    return dependencies.uploadMetadata
  }

  if (
    !dependencies.readRemoteMetadata ||
    !dependencies.uploadRequest ||
    !dependencies.serializeMetadata
  ) {
    return placeholderUploadMetadata<TMetadata>
  }

  const metadataPath = (dependencies.path ?? DEFAULT_METADATA_PATH).trim() || DEFAULT_METADATA_PATH
  const branch = (dependencies.branch ?? DEFAULT_BRANCH).trim() || DEFAULT_BRANCH
  const now = dependencies.now ?? nowIsoString
  const buildCommitMessage = dependencies.buildCommitMessage ?? defaultBuildCommitMessage
  const serializeMetadata = dependencies.serializeMetadata
  const readRemoteMetadata = dependencies.readRemoteMetadata
  const uploadRequest = dependencies.uploadRequest

  return async (
    payload: UploadMetadataPayload<TMetadata>,
  ): Promise<UploadMetadataResult<TMetadata>> => {
    try {
      const encryptedContent = await serializeMetadata(payload.metadata)
      const remoteFile = await readRemoteMetadata()

      const request: UploadRequest = {
        path: metadataPath,
        encryptedContent,
        message: buildCommitMessage(payload),
        branch,
      }

      if (!remoteFile.missing && remoteFile.sha) {
        request.expectedSha = remoteFile.sha
      }

      const uploadResult = await uploadRequest(request)
      return {
        ok: uploadResult.ok,
        conflict: uploadResult.conflict,
        remoteSha: uploadResult.remoteSha,
        reason: uploadResult.reason,
        syncedAt: uploadResult.ok ? now() : undefined,
      }
    } catch (error) {
      const status = pickStatusFromError(error)
      const message = error instanceof Error ? error.message : undefined

      if (looksLikeShaMismatch(status, message)) {
        return {
          ok: false,
          conflict: true,
          reason: 'sha_mismatch',
        }
      }

      const reason = inferUploadFailureReason(error)
      if (reason) {
        return {
          ok: false,
          conflict: false,
          reason,
        }
      }

      throw error
    }
  }
}

function buildDiaryPath(metadata: DiarySyncMetadata): string {
  if (metadata.type === 'daily') {
    return `${metadata.date}.md.enc`
  }
  return `${metadata.year}-summary.md.enc`
}

function buildDiaryCommitMessage(metadata: DiarySyncMetadata, reason: SyncTriggerReason): string {
  if (metadata.type === 'daily') {
    return reason === 'manual'
      ? `chore: 手动同步日记 ${metadata.date}`
      : `chore: 自动同步日记 ${metadata.date}`
  }
  return reason === 'manual'
    ? `chore: 手动同步年度总结 ${metadata.year}`
    : `chore: 自动同步年度总结 ${metadata.year}`
}

function isShaMismatchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  if (error instanceof GiteeApiError && error.status === 409) {
    return true
  }

  return looksLikeShaMismatch(
    error instanceof GiteeApiError ? error.status : pickStatusFromError(error),
    error.message,
  )
}

function isBranchNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const status = error instanceof GiteeApiError ? error.status : pickStatusFromError(error)
  if (status !== 400 && status !== 404 && status !== 422) {
    return false
  }

  const message = error.message.toLowerCase()
  const mentionsBranch = /(branch|分支)/i.test(message)
  const indicatesMissing = /(not\s+exist|does\s+not\s+exist|not\s+found|unknown|invalid|不存在|未找到|无效)/i.test(
    message,
  )

  return mentionsBranch && indicatesMissing
}

function buildBranchCandidates(branch: string): string[] {
  const candidates = [branch, 'main', 'master']
  const uniqueCandidates = new Set<string>()

  candidates.forEach((item) => {
    const normalized = item.trim()
    if (!normalized) {
      return
    }
    uniqueCandidates.add(normalized)
  })

  return Array.from(uniqueCandidates)
}

function toRemoteDiaryMetadata(
  local: DiarySyncMetadata,
  remoteContent: string,
  now: () => string,
): DiarySyncMetadata {
  return {
    ...local,
    content: remoteContent,
    modifiedAt: now(),
  }
}

export function createDiaryUploadExecutor(
  params: CreateDiaryUploadExecutorParams,
): UploadMetadataFn<DiarySyncMetadata> {
  let activeBranch = (params.branch ?? DEFAULT_BRANCH).trim() || DEFAULT_BRANCH
  const now = params.now ?? nowIsoString
  const useAccessTokenQuery = params.useAccessTokenQuery ?? true

  const attemptUpload = async (
    payload: UploadMetadataPayload<DiarySyncMetadata>,
    targetBranch: string,
  ): Promise<UploadMetadataResult<DiarySyncMetadata>> => {
    const metadata = payload.metadata
    const path = buildDiaryPath(metadata)
    const remoteFile = await readGiteeFileContents({
      token: params.token,
      owner: params.owner,
      repo: params.repo,
      path,
      ref: targetBranch,
      apiBase: params.apiBase,
      fetchImpl: params.fetchImpl,
      useAccessTokenQuery,
    })

    const expectedSha = remoteFile.exists ? remoteFile.sha : undefined
    const encryptedContent = await encryptDiaryContent(metadata.content, params.dataEncryptionKey)
    const upsertResult = await upsertGiteeFile({
      token: params.token,
      owner: params.owner,
      repo: params.repo,
      path,
      content: encryptedContent,
      message: buildDiaryCommitMessage(metadata, payload.reason),
      branch: targetBranch,
      expectedSha,
      apiBase: params.apiBase,
      fetchImpl: params.fetchImpl,
      useAccessTokenQuery,
    })

    return {
      ok: true,
      conflict: false,
      remoteSha: upsertResult.sha,
      syncedAt: now(),
    }
  }

  const mapUploadError = async (
    error: unknown,
    payload: UploadMetadataPayload<DiarySyncMetadata>,
    targetBranch: string,
  ): Promise<UploadMetadataResult<DiarySyncMetadata>> => {
    const metadata = payload.metadata
    const path = buildDiaryPath(metadata)

    if (isShaMismatchError(error)) {
      let remoteMetadata: DiarySyncMetadata | undefined
      try {
        const latestRemote = await readGiteeFileContents({
          token: params.token,
          owner: params.owner,
          repo: params.repo,
          path,
          ref: targetBranch,
          apiBase: params.apiBase,
          fetchImpl: params.fetchImpl,
          useAccessTokenQuery,
        })
        if (latestRemote.exists && typeof latestRemote.content === 'string') {
          const decryptedRemoteContent = await decryptDiaryContent(
            latestRemote.content,
            params.dataEncryptionKey,
          )
          remoteMetadata = toRemoteDiaryMetadata(metadata, decryptedRemoteContent, now)
        }
      } catch {
        remoteMetadata = undefined
      }

      return {
        ok: false,
        conflict: true,
        reason: 'sha_mismatch',
        conflictPayload: {
          local: metadata,
          remote: remoteMetadata,
        },
      }
    }

    if (error instanceof GiteeApiError) {
      if (error.type === 'auth') {
        return {
          ok: false,
          conflict: false,
          reason: 'auth',
        }
      }
      if (error.type === 'network') {
        return {
          ok: false,
          conflict: false,
          reason: 'network',
        }
      }
    }

    const reason = inferUploadFailureReason(error)
    if (reason) {
      return {
        ok: false,
        conflict: false,
        reason,
      }
    }
    throw error
  }

  return async (payload) => {
    const branchCandidates = buildBranchCandidates(activeBranch)
    let lastError: unknown = null

    for (let index = 0; index < branchCandidates.length; index += 1) {
      const candidateBranch = branchCandidates[index]!
      try {
        const result = await attemptUpload(payload, candidateBranch)
        activeBranch = candidateBranch
        return result
      } catch (error) {
        lastError = error
        const hasFallback = index < branchCandidates.length - 1
        if (hasFallback && isBranchNotFoundError(error)) {
          continue
        }
        return mapUploadError(error, payload, candidateBranch)
      }
    }

    return mapUploadError(lastError, payload, activeBranch)
  }
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

export async function uploadMetadataToGitee(
  params: UploadMetadataToGiteeParams,
): Promise<UploadResult> {
  const token = params.token.trim()
  const owner = params.owner.trim()
  const repo = params.repo.trim()
  const requestPath = params.request.path.trim() || DEFAULT_METADATA_PATH
  const branch = params.request.branch.trim() || DEFAULT_BRANCH
  const encryptedContent = params.request.encryptedContent.trim()
  const message = params.request.message.trim()
  const expectedSha = params.request.expectedSha?.trim()

  if (!token) {
    throw new Error('Gitee Token 不能为空')
  }
  if (!owner || !repo) {
    throw new Error('owner 与 repo 不能为空')
  }
  if (!encryptedContent) {
    throw new Error('上传内容不能为空')
  }
  if (!message) {
    throw new Error('提交说明不能为空')
  }

  const requestUrl = `${normalizeApiBase(params.apiBase)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(requestPath)}`
  const fetcher = params.fetchImpl ?? fetch

  try {
    const method = expectedSha ? 'PUT' : 'POST'
    const body: {
      content: string
      message: string
      branch: string
      sha?: string
    } = {
      content: encryptedContent,
      message,
      branch,
    }

    if (expectedSha) {
      body.sha = expectedSha
    }

    const response = await fetcher(requestUrl, {
      method,
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (response.ok) {
      let remoteSha: string | undefined
      try {
        const responseBody = (await response.json()) as {
          sha?: unknown
          content?: { sha?: unknown }
          commit?: { sha?: unknown }
        }
        if (typeof responseBody.content?.sha === 'string') {
          remoteSha = responseBody.content.sha
        } else if (typeof responseBody.sha === 'string') {
          remoteSha = responseBody.sha
        } else if (typeof responseBody.commit?.sha === 'string') {
          remoteSha = responseBody.commit.sha
        }
      } catch {
        remoteSha = undefined
      }

      return {
        ok: true,
        conflict: false,
        remoteSha,
      }
    }

    const remoteMessage = await readRemoteErrorMessage(response)
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        conflict: false,
        reason: 'auth',
      }
    }

    if (looksLikeShaMismatch(response.status, remoteMessage)) {
      return {
        ok: false,
        conflict: true,
        reason: 'sha_mismatch',
      }
    }

    return {
      ok: false,
      conflict: false,
    }
  } catch (error) {
    const reason = inferUploadFailureReason(error)
    if (reason === 'auth') {
      return {
        ok: false,
        conflict: false,
        reason: 'auth',
      }
    }
    if (reason === 'network') {
      return {
        ok: false,
        conflict: false,
        reason: 'network',
      }
    }
    throw error
  }
}

export function createGiteeMetadataUploader(
  params: ReadRemoteMetadataFromGiteeParams,
): (request: UploadRequest) => Promise<UploadResult> {
  return (request: UploadRequest) =>
    uploadMetadataToGitee({
      ...params,
      request,
    })
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
