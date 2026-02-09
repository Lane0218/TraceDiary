import { expect, test, type Page } from '@playwright/test'
import { encryptToken } from '../../src/services/crypto'
import {
  AUTH_LOCK_STATE_KEY,
  AUTH_PASSWORD_EXPIRY_KEY,
  AUTH_UNLOCK_SECRET_KEY,
  AUTH_UNLOCKED_TOKEN_KEY,
  CONFIG_STORAGE_KEY,
  buildRunMarker,
  ensureReadySession,
  expectAuthStage,
  expectSessionReady,
  gotoWorkspace,
  submitRefreshToken,
  submitUnlock,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const TEST_DATE = '2100-01-04'
const ONE_DAY_MS = 24 * 60 * 60 * 1000

interface StoredAppConfig {
  kdfParams: {
    algorithm: 'PBKDF2'
    hash: 'SHA-256'
    iterations: number
    salt: string
  }
  encryptedToken?: string
}

async function readStoredConfig(page: Page): Promise<StoredAppConfig> {
  const config = await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as StoredAppConfig) : null
  }, CONFIG_STORAGE_KEY)

  if (!config) {
    throw new Error('缺少本地认证配置，无法继续测试')
  }

  return config
}

async function patchEncryptedToken(
  page: Page,
  encryptedToken: string,
): Promise<void> {
  await page.evaluate(
    ({ key, nextEncryptedToken }) => {
      const raw = localStorage.getItem(key)
      if (!raw) {
        throw new Error('本地配置不存在')
      }
      const config = JSON.parse(raw) as StoredAppConfig
      config.encryptedToken = nextEncryptedToken
      localStorage.setItem(key, JSON.stringify(config))
    },
    {
      key: CONFIG_STORAGE_KEY,
      nextEncryptedToken: encryptedToken,
    },
  )
}

async function forceLockAndClearUnlockCache(
  page: Page,
): Promise<void> {
  await page.evaluate(
    ({ lockKey, expiryKey, unlockSecretKey, unlockedTokenKey, dayMs }) => {
      localStorage.setItem(lockKey, 'locked')
      localStorage.setItem(expiryKey, String(Date.now() + dayMs))
      localStorage.removeItem(unlockSecretKey)
      localStorage.removeItem(unlockedTokenKey)
    },
    {
      lockKey: AUTH_LOCK_STATE_KEY,
      expiryKey: AUTH_PASSWORD_EXPIRY_KEY,
      unlockSecretKey: AUTH_UNLOCK_SECRET_KEY,
      unlockedTokenKey: AUTH_UNLOCKED_TOKEN_KEY,
      dayMs: ONE_DAY_MS,
    },
  )
}

test('7天免输主密码期间刷新页面应保持已解锁', async ({ page }) => {
  const env = getE2EEnv()

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)

  const expiryTimestamp = await page.evaluate((key) => Number(localStorage.getItem(key)), AUTH_PASSWORD_EXPIRY_KEY)
  expect(Number.isFinite(expiryTimestamp)).toBeTruthy()
  expect(expiryTimestamp).toBeGreaterThan(Date.now() + 6 * ONE_DAY_MS)

  await page.reload()
  await expectSessionReady(page)
  await expect(page.getByTestId('auth-unlock-submit')).toHaveCount(0)
})

test('主密码过期后应进入解锁阶段并在重输后恢复已解锁', async ({ page }) => {
  const env = getE2EEnv()

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)

  await page.evaluate(
    ({ lockKey, expiryKey }) => {
      localStorage.setItem(lockKey, 'unlocked')
      localStorage.setItem(expiryKey, String(Date.now() - 60_000))
    },
    {
      lockKey: AUTH_LOCK_STATE_KEY,
      expiryKey: AUTH_PASSWORD_EXPIRY_KEY,
    },
  )

  await page.reload()
  await expectAuthStage(page, 'needs-unlock')
  await expect(page.getByTestId('auth-unlock-submit')).toBeVisible()

  await submitUnlock(page, env.masterPassword)
  await expectSessionReady(page)
})

test('token 解密失败后应进入 refresh，并在覆盖后恢复 ready', async ({ page }) => {
  const env = getE2EEnv()

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)

  await patchEncryptedToken(page, 'invalid-token-ciphertext')
  await forceLockAndClearUnlockCache(page)

  await page.reload()
  await expectAuthStage(page, 'needs-unlock')

  await submitUnlock(page, env.masterPassword)
  await expectAuthStage(page, 'needs-token-refresh')
  await expect(page.getByTestId('auth-refresh-submit')).toBeVisible()

  await submitRefreshToken(page, { token: env.token })
  await expectSessionReady(page)
})

test('token 失效后应进入 refresh，并在补输有效 token 后恢复 ready', async ({ page }) => {
  const env = getE2EEnv()

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)

  const config = await readStoredConfig(page)
  const invalidToken = `invalid-${buildRunMarker('token')}`
  const invalidCipher = await encryptToken(invalidToken, env.masterPassword, config.kdfParams)

  await patchEncryptedToken(page, invalidCipher)
  await forceLockAndClearUnlockCache(page)

  await page.reload()
  await expectAuthStage(page, 'needs-unlock')

  await submitUnlock(page, env.masterPassword)
  await expectAuthStage(page, 'needs-token-refresh')

  await submitRefreshToken(page, { token: env.token })
  await expectSessionReady(page)
})
