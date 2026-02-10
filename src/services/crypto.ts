import type { KdfParams } from '../types/config'

const PBKDF2_NAME = 'PBKDF2'
const SHA256_NAME = 'SHA-256'
const AES_GCM_NAME = 'AES-GCM'
const AES_KEY_LENGTH = 256
const GCM_IV_LENGTH = 12
const DEFAULT_TARGET_MIN_MS = 200
const DEFAULT_TARGET_MAX_MS = 500
const DEFAULT_MIN_ITERATIONS = 150_000
const DEFAULT_MAX_ITERATIONS = 1_000_000
const DEFAULT_INITIAL_ITERATIONS = 300_000
const DEFAULT_SALT_LENGTH = 16
const DEFAULT_MAX_ATTEMPTS = 8

export interface KdfCalibrationOptions {
  targetMinMs?: number
  targetMaxMs?: number
  minIterations?: number
  maxIterations?: number
  initialIterations?: number
  maxAttempts?: number
  saltByteLength?: number
  salt?: string
  measureDurationMs?: (iterations: number) => Promise<number>
}

function assertCryptoAvailable(): Crypto {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.subtle) {
    throw new Error('当前环境不支持 Web Crypto API')
  }
  return cryptoApi
}

function nowMs(): number {
  if (typeof globalThis.performance !== 'undefined') {
    return globalThis.performance.now()
  }
  return Date.now()
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function importPasswordKey(password: string): Promise<CryptoKey> {
  const cryptoApi = assertCryptoAvailable()
  const encoder = new TextEncoder()
  return cryptoApi.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: PBKDF2_NAME },
    false,
    ['deriveBits', 'deriveKey'],
  )
}

async function measurePbkdf2DurationMs(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<number> {
  const cryptoApi = assertCryptoAvailable()
  const baseKey = await importPasswordKey(password)
  const startMs = nowMs()
  await cryptoApi.subtle.deriveBits(
    {
      name: PBKDF2_NAME,
      hash: SHA256_NAME,
      salt: toArrayBuffer(salt),
      iterations,
    },
    baseKey,
    AES_KEY_LENGTH,
  )
  return nowMs() - startMs
}

function normalizeKdfParams(kdfParams: KdfParams): void {
  if (kdfParams.algorithm !== PBKDF2_NAME || kdfParams.hash !== SHA256_NAME) {
    throw new Error('不支持的 KDF 参数')
  }
  if (!Number.isInteger(kdfParams.iterations) || kdfParams.iterations <= 0) {
    throw new Error('kdfParams.iterations 必须为正整数')
  }
  if (!kdfParams.salt) {
    throw new Error('kdfParams.salt 不能为空')
  }
}

export async function calibrateKdfParams(
  password: string,
  options: KdfCalibrationOptions = {},
): Promise<KdfParams> {
  if (!password) {
    throw new Error('主密码不能为空')
  }

  const targetMinMs = options.targetMinMs ?? DEFAULT_TARGET_MIN_MS
  const targetMaxMs = options.targetMaxMs ?? DEFAULT_TARGET_MAX_MS
  if (targetMinMs <= 0 || targetMaxMs < targetMinMs) {
    throw new Error('无效的目标耗时区间')
  }

  const minIterations = options.minIterations ?? DEFAULT_MIN_ITERATIONS
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS
  if (minIterations <= 0 || maxIterations < minIterations) {
    throw new Error('无效的迭代次数范围')
  }

  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  if (maxAttempts <= 0) {
    throw new Error('maxAttempts 必须大于 0')
  }

  const cryptoApi = assertCryptoAvailable()
  const salt =
    typeof options.salt === 'string'
      ? base64ToBytes(options.salt)
      : cryptoApi.getRandomValues(
          new Uint8Array(options.saltByteLength ?? DEFAULT_SALT_LENGTH),
        )

  let iterations = clampInteger(
    options.initialIterations ?? DEFAULT_INITIAL_ITERATIONS,
    minIterations,
    maxIterations,
  )
  const targetMidMs = (targetMinMs + targetMaxMs) / 2
  const measureDurationMs =
    options.measureDurationMs ??
    ((currentIterations: number) =>
      measurePbkdf2DurationMs(password, salt, currentIterations))

  let measuredMs = await measureDurationMs(iterations)
  for (let attempt = 1; attempt < maxAttempts; attempt += 1) {
    if (measuredMs >= targetMinMs && measuredMs <= targetMaxMs) {
      break
    }

    const safeMs = Math.max(measuredMs, 1)
    let nextIterations = clampInteger(
      (iterations * targetMidMs) / safeMs,
      minIterations,
      maxIterations,
    )

    if (nextIterations === iterations) {
      const step = Math.max(1, Math.round(iterations * 0.1))
      if (measuredMs < targetMinMs) {
        nextIterations = Math.min(maxIterations, iterations + step)
      } else {
        nextIterations = Math.max(minIterations, iterations - step)
      }
    }

    if (nextIterations === iterations) {
      break
    }

    iterations = nextIterations
    measuredMs = await measureDurationMs(iterations)
  }

  return {
    algorithm: PBKDF2_NAME,
    hash: SHA256_NAME,
    iterations,
    salt: bytesToBase64(salt),
  }
}

export async function deriveAesKeyFromPassword(
  password: string,
  kdfParams: KdfParams,
): Promise<CryptoKey> {
  if (!password) {
    throw new Error('主密码不能为空')
  }
  normalizeKdfParams(kdfParams)

  const cryptoApi = assertCryptoAvailable()
  const salt = base64ToBytes(kdfParams.salt)
  const baseKey = await importPasswordKey(password)

  return cryptoApi.subtle.deriveKey(
    {
      name: PBKDF2_NAME,
      hash: SHA256_NAME,
      salt: toArrayBuffer(salt),
      iterations: kdfParams.iterations,
    },
    baseKey,
    { name: AES_GCM_NAME, length: AES_KEY_LENGTH },
    true,
    ['encrypt', 'decrypt'],
  )
}

export async function hashMasterPassword(
  password: string,
  kdfParams: KdfParams,
): Promise<string> {
  if (!password) {
    throw new Error('主密码不能为空')
  }
  normalizeKdfParams(kdfParams)

  const cryptoApi = assertCryptoAvailable()
  const salt = base64ToBytes(kdfParams.salt)
  const baseKey = await importPasswordKey(password)
  const bits = await cryptoApi.subtle.deriveBits(
    {
      name: PBKDF2_NAME,
      hash: SHA256_NAME,
      salt: toArrayBuffer(salt),
      iterations: kdfParams.iterations,
    },
    baseKey,
    AES_KEY_LENGTH,
  )

  return bytesToBase64(new Uint8Array(bits))
}

export async function encryptWithAesGcm(
  plaintext: string,
  key: CryptoKey,
): Promise<string> {
  const cryptoApi = assertCryptoAvailable()
  const iv = cryptoApi.getRandomValues(new Uint8Array(GCM_IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)
  const encryptedBuffer = await cryptoApi.subtle.encrypt(
    { name: AES_GCM_NAME, iv: toArrayBuffer(iv) },
    key,
    encoded,
  )
  const encryptedBytes = new Uint8Array(encryptedBuffer)
  const payload = new Uint8Array(iv.length + encryptedBytes.length)
  payload.set(iv, 0)
  payload.set(encryptedBytes, iv.length)
  return bytesToBase64(payload)
}

export async function decryptWithAesGcm(
  encryptedBase64: string,
  key: CryptoKey,
): Promise<string> {
  const cryptoApi = assertCryptoAvailable()
  const payload = base64ToBytes(encryptedBase64)
  if (payload.byteLength <= GCM_IV_LENGTH) {
    throw new Error('密文格式无效')
  }
  const iv = payload.subarray(0, GCM_IV_LENGTH)
  const encryptedBytes = payload.subarray(GCM_IV_LENGTH)
  const decryptedBuffer = await cryptoApi.subtle.decrypt(
    { name: AES_GCM_NAME, iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(encryptedBytes),
  )
  return new TextDecoder().decode(decryptedBuffer)
}

export async function encryptToken(
  token: string,
  password: string,
  kdfParams: KdfParams,
): Promise<string> {
  const key = await deriveAesKeyFromPassword(password, kdfParams)
  return encryptWithAesGcm(token, key)
}

export async function decryptToken(
  encryptedToken: string,
  password: string,
  kdfParams: KdfParams,
): Promise<string> {
  const key = await deriveAesKeyFromPassword(password, kdfParams)
  return decryptWithAesGcm(encryptedToken, key)
}
