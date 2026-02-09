const DEFAULT_GITEE_API_BASE = 'https://gitee.com/api/v5'
const DEFAULT_BRANCH = 'main'

export interface GiteeRepoIdentifier {
  owner: string
  repo: string
  repoPath: string
  repoUrl: string
}

export interface ValidateGiteeRepoAccessParams {
  token: string
  repoUrl: string
  apiBase?: string
  fetchImpl?: typeof fetch
}

export type ValidateGiteeRepoAccessResult =
  | {
      ok: true
      repo: GiteeRepoIdentifier
    }
  | {
      ok: false
      error: string
      status?: number
    }

export type GiteeApiErrorType = 'auth' | 'network' | 'api'

export class GiteeApiError extends Error {
  readonly type: GiteeApiErrorType
  readonly status?: number
  override readonly cause?: unknown

  constructor(type: GiteeApiErrorType, message: string, status?: number, cause?: unknown) {
    super(message)
    this.name = 'GiteeApiError'
    this.type = type
    this.status = status
    this.cause = cause
  }
}

export interface ReadGiteeFileContentsParams {
  token: string
  owner: string
  repo: string
  path: string
  ref?: string
  apiBase?: string
  fetchImpl?: typeof fetch
  useAccessTokenQuery?: boolean
}

export interface ReadGiteeFileContentsResult {
  exists: boolean
  content?: string
  sha?: string
}

export interface UpsertGiteeFileParams {
  token: string
  owner: string
  repo: string
  path: string
  content: string
  message: string
  branch?: string
  expectedSha?: string
  apiBase?: string
  fetchImpl?: typeof fetch
  useAccessTokenQuery?: boolean
}

export interface UpsertGiteeFileResult {
  sha?: string
  commitSha?: string
}

function normalizeApiBase(apiBase?: string): string {
  const envApiBase =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_GITEE_API_BASE
      ? String(import.meta.env.VITE_GITEE_API_BASE)
      : undefined

  return (apiBase ?? envApiBase ?? DEFAULT_GITEE_API_BASE).trim().replace(/\/+$/, '')
}

function normalizeRepoName(repoName: string): string {
  return repoName.replace(/\.git$/i, '')
}

function encodePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function buildContentsEndpoint(apiBase: string | undefined, owner: string, repo: string, path: string): string {
  return `${normalizeApiBase(apiBase)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`
}

function withQueryParams(requestUrl: string, query: Record<string, string | undefined>): string {
  const url = new URL(requestUrl)

  Object.entries(query).forEach(([key, value]) => {
    if (typeof value === 'string' && value) {
      url.searchParams.set(key, value)
    }
  })

  return url.toString()
}

function normalizeRequiredField(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${label} 不能为空`)
  }
  return normalized
}

function toBinaryString(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return binary
}

export function encodeBase64Utf8(content: string): string {
  const bytes = new TextEncoder().encode(content)

  if (typeof btoa === 'function') {
    return btoa(toBinaryString(bytes))
  }

  throw new Error('当前环境缺少 Base64 编码能力')
}

export function decodeBase64Utf8(base64Content: string): string {
  const normalizedBase64 = base64Content.replace(/\s+/g, '')

  if (typeof atob === 'function') {
    const binary = atob(normalizedBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  }

  throw new Error('当前环境缺少 Base64 解码能力')
}

export function parseGiteeRepoUrl(repoUrl: string): GiteeRepoIdentifier {
  const trimmedRepoUrl = repoUrl.trim()

  if (!trimmedRepoUrl) {
    throw new Error('Gitee 仓库地址不能为空')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(trimmedRepoUrl)
  } catch {
    throw new Error('Gitee 仓库地址格式无效，请使用 https://gitee.com/{owner}/{repo}')
  }

  const hostname = parsedUrl.hostname.toLowerCase()
  if (hostname !== 'gitee.com' && hostname !== 'www.gitee.com') {
    throw new Error('仓库地址必须使用 gitee.com 域名')
  }

  const pathSegments = parsedUrl.pathname.split('/').filter(Boolean)
  if (pathSegments.length < 2) {
    throw new Error('仓库地址应包含 owner/repo，例如 https://gitee.com/owner/repo')
  }

  if (pathSegments.length > 2) {
    throw new Error('请提供仓库根地址，不要包含额外路径')
  }

  const owner = decodeURIComponent(pathSegments[0]).trim()
  const repo = normalizeRepoName(decodeURIComponent(pathSegments[1]).trim())

  if (!owner || !repo) {
    throw new Error('仓库地址缺少 owner 或 repo')
  }

  return {
    owner,
    repo,
    repoPath: `${owner}/${repo}`,
    repoUrl: `https://gitee.com/${owner}/${repo}`,
  }
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

function mapValidateError(status: number, remoteMessage?: string): string {
  if (status === 401 || status === 403) {
    return 'Gitee Token 无效或权限不足，请检查后重试'
  }

  if (status === 404) {
    return '仓库不存在或当前 Token 无权访问该仓库，请确认仓库地址和权限'
  }

  if (remoteMessage) {
    return `Gitee 仓库访问校验失败（${status}）：${remoteMessage}`
  }

  return `Gitee 仓库访问校验失败（${status}）`
}

function mapHttpErrorType(status: number): GiteeApiErrorType {
  if (status === 401 || status === 403) {
    return 'auth'
  }
  return 'api'
}

function mapHttpErrorMessage(
  action: '读取文件' | '写入文件',
  status: number,
  remoteMessage?: string,
): string {
  if (status === 401 || status === 403) {
    return `Gitee 鉴权失败（${status}），请检查 Token 是否有效且具备仓库读写权限`
  }

  if (remoteMessage) {
    return `${action}失败（${status}）：${remoteMessage}`
  }

  return `${action}失败（${status}）`
}

async function throwMappedHttpError(
  response: Response,
  action: '读取文件' | '写入文件',
): Promise<never> {
  const remoteMessage = await readRemoteErrorMessage(response)
  throw new GiteeApiError(
    mapHttpErrorType(response.status),
    mapHttpErrorMessage(action, response.status, remoteMessage),
    response.status,
  )
}

function mapNetworkError(error: unknown): GiteeApiError {
  if (error instanceof GiteeApiError) {
    return error
  }
  return new GiteeApiError('network', '无法连接 Gitee API，请检查网络后重试', undefined, error)
}

function normalizeOwnerRepoPath(params: { owner: string; repo: string; path: string }): {
  owner: string
  repo: string
  path: string
} {
  return {
    owner: normalizeRequiredField(params.owner, 'owner'),
    repo: normalizeRequiredField(params.repo, 'repo'),
    path: normalizeRequiredField(params.path, 'path'),
  }
}

function buildContentsRequestUrl(params: {
  apiBase?: string
  owner: string
  repo: string
  path: string
  refOrBranch: string
  token: string
  useAccessTokenQuery?: boolean
  refKey: 'ref' | 'branch'
}): string {
  const requestUrl = buildContentsEndpoint(params.apiBase, params.owner, params.repo, params.path)
  return withQueryParams(requestUrl, {
    [params.refKey]: params.refOrBranch,
    access_token: params.useAccessTokenQuery ? params.token : undefined,
  })
}

export async function readGiteeFileContents(
  params: ReadGiteeFileContentsParams,
): Promise<ReadGiteeFileContentsResult> {
  const token = normalizeRequiredField(params.token, 'Gitee Token')
  const { owner, repo, path } = normalizeOwnerRepoPath(params)
  const ref = (params.ref ?? DEFAULT_BRANCH).trim() || DEFAULT_BRANCH
  const requestUrl = buildContentsRequestUrl({
    apiBase: params.apiBase,
    owner,
    repo,
    path,
    refOrBranch: ref,
    token,
    useAccessTokenQuery: params.useAccessTokenQuery,
    refKey: 'ref',
  })
  const fetcher = params.fetchImpl ?? fetch

  let response: Response
  try {
    response = await fetcher(requestUrl, {
      method: 'GET',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/json',
      },
    })
  } catch (error) {
    throw mapNetworkError(error)
  }

  if (response.status === 404) {
    return { exists: false }
  }

  if (!response.ok) {
    await throwMappedHttpError(response, '读取文件')
  }

  const body = (await response.json()) as {
    content?: unknown
    encoding?: unknown
    sha?: unknown
  }

  if (typeof body.content !== 'string') {
    throw new GiteeApiError('api', '读取文件失败：响应缺少 content 字段', response.status)
  }

  const content = body.encoding === 'base64' ? decodeBase64Utf8(body.content) : body.content

  return {
    exists: true,
    content,
    sha: typeof body.sha === 'string' ? body.sha : undefined,
  }
}

export async function upsertGiteeFile(params: UpsertGiteeFileParams): Promise<UpsertGiteeFileResult> {
  const token = normalizeRequiredField(params.token, 'Gitee Token')
  const { owner, repo, path } = normalizeOwnerRepoPath(params)
  const message = normalizeRequiredField(params.message, 'commit message')
  const branch = (params.branch ?? DEFAULT_BRANCH).trim() || DEFAULT_BRANCH
  const expectedSha = params.expectedSha?.trim()
  const requestUrl = buildContentsRequestUrl({
    apiBase: params.apiBase,
    owner,
    repo,
    path,
    refOrBranch: branch,
    token,
    useAccessTokenQuery: params.useAccessTokenQuery,
    refKey: 'branch',
  })
  const fetcher = params.fetchImpl ?? fetch

  const requestBody: {
    message: string
    content: string
    branch: string
    sha?: string
  } = {
    message,
    content: encodeBase64Utf8(params.content),
    branch,
  }

  if (expectedSha) {
    requestBody.sha = expectedSha
  }

  let response: Response
  try {
    response = await fetcher(requestUrl, {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
  } catch (error) {
    throw mapNetworkError(error)
  }

  if (!response.ok) {
    await throwMappedHttpError(response, '写入文件')
  }

  const body = (await response.json()) as {
    content?: { sha?: unknown }
    commit?: { sha?: unknown }
  }

  const sha =
    typeof body.content?.sha === 'string'
      ? body.content.sha
      : typeof body.commit?.sha === 'string'
        ? body.commit.sha
        : undefined

  return {
    sha,
    commitSha: typeof body.commit?.sha === 'string' ? body.commit.sha : undefined,
  }
}

export async function validateGiteeRepoAccess(
  params: ValidateGiteeRepoAccessParams,
): Promise<ValidateGiteeRepoAccessResult> {
  const token = params.token.trim()
  if (!token) {
    return {
      ok: false,
      error: 'Gitee Token 不能为空',
    }
  }

  let repo: GiteeRepoIdentifier
  try {
    repo = parseGiteeRepoUrl(params.repoUrl)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Gitee 仓库地址无效',
    }
  }

  const requestUrl = `${normalizeApiBase(params.apiBase)}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`
  const fetcher = params.fetchImpl ?? fetch

  try {
    const response = await fetcher(requestUrl, {
      method: 'GET',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/json',
      },
    })

    if (response.ok) {
      return {
        ok: true,
        repo,
      }
    }

    const remoteMessage = await readRemoteErrorMessage(response)
    return {
      ok: false,
      status: response.status,
      error: mapValidateError(response.status, remoteMessage),
    }
  } catch {
    return {
      ok: false,
      error: '无法连接 Gitee API，请检查网络后重试',
    }
  }
}
