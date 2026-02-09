import type { Page, Route } from '@playwright/test'
import { readGiteeFile, upsertGiteeFile } from './gitee-api'

export interface ArmShaMismatchRaceParams {
  owner: string
  repo: string
  branch: string
  token: string
  path: string
  apiBase?: string
  conflictContent?: string
  conflictMessage?: string
  triggerTimeoutMs?: number
  requiredCommitMessageSubstring?: string
}

function isShaMismatch(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return /sha/i.test(error.message) && /(mismatch|not\s+match|不一致|冲突)/i.test(error.message)
}

export interface ArmedShaMismatchRace {
  waitForTriggered: () => Promise<void>
  dispose: () => Promise<void>
}

function buildPathSuffix(params: ArmShaMismatchRaceParams): string {
  return `/repos/${params.owner}/${params.repo}/contents/${params.path}`
}

function isTargetRequest(route: Route, params: ArmShaMismatchRaceParams): boolean {
  const request = route.request()
  if (request.method() !== 'PUT') {
    return false
  }

  const url = new URL(request.url())
  const pathname = decodeURIComponent(url.pathname)
  if (!pathname.endsWith(buildPathSuffix(params))) {
    return false
  }

  const branch = url.searchParams.get('branch')
  if (branch && branch !== params.branch) {
    return false
  }

  return true
}

export async function armShaMismatchRace(
  page: Page,
  params: ArmShaMismatchRaceParams,
): Promise<ArmedShaMismatchRace> {
  const routePattern = '**/api/v5/repos/**/contents/**'
  let triggered = false
  let resolveTriggered!: () => void
  let rejectTriggered!: (error: unknown) => void

  const triggeredPromise = new Promise<void>((resolve, reject) => {
    resolveTriggered = resolve
    rejectTriggered = reject
  })

  const handler = async (route: Route): Promise<void> => {
    if (triggered || !isTargetRequest(route, params)) {
      await route.continue()
      return
    }

    const body = route.request().postDataJSON() as {
      sha?: unknown
      message?: unknown
    }

    if (typeof body.sha !== 'string' || !body.sha.trim()) {
      await route.continue()
      return
    }

    const requiredMessage = params.requiredCommitMessageSubstring?.trim()
    if (requiredMessage) {
      if (typeof body.message !== 'string' || !body.message.includes(requiredMessage)) {
        await route.continue()
        return
      }
    }

    triggered = true

    try {
      const conflictContent = params.conflictContent ?? `race-conflict-${Date.now()}`
      const conflictMessage = params.conflictMessage ?? `test: 构造冲突 ${params.path}`
      const tryUpsert = async (expectedSha?: string): Promise<void> => {
        await upsertGiteeFile({
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
          token: params.token,
          apiBase: params.apiBase,
          path: params.path,
          expectedSha,
          content: conflictContent,
          message: conflictMessage,
        })
      }

      try {
        await tryUpsert(body.sha.trim())
      } catch (error) {
        if (!isShaMismatch(error)) {
          throw error
        }

        const latestSnapshot = await readGiteeFile({
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
          token: params.token,
          apiBase: params.apiBase,
          path: params.path,
        })
        await tryUpsert(latestSnapshot.sha)
      }

      resolveTriggered()
      await route.continue()
    } catch (error) {
      rejectTriggered(error)
      await route.abort()
    } finally {
      await page.unroute(routePattern, handler)
    }
  }

  await page.route(routePattern, handler)

  return {
    waitForTriggered: async () => {
      await Promise.race([
        triggeredPromise,
        new Promise<void>((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error('未能在预期时间内触发 sha mismatch 冲突构造'))
          }, params.triggerTimeoutMs ?? 15_000)
        }),
      ])
    },
    dispose: async () => {
      await page.unroute(routePattern, handler)
    },
  }
}
