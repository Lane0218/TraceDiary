import { expect, test, type Page } from '@playwright/test'
import { CONFIG_STORAGE_KEY, ensureReadySession, gotoDiary } from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const TEST_DATE = '2100-01-06'

interface StoredAppConfig {
  giteeOwner: string
  giteeRepoName: string
  giteeBranch?: string
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

test('ready 状态下应可在设置页更新仓库与分支（不改 token）', async ({ page }) => {
  const env = getE2EEnv()

  await gotoDiary(page, TEST_DATE)
  await ensureReadySession(page, env)

  await page.getByTestId('app-nav-settings').click()
  await expect(page.getByLabel('settings-page')).toBeVisible()
  await expect(page.getByText('READY')).toHaveCount(0)
  await expect(page.getByText(/^状态：\s*ready$/)).toHaveCount(0)
  await expect(page.getByText('仅保留必要项：修改后立即生效；不改 Token 可留空。')).toHaveCount(0)

  const nextBranch = env.branch === 'master' ? 'main' : 'master'
  await page.getByTestId('auth-ready-repo-input').fill(`${env.owner}/${env.repo}`)
  await page.getByTestId('auth-ready-branch-input').fill(nextBranch)
  await page.getByTestId('auth-ready-token-input').fill('')
  await expect(page.getByTestId('auth-ready-password-input')).toHaveCount(0)
  await page.getByTestId('auth-ready-submit').click()
  await expect(page.getByTestId('toast-system')).toContainText('正在校验同步配置，请稍候...')
  await page.waitForFunction(
    ({ key, branch }) => {
      const raw = localStorage.getItem(key)
      if (!raw) {
        return false
      }
      const config = JSON.parse(raw) as { giteeBranch?: unknown }
      return config.giteeBranch === branch
    },
    {
      key: CONFIG_STORAGE_KEY,
      branch: nextBranch,
    },
    { timeout: 20_000 },
  )

  const config = await readStoredConfig(page)
  expect(config.giteeOwner).toBe(env.owner)
  expect(config.giteeRepoName).toBe(env.repo)
  expect(config.giteeBranch).toBe(nextBranch)
  await expect(page.getByTestId('settings-sync-check-status')).toHaveAttribute('data-status', 'success')
  await expect(page.getByTestId('settings-sync-check-status')).toContainText('校验成功')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('ready 状态下应可在设置页更新 token', async ({ page }) => {
  const env = getE2EEnv()

  await gotoDiary(page, TEST_DATE)
  await ensureReadySession(page, env)

  await page.getByTestId('app-nav-settings').click()
  await expect(page.getByLabel('settings-page')).toBeVisible()

  await page.getByTestId('auth-ready-repo-input').fill(`${env.owner}/${env.repo}`)
  await page.getByTestId('auth-ready-branch-input').fill(env.branch)
  await page.getByTestId('auth-ready-token-input').fill(env.token)
  await expect(page.getByTestId('auth-ready-password-input')).toBeVisible()
  await page.getByTestId('auth-ready-password-input').fill(env.masterPassword)
  await page.getByTestId('auth-ready-submit').click()
  await expect(page.getByTestId('toast-system')).toContainText('正在校验同步配置，请稍候...')
  await page.waitForFunction(
    ({ key, branch, token }) => {
      const raw = localStorage.getItem(key)
      if (!raw) {
        return false
      }
      const config = JSON.parse(raw) as { giteeBranch?: unknown; encryptedToken?: unknown }
      return (
        config.giteeBranch === branch &&
        typeof config.encryptedToken === 'string' &&
        config.encryptedToken !== token
      )
    },
    {
      key: CONFIG_STORAGE_KEY,
      branch: env.branch,
      token: env.token,
    },
    { timeout: 20_000 },
  )

  const config = await readStoredConfig(page)
  expect(config.giteeOwner).toBe(env.owner)
  expect(config.giteeRepoName).toBe(env.repo)
  expect(config.giteeBranch).toBe(env.branch)
  expect(typeof config.encryptedToken).toBe('string')
  expect(config.encryptedToken).not.toBe(env.token)
  await expect(page.getByTestId('settings-sync-check-status')).toHaveAttribute('data-status', 'success')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('ready 状态下仓库地址不合法时应显示失败 toast 与状态', async ({ page }) => {
  const env = getE2EEnv()

  await gotoDiary(page, TEST_DATE)
  await ensureReadySession(page, env)

  await page.getByTestId('app-nav-settings').click()
  await expect(page.getByLabel('settings-page')).toBeVisible()

  await page.getByTestId('auth-ready-repo-input').fill('invalid-repo-input')
  await page.getByTestId('auth-ready-submit').click()

  await expect(page.getByTestId('settings-sync-check-status')).toHaveAttribute('data-status', 'error')
  await expect(page.getByTestId('settings-sync-check-status')).toContainText('校验失败')
  await expect(page.getByTestId('toast-system')).toContainText('同步配置校验失败')
  await expect(page.getByRole('alert')).toContainText('仓库地址需为 <owner>/<repo>')
})
