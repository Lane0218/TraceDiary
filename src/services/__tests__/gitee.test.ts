import { describe, expect, it, vi } from 'vitest'
import {
  decodeBase64Utf8,
  encodeBase64Utf8,
  parseGiteeRepoUrl,
  readGiteeFileContents,
  upsertGiteeFile,
  validateGiteeRepoAccess,
} from '../gitee'

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

describe('Base64 UTF-8 编解码', () => {
  it('应支持中文与 emoji 的 UTF-8 编解码', () => {
    const raw = '你好，TraceDiary🚀'
    const encoded = encodeBase64Utf8(raw)
    expect(decodeBase64Utf8(encoded)).toBe(raw)
  })
})

describe('readGiteeFileContents', () => {
  it('读取成功时应返回 exists/content/sha 并自动解码 base64', async () => {
    const rawContent = '测试内容-中文'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: encodeBase64Utf8(rawContent),
          encoding: 'base64',
          sha: 'sha-read-1',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    const result = await readGiteeFileContents({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      path: 'metadata.json.enc',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(result).toEqual({
      exists: true,
      content: rawContent,
      sha: 'sha-read-1',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gitee.com/api/v5/repos/owner/repo/contents/metadata.json.enc?ref=master',
      {
        method: 'GET',
        headers: {
          Authorization: 'token test-token',
          Accept: 'application/json',
        },
      },
    )
  })

  it('404 应返回不存在', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await readGiteeFileContents({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      path: 'metadata.json.enc',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(result).toEqual({ exists: false })
  })

  it('部分 Gitee 实例返回 200 + 空数组时也应视为不存在', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await readGiteeFileContents({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      path: 'metadata.json.enc',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(result).toEqual({ exists: false })
  })

  it('应支持 access_token query 兼容模式且保留 Authorization 头', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: encodeBase64Utf8('ok'),
          encoding: 'base64',
          sha: 'sha-read-2',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    await readGiteeFileContents({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      path: 'dir/file.txt',
      ref: 'dev',
      useAccessTokenQuery: true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://gitee.com/api/v5/repos/owner/repo/contents/dir/file.txt?ref=dev&access_token=test-token',
      {
        method: 'GET',
        headers: {
          Authorization: 'token test-token',
          Accept: 'application/json',
        },
      },
    )
  })

  it('401 应抛出 auth 分类错误并给出中文可读信息', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(
      readGiteeFileContents({
        token: 'bad-token',
        owner: 'owner',
        repo: 'repo',
        path: 'metadata.json.enc',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      name: 'GiteeApiError',
      type: 'auth',
      status: 401,
      message: expect.stringContaining('鉴权失败'),
    })
  })

  it('网络异常应抛出 network 分类错误', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))

    await expect(
      readGiteeFileContents({
        token: 'test-token',
        owner: 'owner',
        repo: 'repo',
        path: 'metadata.json.enc',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      name: 'GiteeApiError',
      type: 'network',
      message: expect.stringContaining('无法连接 Gitee API'),
    })
  })
})

describe('upsertGiteeFile', () => {
  it('应写入 Base64 内容并支持 expectedSha 映射到 body.sha', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: { sha: 'sha-file-new' },
          commit: { sha: 'sha-commit-new' },
        }),
        {
          status: 201,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    const result = await upsertGiteeFile({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      path: 'metadata.json.enc',
      branch: 'main',
      content: '新的内容',
      message: '更新 metadata',
      expectedSha: 'sha-old',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(result).toEqual({
      sha: 'sha-file-new',
      commitSha: 'sha-commit-new',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestUrl).toBe(
      'https://gitee.com/api/v5/repos/owner/repo/contents/metadata.json.enc?branch=main',
    )
    expect(requestInit.method).toBe('PUT')
    expect(requestInit.headers).toEqual({
      Authorization: 'token test-token',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(requestInit.body))).toEqual({
      message: '更新 metadata',
      content: encodeBase64Utf8('新的内容'),
      branch: 'main',
      sha: 'sha-old',
    })
  })

  it('创建文件时 expectedSha 为空不应发送 body.sha', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: { sha: 'sha-created' },
          commit: { sha: 'sha-commit-created' },
        }),
        {
          status: 201,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    await upsertGiteeFile({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      path: 'new-file.txt',
      content: 'v1',
      message: 'create file',
      expectedSha: '   ',
      useAccessTokenQuery: true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestUrl).toBe(
      'https://gitee.com/api/v5/repos/owner/repo/contents/new-file.txt?branch=master&access_token=test-token',
    )
    expect(requestInit.method).toBe('POST')
    expect(JSON.parse(String(requestInit.body))).toEqual({
      message: 'create file',
      content: encodeBase64Utf8('v1'),
      branch: 'master',
    })
  })

  it('服务端错误应抛出 api 分类错误并给出中文可读信息', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Internal Server Error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(
      upsertGiteeFile({
        token: 'test-token',
        owner: 'owner',
        repo: 'repo',
        path: 'metadata.json.enc',
        content: 'v2',
        message: 'update',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      name: 'GiteeApiError',
      type: 'api',
      status: 500,
      message: expect.stringContaining('写入文件失败'),
    })
  })
})
