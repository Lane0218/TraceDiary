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
  prewriteTimeoutMs?: number
  prewriteMaxAttempts?: number
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

function isRouteHandledError(error: unknown): boolean {
  return error instanceof Error && /route.*already handled/i.test(error.message)
}

function isPageClosedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return /(target page, context or browser has been closed|page has been closed|browser has been closed)/i.test(
    error.message,
  )
}

function isRetryablePrewriteError(error: unknown): boolean {
  if (isShaMismatch(error)) {
    return true
  }
  if (!(error instanceof Error)) {
    return false
  }
  return /(network|fetch|timeout|econn|enotfound|连接|超时)/i.test(error.message)
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  if (timeoutMs <= 0) {
    return task
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, timeoutMs)

    task.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function prewriteConflictContent(params: ArmShaMismatchRaceParams): Promise<void> {
  const conflictContent = params.conflictContent ?? `race-conflict-${Date.now()}`
  const conflictMessage = params.conflictMessage ?? `test: 构造冲突 ${params.path}`
  const maxAttempts = Math.max(1, params.prewriteMaxAttempts ?? 3)
  const prewriteTimeoutMs = Math.max(1_000, params.prewriteTimeoutMs ?? 20_000)

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await withTimeout(
        (async () => {
          const latestSnapshot = await readGiteeFile({
            owner: params.owner,
            repo: params.repo,
            branch: params.branch,
            token: params.token,
            apiBase: params.apiBase,
            path: params.path,
          })

          await upsertGiteeFile({
            owner: params.owner,
            repo: params.repo,
            branch: params.branch,
            token: params.token,
            apiBase: params.apiBase,
            path: params.path,
            expectedSha: latestSnapshot.exists ? latestSnapshot.sha : undefined,
            content: conflictContent,
            message: conflictMessage,
          })
        })(),
        prewriteTimeoutMs,
        `预写冲突内容超时（${prewriteTimeoutMs}ms）`,
      )

      return
    } catch (error) {
      const shouldRetry = isRetryablePrewriteError(error) && attempt < maxAttempts - 1
      if (!shouldRetry) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
    }
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
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
  let fulfilled = false
  let triggerError: Error | null = null
  let resolveTriggered!: () => void

  const triggeredPromise = new Promise<void>((resolve) => {
    resolveTriggered = resolve
  })

  const markTriggered = (): void => {
    if (fulfilled || triggerError) {
      return
    }
    fulfilled = true
    resolveTriggered()
  }

  const markTriggerError = (error: unknown): void => {
    if (fulfilled || triggerError) {
      return
    }
    triggerError = toError(error)
  }
  let resolvePrewriteReady!: () => void
  const prewriteReady = new Promise<void>((resolve) => {
    resolvePrewriteReady = resolve
  })

  const handler = async (route: Route): Promise<void> => {
    const continueSafely = async (): Promise<void> => {
      try {
        await route.continue()
      } catch (error) {
        if (!isRouteHandledError(error)) {
          throw error
        }
      }
    }

    await prewriteReady

    if (triggerError) {
      await continueSafely()
      return
    }

    if (triggered || !isTargetRequest(route, params)) {
      await continueSafely()
      return
    }

    const body = route.request().postDataJSON() as {
      sha?: unknown
      message?: unknown
    }

    if (typeof body.sha !== 'string' || !body.sha.trim()) {
      await continueSafely()
      return
    }

    const requiredMessage = params.requiredCommitMessageSubstring?.trim()
    if (requiredMessage) {
      if (typeof body.message !== 'string' || !body.message.includes(requiredMessage)) {
        await continueSafely()
        return
      }
    }

    triggered = true

    try {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'sha mismatch',
        }),
      })
      markTriggered()
    } catch (error) {
      if (isRouteHandledError(error)) {
        markTriggered()
      } else {
        markTriggerError(error)
      }
    } finally {
      try {
        await page.unroute(routePattern, handler)
      } catch (error) {
        if (!isPageClosedError(error)) {
          throw error
        }
      }
    }
  }

  await page.route(routePattern, handler)
  prewriteConflictContent(params).then(
    () => {
      resolvePrewriteReady()
    },
    (error) => {
      markTriggerError(new Error(`[prewrite_failed] ${toError(error).message}`))
      resolvePrewriteReady()
    },
  )
  await prewriteReady

  return {
    waitForTriggered: async () => {
      if (triggerError) {
        throw triggerError
      }
      await Promise.race([
        triggeredPromise,
        new Promise<void>((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error('[target_request_not_seen] 未能在预期时间内触发 sha mismatch 冲突构造'))
          }, params.triggerTimeoutMs ?? 15_000)
        }),
      ])
      if (triggerError) {
        throw triggerError
      }
    },
    dispose: async () => {
      try {
        await page.unroute(routePattern, handler)
      } catch (error) {
        if (!isPageClosedError(error)) {
          throw error
        }
      }
    },
  }
}
