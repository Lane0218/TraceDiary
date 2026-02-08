import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const DAY_MS = 24 * 60 * 60 * 1000
const PASSWORD_VALIDATION = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/
const DEFAULT_KDF_ITERATIONS = 300_000
const MIN_KDF_ITERATIONS = 150_000
const MAX_KDF_ITERATIONS = 1_000_000

const CONFIG_STORAGE_KEY = 'trace-diary:app-config'
export const AUTH_LOCK_STATE_KEY = 'trace-diary:auth:lock-state'
export const AUTH_PASSWORD_EXPIRY_KEY = 'trace-diary:auth:password-expiry'

export interface KdfParams {
  algorithm: 'PBKDF2'
  hash: 'SHA-256'
  iterations: number
  salt: string
}

export interface AppConfig {
  giteeRepo: string
  giteeOwner: string
  giteeRepoName: string
  passwordHash: string
  passwordExpiry: string
  kdfParams: KdfParams
  encryptedToken?: string
  tokenCipherVersion: 'v1'
}

export interface RepoRef {
  owner: string
  repoName: string
  canonicalRepo: string
}

export interface AuthDependencies {
  loadConfig: () => Promise<AppConfig | null>
  saveConfig: (config: AppConfig) => Promise<void>
  validateGiteeRepoAccess: (payload: { owner: string; repoName: string; token: string }) => Promise<void>
  generateKdfParams: (masterPassword: string) => Promise<KdfParams>
  hashMasterPassword: (payload: { masterPassword: string; kdfParams: KdfParams }) => Promise<string>
  encryptToken: (payload: { token: string; masterPassword: string; kdfParams: KdfParams }) => Promise<string>
  decryptToken: (payload: { encryptedToken: string; masterPassword: string; kdfParams: KdfParams }) => Promise<string>
  restoreUnlockedToken?: (config: AppConfig) => Promise<string | null>
  now: () => number
}

export interface InitializeAuthPayload {
  repoInput: string
  token: string
  masterPassword: string
}

export interface UnlockPayload {
  masterPassword: string
}

export interface RefreshTokenPayload {
  token: string
  masterPassword?: string
}

export interface AuthState {
  stage: 'checking' | 'needs-setup' | 'needs-unlock' | 'needs-token-refresh' | 'ready'
  config: AppConfig | null
  tokenInMemory: string | null
  isLocked: boolean
  passwordExpired: boolean
  needsMasterPasswordForTokenRefresh: boolean
  tokenRefreshReason: 'decrypt-failed' | 'token-invalid' | 'missing-token' | null
  errorMessage: string | null
}

export interface UseAuthResult {
  state: AuthState
  getMasterPasswordError: (masterPassword: string) => string | null
  initializeFirstTime: (payload: InitializeAuthPayload) => Promise<void>
  unlockWithMasterPassword: (payload: UnlockPayload) => Promise<void>
  updateTokenCiphertext: (payload: RefreshTokenPayload) => Promise<void>
  lockNow: () => void
  clearError: () => void
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copied = new Uint8Array(bytes.byteLength)
  copied.set(bytes)
  return copied.buffer
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
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

function createDefaultDependencies(): AuthDependencies {
  const importPbkdfKey = async (masterPassword: string): Promise<CryptoKey> => {
    const source = toArrayBuffer(new TextEncoder().encode(masterPassword))
    return crypto.subtle.importKey('raw', source, 'PBKDF2', false, ['deriveBits', 'deriveKey'])
  }

  const deriveBits = async (payload: {
    masterPassword: string
    kdfParams: KdfParams
    bits: number
  }): Promise<Uint8Array> => {
    const key = await importPbkdfKey(payload.masterPassword)
    const salt = fromBase64(payload.kdfParams.salt)
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: payload.kdfParams.hash,
        iterations: payload.kdfParams.iterations,
        salt: toArrayBuffer(salt),
      },
      key,
      payload.bits,
    )

    return new Uint8Array(bits)
  }

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
    validateGiteeRepoAccess: async ({ owner, repoName, token }) => {
      const endpoint = `https://gitee.com/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Token 或仓库权限校验失败')
      }
    },
    generateKdfParams: async (masterPassword) => {
      const baseline = {
        algorithm: 'PBKDF2' as const,
        hash: 'SHA-256' as const,
        iterations: DEFAULT_KDF_ITERATIONS,
        salt: toBase64(randomBytes(16)),
      }
      const start = performance.now()
      await deriveBits({ masterPassword, kdfParams: baseline, bits: 256 })
      const elapsed = Math.max(1, performance.now() - start)
      const tunedIterations = clamp(
        Math.round((DEFAULT_KDF_ITERATIONS * 260) / elapsed),
        MIN_KDF_ITERATIONS,
        MAX_KDF_ITERATIONS,
      )

      return {
        ...baseline,
        iterations: tunedIterations,
      }
    },
    hashMasterPassword: async ({ masterPassword, kdfParams }) => {
      const bits = await deriveBits({ masterPassword, kdfParams, bits: 256 })
      return toBase64(bits)
    },
    encryptToken: async ({ token, masterPassword, kdfParams }) => {
      const keyMaterial = await importPbkdfKey(masterPassword)
      const iv = randomBytes(12)
      const aesKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          hash: kdfParams.hash,
          iterations: kdfParams.iterations,
          salt: toArrayBuffer(fromBase64(kdfParams.salt)),
        },
        keyMaterial,
        {
          name: 'AES-GCM',
          length: 256,
        },
        false,
        ['encrypt'],
      )

      const plaintext = new TextEncoder().encode(token)
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        aesKey,
        toArrayBuffer(plaintext),
      )
      const encryptedBytes = new Uint8Array(encrypted)
      const merged = new Uint8Array(iv.length + encryptedBytes.length)
      merged.set(iv, 0)
      merged.set(encryptedBytes, iv.length)
      return toBase64(merged)
    },
    decryptToken: async ({ encryptedToken, masterPassword, kdfParams }) => {
      const keyMaterial = await importPbkdfKey(masterPassword)
      const bytes = fromBase64(encryptedToken)
      const iv = bytes.slice(0, 12)
      const cipher = bytes.slice(12)
      if (!iv.length || !cipher.length) {
        throw new Error('Token 密文格式错误')
      }

      const aesKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          hash: kdfParams.hash,
          iterations: kdfParams.iterations,
          salt: toArrayBuffer(fromBase64(kdfParams.salt)),
        },
        keyMaterial,
        {
          name: 'AES-GCM',
          length: 256,
        },
        false,
        ['decrypt'],
      )

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        aesKey,
        toArrayBuffer(cipher),
      )
      return new TextDecoder().decode(decrypted)
    },
    now: () => Date.now(),
  }
}

function createInitialState(): AuthState {
  return {
    stage: 'checking',
    config: null,
    tokenInMemory: null,
    isLocked: true,
    passwordExpired: true,
    needsMasterPasswordForTokenRefresh: true,
    tokenRefreshReason: null,
    errorMessage: null,
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

  const bootstrap = useCallback(async () => {
    setState(createInitialState())

    const config = await dependencies.loadConfig()
    if (!config) {
      writeLockState(true)
      setState({
        stage: 'needs-setup',
        config: null,
        tokenInMemory: null,
        isLocked: true,
        passwordExpired: true,
        needsMasterPasswordForTokenRefresh: true,
        tokenRefreshReason: null,
        errorMessage: null,
      })
      return
    }

    const now = dependencies.now()
    const storedExpiry = readExpiryTimestamp() ?? new Date(config.passwordExpiry).getTime()
    const passwordExpired = !Number.isFinite(storedExpiry) || storedExpiry <= now
    const isLocked = readLockState() || passwordExpired

    if (isLocked) {
      writeLockState(true)
      setState({
        stage: 'needs-unlock',
        config,
        tokenInMemory: null,
        isLocked: true,
        passwordExpired,
        needsMasterPasswordForTokenRefresh: true,
        tokenRefreshReason: null,
        errorMessage: null,
      })
      return
    }

    if (!config.encryptedToken) {
      setState({
        stage: 'needs-token-refresh',
        config,
        tokenInMemory: null,
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

      setState({
        stage: 'ready',
        config,
        tokenInMemory: restoredToken,
        isLocked: false,
        passwordExpired: false,
        needsMasterPasswordForTokenRefresh: false,
        tokenRefreshReason: null,
        errorMessage: null,
      })
    } catch {
      setState({
        stage: 'needs-token-refresh',
        config,
        tokenInMemory: null,
        isLocked: false,
        passwordExpired: false,
        needsMasterPasswordForTokenRefresh: masterPasswordRef.current === null,
        tokenRefreshReason: 'decrypt-failed',
        errorMessage: 'Token 恢复失败，请补输 Token 覆盖本地密文',
      })
    }
  }, [dependencies])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

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
        const config: AppConfig = {
          giteeRepo: `https://gitee.com/${repoRef.canonicalRepo}`,
          giteeOwner: repoRef.owner,
          giteeRepoName: repoRef.repoName,
          passwordHash,
          passwordExpiry: expiry.iso,
          kdfParams,
          encryptedToken,
          tokenCipherVersion: 'v1',
        }

        await dependencies.saveConfig(config)
        masterPasswordRef.current = payload.masterPassword
        setState({
          stage: 'ready',
          config,
          tokenInMemory: payload.token.trim(),
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
          setState({
            stage: 'needs-token-refresh',
            config: nextConfig,
            tokenInMemory: null,
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
          setState({
            stage: 'needs-token-refresh',
            config: nextConfig,
            tokenInMemory: null,
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
          setState({
            stage: 'needs-token-refresh',
            config: nextConfig,
            tokenInMemory: null,
            isLocked: false,
            passwordExpired: false,
            needsMasterPasswordForTokenRefresh: false,
            tokenRefreshReason: 'token-invalid',
            errorMessage: 'Token 已失效，请补输新的 Token',
          })
          return
        }

        nextConfig = {
          ...state.config,
          passwordExpiry: expiry.iso,
        }
        await dependencies.saveConfig(nextConfig)

        setState({
          stage: 'ready',
          config: nextConfig,
          tokenInMemory: token,
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
    [clearError, dependencies, markUnlockedWithFreshExpiry, state.config],
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
        const nextConfig: AppConfig = {
          ...state.config,
          passwordExpiry: expiry.iso,
          encryptedToken,
          tokenCipherVersion: 'v1',
        }

        await dependencies.saveConfig(nextConfig)
        masterPasswordRef.current = masterPassword

        setState({
          stage: 'ready',
          config: nextConfig,
          tokenInMemory: token,
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
    [clearError, dependencies, markUnlockedWithFreshExpiry, state.config],
  )

  const lockNow = useCallback(() => {
    writeLockState(true)
    masterPasswordRef.current = null
    setState((prev) => ({
      ...prev,
      stage: prev.config ? 'needs-unlock' : 'needs-setup',
      tokenInMemory: null,
      isLocked: true,
      passwordExpired: true,
      needsMasterPasswordForTokenRefresh: true,
      tokenRefreshReason: null,
    }))
  }, [])

  return {
    state,
    getMasterPasswordError,
    initializeFirstTime,
    unlockWithMasterPassword,
    updateTokenCiphertext,
    lockNow,
    clearError,
  }
}
