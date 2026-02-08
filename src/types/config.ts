export interface KdfParams {
  algorithm: 'PBKDF2'
  hash: 'SHA-256'
  iterations: number
  salt: string
}

export type TokenCipherVersion = 'v1'

export interface AppConfig {
  giteeRepo: string
  giteeOwner: string
  giteeRepoName: string
  passwordHash: string
  passwordExpiry: string
  kdfParams: KdfParams
  encryptedToken?: string
  tokenCipherVersion: TokenCipherVersion
}
