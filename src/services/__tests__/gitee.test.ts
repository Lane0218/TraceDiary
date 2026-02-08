import { describe, expect, it, vi } from 'vitest'
import { parseGiteeRepoUrl, validateGiteeRepoAccess } from '../gitee'

describe('parseGiteeRepoUrl', () => {
  it('应正确解析标准仓库地址', () => {
    expect(parseGiteeRepoUrl('https://gitee.com/owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo',
      repoPath: 'owner/repo',
      repoUrl: 'https://gitee.com/owner/repo',
    })
  })

  it('应支持 .git 后缀和尾部斜杠', () => {
    expect(parseGiteeRepoUrl('https://gitee.com/owner/repo.git/')).toEqual({
      owner: 'owner',
      repo: 'repo',
      repoPath: 'owner/repo',
      repoUrl: 'https://gitee.com/owner/repo',
    })
  })

  it('非 gitee 域名应抛出可读错误', () => {
    expect(() => parseGiteeRepoUrl('https://github.com/owner/repo')).toThrow(
      '仓库地址必须使用 gitee.com 域名',
    )
  })
})

describe('validateGiteeRepoAccess', () => {
  it('token 与仓库可访问时应返回成功', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1, full_name: 'owner/repo' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }),
    )

    const result = await validateGiteeRepoAccess({
      token: 'test-token',
      repoUrl: 'https://gitee.com/owner/repo',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('https://gitee.com/api/v5/repos/owner/repo', {
      method: 'GET',
      headers: {
        Authorization: 'token test-token',
        Accept: 'application/json',
      },
    })
  })

  it('401 应返回 token 无效可读错误', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: '401 Unauthorized' }), {
        status: 401,
        headers: {
          'content-type': 'application/json',
        },
      }),
    )

    const result = await validateGiteeRepoAccess({
      token: 'bad-token',
      repoUrl: 'https://gitee.com/owner/repo',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
      expect(result.error).toContain('Token')
    }
  })

  it('404 应返回仓库无权限可读错误', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: {
          'content-type': 'application/json',
        },
      }),
    )

    const result = await validateGiteeRepoAccess({
      token: 'test-token',
      repoUrl: 'https://gitee.com/owner/missing-repo',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(404)
      expect(result.error).toContain('仓库')
    }
  })

  it('网络异常应返回连接失败可读错误', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))

    const result = await validateGiteeRepoAccess({
      token: 'test-token',
      repoUrl: 'https://gitee.com/owner/repo',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(result).toEqual({
      ok: false,
      error: '无法连接 Gitee API，请检查网络后重试',
    })
  })

  it('仓库地址无效时不应发起请求', async () => {
    const fetchMock = vi.fn()

    const result = await validateGiteeRepoAccess({
      token: 'test-token',
      repoUrl: 'invalid-url',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('格式无效')
    }
  })
})
