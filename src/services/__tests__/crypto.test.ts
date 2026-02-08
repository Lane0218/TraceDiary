import { describe, expect, it } from 'vitest'

import type { KdfParams } from '../../types/config'
import {
  calibrateKdfParams,
  decryptToken,
  decryptWithAesGcm,
  deriveAesKeyFromPassword,
  encryptToken,
  encryptWithAesGcm,
} from '../crypto'

const TEST_KDF_PARAMS: KdfParams = {
  algorithm: 'PBKDF2',
  hash: 'SHA-256',
  iterations: 2_000,
  salt: 'MDEyMzQ1Njc4OWFiY2RlZg==',
}

describe('crypto service', () => {
  it('输出可持久化的 kdfParams，且迭代次数落在约束范围', async () => {
    const params = await calibrateKdfParams('Password123', {
      minIterations: 150_000,
      maxIterations: 1_000_000,
      initialIterations: 300_000,
      targetMinMs: 200,
      targetMaxMs: 500,
      salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
      measureDurationMs: async () => 300,
    })

    expect(params.algorithm).toBe('PBKDF2')
    expect(params.hash).toBe('SHA-256')
    expect(params.salt).toBe('AAAAAAAAAAAAAAAAAAAAAA==')
    expect(params.iterations).toBeGreaterThanOrEqual(150_000)
    expect(params.iterations).toBeLessThanOrEqual(1_000_000)
  })

  it('校准会根据耗时向上调整迭代次数', async () => {
    const params = await calibrateKdfParams('Password123', {
      minIterations: 150_000,
      maxIterations: 1_000_000,
      initialIterations: 150_000,
      targetMinMs: 200,
      targetMaxMs: 500,
      salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
      measureDurationMs: async (iterations) => iterations / 2_000,
    })

    expect(params.iterations).toBeGreaterThan(150_000)
    expect(params.iterations).toBeLessThanOrEqual(1_000_000)
  })

  it('AES-256-GCM 可无损往返解密，格式为 IV+ciphertext 的 Base64', async () => {
    const key = await deriveAesKeyFromPassword('Password123', TEST_KDF_PARAMS)
    const encrypted = await encryptWithAesGcm('hello tracediary', key)

    const rawPayload = atob(encrypted)
    expect(rawPayload.length).toBeGreaterThan(12)

    const decrypted = await decryptWithAesGcm(encrypted, key)
    expect(decrypted).toBe('hello tracediary')
  })

  it('encryptedToken 封装可用，且错误主密码无法解密', async () => {
    const encryptedToken = await encryptToken(
      'gitee_pat_xxx',
      'Password123',
      TEST_KDF_PARAMS,
    )

    const restored = await decryptToken(
      encryptedToken,
      'Password123',
      TEST_KDF_PARAMS,
    )
    expect(restored).toBe('gitee_pat_xxx')

    await expect(
      decryptToken(encryptedToken, 'WrongPassword1', TEST_KDF_PARAMS),
    ).rejects.toThrow()
  })
})
