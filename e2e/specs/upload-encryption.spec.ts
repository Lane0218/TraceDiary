import { expect, test } from '@playwright/test'
import { deriveAesKeyFromPassword, encryptWithAesGcm } from '../../src/services/crypto'
import {
  AUTH_UNLOCKED_TOKEN_KEY,
  CONFIG_STORAGE_KEY,
  buildRunMarker,
  clickManualSync,
  ensureReadySession,
  expectSyncSuccess,
  gotoWorkspace,
  waitForDailyDiaryPersisted,
  writeDailyContent,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'
import { readGiteeFile, upsertGiteeFile } from '../helpers/gitee-api'

const TEST_DATE = '2100-01-03'

test('手动上传后的远端日记内容应为非明文密文', async ({ page }) => {
  const env = getE2EEnv()
  const marker = buildRunMarker('upload-encryption')

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)
  await writeDailyContent(page, `E2E ${marker}`)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)
  await page.waitForTimeout(800)

  await clickManualSync(page)
  await expectSyncSuccess(page)

  const remote = await readGiteeFile({
    owner: env.owner,
    repo: env.repo,
    branch: env.branch,
    token: env.token,
    path: `${TEST_DATE}.md.enc`,
  })

  expect(remote.exists).toBe(true)
  const remoteContent = remote.content ?? ''
  expect(remoteContent).not.toContain(marker)
  expect(remoteContent).toMatch(/^[A-Za-z0-9+/=]+$/)

  const config = await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as { kdfParams: { algorithm: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string } }) : null
  }, CONFIG_STORAGE_KEY)
  expect(config).toBeTruthy()

  const metadataPlaintext = JSON.stringify({
    run: marker,
    date: TEST_DATE,
    syncedAt: new Date().toISOString(),
  })
  const metadataKey = await deriveAesKeyFromPassword(env.masterPassword, config!.kdfParams)
  const metadataCiphertext = await encryptWithAesGcm(metadataPlaintext, metadataKey)

  const metadataBefore = await readGiteeFile({
    owner: env.owner,
    repo: env.repo,
    branch: env.branch,
    token: env.token,
    path: 'metadata.json.enc',
  })

  await upsertGiteeFile({
    owner: env.owner,
    repo: env.repo,
    branch: env.branch,
    token: env.token,
    path: 'metadata.json.enc',
    content: metadataCiphertext,
    message: `test: e2e metadata encryption ${marker}`,
    expectedSha: metadataBefore.sha,
  })

  const remoteMetadata = await readGiteeFile({
    owner: env.owner,
    repo: env.repo,
    branch: env.branch,
    token: env.token,
    path: 'metadata.json.enc',
  })
  expect(remoteMetadata.exists).toBe(true)
  const metadataContent = remoteMetadata.content ?? ''
  expect(metadataContent).toMatch(/^[A-Za-z0-9+/=]+$/)
  expect(metadataContent).not.toContain(marker)
  expect(metadataContent).not.toContain(TEST_DATE)
  expect(metadataContent.trim().startsWith('{')).toBe(false)

  const localTokenState = await page.evaluate(
    ({ configKey, unlockedTokenKey }) => {
      return {
        configRaw: localStorage.getItem(configKey) ?? '',
        unlockedTokenRaw: localStorage.getItem(unlockedTokenKey) ?? '',
        allValues: Object.values(localStorage),
      }
    },
    {
      configKey: CONFIG_STORAGE_KEY,
      unlockedTokenKey: AUTH_UNLOCKED_TOKEN_KEY,
    },
  )
  expect(localTokenState.configRaw).toContain('encryptedToken')
  expect(localTokenState.configRaw).not.toContain(env.token)
  expect(localTokenState.unlockedTokenRaw).not.toContain(env.token)
  for (const value of localTokenState.allValues) {
    expect(value).not.toContain(env.token)
  }
})
