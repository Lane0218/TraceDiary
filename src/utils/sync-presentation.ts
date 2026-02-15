import type { AuthState } from '../hooks/use-auth'
import type { SaveNowResult, SyncStatus } from '../hooks/use-sync'
import type { PullDiaryFailureReason } from '../services/sync'

export const BUSY_SYNC_MESSAGE = '当前正在上传，请稍候重试'
export const MANUAL_SYNC_PENDING_MESSAGE = '手动上传已触发，正在等待结果...'
export const MANUAL_SYNC_OFFLINE_MESSAGE = '当前处于离线状态，请恢复网络后再次手动上传'
export const MANUAL_PULL_PENDING_MESSAGE = '手动拉取已触发，正在等待结果...'
export const MANUAL_PULL_BUSY_MESSAGE = '当前正在拉取，请稍候重试'
const MANUAL_SYNC_NETWORK_MESSAGE = '网络异常，请检查后再次手动上传'
const MANUAL_SYNC_FALLBACK_ERROR_MESSAGE = '上传未完成，请重试'
const MANUAL_PULL_NOT_FOUND_MESSAGE = '云端不存在该条目，未拉取到可用内容'
const MANUAL_PULL_NETWORK_MESSAGE = '网络异常，请检查后再次手动拉取'
const MANUAL_PULL_AUTH_MESSAGE = '鉴权失败，请重新解锁或更新 Token 配置'
const MANUAL_PULL_FALLBACK_ERROR_MESSAGE = '拉取失败，请稍后重试'

interface SyncPresentationInput {
  canSyncToRemote: boolean
  hasConflict: boolean
  isOffline: boolean
  hasPendingRetry: boolean
  status: SyncStatus
  hasUnsyncedChanges: boolean
  lastSyncedAt: string | null
}

export type SyncActionType = 'pull' | 'push'
export type SyncActionStatus = 'idle' | 'running' | 'success' | 'error'

export interface SyncActionSnapshot {
  status: SyncActionStatus
  at: string | null
  reason: string | null
}

const SYNC_ACTION_STORAGE_PREFIX = 'trace-diary:sync-action'

function buildSyncActionStorageKey(scope: string, entryId: string, action: SyncActionType): string {
  const normalizedScope = scope.trim() || 'default'
  const normalizedEntryId = entryId.trim() || 'default'
  return `${SYNC_ACTION_STORAGE_PREFIX}:${normalizedScope}:${normalizedEntryId}:${action}`
}

function toActionLabel(action: SyncActionType): string {
  return action === 'pull' ? 'Pull' : 'Push'
}

function toActionStatusLabel(status: SyncActionStatus): string {
  if (status === 'running') {
    return '进行中'
  }
  if (status === 'success') {
    return '成功'
  }
  if (status === 'error') {
    return '失败'
  }
  return '未执行'
}

function isValidSyncActionStatus(value: unknown): value is SyncActionStatus {
  return value === 'idle' || value === 'running' || value === 'success' || value === 'error'
}

function parseTimestamp(value: string): number | null {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return null
  }
  return timestamp
}

function formatAbsoluteTime(isoTime: string): string {
  const parsed = parseTimestamp(isoTime)
  if (parsed === null) {
    return isoTime
  }

  const date = new Date(parsed)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

export function createIdleSyncActionSnapshot(): SyncActionSnapshot {
  return {
    status: 'idle',
    at: null,
    reason: null,
  }
}

export function getSyncActionLabel(action: SyncActionType, snapshot: SyncActionSnapshot): string {
  const actionLabel = toActionLabel(action)
  const statusLabel = toActionStatusLabel(snapshot.status)
  if (!snapshot.at) {
    return `${actionLabel}：${statusLabel}`
  }
  return `${actionLabel}：${statusLabel} · ${formatAbsoluteTime(snapshot.at)}`
}

export function getSyncActionToneClass(status: SyncActionStatus): string {
  if (status === 'success') {
    return 'td-status-success'
  }
  if (status === 'error') {
    return 'td-status-danger'
  }
  if (status === 'running') {
    return 'td-status-warning'
  }
  return 'td-status-muted'
}

export function loadSyncActionSnapshot(
  scope: string,
  entryId: string,
  action: SyncActionType,
): SyncActionSnapshot {
  if (typeof window === 'undefined') {
    return createIdleSyncActionSnapshot()
  }

  const key = buildSyncActionStorageKey(scope, entryId, action)
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return createIdleSyncActionSnapshot()
    }
    const parsed = JSON.parse(raw) as Partial<SyncActionSnapshot>
    if (!isValidSyncActionStatus(parsed.status)) {
      return createIdleSyncActionSnapshot()
    }
    const at =
      typeof parsed.at === 'string' && parsed.at.trim() && parseTimestamp(parsed.at) !== null
        ? parsed.at.trim()
        : null
    const reason = typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim() : null
    return {
      status: parsed.status,
      at,
      reason,
    }
  } catch {
    return createIdleSyncActionSnapshot()
  }
}

export function saveSyncActionSnapshot(
  scope: string,
  entryId: string,
  action: SyncActionType,
  snapshot: SyncActionSnapshot,
): void {
  if (typeof window === 'undefined') {
    return
  }

  const key = buildSyncActionStorageKey(scope, entryId, action)
  try {
    window.localStorage.setItem(key, JSON.stringify(snapshot))
  } catch {
    // 本地存储失败不阻塞主流程。
  }
}

export function getSessionLabel(stage: AuthState['stage']): string {
  if (stage === 'ready') {
    return '会话：已解锁'
  }
  if (stage === 'checking') {
    return '会话：认证处理中'
  }
  return '会话：待认证'
}

export function getSyncLabel(input: SyncPresentationInput): string {
  if (!input.canSyncToRemote) {
    return '云端未就绪'
  }
  if (input.hasConflict) {
    return '检测到冲突'
  }
  if (input.isOffline) {
    return '网络离线'
  }
  if (input.hasPendingRetry) {
    return '云端待同步'
  }
  if (input.status === 'syncing') {
    return '云端同步中'
  }
  if (input.status === 'success') {
    return '云端已同步'
  }
  if (input.status === 'error') {
    return '云端同步失败'
  }
  if (!input.hasUnsyncedChanges && input.lastSyncedAt) {
    return '云端已同步'
  }
  return '云端待同步'
}

export function getSyncToneClass(input: SyncPresentationInput): string {
  if (!input.canSyncToRemote) {
    return 'td-status-warning'
  }
  if (input.hasConflict) {
    return 'td-status-danger'
  }
  if (input.isOffline || input.hasPendingRetry) {
    return 'td-status-warning'
  }
  if (input.status === 'syncing') {
    return 'td-status-warning'
  }
  if (input.status === 'success') {
    return 'td-status-success'
  }
  if (input.status === 'error') {
    return 'td-status-danger'
  }
  if (input.hasUnsyncedChanges) {
    return 'td-status-warning'
  }
  return 'td-status-muted'
}

export function getManualSyncFailureMessage(result: Extract<SaveNowResult, { ok: false }>): string {
  if (result.code === 'stale') {
    return BUSY_SYNC_MESSAGE
  }
  if (result.code === 'offline') {
    return MANUAL_SYNC_OFFLINE_MESSAGE
  }
  if (result.code === 'network') {
    return MANUAL_SYNC_NETWORK_MESSAGE
  }
  return result.errorMessage || MANUAL_SYNC_FALLBACK_ERROR_MESSAGE
}

export function getDisplayedManualSyncError(manualSyncError: string | null, status: SyncStatus): string | null {
  if (status !== 'syncing' && manualSyncError === BUSY_SYNC_MESSAGE) {
    return null
  }
  return manualSyncError
}

export function getManualPullFailureMessage(reason?: PullDiaryFailureReason): string {
  if (reason === 'not_found') {
    return MANUAL_PULL_NOT_FOUND_MESSAGE
  }
  if (reason === 'network') {
    return MANUAL_PULL_NETWORK_MESSAGE
  }
  if (reason === 'auth') {
    return MANUAL_PULL_AUTH_MESSAGE
  }
  return MANUAL_PULL_FALLBACK_ERROR_MESSAGE
}
