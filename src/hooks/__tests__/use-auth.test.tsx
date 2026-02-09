import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_LOCK_STATE_KEY,
  AUTH_PASSWORD_EXPIRY_KEY,
  type AppConfig,
  type AuthDependencies,
  type KdfParams,
  useAuth,
} from '../use-auth'

const fixedNow = Date.parse('2026-02-08T00:00:00.000Z')
const sampleKdf: KdfParams = {
  algorithm: 'PBKDF2',
  hash: 'SHA-256',
  iterations: 300_000,
  salt: 'salt-base64',
}
const sampleDataEncryptionKey = { type: 'secret' } as CryptoKey

function buildConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    giteeRepo: 'https://gitee.com/alice/trace-diary',
    giteeOwner: 'alice',
    giteeRepoName: 'trace-diary',
    giteeBranch: 'master',
    passwordHash: 'hash:master1234',
    passwordExpiry: new Date(fixedNow + 7 * 24 * 60 * 60 * 1000).toISOString(),
    kdfParams: sampleKdf,
    encryptedToken: 'cipher-old-token',
    tokenCipherVersion: 'v1',
    ...overrides,
  }
}

function buildDependencies(overrides?: Partial<AuthDependencies>): AuthDependencies {
  return {
    loadConfig: vi.fn(async () => null),
    saveConfig: vi.fn(async () => undefined),
    validateGiteeRepoAccess: vi.fn(async () => undefined),
    generateKdfParams: vi.fn(async () => sampleKdf),
    hashMasterPassword: vi.fn(async ({ masterPassword }) => `hash:${masterPassword}`),
    encryptToken: vi.fn(async ({ token }) => `cipher:${token}`),
    decryptToken: vi.fn(async () => 'token-from-cipher'),
    deriveDataEncryptionKey: vi.fn(async () => sampleDataEncryptionKey),
    restoreUnlockedToken: vi.fn(async () => null),
    now: vi.fn(() => fixedNow),
    ...overrides,
  }
}

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('首次初始化应校验输入并仅保存 encryptedToken', async () => {
    let capturedConfig: AppConfig | null = null
    const saveConfig = vi.fn(async (config: AppConfig) => {
      capturedConfig = config
    })
    const dependencies = buildDependencies({
      saveConfig,
    })

    const { result } = renderHook(() => useAuth(dependencies))

    await waitFor(() => expect(result.current.state.stage).toBe('needs-setup'))

    await act(async () => {
      await result.current.initializeFirstTime({
        repoInput: 'alice/trace-diary',
        token: 'token-plain',
        masterPassword: 'master1234',
      })
    })

    await waitFor(() => expect(result.current.state.stage).toBe('ready'))
    expect(result.current.state.config?.encryptedToken).toBe('cipher:token-plain')
    expect(result.current.state.tokenInMemory).toBe('token-plain')
    expect(result.current.state.dataEncryptionKey).toBe(sampleDataEncryptionKey)
    expect(localStorage.getItem(AUTH_LOCK_STATE_KEY)).toBe('unlocked')
    expect(Number(localStorage.getItem(AUTH_PASSWORD_EXPIRY_KEY))).toBeGreaterThan(fixedNow)

    expect(saveConfig).toHaveBeenCalledTimes(1)
    expect(capturedConfig).not.toBeNull()
    if (!capturedConfig) {
      throw new Error('capturedConfig is null')
    }
    const savedPayload = capturedConfig as AppConfig & { giteeToken?: string }
    expect(savedPayload.giteeToken).toBeUndefined()
    expect(savedPayload.encryptedToken).toBe('cipher:token-plain')
    expect(savedPayload.giteeBranch).toBe('master')
  })

  it('首次初始化应支持自定义仓库分支', async () => {
    const saveConfig = vi.fn(async (config: AppConfig) => {
      void config
    })
    const dependencies = buildDependencies({
      saveConfig,
    })

    const { result } = renderHook(() => useAuth(dependencies))
    await waitFor(() => expect(result.current.state.stage).toBe('needs-setup'))

    await act(async () => {
      await result.current.initializeFirstTime({
        repoInput: 'alice/trace-diary',
        giteeBranch: 'main',
        token: 'token-plain',
        masterPassword: 'master1234',
      })
    })

    await waitFor(() => expect(result.current.state.stage).toBe('ready'))
    expect(result.current.state.dataEncryptionKey).toBe(sampleDataEncryptionKey)
    expect(saveConfig).toHaveBeenCalledTimes(1)
    const savedConfig = saveConfig.mock.calls[0]?.[0] as AppConfig | undefined
    expect(savedConfig?.giteeBranch).toBe('main')
  })

  it('7天内未锁定时应可免输主密码恢复', async () => {
    const config = buildConfig()
    localStorage.setItem(AUTH_LOCK_STATE_KEY, 'unlocked')
    localStorage.setItem(AUTH_PASSWORD_EXPIRY_KEY, String(fixedNow + 2 * 24 * 60 * 60 * 1000))

    const dependencies = buildDependencies({
      loadConfig: vi.fn(async () => config),
      restoreUnlockedToken: vi.fn(async () => 'restored-token'),
    })

    const { result } = renderHook(() => useAuth(dependencies))

    await waitFor(() => expect(result.current.state.stage).toBe('ready'))
    expect(result.current.state.tokenInMemory).toBe('restored-token')
    expect(result.current.state.dataEncryptionKey).toBeNull()
    expect(result.current.state.isLocked).toBe(false)
    expect(result.current.state.passwordExpired).toBe(false)
  })

  it('解密失败后应允许补输 token 并覆盖本地密文', async () => {
    const config = buildConfig()
    const saveConfig = vi.fn(async () => undefined)
    const dependencies = buildDependencies({
      loadConfig: vi.fn(async () => config),
      saveConfig,
      hashMasterPassword: vi.fn(async ({ masterPassword }) => `hash:${masterPassword}`),
      decryptToken: vi.fn(async () => {
        throw new Error('cipher broken')
      }),
      validateGiteeRepoAccess: vi.fn(async ({ token }) => {
        if (token === 'token-new') {
          return
        }
        throw new Error('old token invalid')
      }),
      encryptToken: vi.fn(async ({ token }) => `cipher:${token}`),
    })

    localStorage.setItem(AUTH_LOCK_STATE_KEY, 'locked')
    localStorage.setItem(AUTH_PASSWORD_EXPIRY_KEY, String(fixedNow - 1_000))

    const { result } = renderHook(() => useAuth(dependencies))
    await waitFor(() => expect(result.current.state.stage).toBe('needs-unlock'))

    await act(async () => {
      await result.current.unlockWithMasterPassword({ masterPassword: 'master1234' })
    })

    await waitFor(() => expect(result.current.state.stage).toBe('needs-token-refresh'))
    expect(result.current.state.tokenRefreshReason).toBe('decrypt-failed')

    await act(async () => {
      await result.current.updateTokenCiphertext({
        token: 'token-new',
      })
    })

    await waitFor(() => expect(result.current.state.stage).toBe('ready'))
    expect(result.current.state.config?.encryptedToken).toBe('cipher:token-new')
    expect(result.current.state.tokenInMemory).toBe('token-new')
    expect(result.current.state.dataEncryptionKey).toBe(sampleDataEncryptionKey)
    expect(saveConfig).toHaveBeenCalled()
  })

  it('token 校验失效后应进入补输流程', async () => {
    const config = buildConfig()
    const dependencies = buildDependencies({
      loadConfig: vi.fn(async () => config),
      hashMasterPassword: vi.fn(async ({ masterPassword }) => `hash:${masterPassword}`),
      decryptToken: vi.fn(async () => 'token-old'),
      validateGiteeRepoAccess: vi.fn(async ({ token }) => {
        if (token === 'token-old') {
          throw new Error('token expired')
        }
      }),
    })

    localStorage.setItem(AUTH_LOCK_STATE_KEY, 'locked')
    localStorage.setItem(AUTH_PASSWORD_EXPIRY_KEY, String(fixedNow - 1_000))

    const { result } = renderHook(() => useAuth(dependencies))
    await waitFor(() => expect(result.current.state.stage).toBe('needs-unlock'))

    await act(async () => {
      await result.current.unlockWithMasterPassword({ masterPassword: 'master1234' })
    })

    await waitFor(() => expect(result.current.state.stage).toBe('needs-token-refresh'))
    expect(result.current.state.tokenRefreshReason).toBe('token-invalid')
    expect(result.current.state.dataEncryptionKey).toBeNull()
  })

  it('手动锁定后应清空 dataEncryptionKey', async () => {
    const dependencies = buildDependencies()
    const { result } = renderHook(() => useAuth(dependencies))
    await waitFor(() => expect(result.current.state.stage).toBe('needs-setup'))

    await act(async () => {
      await result.current.initializeFirstTime({
        repoInput: 'alice/trace-diary',
        token: 'token-plain',
        masterPassword: 'master1234',
      })
    })

    await waitFor(() => expect(result.current.state.stage).toBe('ready'))
    expect(result.current.state.dataEncryptionKey).toBe(sampleDataEncryptionKey)

    act(() => {
      result.current.lockNow()
    })

    expect(result.current.state.stage).toBe('needs-unlock')
    expect(result.current.state.dataEncryptionKey).toBeNull()
  })
})
