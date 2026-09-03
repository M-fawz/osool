import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { env } from '@/lib/env'
import { putDocument, sha256, storage, storageKeyFor, verifyStoredDocument } from '@/lib/storage'

/**
 * The archive-integrity check — 02-SYSTEM-ARCHITECTURE §7.
 *
 * "The hash is what allows the Authority to prove that the document reviewed in
 * March is byte-identical to the one in the archive today."
 *
 * `verifyStoredDocument` implemented that and had **no callers anywhere** —
 * exported, correct, and never run. It now runs on a schedule
 * (`npm run sweep -- documents`), and these tests exist because a check that
 * only ever reports INTACT is indistinguishable from a check that does nothing.
 * A first run over the development store passed on all 2,016 documents, which
 * proves the happy path and nothing else. So each test below makes the check
 * *fail*, deliberately.
 */

async function storeSomething(): Promise<{ key: string; bytes: Buffer }> {
  const bytes = Buffer.from(`osool archive integrity ${randomBytes(8).toString('hex')}`)
  const stored = await putDocument({ bytes, mimeType: 'text/plain' })
  return { key: stored.key, bytes }
}

describe('a document that has not been touched', () => {
  it('verifies', async () => {
    const { key } = await storeSomething()
    const result = await verifyStoredDocument(key)

    expect(result.ok).toBe(true)
    expect(result.actualHash).toBe(result.expectedHash)
  })
})

describe('a document that is not there', () => {
  it('fails, and says the bytes are missing rather than that they differ', async () => {
    // A hash of something never stored: the key is well formed, the object is
    // absent. This is the shape of "somebody removed a file from the bucket".
    const key = storageKeyFor(sha256(Buffer.from(`never stored ${randomBytes(8).toString('hex')}`)))
    const result = await verifyStoredDocument(key)

    expect(result.ok).toBe(false)
    expect(result.actualHash).toBeNull()
  })
})

describe('the driver itself', () => {
  it('will not overwrite an object that already exists', async () => {
    /*
     * Found while writing the tamper test below, which originally tried to
     * corrupt a document by calling `put` again with different bytes — and
     * could not. `LocalDriver.put` opens with `flag: 'wx'`, which fails if the
     * file is already there, and swallows only EEXIST.
     *
     * That is the "never overwrite — supersede" guarantee of CLAUDE.md's upload
     * rule, enforced at the filesystem call rather than by convention. Worth an
     * assertion of its own now that it is known to hold.
     */
    const { key, bytes } = await storeSomething()
    const different = Buffer.from(`different bytes ${randomBytes(8).toString('hex')}`)

    await storage().put(key, different, { contentType: 'text/plain' })

    const after = await storage().get(key)
    expect(after).not.toBeNull()
    expect(sha256(after!)).toBe(sha256(bytes))
  })
})

describe('a document whose bytes no longer match its key', () => {
  it('fails, and reports what the bytes actually hash to', async () => {
    /*
     * Tampering has to bypass the driver, because the driver refuses to
     * overwrite — so this writes to the file directly, which is what someone
     * with access to the bucket or the disk would actually do. That is the
     * threat the content hash exists to detect: not a bad write through the
     * application, but a change made behind its back.
     *
     * Local driver only. Against S3 the equivalent is a PutObject on the same
     * key by something holding bucket credentials; the check is identical, the
     * staging is not, and it is proven against MinIO in the Phase 4 stack.
     */
    if (env.STORAGE_DRIVER !== 'local') return

    const a = await storeSomething()
    const b = Buffer.from(`tampered bytes ${randomBytes(8).toString('hex')}`)

    await writeFile(resolve(process.cwd(), env.STORAGE_LOCAL_PATH, a.key), b)

    const result = await verifyStoredDocument(a.key)

    expect(result.ok).toBe(false)
    expect(result.actualHash).toBe(sha256(b))
    expect(result.actualHash).not.toBe(result.expectedHash)
    // The expected hash still comes from the key, so a report can say what the
    // document was *supposed* to be, not merely that it is wrong.
    expect(result.expectedHash).toBe(sha256(a.bytes))
  })
})

describe('content addressing', () => {
  it('files identical bytes exactly once', async () => {
    const bytes = Buffer.from(`identical ${randomBytes(8).toString('hex')}`)

    const first = await putDocument({ bytes, mimeType: 'text/plain' })
    const second = await putDocument({ bytes, mimeType: 'text/plain' })

    expect(second.key).toBe(first.key)
    expect(first.isNew).toBe(true)
    // The second upload recognised the bytes rather than storing them again —
    // "identical bytes are stored exactly once", from the schema's own comment.
    expect(second.isNew).toBe(false)
  })

  it('derives the key from the hash, so the key cannot disagree with the bytes', async () => {
    const { key, bytes } = await storeSomething()
    expect(key.endsWith(sha256(bytes))).toBe(true)
  })
})
