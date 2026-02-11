import type { AuthState } from '../hooks/use-auth'
import type { SaveNowResult, SyncStatus } from '../hooks/use-sync'

export const BUSY_SYNC_MESSAGE = '当前正在上传，请稍候重试'
export const MANUAL_SYNC_PENDING_MESSAGE = '手动上传已触发，正在等待结果...'
export const MANUAL_SYNC_OFFLINE_MESSAGE = '当前处于离线状态，请恢复网络后再次手动上传'
const MANUAL_SYNC_NETWORK_MESSAGE = '网络异常，请检查后再次手动上传'
const MANUAL_SYNC_FALLBACK_ERROR_MESSAGE = '上传未完成，请重试'

interface SyncPresentationInput {
  canSyncToRemote: boolean
  hasConflict: boolean
  isOffline: boolean
  hasPendingRetry: boolean
  status: SyncStatus
  hasUnsyncedChanges: boolean
  lastSyncedAt: string | null
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
