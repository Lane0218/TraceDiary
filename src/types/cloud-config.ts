import type { AppConfig } from './config'

export interface CloudConfigRow {
  user_id: string
  gitee_repo: string
  gitee_owner: string
  gitee_repo_name: string
  gitee_branch: string
  password_hash: string
  password_expiry: string
  kdf_params: AppConfig['kdfParams']
  encrypted_token: string | null
  token_cipher_version: AppConfig['tokenCipherVersion']
  updated_at?: string
}

export interface CloudConfigUpsertPayload {
  user_id: string
  gitee_repo: string
  gitee_owner: string
  gitee_repo_name: string
  gitee_branch: string
  password_hash: string
  password_expiry: string
  kdf_params: AppConfig['kdfParams']
  encrypted_token: string | null
  token_cipher_version: AppConfig['tokenCipherVersion']
}

export interface CloudConfigMeta {
  exists: boolean
  updatedAt: string | null
}
