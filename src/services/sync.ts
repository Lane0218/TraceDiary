import {
  getDiary,
  getMetadata,
  getSyncBaseline,
  saveDiary,
  saveMetadata,
  type DiaryRecord,
  type SyncBaselineRecord,
} from './indexeddb'
import { GiteeApiError, readGiteeFileContents, upsertGiteeFile } from './gitee'
import { decryptWithAesGcm, encryptWithAesGcm } from './crypto'
import type { Metadata } from '../types/metadata'
import { getDiarySyncEntryId, getDiarySyncFingerprint } from '../utils/sync-dirty'
import { countVisibleChars } from '../utils/word-count'

const DEFAULT_METADATA_PATH = 'metadata.json.enc'
const DEFAULT_BRANCH = 'master'

export type SyncTriggerReason = 'manual'

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
  expectedSha?: string
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
  buildCommitMessage?: (payload: UploadMetadataPayload<TMetadata>, commitTimestamp: string) => string
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

export interface PullRemoteDiariesToIndexedDbParams {
  token: string
  owner: string
  repo: string
  dataEncryptionKey: CryptoKey
  branch?: string
  apiBase?: string
  fetchImpl?: typeof fetch
  useAccessTokenQuery?: boolean
}

export interface PullRemoteDiariesToIndexedDbOptions {
  readRemoteMetadata?: () => Promise<RemoteMetadataFile>
  readRemoteDiaryFile?: (path: string) => Promise<{ exists: boolean; content?: string; sha?: string }>
  loadLocalDiary?: (entryId: string) => Promise<DiaryRecord | null>
  loadBaseline?: (entryId: string) => Promise<SyncBaselineRecord | null>
  saveLocalDiary?: (record: DiaryRecord) => Promise<void>
  saveBaseline?: (record: {
    entryId: string
    fingerprint: string
    syncedAt: string
    remoteSha?: string
  }) => Promise<void>
}

export interface PullRemoteDiariesToIndexedDbResult {
  total: number
  inserted: number
  updated: number
  skipped: number
  conflicted: number
  failed: number
  downloaded: number
  conflicts: Array<{ entryId: string; reason: string }>
  failedItems: Array<{ entryId: string; reason: string }>
  metadataMissing: boolean
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
  syncMetadata?: boolean
  branch?: string
  apiBase?: string
  fetchImpl?: typeof fetch
  useAccessTokenQuery?: boolean
  now?: () => string
}

export type PullDiaryFailureReason = 'not_found' | 'network' | 'auth'

export interface PullDiaryFromGiteeParams {
  token: string
  owner: string
  repo: string
  dataEncryptionKey: CryptoKey
  metadata: DiarySyncMetadata
  branch?: string
  apiBase?: string
  fetchImpl?: typeof fetch
  useAccessTokenQuery?: boolean
  now?: () => string
}

export interface PullDiaryFromGiteeResult {
  ok: boolean
  conflict: boolean
  reason?: PullDiaryFailureReason
  pulledMetadata?: DiarySyncMetadata
  remoteSha?: string
  syncedAt?: string
  conflictPayload?: UploadConflictPayload<DiarySyncMetadata>
}

function defaultBuildCommitMessage<TMetadata>(
  payload: UploadMetadataPayload<TMetadata>,
  commitTimestamp: string,
): string {
  void payload
  return `chore: metadata @ ${commitTimestamp}`
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

function toBeijingSecondTimestamp(isoString: string): string {
  const parsed = new Date(isoString)
  if (Number.isNaN(parsed.getTime())) {
    return isoString
  }

  const beijingOffsetMilliseconds = 8 * 60 * 60 * 1000
  const beijingDate = new Date(parsed.getTime() + beijingOffsetMilliseconds)
  const year = beijingDate.getUTCFullYear()
  const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(beijingDate.getUTCDate()).padStart(2, '0')
  const hours = String(beijingDate.getUTCHours()).padStart(2, '0')
  const minutes = String(beijingDate.getUTCMinutes()).padStart(2, '0')
  const seconds = String(beijingDate.getUTCSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+08:00`
}

function normalizeEncryptedContent(encryptedContent: string): string {
  return encryptedContent.replace(/\s+/g, '')
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

  if (!dependencies.uploadRequest || !dependencies.serializeMetadata) {
    return placeholderUploadMetadata<TMetadata>
  }

  const metadataPath = (dependencies.path ?? DEFAULT_METADATA_PATH).trim() || DEFAULT_METADATA_PATH
  const branch = (dependencies.branch ?? DEFAULT_BRANCH).trim() || DEFAULT_BRANCH
  const now = dependencies.now ?? nowIsoString
  const buildCommitMessage = dependencies.buildCommitMessage ?? defaultBuildCommitMessage
  const serializeMetadata = dependencies.serializeMetadata
  const uploadRequest = dependencies.uploadRequest

  return async (
    payload: UploadMetadataPayload<TMetadata>,
  ): Promise<UploadMetadataResult<TMetadata>> => {
    try {
      const encryptedContent = await serializeMetadata(payload.metadata)
      const commitTimestamp = toBeijingSecondTimestamp(now())

      const request: UploadRequest = {
        path: metadataPath,
        encryptedContent,
        message: buildCommitMessage(payload, commitTimestamp),
        branch,
      }

      if (payload.expectedSha?.trim()) {
        request.expectedSha = payload.expectedSha.trim()
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

function buildDiaryCommitMessage(metadata: DiarySyncMetadata, commitTimestamp: string): string {
  if (metadata.type === 'daily') {
    return `chore: 日记 ${metadata.date} @ ${commitTimestamp}`
  }
  return `chore: 年度总结 ${metadata.year} @ ${commitTimestamp}`
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

function looksLikeFileExistsConflict(status: number | undefined, message: string | undefined): boolean {
  if (status !== 400 && status !== 409 && status !== 422) {
    return false
  }
  if (!message) {
    return false
  }

  const normalized = message.toLowerCase()
  return /(already\s+exists|file\s+exists|path.*exists|已存在|同名文件)/i.test(normalized)
}

function isDiaryPushConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const status = error instanceof GiteeApiError ? error.status : pickStatusFromError(error)
  return isShaMismatchError(error) || looksLikeFileExistsConflict(status, error.message)
}

function normalizeDiaryContentForCompare(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '')
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

function createEmptyMetadata(nowIso: string): Metadata {
  return {
    version: '1',
    lastSync: nowIso,
    entries: [],
  }
}

function normalizeMetadata(raw: unknown, nowIso: string): Metadata {
  if (!raw || typeof raw !== 'object') {
    return createEmptyMetadata(nowIso)
  }

  const candidate = raw as Partial<Metadata>
  const normalizedEntries = Array.isArray(candidate.entries)
    ? candidate.entries.filter((entry): entry is Metadata['entries'][number] => {
        if (!entry || typeof entry !== 'object') {
          return false
        }
        const target = entry as Partial<Metadata['entries'][number]>
        if (target.type === 'daily') {
          return (
            typeof target.date === 'string' &&
            typeof target.filename === 'string' &&
            typeof target.wordCount === 'number' &&
            typeof target.createdAt === 'string' &&
            typeof target.modifiedAt === 'string'
          )
        }

        if (target.type === 'yearly_summary') {
          return (
            typeof target.year === 'number' &&
            typeof target.date === 'string' &&
            typeof target.filename === 'string' &&
            typeof target.wordCount === 'number' &&
            typeof target.createdAt === 'string' &&
            typeof target.modifiedAt === 'string'
          )
        }

        return false
      })
    : []

  return {
    version: typeof candidate.version === 'string' && candidate.version.trim() ? candidate.version : '1',
    lastSync: typeof candidate.lastSync === 'string' && candidate.lastSync.trim() ? candidate.lastSync : nowIso,
    entries: normalizedEntries,
  }
}

function upsertMetadataEntryFromDiary(
  metadata: Metadata,
  diary: DiarySyncMetadata,
  nowIso: string,
): Metadata {
  const entries = [...metadata.entries]

  if (diary.type === 'daily') {
    const existingIndex = entries.findIndex((entry) => entry.type === 'daily' && entry.date === diary.date)
    const existing = existingIndex >= 0 ? entries[existingIndex] : null
    const nextEntry: Metadata['entries'][number] = {
      type: 'daily',
      date: diary.date as `${number}-${number}-${number}`,
      filename: `${diary.date}.md.enc`,
      wordCount: countVisibleChars(diary.content),
      createdAt: existing?.createdAt ?? diary.modifiedAt ?? nowIso,
      modifiedAt: diary.modifiedAt ?? nowIso,
    }

    if (existingIndex >= 0) {
      entries[existingIndex] = nextEntry
    } else {
      entries.push(nextEntry)
    }
  } else {
    const summaryDate = `${diary.year}-12-31` as `${number}-${number}-${number}`
    const existingIndex = entries.findIndex(
      (entry) => entry.type === 'yearly_summary' && entry.year === diary.year,
    )
    const existing = existingIndex >= 0 ? entries[existingIndex] : null
    const nextEntry: Metadata['entries'][number] = {
      type: 'yearly_summary',
      year: diary.year,
      date: summaryDate,
      filename: `${diary.year}-summary.md.enc`,
      wordCount: countVisibleChars(diary.content),
      createdAt: existing?.createdAt ?? diary.modifiedAt ?? nowIso,
      modifiedAt: diary.modifiedAt ?? nowIso,
    }

    if (existingIndex >= 0) {
      entries[existingIndex] = nextEntry
    } else {
      entries.push(nextEntry)
    }
  }

  return {
    version: metadata.version || '1',
    lastSync: nowIso,
    entries,
  }
}

export function createDiaryUploadExecutor(
  params: CreateDiaryUploadExecutorParams,
): UploadMetadataFn<DiarySyncMetadata> {
  let activeBranch = (params.branch ?? DEFAULT_BRANCH).trim() || DEFAULT_BRANCH
  const now = params.now ?? nowIsoString
  const useAccessTokenQuery = params.useAccessTokenQuery ?? true
  const shouldSyncMetadata = params.syncMetadata !== false

  const syncMetadataForDiary = async (
    payload: UploadMetadataPayload<DiarySyncMetadata>,
    targetBranch: string,
  ): Promise<void> => {
    if (!shouldSyncMetadata) {
      return
    }

    const maxAttempts = 2
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const nowIso = now()
      const remoteMetadata = await readGiteeFileContents({
        token: params.token,
        owner: params.owner,
        repo: params.repo,
        path: DEFAULT_METADATA_PATH,
        ref: targetBranch,
        apiBase: params.apiBase,
        fetchImpl: params.fetchImpl,
        useAccessTokenQuery,
      })

      let baseMetadata = createEmptyMetadata(nowIso)
      if (remoteMetadata.exists && typeof remoteMetadata.content === 'string' && remoteMetadata.content.trim()) {
        try {
          const decryptedContent = await decryptWithAesGcm(
            normalizeEncryptedContent(remoteMetadata.content),
            params.dataEncryptionKey,
          )
          const parsed = defaultParseMetadata<unknown>(decryptedContent)
          baseMetadata = normalizeMetadata(parsed, nowIso)
        } catch {
          baseMetadata = createEmptyMetadata(nowIso)
        }
      }

      const mergedMetadata = upsertMetadataEntryFromDiary(baseMetadata, payload.metadata, nowIso)
      const encryptedMetadata = await encryptWithAesGcm(
        JSON.stringify(mergedMetadata),
        params.dataEncryptionKey,
      )
      try {
        await upsertGiteeFile({
          token: params.token,
          owner: params.owner,
          repo: params.repo,
          path: DEFAULT_METADATA_PATH,
          content: encryptedMetadata,
          message: defaultBuildCommitMessage(payload, toBeijingSecondTimestamp(nowIso)),
          branch: targetBranch,
          expectedSha: remoteMetadata.exists ? remoteMetadata.sha : undefined,
          apiBase: params.apiBase,
          fetchImpl: params.fetchImpl,
          useAccessTokenQuery,
        })
        return
      } catch (error) {
        if (!(isShaMismatchError(error) && attempt < maxAttempts - 1)) {
          return
        }
      }
    }
  }

  const attemptUpload = async (
    payload: UploadMetadataPayload<DiarySyncMetadata>,
    targetBranch: string,
  ): Promise<UploadMetadataResult<DiarySyncMetadata>> => {
    const metadata = payload.metadata
    const path = buildDiaryPath(metadata)
    const expectedSha = payload.expectedSha?.trim()
    const commitTimestamp = toBeijingSecondTimestamp(now())
    const encryptedContent = await encryptWithAesGcm(metadata.content, params.dataEncryptionKey)
    const upsertResult = await upsertGiteeFile({
      token: params.token,
      owner: params.owner,
      repo: params.repo,
      path,
      content: encryptedContent,
      message: buildDiaryCommitMessage(metadata, commitTimestamp),
      branch: targetBranch,
      expectedSha,
      apiBase: params.apiBase,
      fetchImpl: params.fetchImpl,
      useAccessTokenQuery,
    })

    if (shouldSyncMetadata) {
      try {
        await syncMetadataForDiary(payload, targetBranch)
      } catch {
        // metadata 同步失败不应阻塞主日记上传结果，避免用户误判为整次同步失败。
      }
    }

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

    if (isDiaryPushConflictError(error)) {
      let remoteMetadata: DiarySyncMetadata | undefined
      let remoteSha: string | undefined
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
          remoteSha = latestRemote.sha
          const decryptedRemoteContent = await decryptWithAesGcm(
            normalizeEncryptedContent(latestRemote.content),
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
        remoteSha,
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

  const tryRecoverUploadWithoutExpectedSha = async (
    error: unknown,
    payload: UploadMetadataPayload<DiarySyncMetadata>,
    targetBranch: string,
  ): Promise<UploadMetadataResult<DiarySyncMetadata> | null> => {
    if (payload.expectedSha?.trim()) {
      return null
    }
    if (!isDiaryPushConflictError(error)) {
      return null
    }

    const metadata = payload.metadata
    const path = buildDiaryPath(metadata)
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

    if (!latestRemote.exists || !latestRemote.sha) {
      return null
    }

    if (typeof latestRemote.content === 'string') {
      try {
        const remoteContent = await decryptWithAesGcm(
          normalizeEncryptedContent(latestRemote.content),
          params.dataEncryptionKey,
        )
        const normalizedRemote = normalizeDiaryContentForCompare(remoteContent)
        const normalizedLocal = normalizeDiaryContentForCompare(metadata.content)
        if (normalizedRemote === normalizedLocal) {
          return {
            ok: true,
            conflict: false,
            remoteSha: latestRemote.sha,
            syncedAt: now(),
          }
        }
      } catch {
        // 远端解密失败时继续按覆盖流程处理。
      }
    }

    const encryptedContent = await encryptWithAesGcm(metadata.content, params.dataEncryptionKey)
    const commitTimestamp = toBeijingSecondTimestamp(now())
    const overwriteResult = await upsertGiteeFile({
      token: params.token,
      owner: params.owner,
      repo: params.repo,
      path,
      content: encryptedContent,
      message: buildDiaryCommitMessage(metadata, commitTimestamp),
      branch: targetBranch,
      expectedSha: latestRemote.sha,
      apiBase: params.apiBase,
      fetchImpl: params.fetchImpl,
      useAccessTokenQuery,
    })

    if (shouldSyncMetadata) {
      try {
        await syncMetadataForDiary(payload, targetBranch)
      } catch {
        // metadata 同步失败不应阻断主日记上传结果，避免用户误判为整次同步失败。
      }
    }

    return {
      ok: true,
      conflict: false,
      remoteSha: overwriteResult.sha,
      syncedAt: now(),
    }
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
        try {
          const recovered = await tryRecoverUploadWithoutExpectedSha(error, payload, candidateBranch)
          if (recovered) {
            activeBranch = candidateBranch
            return recovered
          }
        } catch (recoverError) {
          lastError = recoverError
          return mapUploadError(recoverError, payload, candidateBranch)
        }
        return mapUploadError(error, payload, candidateBranch)
      }
    }

    return mapUploadError(lastError, payload, activeBranch)
  }
}

export async function pullDiaryFromGitee(
  params: PullDiaryFromGiteeParams,
): Promise<PullDiaryFromGiteeResult> {
  const now = params.now ?? nowIsoString
  const branch = (params.branch ?? DEFAULT_BRANCH).trim() || DEFAULT_BRANCH
  const useAccessTokenQuery = params.useAccessTokenQuery ?? true
  const localMetadata = params.metadata
  const path = buildDiaryPath(localMetadata)

  try {
    const remoteFile = await readGiteeFileContents({
      token: params.token,
      owner: params.owner,
      repo: params.repo,
      path,
      ref: branch,
      apiBase: params.apiBase,
      fetchImpl: params.fetchImpl,
      useAccessTokenQuery,
    })

    if (!remoteFile.exists || typeof remoteFile.content !== 'string' || !remoteFile.content.trim()) {
      return {
        ok: false,
        conflict: false,
        reason: 'not_found',
      }
    }

    const remoteContent = await decryptWithAesGcm(
      normalizeEncryptedContent(remoteFile.content),
      params.dataEncryptionKey,
    )
    const pulledMetadata = toRemoteDiaryMetadata(localMetadata, remoteContent, now)
    const normalizedLocal = normalizeDiaryContentForCompare(localMetadata.content)
    const normalizedRemote = normalizeDiaryContentForCompare(remoteContent)
    const hasLocalContent = normalizedLocal.trim().length > 0

    if (hasLocalContent && normalizedLocal !== normalizedRemote) {
      return {
        ok: false,
        conflict: true,
        remoteSha: remoteFile.sha,
        conflictPayload: {
          local: localMetadata,
          remote: pulledMetadata,
        },
      }
    }

    return {
      ok: true,
      conflict: false,
      pulledMetadata,
      remoteSha: remoteFile.sha,
      syncedAt: now(),
    }
  } catch (error) {
    if (error instanceof GiteeApiError) {
      if (error.status === 404) {
        return {
          ok: false,
          conflict: false,
          reason: 'not_found',
        }
      }
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
    if (reason === 'auth' || reason === 'network') {
      return {
        ok: false,
        conflict: false,
        reason,
      }
    }

    throw error
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

  const remoteFile = await readGiteeFileContents({
    token,
    owner,
    repo,
    path: metadataPath,
    ref: branch,
    apiBase: params.apiBase,
    fetchImpl: params.fetchImpl,
  })

  if (!remoteFile.exists) {
    return { missing: true }
  }

  const encryptedContent = remoteFile.content?.trim() ?? ''
  if (!encryptedContent.trim()) {
    throw new Error('远端 metadata 文件内容为空')
  }

  return {
    missing: false,
    encryptedContent,
    sha: remoteFile.sha,
  }
}

export function createGiteeMetadataReader(
  params: ReadRemoteMetadataFromGiteeParams,
): () => Promise<RemoteMetadataFile> {
  return () => readRemoteMetadataFromGitee(params)
}

function toDiaryRecordFromMetadataEntry(
  entry: Metadata['entries'][number],
  content: string,
): DiaryRecord {
  if (entry.type === 'daily') {
    return {
      id: `daily:${entry.date}`,
      type: 'daily',
      date: entry.date,
      filename: entry.filename,
      content,
      wordCount: countVisibleChars(content),
      createdAt: entry.createdAt,
      modifiedAt: entry.modifiedAt,
    }
  }

  return {
    id: `summary:${entry.year}`,
    type: 'yearly_summary',
    year: entry.year,
    date: entry.date,
    filename: entry.filename,
    content,
    wordCount: countVisibleChars(content),
    createdAt: entry.createdAt,
    modifiedAt: entry.modifiedAt,
  }
}

function parseTimeToMs(value: string | undefined): number | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return parsed
}

function shouldOverwriteLocalDiary(
  local: DiaryRecord,
  remoteModifiedAt: string,
): boolean {
  const localMs = parseTimeToMs(local.modifiedAt)
  const remoteMs = parseTimeToMs(remoteModifiedAt)

  if (remoteMs !== null && localMs !== null) {
    return remoteMs > localMs
  }

  if (remoteMs !== null && localMs === null) {
    return true
  }

  return false
}

function resolveDirtyByTimestamp(localModifiedAt: string | null, syncedAt: string): boolean | null {
  const localTs = parseTimeToMs(localModifiedAt ?? undefined)
  const syncedTs = parseTimeToMs(syncedAt)
  if (localTs === null || syncedTs === null) {
    return null
  }
  return localTs > syncedTs
}

function buildEntryIdFromMetadataEntry(entry: Metadata['entries'][number]): string {
  if (entry.type === 'daily') {
    return `daily:${entry.date}`
  }
  return `summary:${entry.year}`
}

function resolveYearFromSummaryRecord(record: DiaryRecord): number | null {
  if (typeof record.year === 'number' && Number.isFinite(record.year)) {
    return record.year
  }
  const matched = record.id.match(/^summary:(\d{4})$/)
  if (!matched) {
    return null
  }
  const year = Number.parseInt(matched[1], 10)
  return Number.isFinite(year) ? year : null
}

function toLocalSyncMetadata(record: DiaryRecord): DiarySyncMetadata | null {
  const content = typeof record.content === 'string' ? record.content : null
  if (content === null) {
    return null
  }

  if (record.type === 'daily') {
    return {
      type: 'daily',
      entryId: record.id,
      date: record.date,
      content,
      modifiedAt: record.modifiedAt,
    }
  }

  const year = resolveYearFromSummaryRecord(record)
  if (year === null) {
    return null
  }
  return {
    type: 'yearly_summary',
    entryId: record.id,
    year,
    content,
    modifiedAt: record.modifiedAt,
  }
}

function hasLocalUnsyncedChanges(localRecord: DiaryRecord, baseline: SyncBaselineRecord | null): boolean {
  if (!baseline) {
    return false
  }

  const timestampDirty = resolveDirtyByTimestamp(localRecord.modifiedAt, baseline.syncedAt)
  if (timestampDirty !== null) {
    return timestampDirty
  }

  const localMetadata = toLocalSyncMetadata(localRecord)
  if (!localMetadata) {
    return false
  }
  return getDiarySyncFingerprint(localMetadata) !== baseline.fingerprint
}

export async function pullRemoteDiariesToIndexedDb(
  params: PullRemoteDiariesToIndexedDbParams,
  options: PullRemoteDiariesToIndexedDbOptions = {},
): Promise<PullRemoteDiariesToIndexedDbResult> {
  const branch = (params.branch ?? DEFAULT_BRANCH).trim() || DEFAULT_BRANCH
  const useAccessTokenQuery = params.useAccessTokenQuery ?? true
  const result: PullRemoteDiariesToIndexedDbResult = {
    total: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    conflicted: 0,
    failed: 0,
    downloaded: 0,
    conflicts: [],
    failedItems: [],
    metadataMissing: false,
  }

  const readRemoteMetadata = options.readRemoteMetadata ?? (() =>
    readRemoteMetadataFromGitee({
      token: params.token,
      owner: params.owner,
      repo: params.repo,
      branch,
      apiBase: params.apiBase,
      fetchImpl: params.fetchImpl,
    }))

  const readRemoteDiaryFile = options.readRemoteDiaryFile ?? ((path: string) =>
    readGiteeFileContents({
      token: params.token,
      owner: params.owner,
      repo: params.repo,
      path,
      ref: branch,
      apiBase: params.apiBase,
      fetchImpl: params.fetchImpl,
      useAccessTokenQuery,
    }))

  const loadLocalDiary = options.loadLocalDiary ?? ((entryId: string) => getDiary(entryId))
  const loadBaseline = options.loadBaseline ?? (async (entryId: string) => {
    try {
      return await getSyncBaseline(entryId)
    } catch {
      return null
    }
  })
  const saveLocalDiary = options.saveLocalDiary ?? ((record: DiaryRecord) => saveDiary(record))
  const saveBaseline = options.saveBaseline

  const remoteMetadata = await readRemoteMetadata()
  if (remoteMetadata.missing) {
    result.metadataMissing = true
    return result
  }

  const decryptedMetadata = await decryptWithAesGcm(
    normalizeEncryptedContent(remoteMetadata.encryptedContent),
    params.dataEncryptionKey,
  )
  const parsedMetadata = defaultParseMetadata<unknown>(decryptedMetadata)
  const metadata = normalizeMetadata(parsedMetadata, nowIsoString())
  result.total = metadata.entries.length

  for (const entry of metadata.entries) {
    try {
      const entryId = buildEntryIdFromMetadataEntry(entry)
      const localRecord = await loadLocalDiary(entryId)
      if (localRecord && !shouldOverwriteLocalDiary(localRecord, entry.modifiedAt)) {
        result.skipped += 1
        continue
      }

      if (localRecord) {
        const baseline = await loadBaseline(entryId)
        if (hasLocalUnsyncedChanges(localRecord, baseline)) {
          result.conflicted += 1
          result.conflicts.push({
            entryId,
            reason: '本地存在未同步改动，已跳过覆盖',
          })
          continue
        }
      }

      const remoteDiary = await readRemoteDiaryFile(entry.filename)
      if (!remoteDiary.exists || typeof remoteDiary.content !== 'string' || !remoteDiary.content.trim()) {
        result.failed += 1
        result.failedItems.push({
          entryId,
          reason: '远端文件不存在或内容为空',
        })
        continue
      }

      const decryptedDiaryContent = await decryptWithAesGcm(
        normalizeEncryptedContent(remoteDiary.content),
        params.dataEncryptionKey,
      )
      result.downloaded += 1
      const remoteRecord = toDiaryRecordFromMetadataEntry(entry, decryptedDiaryContent)
      const remoteSyncMetadata: DiarySyncMetadata =
        entry.type === 'daily'
          ? {
              type: 'daily',
              entryId: remoteRecord.id,
              date: entry.date,
              content: decryptedDiaryContent,
              modifiedAt: entry.modifiedAt,
            }
          : {
              type: 'yearly_summary',
              entryId: remoteRecord.id,
              year: entry.year,
              content: decryptedDiaryContent,
              modifiedAt: entry.modifiedAt,
            }
      const baselineRecord = {
        entryId: getDiarySyncEntryId(remoteSyncMetadata),
        fingerprint: getDiarySyncFingerprint(remoteSyncMetadata),
        syncedAt: entry.modifiedAt,
        remoteSha: remoteDiary.sha,
      }
      const persistBaseline = async (): Promise<void> => {
        if (!saveBaseline) {
          return
        }
        try {
          await saveBaseline(baselineRecord)
        } catch {
          // baseline 持久化失败不应影响远端下拉主流程。
        }
      }
      if (!localRecord) {
        await saveLocalDiary(remoteRecord)
        await persistBaseline()
        result.inserted += 1
        continue
      }

      await saveLocalDiary({
        ...localRecord,
        ...remoteRecord,
      })
      await persistBaseline()
      result.updated += 1
    } catch (error) {
      result.failed += 1
      result.failedItems.push({
        entryId: buildEntryIdFromMetadataEntry(entry),
        reason: error instanceof Error && error.message ? error.message : '读取或解密远端文件失败',
      })
    }
  }

  return result
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

  try {
    const upsertResult = await upsertGiteeFile({
      token,
      owner,
      repo,
      path: requestPath,
      content: encryptedContent,
      message,
      branch,
      expectedSha,
      apiBase: params.apiBase,
      fetchImpl: params.fetchImpl,
    })

    return {
      ok: true,
      conflict: false,
      remoteSha: upsertResult.sha,
    }
  } catch (error) {
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
      if (looksLikeShaMismatch(error.status, error.message)) {
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
    }

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

    if (looksLikeShaMismatch(pickStatusFromError(error), error instanceof Error ? error.message : undefined)) {
      return {
        ok: false,
        conflict: true,
        reason: 'sha_mismatch',
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
