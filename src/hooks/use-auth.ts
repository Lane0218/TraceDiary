import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  calibrateKdfParams,
  decryptToken as decryptTokenWithPassword,
  deriveDataEncryptionKeyFromMasterPassword,
  encryptToken as encryptTokenWithPassword,
  hashMasterPassword as hashMasterPasswordWithKdf,
} from '../services/crypto'
import {
  hasCloudSession,
  loadCloudConfigForCurrentUser,
  saveCloudConfigForCurrentUser,
} from '../services/cloud-config'
import { validateGiteeRepoAccess as validateGiteeRepoAccessService } from '../services/gitee'
import { saveSyncBaseline } from '../services/indexeddb'
import { pullRemoteDiariesToIndexedDb } from '../services/sync'
import type { AppConfig, KdfParams } from '../types/config'
import { emitRemotePullCompletedEvent } from '../utils/remote-sync-events'
export type { AppConfig, KdfParams } from '../types/config'

const DAY_MS = 24 * 60 * 60 * 1000
const PASSWORD_VALIDATION = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/
const DEFAULT_GITEE_BRANCH = 'master'

const CONFIG_STORAGE_KEY = 'trace-diary:app-config'
export const AUTH_LOCK_STATE_KEY = 'trace-diary:auth:lock-state'
export const AUTH_PASSWORD_EXPIRY_KEY = 'trace-diary:auth:password-expiry'
const AUTH_UNLOCK_SECRET_KEY = 'trace-diary:auth:unlock-secret'
const AUTH_UNLOCKED_TOKEN_KEY = 'trace-diary:auth:unlocked-token'
const AUTH_UNLOCKED_DATA_KEY = 'trace-diary:auth:unlocked-data-key'
const UNLOCK_KEY_LENGTH = 32

export interface RepoRef {
  owner: string
  repoName: string
  canonicalRepo: string
}

export interface PullRemoteDiariesPayload {
  token: string
  owner: string
  repoName: string
  branch: string
  dataEncryptionKey: CryptoKey
}

export interface AuthDependencies {
  loadConfig: () => Promise<AppConfig | null>
  saveConfig: (config: AppConfig) => Promise<void>
  loadCloudConfig: () => Promise<AppConfig | null>
  saveCloudConfig: (config: AppConfig) => Promise<void>
  hasCloudSession: () => Promise<boolean>
  validateGiteeRepoAccess: (payload: { owner: string; repoName: string; token: string }) => Promise<void>
  generateKdfParams: (masterPassword: string) => Promise<KdfParams>
  hashMasterPassword: (payload: { masterPassword: string; kdfParams: KdfParams }) => Promise<string>
  encryptToken: (payload: { token: string; masterPassword: string; kdfParams: KdfParams }) => Promise<string>
  decryptToken: (payload: { encryptedToken: string; masterPassword: string; kdfParams: KdfParams }) => Promise<string>
  deriveDataEncryptionKey: (masterPassword: string) => Promise<CryptoKey>
  pullRemoteDiariesToLocal: (payload: PullRemoteDiariesPayload) => Promise<void>
  restoreUnlockedToken?: (config: AppConfig) => Promise<string | null>
  now: () => number
}

export interface InitializeAuthPayload {
  repoInput: string
  token: string
  masterPassword: string
  giteeBranch?: string
}

export interface UnlockPayload {
  masterPassword: string
}

export interface RefreshTokenPayload {
  token: string
  masterPassword?: string
}

export interface UpdateConnectionSettingsPayload {
  repoInput: string
  giteeBranch?: string
  token?: string
  masterPassword?: string
}

export type CloudSaveStatus = 'success' | 'not_applicable' | 'error'

export interface UpdateConnectionSettingsResult {
  ok: boolean
  message: string
  checkedAt: string
  cloudSaveStatus: CloudSaveStatus
  cloudSaveMessage: string | null
}

export interface AuthState {
  stage: 'checking' | 'needs-setup' | 'needs-unlock' | 'needs-token-refresh' | 'ready'
  config: AppConfig | null
  tokenInMemory: string | null
  dataEncryptionKey: CryptoKey | null
  isLocked: boolean
  passwordExpired: boolean
  needsMasterPasswordForTokenRefresh: boolean
  tokenRefreshReason: 'decrypt-failed' | 'token-invalid' | 'missing-token' | null
  errorMessage: string | null
  initialPullStatus?: 'idle' | 'pulling' | 'success' | 'error'
  initialPullError?: string | null
}

export interface UseAuthResult {
  state: AuthState
  getMasterPasswordError: (masterPassword: string) => string | null
  initializeFirstTime: (payload: InitializeAuthPayload) => Promise<void>
  restoreConfigFromCloud: () => Promise<void>
  unlockWithMasterPassword: (payload: UnlockPayload) => Promise<void>
  updateTokenCiphertext: (payload: RefreshTokenPayload) => Promise<void>
  updateConnectionSettings: (payload: UpdateConnectionSettingsPayload) => Promise<UpdateConnectionSettingsResult>
  lockNow: () => void
  clearError: () => void
}

function parseGiteeRepo(repoInput: string): RepoRef {
  const trimmed = repoInput.trim()
  if (!trimmed) {
    throw new Error('请填写仓库地址')
  }

  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL
    try {
      url = new URL(trimmed)
    } catch {
      throw new Error('仓库地址格式错误')
    }

    const pathChunks = url.pathname
      .replace(/\.git$/i, '')
      .split('/')
      .filter(Boolean)

    if (url.hostname !== 'gitee.com' || pathChunks.length < 2) {
      throw new Error('仓库地址需为 gitee.com/<owner>/<repo>')
    }

    return {
      owner: pathChunks[0],
      repoName: pathChunks[1],
      canonicalRepo: `${pathChunks[0]}/${pathChunks[1]}`,
    }
  }

  const plainPath = trimmed.replace(/\.git$/i, '')
  const parts = plainPath.split('/').filter(Boolean)
  if (parts.length !== 2) {
    throw new Error('仓库地址需为 <owner>/<repo>')
  }

  return {
    owner: parts[0],
    repoName: parts[1],
    canonicalRepo: `${parts[0]}/${parts[1]}`,
  }
}

function normalizeGiteeBranch(branchInput: string | undefined): string {
  const normalized = branchInput?.trim()
  if (normalized) {
    return normalized
  }
  return DEFAULT_GITEE_BRANCH
}

function normalizeAppConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    giteeBranch: normalizeGiteeBranch(config.giteeBranch),
  }
}

function getMasterPasswordError(masterPassword: string): string | null {
  if (!masterPassword) {
    return '请填写主密码'
  }

  if (!PASSWORD_VALIDATION.test(masterPassword)) {
    return '主密码至少 8 位，且必须包含字母和数字'
  }

  return null
}

function readLockState(): boolean {
  return localStorage.getItem(AUTH_LOCK_STATE_KEY) !== 'unlocked'
}

function writeLockState(locked: boolean): void {
  localStorage.setItem(AUTH_LOCK_STATE_KEY, locked ? 'locked' : 'unlocked')
}

function readExpiryTimestamp(): number | null {
  const raw = localStorage.getItem(AUTH_PASSWORD_EXPIRY_KEY)
  if (!raw) {
    return null
  }

  const timestamp = Number(raw)
  if (!Number.isFinite(timestamp)) {
    return null
  }

  return timestamp
}

function writeExpiryTimestamp(expiryTimestamp: number): void {
  localStorage.setItem(AUTH_PASSWORD_EXPIRY_KEY, String(expiryTimestamp))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function importUnlockStateKey(secretBase64: string): Promise<CryptoKey> {
  const secret = base64ToBytes(secretBase64)
  return crypto.subtle.importKey('raw', toArrayBuffer(secret), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function getOrCreateUnlockSecret(): string {
  const existing = localStorage.getItem(AUTH_UNLOCK_SECRET_KEY)
  if (existing) {
    return existing
  }

  const bytes = crypto.getRandomValues(new Uint8Array(UNLOCK_KEY_LENGTH))
  const secret = bytesToBase64(bytes)
  localStorage.setItem(AUTH_UNLOCK_SECRET_KEY, secret)
  return secret
}

async function encryptWithUnlockSecret(plaintext: Uint8Array): Promise<string> {
  const secret = getOrCreateUnlockSecret()
  const key = await importUnlockStateKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(plaintext))

  const cipher = new Uint8Array(encrypted)
  const payload = new Uint8Array(iv.length + cipher.length)
  payload.set(iv, 0)
  payload.set(cipher, iv.length)
  return bytesToBase64(payload)
}

async function decryptWithUnlockSecret(payloadBase64: string): Promise<Uint8Array | null> {
  const secret = localStorage.getItem(AUTH_UNLOCK_SECRET_KEY)
  if (!secret) {
    return null
  }

  const payload = base64ToBytes(payloadBase64)
  if (payload.byteLength <= 12) {
    return null
  }

  const iv = payload.subarray(0, 12)
  const cipher = payload.subarray(12)
  const key = await importUnlockStateKey(secret)
  try {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(cipher))
    return new Uint8Array(decrypted)
  } catch {
    return null
  }
}

async function cacheUnlockedToken(token: string): Promise<void> {
  const plaintext = new TextEncoder().encode(token)
  const encryptedPayload = await encryptWithUnlockSecret(plaintext)
  localStorage.setItem(AUTH_UNLOCKED_TOKEN_KEY, encryptedPayload)
}

async function restoreUnlockedTokenFromCache(): Promise<string | null> {
  const cached = localStorage.getItem(AUTH_UNLOCKED_TOKEN_KEY)
  if (!cached) {
    return null
  }

  const decrypted = await decryptWithUnlockSecret(cached)
  if (!decrypted) {
    return null
  }
  return new TextDecoder().decode(decrypted)
}

async function cacheUnlockedDataEncryptionKey(dataEncryptionKey: CryptoKey): Promise<void> {
  const rawKey = await crypto.subtle.exportKey('raw', dataEncryptionKey)
  const encryptedPayload = await encryptWithUnlockSecret(new Uint8Array(rawKey))
  localStorage.setItem(AUTH_UNLOCKED_DATA_KEY, encryptedPayload)
}

async function restoreUnlockedDataEncryptionKeyFromCache(): Promise<CryptoKey | null> {
  const cached = localStorage.getItem(AUTH_UNLOCKED_DATA_KEY)
  if (!cached) {
    return null
  }

  const rawKey = await decryptWithUnlockSecret(cached)
  if (!rawKey || rawKey.byteLength === 0) {
    return null
  }

  return crypto.subtle.importKey('raw', toArrayBuffer(rawKey), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function clearUnlockStateCache(): void {
  localStorage.removeItem(AUTH_UNLOCKED_TOKEN_KEY)
  localStorage.removeItem(AUTH_UNLOCKED_DATA_KEY)
  localStorage.removeItem(AUTH_UNLOCK_SECRET_KEY)
}

function createDefaultDependencies(): AuthDependencies {
  return {
    loadConfig: async () => {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
      if (!raw) {
        return null
      }

      try {
        return JSON.parse(raw) as AppConfig
      } catch {
        return null
      }
    },
    saveConfig: async (config) => {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
    },
    loadCloudConfig: async () => {
      return loadCloudConfigForCurrentUser()
    },
    saveCloudConfig: async (config) => {
      await saveCloudConfigForCurrentUser(config)
    },
    hasCloudSession: async () => {
      return hasCloudSession()
    },
    validateGiteeRepoAccess: async ({ owner, repoName, token }) => {
      const result = await validateGiteeRepoAccessService({
        token,
        repoUrl: `https://gitee.com/${owner}/${repoName}`,
      })

      if (!result.ok) {
        throw new Error(result.error)
      }
    },
    generateKdfParams: (masterPassword) => calibrateKdfParams(masterPassword),
    hashMasterPassword: async ({ masterPassword, kdfParams }) => {
      return hashMasterPasswordWithKdf(masterPassword, kdfParams)
    },
    encryptToken: async ({ token, masterPassword, kdfParams }) => {
      return encryptTokenWithPassword(token, masterPassword, kdfParams)
    },
    decryptToken: async ({ encryptedToken, masterPassword, kdfParams }) => {
      return decryptTokenWithPassword(encryptedToken, masterPassword, kdfParams)
    },
    deriveDataEncryptionKey: async (masterPassword) => {
      return deriveDataEncryptionKeyFromMasterPassword(masterPassword)
    },
    pullRemoteDiariesToLocal: async (payload) => {
      await pullRemoteDiariesToIndexedDb(
        {
          token: payload.token,
          owner: payload.owner,
          repo: payload.repoName,
          branch: payload.branch,
          dataEncryptionKey: payload.dataEncryptionKey,
        },
        {
          saveBaseline: async (record) => {
            await saveSyncBaseline(record)
          },
        },
      )
    },
    restoreUnlockedToken: async () => {
      return restoreUnlockedTokenFromCache()
    },
    now: () => Date.now(),
  }
}

function createInitialState(): AuthState {
  return {
    stage: 'checking',
    config: null,
    tokenInMemory: null,
    dataEncryptionKey: null,
    isLocked: true,
    passwordExpired: true,
    needsMasterPasswordForTokenRefresh: true,
    tokenRefreshReason: null,
    errorMessage: null,
    initialPullStatus: 'idle',
    initialPullError: null,
  }
}

function calculateExpiry(now: number): { iso: string; timestamp: number } {
  const timestamp = now + 7 * DAY_MS
  return {
    iso: new Date(timestamp).toISOString(),
    timestamp,
  }
}

export function useAuth(customDependencies?: Partial<AuthDependencies>): UseAuthResult {
  const dependencies = useMemo<AuthDependencies>(() => {
    const defaults = createDefaultDependencies()
    return {
      ...defaults,
      ...customDependencies,
    }
  }, [customDependencies])

  const masterPasswordRef = useRef<string | null>(null)
  const lastReadyPullKeyRef = useRef<string | null>(null)
  const [state, setState] = useState<AuthState>(createInitialState)

  const markUnlockedWithFreshExpiry = useCallback(
    (now: number): { iso: string; timestamp: number } => {
      const expiry = calculateExpiry(now)
      writeLockState(false)
      writeExpiryTimestamp(expiry.timestamp)
      return expiry
    },
    [],
  )

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, errorMessage: null }))
  }, [])

  const syncCloudConfigBestEffort = useCallback(
    async (
      config: AppConfig,
    ): Promise<{
      status: CloudSaveStatus
      message: string | null
    }> => {
      let hasSession = false
      try {
        hasSession = await dependencies.hasCloudSession()
      } catch (error) {
        return {
          status: 'error',
          message: error instanceof Error ? error.message : '云端配置状态检测失败，请稍后重试',
        }
      }

      if (!hasSession) {
        return {
          status: 'not_applicable',
          message: '当前未登录云端账号，配置仅保存在本地。',
        }
      }

      try {
        await dependencies.saveCloudConfig(config)
        return {
          status: 'success',
          message: '云端配置已同步。',
        }
      } catch (error) {
        return {
          status: 'error',
          message: error instanceof Error ? error.message : '云端配置保存失败，请稍后重试',
        }
      }
    },
    [dependencies],
  )

  const bootstrap = useCallback(async () => {
    setState(createInitialState())

    let rawConfig = await dependencies.loadConfig()
    if (!rawConfig) {
      try {
        const cloudConfig = await dependencies.loadCloudConfig()
        if (cloudConfig) {
          rawConfig = normalizeAppConfig(cloudConfig)
          await dependencies.saveConfig(rawConfig)
        }
      } catch {
        // 云端配置读取失败时回退本地初始化流程，不阻断游客体验。
      }
    }
    if (!rawConfig) {
      writeLockState(true)
      clearUnlockStateCache()
      setState({
        stage: 'needs-setup',
        config: null,
        tokenInMemory: null,
        dataEncryptionKey: null,
        isLocked: true,
        passwordExpired: true,
        needsMasterPasswordForTokenRefresh: true,
        tokenRefreshReason: null,
        errorMessage: null,
      })
      return
    }
    const config = normalizeAppConfig(rawConfig)
    if (rawConfig.giteeBranch !== config.giteeBranch) {
      try {
        await dependencies.saveConfig(config)
        await syncCloudConfigBestEffort(config)
      } catch {
        // 配置迁移失败不应阻断认证流程，后续仍可继续使用默认分支。
      }
    }

    const now = dependencies.now()
    const storedExpiry = readExpiryTimestamp() ?? new Date(config.passwordExpiry).getTime()
    const passwordExpired = !Number.isFinite(storedExpiry) || storedExpiry <= now
    const isLocked = readLockState() || passwordExpired

    if (isLocked) {
      writeLockState(true)
      if (passwordExpired) {
        clearUnlockStateCache()
      }
      setState({
        stage: 'needs-unlock',
        config,
        tokenInMemory: null,
        dataEncryptionKey: null,
        isLocked: true,
        passwordExpired,
        needsMasterPasswordForTokenRefresh: true,
        tokenRefreshReason: null,
        errorMessage: null,
      })
      return
    }

    if (!config.encryptedToken) {
      clearUnlockStateCache()
      setState({
        stage: 'needs-token-refresh',
        config,
        tokenInMemory: null,
        dataEncryptionKey: null,
        isLocked: false,
        passwordExpired: false,
        needsMasterPasswordForTokenRefresh: masterPasswordRef.current === null,
        tokenRefreshReason: 'missing-token',
        errorMessage: null,
      })
      return
    }

    try {
      const restoredToken =
        (await dependencies.restoreUnlockedToken?.(config)) ??
        (masterPasswordRef.current
          ? await dependencies.decryptToken({
              encryptedToken: config.encryptedToken,
              masterPassword: masterPasswordRef.current,
              kdfParams: config.kdfParams,
            })
          : null)

      if (!restoredToken) {
        throw new Error('无法从本地锁态恢复 token')
      }

      await dependencies.validateGiteeRepoAccess({
        owner: config.giteeOwner,
        repoName: config.giteeRepoName,
        token: restoredToken,
      })

      const dataEncryptionKey = masterPasswordRef.current
        ? await dependencies.deriveDataEncryptionKey(masterPasswordRef.current)
        : await restoreUnlockedDataEncryptionKeyFromCache()

      if (!dataEncryptionKey) {
        writeLockState(true)
        localStorage.removeItem(AUTH_UNLOCKED_DATA_KEY)
        setState({
          stage: 'needs-unlock',
          config,
          tokenInMemory: null,
          dataEncryptionKey: null,
          isLocked: true,
          passwordExpired: false,
          needsMasterPasswordForTokenRefresh: true,
          tokenRefreshReason: null,
          errorMessage: '当前会话缺少数据加密密钥，请重新解锁。',
        })
        return
      }

      try {
        await cacheUnlockedToken(restoredToken)
        await cacheUnlockedDataEncryptionKey(dataEncryptionKey)
      } catch {
        // 缓存写入失败不阻断当前会话，仅影响后续免输恢复能力。
      }

      setState({
        stage: 'ready',
        config,
        tokenInMemory: restoredToken,
        dataEncryptionKey,
        isLocked: false,
        passwordExpired: false,
        needsMasterPasswordForTokenRefresh: false,
        tokenRefreshReason: null,
        errorMessage: null,
      })
    } catch {
      clearUnlockStateCache()
      setState({
        stage: 'needs-token-refresh',
        config,
        tokenInMemory: null,
        dataEncryptionKey: null,
        isLocked: false,
        passwordExpired: false,
        needsMasterPasswordForTokenRefresh: masterPasswordRef.current === null,
        tokenRefreshReason: 'decrypt-failed',
        errorMessage: 'Token 恢复失败，请补输 Token 覆盖本地密文',
      })
    }
  }, [dependencies, syncCloudConfigBestEffort])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (state.stage !== 'ready') {
      lastReadyPullKeyRef.current = null
      return
    }

    const config = state.config
    const token = state.tokenInMemory
    const dataEncryptionKey = state.dataEncryptionKey
    if (!config || !token || !dataEncryptionKey) {
      return
    }

    const branch = config.giteeBranch?.trim() || DEFAULT_GITEE_BRANCH
    const pullKey = `${config.giteeOwner}/${config.giteeRepoName}@${branch}:${token}`
    if (lastReadyPullKeyRef.current === pullKey) {
      return
    }
    lastReadyPullKeyRef.current = pullKey

    let cancelled = false
    setState((prev) => ({
      ...prev,
      initialPullStatus: 'pulling',
      initialPullError: null,
    }))

    void dependencies
      .pullRemoteDiariesToLocal({
        token,
        owner: config.giteeOwner,
        repoName: config.giteeRepoName,
        branch,
        dataEncryptionKey,
      })
      .then(() => {
        if (cancelled) {
          return
        }

        emitRemotePullCompletedEvent()
        setState((prev) => {
          if (prev.stage !== 'ready') {
            return prev
          }

          return {
            ...prev,
            initialPullStatus: 'success',
            initialPullError: null,
          }
        })
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        setState((prev) => {
          if (prev.stage !== 'ready') {
            return prev
          }

          return {
            ...prev,
            initialPullStatus: 'error',
            initialPullError: error instanceof Error ? error.message : '云端下拉失败',
          }
        })
      })

    return () => {
      cancelled = true
    }
  }, [
    dependencies,
    state.config,
    state.dataEncryptionKey,
    state.stage,
    state.tokenInMemory,
  ])

  const initializeFirstTime = useCallback(
    async (payload: InitializeAuthPayload) => {
      clearError()

      const repoRef = parseGiteeRepo(payload.repoInput)
      if (!payload.token.trim()) {
        setState((prev) => ({ ...prev, errorMessage: '请填写 Gitee Token' }))
        return
      }

      const passwordError = getMasterPasswordError(payload.masterPassword)
      if (passwordError) {
        setState((prev) => ({ ...prev, errorMessage: passwordError }))
        return
      }

      setState((prev) => ({ ...prev, stage: 'checking' }))

      try {
        await dependencies.validateGiteeRepoAccess({
          owner: repoRef.owner,
          repoName: repoRef.repoName,
          token: payload.token.trim(),
        })

        const kdfParams = await dependencies.generateKdfParams(payload.masterPassword)
        const passwordHash = await dependencies.hashMasterPassword({
          masterPassword: payload.masterPassword,
          kdfParams,
        })
        const encryptedToken = await dependencies.encryptToken({
          token: payload.token.trim(),
          masterPassword: payload.masterPassword,
          kdfParams,
        })

        const now = dependencies.now()
        const expiry = markUnlockedWithFreshExpiry(now)
        const dataEncryptionKey = await dependencies.deriveDataEncryptionKey(payload.masterPassword)
        const config: AppConfig = {
          giteeRepo: `https://gitee.com/${repoRef.canonicalRepo}`,
          giteeOwner: repoRef.owner,
          giteeRepoName: repoRef.repoName,
          giteeBranch: normalizeGiteeBranch(payload.giteeBranch),
          passwordHash,
          passwordExpiry: expiry.iso,
          kdfParams,
          encryptedToken,
          tokenCipherVersion: 'v1',
        }

        await dependencies.saveConfig(config)
        try {
          await cacheUnlockedToken(payload.token.trim())
          await cacheUnlockedDataEncryptionKey(dataEncryptionKey)
        } catch {
          // 缓存写入失败不阻断当前会话，仅影响后续免输恢复能力。
        }
        masterPasswordRef.current = payload.masterPassword
        setState({
          stage: 'ready',
          config,
          tokenInMemory: payload.token.trim(),
          dataEncryptionKey,
          isLocked: false,
          passwordExpired: false,
          needsMasterPasswordForTokenRefresh: false,
          tokenRefreshReason: null,
          errorMessage: null,
        })
      } catch (error) {
        setState((prev) => ({
          ...prev,
          stage: 'needs-setup',
          errorMessage: error instanceof Error ? error.message : '初始化失败，请重试',
        }))
      }
    },
    [clearError, dependencies, markUnlockedWithFreshExpiry],
  )

  const unlockWithMasterPassword = useCallback(
    async (payload: UnlockPayload) => {
      clearError()

      if (!state.config) {
        setState((prev) => ({ ...prev, stage: 'needs-setup', errorMessage: '本地配置不存在，请先初始化' }))
        return
      }

      const passwordError = getMasterPasswordError(payload.masterPassword)
      if (passwordError) {
        setState((prev) => ({ ...prev, errorMessage: passwordError }))
        return
      }

      setState((prev) => ({ ...prev, stage: 'checking' }))

      try {
        const passwordHash = await dependencies.hashMasterPassword({
          masterPassword: payload.masterPassword,
          kdfParams: state.config.kdfParams,
        })

        if (passwordHash !== state.config.passwordHash) {
          throw new Error('主密码错误')
        }

        masterPasswordRef.current = payload.masterPassword
        const now = dependencies.now()
        const expiry = markUnlockedWithFreshExpiry(now)
        let nextConfig: AppConfig = {
          ...state.config,
          passwordExpiry: expiry.iso,
        }

        if (!state.config.encryptedToken) {
          await dependencies.saveConfig(nextConfig)
          await syncCloudConfigBestEffort(nextConfig)
          clearUnlockStateCache()
          setState({
            stage: 'needs-token-refresh',
            config: nextConfig,
            tokenInMemory: null,
            dataEncryptionKey: null,
            isLocked: false,
            passwordExpired: false,
            needsMasterPasswordForTokenRefresh: false,
            tokenRefreshReason: 'missing-token',
            errorMessage: '当前没有可用 Token 密文，请补输 Token',
          })
          return
        }

        let token: string
        try {
          token = await dependencies.decryptToken({
            encryptedToken: state.config.encryptedToken,
            masterPassword: payload.masterPassword,
            kdfParams: state.config.kdfParams,
          })
        } catch {
          nextConfig = {
            ...state.config,
            passwordExpiry: expiry.iso,
          }
          await dependencies.saveConfig(nextConfig)
          await syncCloudConfigBestEffort(nextConfig)
          clearUnlockStateCache()
          setState({
            stage: 'needs-token-refresh',
            config: nextConfig,
            tokenInMemory: null,
            dataEncryptionKey: null,
            isLocked: false,
            passwordExpired: false,
            needsMasterPasswordForTokenRefresh: false,
            tokenRefreshReason: 'decrypt-failed',
            errorMessage: 'Token 解密失败，请补输 Token 并覆盖本地密文',
          })
          return
        }

        try {
          await dependencies.validateGiteeRepoAccess({
            owner: state.config.giteeOwner,
            repoName: state.config.giteeRepoName,
            token,
          })
        } catch {
          nextConfig = {
            ...state.config,
            passwordExpiry: expiry.iso,
          }
          await dependencies.saveConfig(nextConfig)
          await syncCloudConfigBestEffort(nextConfig)
          clearUnlockStateCache()
          setState({
            stage: 'needs-token-refresh',
            config: nextConfig,
            tokenInMemory: null,
            dataEncryptionKey: null,
            isLocked: false,
            passwordExpired: false,
            needsMasterPasswordForTokenRefresh: false,
            tokenRefreshReason: 'token-invalid',
            errorMessage: 'Token 已失效，请补输新的 Token',
          })
          return
        }

        const dataEncryptionKey = await dependencies.deriveDataEncryptionKey(payload.masterPassword)
        nextConfig = {
          ...state.config,
          passwordExpiry: expiry.iso,
        }
        await dependencies.saveConfig(nextConfig)
        await syncCloudConfigBestEffort(nextConfig)
        try {
          await cacheUnlockedToken(token)
          await cacheUnlockedDataEncryptionKey(dataEncryptionKey)
        } catch {
          // 缓存写入失败不阻断当前会话，仅影响后续免输恢复能力。
        }

        setState({
          stage: 'ready',
          config: nextConfig,
          tokenInMemory: token,
          dataEncryptionKey,
          isLocked: false,
          passwordExpired: false,
          needsMasterPasswordForTokenRefresh: false,
          tokenRefreshReason: null,
          errorMessage: null,
        })
      } catch (error) {
        setState((prev) => ({
          ...prev,
          stage: 'needs-unlock',
          errorMessage: error instanceof Error ? error.message : '解锁失败，请重试',
        }))
      }
    },
    [clearError, dependencies, markUnlockedWithFreshExpiry, state.config, syncCloudConfigBestEffort],
  )

  const updateTokenCiphertext = useCallback(
    async (payload: RefreshTokenPayload) => {
      clearError()

      if (!state.config) {
        setState((prev) => ({ ...prev, stage: 'needs-setup', errorMessage: '本地配置不存在，请先初始化' }))
        return
      }

      const token = payload.token.trim()
      if (!token) {
        setState((prev) => ({ ...prev, errorMessage: '请填写新的 Gitee Token' }))
        return
      }

      const masterPassword = payload.masterPassword?.trim() || masterPasswordRef.current
      if (!masterPassword) {
        setState((prev) => ({ ...prev, errorMessage: '请补充主密码后再覆盖 Token 密文' }))
        return
      }

      setState((prev) => ({ ...prev, stage: 'checking' }))

      try {
        const passwordHash = await dependencies.hashMasterPassword({
          masterPassword,
          kdfParams: state.config.kdfParams,
        })
        if (passwordHash !== state.config.passwordHash) {
          throw new Error('主密码错误，无法覆盖 Token 密文')
        }

        await dependencies.validateGiteeRepoAccess({
          owner: state.config.giteeOwner,
          repoName: state.config.giteeRepoName,
          token,
        })

        const encryptedToken = await dependencies.encryptToken({
          token,
          masterPassword,
          kdfParams: state.config.kdfParams,
        })

        const now = dependencies.now()
        const expiry = markUnlockedWithFreshExpiry(now)
        const dataEncryptionKey = await dependencies.deriveDataEncryptionKey(masterPassword)
        const nextConfig: AppConfig = {
          ...state.config,
          passwordExpiry: expiry.iso,
          encryptedToken,
          tokenCipherVersion: 'v1',
        }

        await dependencies.saveConfig(nextConfig)
        await syncCloudConfigBestEffort(nextConfig)
        try {
          await cacheUnlockedToken(token)
          await cacheUnlockedDataEncryptionKey(dataEncryptionKey)
        } catch {
          // 缓存写入失败不阻断当前会话，仅影响后续免输恢复能力。
        }
        masterPasswordRef.current = masterPassword

        setState({
          stage: 'ready',
          config: nextConfig,
          tokenInMemory: token,
          dataEncryptionKey,
          isLocked: false,
          passwordExpired: false,
          needsMasterPasswordForTokenRefresh: false,
          tokenRefreshReason: null,
          errorMessage: null,
        })
      } catch (error) {
        setState((prev) => ({
          ...prev,
          stage: 'needs-token-refresh',
          needsMasterPasswordForTokenRefresh: masterPasswordRef.current === null,
          errorMessage: error instanceof Error ? error.message : 'Token 覆盖失败，请重试',
        }))
      }
    },
    [clearError, dependencies, markUnlockedWithFreshExpiry, state.config, syncCloudConfigBestEffort],
  )

  const updateConnectionSettings = useCallback(
    async (payload: UpdateConnectionSettingsPayload): Promise<UpdateConnectionSettingsResult> => {
      clearError()
      const checkedAt = new Date(dependencies.now()).toISOString()

      const fail = (message: string): UpdateConnectionSettingsResult => ({
        ok: false,
        message,
        checkedAt,
        cloudSaveStatus: 'not_applicable',
        cloudSaveMessage: null,
      })

      if (state.stage !== 'ready' || !state.config) {
        const message = '当前会话未就绪，请先完成解锁'
        setState((prev) => ({ ...prev, errorMessage: message }))
        return fail(message)
      }

      let repoRef: RepoRef
      try {
        repoRef = parseGiteeRepo(payload.repoInput)
      } catch (error) {
        const message = error instanceof Error ? error.message : '仓库地址格式错误'
        setState((prev) => ({ ...prev, errorMessage: message }))
        return fail(message)
      }
      const nextBranch = normalizeGiteeBranch(payload.giteeBranch)
      const nextToken = payload.token?.trim() ?? ''
      const hasTokenUpdate = nextToken.length > 0
      const validationToken = hasTokenUpdate ? nextToken : state.tokenInMemory?.trim() ?? ''
      if (!validationToken) {
        const message = '当前会话缺少可用 Token，请输入 Token 后重试'
        setState((prev) => ({ ...prev, errorMessage: message }))
        return fail(message)
      }

      setState((prev) => ({ ...prev, stage: 'checking' }))

      try {
        await dependencies.validateGiteeRepoAccess({
          owner: repoRef.owner,
          repoName: repoRef.repoName,
          token: validationToken,
        })

        let nextEncryptedToken = state.config.encryptedToken
        let nextTokenInMemory = state.tokenInMemory
        let nextDataEncryptionKey = state.dataEncryptionKey
        let nextPasswordExpiry = state.config.passwordExpiry
        let masterPasswordForUpdate = masterPasswordRef.current

        if (hasTokenUpdate) {
          masterPasswordForUpdate = payload.masterPassword?.trim() || masterPasswordRef.current
          if (!masterPasswordForUpdate) {
            throw new Error('请补充主密码后再更新 Token')
          }

          const passwordHash = await dependencies.hashMasterPassword({
            masterPassword: masterPasswordForUpdate,
            kdfParams: state.config.kdfParams,
          })
          if (passwordHash !== state.config.passwordHash) {
            throw new Error('主密码错误，无法更新 Token')
          }

          nextEncryptedToken = await dependencies.encryptToken({
            token: nextToken,
            masterPassword: masterPasswordForUpdate,
            kdfParams: state.config.kdfParams,
          })
          nextTokenInMemory = nextToken

          if (!nextDataEncryptionKey) {
            nextDataEncryptionKey = await dependencies.deriveDataEncryptionKey(masterPasswordForUpdate)
          }

          const now = dependencies.now()
          const expiry = markUnlockedWithFreshExpiry(now)
          nextPasswordExpiry = expiry.iso
        }

        const nextConfig: AppConfig = {
          ...state.config,
          giteeRepo: `https://gitee.com/${repoRef.canonicalRepo}`,
          giteeOwner: repoRef.owner,
          giteeRepoName: repoRef.repoName,
          giteeBranch: nextBranch,
          passwordExpiry: nextPasswordExpiry,
          encryptedToken: nextEncryptedToken,
          tokenCipherVersion: 'v1',
        }

        await dependencies.saveConfig(nextConfig)
        const cloudSyncResult = await syncCloudConfigBestEffort(nextConfig)

        if (hasTokenUpdate && nextTokenInMemory && nextDataEncryptionKey) {
          try {
            await cacheUnlockedToken(nextTokenInMemory)
            await cacheUnlockedDataEncryptionKey(nextDataEncryptionKey)
          } catch {
            // 缓存写入失败不阻断当前会话，仅影响后续免输恢复能力。
          }
        }

        if (hasTokenUpdate && masterPasswordForUpdate) {
          masterPasswordRef.current = masterPasswordForUpdate
        }

        setState({
          stage: 'ready',
          config: nextConfig,
          tokenInMemory: nextTokenInMemory,
          dataEncryptionKey: nextDataEncryptionKey,
          isLocked: false,
          passwordExpired: false,
          needsMasterPasswordForTokenRefresh: false,
          tokenRefreshReason: null,
          errorMessage: null,
          initialPullStatus: 'idle',
          initialPullError: null,
        })
        return {
          ok: true,
          message: '同步配置校验通过，本地保存成功。',
          checkedAt,
          cloudSaveStatus: cloudSyncResult.status,
          cloudSaveMessage: cloudSyncResult.message,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '连接配置更新失败，请重试'
        setState((prev) => ({
          ...prev,
          stage: 'ready',
          errorMessage: message,
        }))
        return fail(message)
      }
    },
    [
      clearError,
      dependencies,
      markUnlockedWithFreshExpiry,
      state.config,
      state.dataEncryptionKey,
      state.stage,
      state.tokenInMemory,
      syncCloudConfigBestEffort,
    ],
  )

  const restoreConfigFromCloud = useCallback(async () => {
    clearError()
    setState((prev) => ({ ...prev, stage: 'checking' }))

    try {
      const cloudConfig = await dependencies.loadCloudConfig()
      if (!cloudConfig) {
        throw new Error('云端尚无可恢复的配置，请先在当前设备完成初始化并保存。')
      }

      const normalized = normalizeAppConfig(cloudConfig)
      await dependencies.saveConfig(normalized)
      writeLockState(true)
      clearUnlockStateCache()
      masterPasswordRef.current = null

      setState({
        stage: 'needs-unlock',
        config: normalized,
        tokenInMemory: null,
        dataEncryptionKey: null,
        isLocked: true,
        passwordExpired: false,
        needsMasterPasswordForTokenRefresh: true,
        tokenRefreshReason: null,
        errorMessage: null,
        initialPullStatus: 'idle',
        initialPullError: null,
      })
    } catch (error) {
      setState((prev) => ({
        ...prev,
        stage: prev.config ? prev.stage : 'needs-setup',
        errorMessage: error instanceof Error ? error.message : '云端恢复失败，请稍后重试',
      }))
    }
  }, [clearError, dependencies])

  const lockNow = useCallback(() => {
    writeLockState(true)
    clearUnlockStateCache()
    masterPasswordRef.current = null
    setState((prev) => ({
      ...prev,
      stage: prev.config ? 'needs-unlock' : 'needs-setup',
      tokenInMemory: null,
      dataEncryptionKey: null,
      isLocked: true,
      passwordExpired: true,
      needsMasterPasswordForTokenRefresh: true,
      tokenRefreshReason: null,
      initialPullStatus: 'idle',
      initialPullError: null,
    }))
  }, [])

  return {
    state,
    getMasterPasswordError,
    initializeFirstTime,
    restoreConfigFromCloud,
    unlockWithMasterPassword,
    updateTokenCiphertext,
    updateConnectionSettings,
    lockNow,
    clearError,
  }
}
