const DEFAULT_GITEE_API_BASE = 'https://gitee.com/api/v5'

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
