interface GiteeRequestBase {
  owner: string
  repo: string
  branch: string
  token: string
  apiBase?: string
}

interface ReadFileParams extends GiteeRequestBase {
  path: string
}

interface UpsertFileParams extends GiteeRequestBase {
  path: string
  content: string
  message: string
  expectedSha?: string
}

export interface RemoteFileSnapshot {
  exists: boolean
  content?: string
  sha?: string
}

const DEFAULT_GITEE_API_BASE = 'https://gitee.com/api/v5'

function normalizeApiBase(apiBase?: string): string {
  return (apiBase ?? DEFAULT_GITEE_API_BASE).trim().replace(/\/+$/, '')
}

function encodePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function buildContentsUrl(params: ReadFileParams | UpsertFileParams, queryKey: 'ref' | 'branch'): string {
  const base = normalizeApiBase(params.apiBase)
  const url = new URL(
    `${base}/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/contents/${encodePath(params.path)}`,
  )
  url.searchParams.set(queryKey, params.branch)
  url.searchParams.set('access_token', params.token)
  return url.toString()
}

function encodeBase64(content: string): string {
  return Buffer.from(content, 'utf8').toString('base64')
}

function decodeBase64(content: string): string {
  return Buffer.from(content.replace(/\s+/g, ''), 'base64').toString('utf8')
}

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  maxAttempts = 5,
): Promise<Response> {
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fetch(input, init)
    } catch (error) {
      lastError = error
      const hasNextAttempt = attempt < maxAttempts - 1
      if (!hasNextAttempt) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('fetch failed')
}

async function readRemoteErrorMessage(response: Response): Promise<string | undefined> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

  try {
    if (contentType.includes('application/json')) {
      const body = (await response.json()) as { message?: unknown; error?: unknown }
      if (typeof body.message === 'string' && body.message.trim()) {
        return body.message.trim()
      }
      if (typeof body.error === 'string' && body.error.trim()) {
        return body.error.trim()
      }
      return undefined
    }

    const text = (await response.text()).trim()
    return text || undefined
  } catch {
    return undefined
  }
}

async function throwHttpError(action: string, response: Response): Promise<never> {
  const remoteMessage = await readRemoteErrorMessage(response)
  const suffix = remoteMessage ? `：${remoteMessage}` : ''
  throw new Error(`${action}失败（${response.status}）${suffix}`)
}

export async function readGiteeFile(params: ReadFileParams): Promise<RemoteFileSnapshot> {
  const url = buildContentsUrl(params, 'ref')
  const response = await fetchWithRetry(url, {
    method: 'GET',
    headers: {
      Authorization: `token ${params.token}`,
      Accept: 'application/json',
    },
  })

  if (response.status === 404) {
    return { exists: false }
  }

  if (!response.ok) {
    await throwHttpError(`读取远端文件 ${params.path}`, response)
  }

  const body = (await response.json()) as
    | {
        content?: unknown
        encoding?: unknown
        sha?: unknown
      }
    | unknown[]

  if (Array.isArray(body)) {
    return { exists: false }
  }

  if (typeof body.content !== 'string') {
    throw new Error(`读取远端文件 ${params.path} 失败：响应缺少 content`)
  }

  return {
    exists: true,
    content: body.encoding === 'base64' ? decodeBase64(body.content) : body.content,
    sha: typeof body.sha === 'string' ? body.sha : undefined,
  }
}

export async function upsertGiteeFile(params: UpsertFileParams): Promise<{ sha?: string }> {
  const url = buildContentsUrl(params, 'branch')
  const method = params.expectedSha?.trim() ? 'PUT' : 'POST'

  const body: {
    message: string
    content: string
    branch: string
    sha?: string
  } = {
    message: params.message,
    content: encodeBase64(params.content),
    branch: params.branch,
  }

  const expectedSha = params.expectedSha?.trim()
  if (expectedSha) {
    body.sha = expectedSha
  }

  const response = await fetchWithRetry(url, {
    method,
    headers: {
      Authorization: `token ${params.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    await throwHttpError(`写入远端文件 ${params.path}`, response)
  }

  const payload = (await response.json()) as {
    content?: { sha?: unknown }
    commit?: { sha?: unknown }
  }

  const sha =
    typeof payload.content?.sha === 'string'
      ? payload.content.sha
      : typeof payload.commit?.sha === 'string'
        ? payload.commit.sha
        : undefined

  return { sha }
}
