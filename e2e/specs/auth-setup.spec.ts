import { expect, test } from '@playwright/test'
import { ensureReadySession, gotoWorkspace } from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const CONFIG_STORAGE_KEY = 'trace-diary:app-config'
const LOCK_STATE_KEY = 'trace-diary:auth:lock-state'
const TEST_DATE = '2099-12-28'

test('首次配置后应进入已解锁状态，且本地仅保存 encryptedToken', async ({ page }) => {
  const env = getE2EEnv()

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)

  const config = await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  }, CONFIG_STORAGE_KEY)

  expect(config).toBeTruthy()
  expect(config.giteeOwner).toBe(env.owner)
  expect(config.giteeRepoName).toBe(env.repo)
  expect(config.giteeBranch).toBe(env.branch)
  expect(typeof config.encryptedToken).toBe('string')
  expect(config.encryptedToken).not.toBe(env.token)

  const lockState = await page.evaluate((key) => localStorage.getItem(key), LOCK_STATE_KEY)
  expect(lockState).toBe('unlocked')
})
