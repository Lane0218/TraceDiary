import type { AuthState } from '../hooks/use-auth'

interface SyncAvailabilityInput {
  stage: AuthState['stage']
  giteeOwner: string | null | undefined
  giteeRepoName: string | null | undefined
  tokenInMemory: string | null
  dataEncryptionKey: CryptoKey | null
}

interface SyncAvailabilityResult {
  canSyncToRemote: boolean
  disabledMessage: string
}

export function getSyncAvailability(input: SyncAvailabilityInput): SyncAvailabilityResult {
  const canSyncToRemote =
    input.stage === 'ready' &&
    Boolean(input.tokenInMemory) &&
    Boolean(input.dataEncryptionKey) &&
    Boolean(input.giteeOwner) &&
    Boolean(input.giteeRepoName)

  if (input.stage !== 'ready') {
    return {
      canSyncToRemote,
      disabledMessage: '云端同步未就绪：请先完成解锁。',
    }
  }

  if (!input.giteeOwner || !input.giteeRepoName) {
    return {
      canSyncToRemote,
      disabledMessage: '云端同步未就绪：请先配置 Gitee 仓库。',
    }
  }

  if (!input.tokenInMemory) {
    return {
      canSyncToRemote,
      disabledMessage: '云端同步未就绪：当前会话缺少可用 Token，请重新解锁/配置。',
    }
  }

  if (!input.dataEncryptionKey) {
    return {
      canSyncToRemote,
      disabledMessage: '云端同步未就绪：当前会话缺少数据加密密钥，请重新解锁。',
    }
  }

  return {
    canSyncToRemote,
    disabledMessage: '云端同步未就绪。',
  }
}
