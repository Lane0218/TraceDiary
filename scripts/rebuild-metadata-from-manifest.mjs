import fs from 'node:fs/promises'
import path from 'node:path'

import { encryptWithAesGcm, deriveDataEncryptionKeyFromMasterPassword } from '../src/services/crypto.ts'
import {
  createCanonicalIndexDocument,
  normalizeCanonicalIndexDocument,
} from '../src/services/index-manifest.ts'

function readArg(flag) {
  const index = process.argv.indexOf(flag)
  if (index < 0) {
    return null
  }
  return process.argv[index + 1] ?? null
}

function hasFlag(flag) {
  return process.argv.includes(flag)
}

async function main() {
  const manifestPath = readArg('--manifest') ?? 'manifest.json'
  const writeJsonPath = readArg('--write-json')
  const writeEncryptedPath = readArg('--write-encrypted')
  const generatedAt = readArg('--generated-at') ?? new Date().toISOString()
  const password = readArg('--password')
  const passwordEnv = readArg('--password-env')

  const manifestRaw = await fs.readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(manifestRaw)
  const normalized = normalizeCanonicalIndexDocument(manifest, generatedAt)
  const metadata = createCanonicalIndexDocument(normalized.entries, generatedAt, {
    version: normalized.version,
  })

  console.log(
    JSON.stringify(
      {
        manifestPath: path.resolve(manifestPath),
        generatedAt: metadata.generatedAt,
        entryCount: metadata.entryCount,
        dailyCount: metadata.dailyCount,
        yearlySummaryCount: metadata.yearlySummaryCount,
      },
      null,
      2,
    ),
  )

  if (writeJsonPath) {
    await fs.writeFile(writeJsonPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
    console.log(`已写入明文 metadata：${path.resolve(writeJsonPath)}`)
  }

  if (writeEncryptedPath) {
    const resolvedPassword = password ?? (passwordEnv ? process.env[passwordEnv] ?? '' : '')
    if (!resolvedPassword) {
      throw new Error('写入加密 metadata 前必须提供 --password 或 --password-env')
    }

    const key = await deriveDataEncryptionKeyFromMasterPassword(resolvedPassword)
    const encrypted = await encryptWithAesGcm(JSON.stringify(metadata), key)
    await fs.writeFile(writeEncryptedPath, `${encrypted}\n`, 'utf8')
    console.log(`已写入加密 metadata：${path.resolve(writeEncryptedPath)}`)
  }

  if (!writeJsonPath && !writeEncryptedPath && !hasFlag('--quiet')) {
    console.log(JSON.stringify(metadata, null, 2))
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`rebuild-metadata-from-manifest failed: ${message}`)
  process.exit(1)
})
