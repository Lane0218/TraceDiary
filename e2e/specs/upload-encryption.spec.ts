import { expect, test, type Route } from '@playwright/test'
import { decryptWithAesGcm, deriveAesKeyFromPassword } from '../../src/services/crypto'
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
import { readGiteeFile } from '../helpers/gitee-api'

interface StoredKdfParams {
  algorithm: 'PBKDF2'
  hash: 'SHA-256'
  iterations: number
  salt: string
}

function buildUniqueTestDate(): string {
  const stamp = Date.now().toString()
  const yearSeed = Number.parseInt(stamp.slice(-8, -2), 10)
  const monthSeed = Number.parseInt(stamp.slice(-4, -2), 10)
  const daySeed = Number.parseInt(stamp.slice(-2), 10)
  const year = 3000 + (yearSeed % 5000)
  const month = (monthSeed % 12) + 1
  const day = (daySeed % 28) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function decodeBase64Utf8(content: string): string {
  return Buffer.from(content, 'base64').toString('utf8')
}

test('手动上传后的远端日记内容应为非明文密文', async ({ page }) => {
  const env = getE2EEnv()
  const testDate = buildUniqueTestDate()
  const marker = buildRunMarker('upload-encryption')
  let contentsRequestCount = 0
  let metadataRequestBodyContent: string | null = null

  const metadataUploadHandler = async (route: Route): Promise<void> => {
    contentsRequestCount += 1
    const request = route.request()
    if (request.method() === 'PUT' || request.method() === 'POST') {
      const pathname = decodeURIComponent(new URL(request.url()).pathname)
      if (pathname.includes('/contents/metadata.json.enc')) {
        const body = request.postDataJSON() as { content?: unknown } | null
        if (body && typeof body.content === 'string') {
          metadataRequestBodyContent = body.content
        }
      }
    }
    await route.continue()
  }

  await page.route('**/api/v5/repos/**/contents/**', metadataUploadHandler)

  await gotoWorkspace(page, testDate)
  await ensureReadySession(page, env)
  await writeDailyContent(page, `E2E ${marker}`)
  await waitForDailyDiaryPersisted(page, testDate, marker)
  await page.waitForTimeout(800)

  await clickManualSync(page)
  await expectSyncSuccess(page)
  await page.unroute('**/api/v5/repos/**/contents/**', metadataUploadHandler)
  expect(contentsRequestCount).toBeGreaterThanOrEqual(4)
  expect(metadataRequestBodyContent).toBeTruthy()

  const remote = await readGiteeFile({
    owner: env.owner,
    repo: env.repo,
    branch: env.branch,
    token: env.token,
    path: `${testDate}.md.enc`,
  })

  expect(remote.exists).toBe(true)
  const remoteContent = remote.content ?? ''
  expect(remoteContent).not.toContain(marker)
  expect(remoteContent).toMatch(/^[A-Za-z0-9+/=]+$/)

  const config = await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as { kdfParams: StoredKdfParams }) : null
  }, CONFIG_STORAGE_KEY)
  expect(config).toBeTruthy()

  const metadataKey = await deriveAesKeyFromPassword(env.masterPassword, config!.kdfParams)
  const encryptedMetadataPayload = decodeBase64Utf8(metadataRequestBodyContent as string)
  expect(encryptedMetadataPayload).toMatch(/^[A-Za-z0-9+/=]+$/)
  expect(encryptedMetadataPayload).not.toContain(marker)
  expect(encryptedMetadataPayload).not.toContain(testDate)
  expect(encryptedMetadataPayload.trim().startsWith('{')).toBe(false)
  const decryptedMetadata = await decryptWithAesGcm(encryptedMetadataPayload, metadataKey)
  const metadataDoc = JSON.parse(decryptedMetadata) as {
    entries?: Array<{ type?: string; date?: string; filename?: string }>
  }
  expect(Array.isArray(metadataDoc.entries)).toBe(true)
  const hasTargetDailyEntry = (metadataDoc.entries ?? []).some(
    (entry) => entry.type === 'daily' && entry.date === testDate && entry.filename === `${testDate}.md.enc`,
  )
  expect(hasTargetDailyEntry).toBe(true)

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
