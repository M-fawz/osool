import { createHash } from 'node:crypto'
import { env } from '@/lib/env'
import { LocalDriver } from './local'
import { S3Driver } from './s3'
import type { StorageDriver, StoredObject } from './driver'

/**
 * Document storage. 02-SYSTEM-ARCHITECTURE §7.
 *
 * "Documents are immutable. On upload: content hashed (SHA-256), size and MIME
 *  recorded, stored under a content-addressed key. A 'replacement' creates a
 *  new version and supersedes the old one; it never overwrites. The hash is
 *  what allows the Authority to prove that the document reviewed in March is
 *  byte-identical to the one in the archive today."
 *
 * Content addressing does that work almost for free. The storage key *is* the
 * hash, so:
 *
 *   · the same bytes always land on the same key, and are stored once however
 *     many applications reference them;
 *   · a write to an existing key is provably a write of identical content, so
 *     "never overwrite" is not a rule anyone has to remember — it is
 *     arithmetic;
 *   · verifying the archive is re-hashing an object and comparing it to the
 *     name it is filed under.
 *
 * Neither driver exposes a delete. That is not an omission.
 */

export * from './driver'

let cached: StorageDriver | null = null

export function storage(): StorageDriver {
  if (cached) return cached
  cached = env.STORAGE_DRIVER === 's3' ? new S3Driver() : new LocalDriver()
  return cached
}

/** SHA-256 of a buffer, lowercase hex — the document's identity everywhere. */
export function sha256(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * The content-addressed key.
 *
 * Fanned out over two levels of two hex characters, so no single directory
 * accumulates a million entries — which is slow on a local filesystem and
 * unpleasant to list on any object store.
 */
export function storageKeyFor(hash: string): string {
  return `documents/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`
}

export interface PutResult extends StoredObject {
  /** False when identical bytes were already stored — the write was a no-op. */
  isNew: boolean
}

/**
 * Store bytes and return their address.
 *
 * Idempotent by construction: storing the same document twice yields the same
 * key and does not write a second copy.
 */
export async function putDocument(input: {
  bytes: Buffer
  mimeType: string
  originalFilename?: string | null
}): Promise<PutResult> {
  const hash = sha256(input.bytes)
  const key = storageKeyFor(hash)
  const driver = storage()

  const existing = await driver.head(key)
  if (existing) {
    return { ...existing, isNew: false }
  }

  const stored = await driver.put(key, input.bytes, {
    contentType: input.mimeType,
    originalFilename: input.originalFilename ?? null,
  })

  return { ...stored, isNew: true }
}

/**
 * Re-hash a stored object and confirm it still matches the key it is filed
 * under. This is the archive-integrity check an inspector would ask for.
 */
export async function verifyStoredDocument(key: string): Promise<{
  ok: boolean
  expectedHash: string
  actualHash: string | null
}> {
  const expectedHash = key.split('/').pop() ?? ''
  const bytes = await storage().get(key)
  if (!bytes) return { ok: false, expectedHash, actualHash: null }
  const actualHash = sha256(bytes)
  return { ok: actualHash === expectedHash, expectedHash, actualHash }
}
