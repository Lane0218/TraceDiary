import fs from 'node:fs'
import path from 'node:path'

export interface E2EEnv {
  owner: string
  repo: string
  token: string
  masterPassword: string
  branch: string
}

const ENV_FILE = '.env.e2e'
let cachedEnv: E2EEnv | null = null

function parseDotEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    return null
  }

  const index = trimmed.indexOf('=')
  if (index <= 0) {
    return null
  }

  const key = trimmed.slice(0, index).trim()
  let value = trimmed.slice(index + 1).trim()

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return {
    key,
    value,
  }
}

function loadDotEnvFileIfExists(): void {
  const envPath = path.resolve(process.cwd(), ENV_FILE)
  if (!fs.existsSync(envPath)) {
    return
  }

  const content = fs.readFileSync(envPath, 'utf8')
  const lines = content.split(/\r?\n/u)

  for (const line of lines) {
    const parsed = parseDotEnvLine(line)
    if (!parsed) {
      continue
    }

    if (!process.env[parsed.key]) {
      process.env[parsed.key] = parsed.value
    }
  }
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(
      `缺少环境变量 ${name}。请在仓库根目录创建 ${ENV_FILE}（可参考 .env.e2e.example）或在命令行中导出该变量。`,
    )
  }
  return value
}

export function getE2EEnv(): E2EEnv {
  if (cachedEnv) {
    return cachedEnv
  }

  loadDotEnvFileIfExists()

  cachedEnv = {
    owner: readRequiredEnv('E2E_GITEE_OWNER'),
    repo: readRequiredEnv('E2E_GITEE_REPO'),
    token: readRequiredEnv('E2E_GITEE_TOKEN'),
    masterPassword: readRequiredEnv('E2E_MASTER_PASSWORD'),
    branch: process.env.E2E_GITEE_BRANCH?.trim() || 'master',
  }

  return cachedEnv
}
