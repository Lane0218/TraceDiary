import { expect, test } from '@playwright/test'
import {
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
})
