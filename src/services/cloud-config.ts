import type { AppConfig } from '../types/config'
import type {
  CloudConfigConflictMeta,
  CloudConfigConflictSnapshot,
  CloudConfigMeta,
  CloudConfigRow,
  CloudConfigUpsertPayload,
} from '../types/cloud-config'
import { getSupabaseClient, getSupabaseUserId, isSupabaseConfigured } from './supabase'

const TABLE_NAME = 'user_sync_configs'

function toCloudPayload(userId: string, config: AppConfig): CloudConfigUpsertPayload {
  return {
    user_id: userId,
    gitee_repo: config.giteeRepo,
    gitee_owner: config.giteeOwner,
    gitee_repo_name: config.giteeRepoName,
    gitee_branch: config.giteeBranch ?? 'master',
    password_hash: config.passwordHash,
    password_expiry: config.passwordExpiry,
    kdf_params: config.kdfParams,
    encrypted_token: config.encryptedToken ?? null,
    token_cipher_version: config.tokenCipherVersion,
  }
}

function toAppConfig(row: CloudConfigRow): AppConfig {
  return {
    giteeRepo: row.gitee_repo,
    giteeOwner: row.gitee_owner,
    giteeRepoName: row.gitee_repo_name,
    giteeBranch: row.gitee_branch,
    passwordHash: row.password_hash,
    passwordExpiry: row.password_expiry,
    kdfParams: row.kdf_params,
    encryptedToken: row.encrypted_token ?? undefined,
    tokenCipherVersion: row.token_cipher_version,
  }
}

function buildCloudConfigConflictFingerprint(snapshot: CloudConfigConflictSnapshot): string {
  return JSON.stringify({
    giteeRepo: snapshot.gitee_repo ?? '',
    giteeOwner: snapshot.gitee_owner ?? '',
    giteeRepoName: snapshot.gitee_repo_name ?? '',
    giteeBranch: snapshot.gitee_branch ?? 'master',
    passwordHash: snapshot.password_hash ?? '',
    kdfParams: snapshot.kdf_params ?? null,
    encryptedToken: snapshot.encrypted_token ?? null,
    tokenCipherVersion: snapshot.token_cipher_version ?? 'v1',
  })
}

export async function loadCloudConfigForCurrentUser(): Promise<AppConfig | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  const userId = await getSupabaseUserId()
  if (!userId) {
    return null
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle<CloudConfigRow>()

  if (error) {
    throw new Error(`云端配置读取失败：${error.message}`)
  }

  if (!data) {
    return null
  }

  return toAppConfig(data)
}

export async function loadCloudConfigMetaForCurrentUser(): Promise<CloudConfigMeta> {
  if (!isSupabaseConfigured()) {
    return { exists: false, updatedAt: null }
  }

  const userId = await getSupabaseUserId()
  if (!userId) {
    return { exists: false, updatedAt: null }
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from(TABLE_NAME)
    .select('updated_at')
    .eq('user_id', userId)
    .maybeSingle<Pick<CloudConfigRow, 'updated_at'>>()

  if (error) {
    throw new Error(`云端配置状态检测失败：${error.message}`)
  }

  if (!data) {
    return { exists: false, updatedAt: null }
  }

  return {
    exists: true,
    updatedAt: data.updated_at ?? null,
  }
}

export async function loadCloudConfigConflictMetaForCurrentUser(): Promise<CloudConfigConflictMeta> {
  if (!isSupabaseConfigured()) {
    return { exists: false, fingerprint: null }
  }

  const userId = await getSupabaseUserId()
  if (!userId) {
    return { exists: false, fingerprint: null }
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from(TABLE_NAME)
    .select('gitee_repo, gitee_owner, gitee_repo_name, gitee_branch, password_hash, kdf_params, encrypted_token, token_cipher_version')
    .eq('user_id', userId)
    .maybeSingle<CloudConfigConflictSnapshot>()

  if (error) {
    throw new Error(`云端配置状态检测失败：${error.message}`)
  }

  if (!data) {
    return { exists: false, fingerprint: null }
  }

  return {
    exists: true,
    fingerprint: buildCloudConfigConflictFingerprint(data),
  }
}

export async function saveCloudConfigForCurrentUser(config: AppConfig): Promise<void> {
  if (!isSupabaseConfigured()) {
    return
  }

  const userId = await getSupabaseUserId()
  if (!userId) {
    return
  }

  const client = getSupabaseClient()
  const payload = toCloudPayload(userId, config)

  const { error } = await client.from(TABLE_NAME).upsert(payload, {
    onConflict: 'user_id',
    ignoreDuplicates: false,
  })

  if (error) {
    throw new Error(`云端配置保存失败：${error.message}`)
  }
}

export async function hasCloudSession(): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false
  }

  const userId = await getSupabaseUserId()
  return Boolean(userId)
}
