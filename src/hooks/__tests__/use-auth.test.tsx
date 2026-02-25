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
    loadCloudConfig: vi.fn(async () => null),
    saveCloudConfig: vi.fn(async () => undefined),
    hasCloudSession: vi.fn(async () => false),
    validateGiteeRepoAccess: vi.fn(async () => undefined),
    generateKdfParams: vi.fn(async () => sampleKdf),
    hashMasterPassword: vi.fn(async ({ masterPassword }) => `hash:${masterPassword}`),
    encryptToken: vi.fn(async ({ token }) => `cipher:${token}`),
    decryptToken: vi.fn(async () => 'token-from-cipher'),
    deriveDataEncryptionKey: vi.fn(async (masterPassword: string) => {
      void masterPassword
      return sampleDataEncryptionKey
    }),
    pullRemoteDiariesToLocal: vi.fn(async () => undefined),
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
    expect(dependencies.deriveDataEncryptionKey).toHaveBeenCalledTimes(1)
    expect(dependencies.deriveDataEncryptionKey).toHaveBeenCalledWith('master1234')
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

  it('7天内未锁定但缺少数据密钥时应回退到重新解锁', async () => {
    const config = buildConfig()
    localStorage.setItem(AUTH_LOCK_STATE_KEY, 'unlocked')
    localStorage.setItem(AUTH_PASSWORD_EXPIRY_KEY, String(fixedNow + 2 * 24 * 60 * 60 * 1000))

    const dependencies = buildDependencies({
      loadConfig: vi.fn(async () => config),
      restoreUnlockedToken: vi.fn(async () => 'restored-token'),
    })

    const { result } = renderHook(() => useAuth(dependencies))

    await waitFor(() => expect(result.current.state.stage).toBe('needs-unlock'))
    expect(result.current.state.tokenInMemory).toBeNull()
    expect(result.current.state.dataEncryptionKey).toBeNull()
    expect(result.current.state.isLocked).toBe(true)
    expect(result.current.state.passwordExpired).toBe(false)
    expect(result.current.state.errorMessage).toBe('当前会话缺少数据加密密钥，请重新解锁。')
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
    expect(dependencies.deriveDataEncryptionKey).toHaveBeenCalledTimes(1)
    expect(dependencies.deriveDataEncryptionKey).toHaveBeenCalledWith('master1234')
  })

  it('token-refresh 阶段应支持切换仓库与分支后恢复 ready', async () => {
    const config = buildConfig()
    const saveConfig = vi.fn(async () => undefined)
    const validateGiteeRepoAccess = vi.fn(async ({ owner, repoName, token }) => {
      if (owner === 'alice-next' && repoName === 'trace-diary-next' && token === 'token-new') {
        return
      }
      throw new Error('repo/token invalid')
    })
    const dependencies = buildDependencies({
      loadConfig: vi.fn(async () => config),
      saveConfig,
      hashMasterPassword: vi.fn(async ({ masterPassword }) => `hash:${masterPassword}`),
      decryptToken: vi.fn(async () => {
        throw new Error('cipher broken')
      }),
      validateGiteeRepoAccess,
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

    await act(async () => {
      await result.current.updateTokenCiphertext({
        repoInput: 'alice-next/trace-diary-next',
        giteeBranch: 'main',
        token: 'token-new',
      })
    })

    await waitFor(() => expect(result.current.state.stage).toBe('ready'))
    expect(result.current.state.config?.giteeOwner).toBe('alice-next')
    expect(result.current.state.config?.giteeRepoName).toBe('trace-diary-next')
    expect(result.current.state.config?.giteeRepo).toBe('https://gitee.com/alice-next/trace-diary-next')
    expect(result.current.state.config?.giteeBranch).toBe('main')
    expect(result.current.state.config?.encryptedToken).toBe('cipher:token-new')
    expect(result.current.state.tokenInMemory).toBe('token-new')
    expect(validateGiteeRepoAccess).toHaveBeenLastCalledWith({
      owner: 'alice-next',
      repoName: 'trace-diary-next',
      token: 'token-new',
    })
    expect(saveConfig).toHaveBeenCalled()
  })

  it('token-refresh 阶段仓库地址非法时应保持 needs-token-refresh', async () => {
    const config = buildConfig()
    const dependencies = buildDependencies({
      loadConfig: vi.fn(async () => config),
      hashMasterPassword: vi.fn(async ({ masterPassword }) => `hash:${masterPassword}`),
      decryptToken: vi.fn(async () => {
        throw new Error('cipher broken')
      }),
      validateGiteeRepoAccess: vi.fn(async () => undefined),
    })

    localStorage.setItem(AUTH_LOCK_STATE_KEY, 'locked')
    localStorage.setItem(AUTH_PASSWORD_EXPIRY_KEY, String(fixedNow - 1_000))

    const { result } = renderHook(() => useAuth(dependencies))
    await waitFor(() => expect(result.current.state.stage).toBe('needs-unlock'))

    await act(async () => {
      await result.current.unlockWithMasterPassword({ masterPassword: 'master1234' })
    })

    await waitFor(() => expect(result.current.state.stage).toBe('needs-token-refresh'))
    const previousConfig = result.current.state.config

    await act(async () => {
      await result.current.updateTokenCiphertext({
        repoInput: 'invalid-repo-input',
        token: 'token-new',
      })
    })

    await waitFor(() => expect(result.current.state.stage).toBe('needs-token-refresh'))
    expect(result.current.state.errorMessage).toBe('仓库地址需为 <owner>/<repo>')
    expect(result.current.state.config).toEqual(previousConfig)
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

  it('云端无可恢复配置时应退出 checking 并抛出错误', async () => {
    const dependencies = buildDependencies()
    const { result } = renderHook(() => useAuth(dependencies))
    await waitFor(() => expect(result.current.state.stage).toBe('needs-setup'))

    let thrownError: unknown = null
    await act(async () => {
      try {
        await result.current.restoreConfigFromCloud()
      } catch (error) {
        thrownError = error
      }
    })

    expect(thrownError).toBeInstanceOf(Error)
    expect((thrownError as Error).message).toBe('云端尚无可恢复的配置，请先在当前设备完成初始化并保存。')
    await waitFor(() => expect(result.current.state.stage).toBe('needs-setup'))
    expect(result.current.state.errorMessage).toBe('云端尚无可恢复的配置，请先在当前设备完成初始化并保存。')
  })

  it('已有本地配置时云端恢复失败应回到 needs-unlock 而非 checking', async () => {
    const config = buildConfig()
    const dependencies = buildDependencies({
      loadConfig: vi.fn(async () => config),
    })
    localStorage.setItem(AUTH_LOCK_STATE_KEY, 'locked')

    const { result } = renderHook(() => useAuth(dependencies))
    await waitFor(() => expect(result.current.state.stage).toBe('needs-unlock'))

    let thrownError: unknown = null
    await act(async () => {
      try {
        await result.current.restoreConfigFromCloud()
      } catch (error) {
        thrownError = error
      }
    })

    expect(thrownError).toBeInstanceOf(Error)
    expect((thrownError as Error).message).toBe('云端尚无可恢复的配置，请先在当前设备完成初始化并保存。')
    await waitFor(() => expect(result.current.state.stage).toBe('needs-unlock'))
    expect(result.current.state.errorMessage).toBe('云端尚无可恢复的配置，请先在当前设备完成初始化并保存。')
  })

  it('云端恢复异常时应透传错误并恢复到进入前阶段', async () => {
    const dependencies = buildDependencies({
      loadCloudConfig: vi.fn(async () => {
        throw new Error('cloud fetch failed')
      }),
    })
    const { result } = renderHook(() => useAuth(dependencies))
    await waitFor(() => expect(result.current.state.stage).toBe('needs-setup'))

    let thrownError: unknown = null
    await act(async () => {
      try {
        await result.current.restoreConfigFromCloud()
      } catch (error) {
        thrownError = error
      }
    })

    expect(thrownError).toBeInstanceOf(Error)
    expect((thrownError as Error).message).toBe('cloud fetch failed')
    await waitFor(() => expect(result.current.state.stage).toBe('needs-setup'))
    expect(result.current.state.errorMessage).toBe('cloud fetch failed')
  })

  it('ready 状态应支持仅更新仓库与分支（不改 token）', async () => {
    const saveConfig = vi.fn(async () => undefined)
    const dependencies = buildDependencies({
      saveConfig,
    })

    const { result } = renderHook(() => useAuth(dependencies))
    await waitFor(() => expect(result.current.state.stage).toBe('needs-setup'))

    await act(async () => {
      await result.current.initializeFirstTime({
        repoInput: 'alice/trace-diary',
        giteeBranch: 'master',
        token: 'token-plain',
        masterPassword: 'master1234',
      })
    })

    await waitFor(() => expect(result.current.state.stage).toBe('ready'))

    let updateResult: Awaited<ReturnType<typeof result.current.updateConnectionSettings>> | null = null
    await act(async () => {
      updateResult = await result.current.updateConnectionSettings({
        repoInput: 'alice/trace-diary-next',
        giteeBranch: 'main',
      })
    })

    await waitFor(() => expect(result.current.state.stage).toBe('ready'))
    expect(updateResult).toEqual({
      ok: true,
      message: '同步配置校验通过，本地保存成功。',
      checkedAt: new Date(fixedNow).toISOString(),
      cloudSaveStatus: 'not_applicable',
      cloudSaveMessage: '当前未登录云端账号，配置仅保存在本地。',
    })
    expect(result.current.state.config?.giteeOwner).toBe('alice')
    expect(result.current.state.config?.giteeRepoName).toBe('trace-diary-next')
    expect(result.current.state.config?.giteeBranch).toBe('main')
    expect(result.current.state.tokenInMemory).toBe('token-plain')
    expect(result.current.state.config?.encryptedToken).toBe('cipher:token-plain')
    expect(saveConfig).toHaveBeenCalledTimes(2)
  })

  it('ready 状态更新 token 时若主密码错误应回退并保留原配置', async () => {
    const saveConfig = vi.fn(async () => undefined)
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

    let updateResult: Awaited<ReturnType<typeof result.current.updateConnectionSettings>> | null = null
    await act(async () => {
      updateResult = await result.current.updateConnectionSettings({
        repoInput: 'alice/trace-diary',
        giteeBranch: 'master',
        token: 'token-new',
        masterPassword: 'wrongpass1',
      })
    })

    await waitFor(() => expect(result.current.state.stage).toBe('ready'))
    expect(updateResult).toEqual({
      ok: false,
      message: '主密码错误，无法更新 Token',
      checkedAt: new Date(fixedNow).toISOString(),
      cloudSaveStatus: 'not_applicable',
      cloudSaveMessage: null,
    })
    expect(result.current.state.errorMessage).toBe('主密码错误，无法更新 Token')
    expect(result.current.state.tokenInMemory).toBe('token-plain')
    expect(result.current.state.config?.encryptedToken).toBe('cipher:token-plain')
    expect(saveConfig).toHaveBeenCalledTimes(1)
  })

  it('ready 状态应支持同时更新仓库分支与 token', async () => {
    const saveConfig = vi.fn(async () => undefined)
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

    let updateResult: Awaited<ReturnType<typeof result.current.updateConnectionSettings>> | null = null
    await act(async () => {
      updateResult = await result.current.updateConnectionSettings({
        repoInput: 'alice/trace-diary-next',
        giteeBranch: 'main',
        token: 'token-new',
        masterPassword: 'master1234',
      })
    })

    await waitFor(() => expect(result.current.state.stage).toBe('ready'))
    expect(updateResult).toEqual({
      ok: true,
      message: '同步配置校验通过，本地保存成功。',
      checkedAt: new Date(fixedNow).toISOString(),
      cloudSaveStatus: 'not_applicable',
      cloudSaveMessage: '当前未登录云端账号，配置仅保存在本地。',
    })
    expect(result.current.state.config?.giteeRepoName).toBe('trace-diary-next')
    expect(result.current.state.config?.giteeBranch).toBe('main')
    expect(result.current.state.config?.encryptedToken).toBe('cipher:token-new')
    expect(result.current.state.tokenInMemory).toBe('token-new')
    expect(result.current.state.dataEncryptionKey).toBe(sampleDataEncryptionKey)
    expect(saveConfig).toHaveBeenCalledTimes(2)
  })

  it('ready 状态下存在云端会话时应返回 cloudSaveStatus=success', async () => {
    const saveConfig = vi.fn(async () => undefined)
    const saveCloudConfig = vi.fn(async () => undefined)
    const dependencies = buildDependencies({
      saveConfig,
      saveCloudConfig,
      hasCloudSession: vi.fn(async () => true),
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

    let updateResult: Awaited<ReturnType<typeof result.current.updateConnectionSettings>> | null = null
    await act(async () => {
      updateResult = await result.current.updateConnectionSettings({
        repoInput: 'alice/trace-diary-next',
        giteeBranch: 'main',
      })
    })

    expect(updateResult).toEqual({
      ok: true,
      message: '同步配置校验通过，本地保存成功。',
      checkedAt: new Date(fixedNow).toISOString(),
      cloudSaveStatus: 'success',
      cloudSaveMessage: '云端配置已同步。',
    })
    expect(saveCloudConfig).toHaveBeenCalledTimes(1)
  })

  it('ready 状态下云端保存失败时应返回 cloudSaveStatus=error 且不回滚本地配置', async () => {
    const saveConfig = vi.fn(async () => undefined)
    const saveCloudConfig = vi
      .fn(async () => undefined)
      .mockRejectedValueOnce(new Error('云端配置保存失败：network'))
    const dependencies = buildDependencies({
      saveConfig,
      saveCloudConfig,
      hasCloudSession: vi.fn(async () => true),
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

    let updateResult: Awaited<ReturnType<typeof result.current.updateConnectionSettings>> | null = null
    await act(async () => {
      updateResult = await result.current.updateConnectionSettings({
        repoInput: 'alice/trace-diary-next',
        giteeBranch: 'main',
      })
    })

    expect(updateResult).toEqual({
      ok: true,
      message: '同步配置校验通过，本地保存成功。',
      checkedAt: new Date(fixedNow).toISOString(),
      cloudSaveStatus: 'error',
      cloudSaveMessage: '云端配置保存失败：network',
    })
    expect(result.current.state.config?.giteeRepoName).toBe('trace-diary-next')
    expect(saveConfig).toHaveBeenCalledTimes(2)
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

  it('进入 ready 后应自动触发一次云端下拉', async () => {
    const pullRemoteDiariesToLocal = vi.fn(async () => undefined)
    const dependencies = buildDependencies({
      pullRemoteDiariesToLocal,
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
    await waitFor(() => expect(pullRemoteDiariesToLocal).toHaveBeenCalledTimes(1))
    expect(pullRemoteDiariesToLocal).toHaveBeenCalledWith({
      token: 'token-plain',
      owner: 'alice',
      repoName: 'trace-diary',
      branch: 'master',
      dataEncryptionKey: sampleDataEncryptionKey,
    })
  })
})
