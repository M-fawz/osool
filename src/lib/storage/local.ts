import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { env } from '@/lib/env'
import type { PutOptions, StorageDriver, StoredObject } from './driver'

/**
 * Local disk, for development only.
 *
 * src/lib/env.ts refuses to start a production process with this driver
 * selected: uploaded documents that live on a container's filesystem do not
 * survive a redeploy, and a register that loses its documents is not a
 * register.
 */
export class LocalDriver implements StorageDriver {
  readonly name = 'local' as const
  private readonly root = resolve(process.cwd(), env.STORAGE_LOCAL_PATH)

  private path(key: string): string {
    const full = resolve(this.root, key)
    // Keys are derived from hashes, so this cannot currently be reached — but
    // a driver that concatenates a caller's string into a filesystem path
    // should refuse to escape its root regardless of who is calling today.
    if (!full.startsWith(this.root)) {
      throw new Error(`Refusing a storage key that escapes the storage root: ${key}`)
    }
    return full
  }

  async put(key: string, bytes: Buffer, options: PutOptions): Promise<StoredObject> {
    const path = this.path(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, bytes, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
      // 'wx' fails if the file exists. Identical content under a
      // content-addressed key means the existing file is already correct.
      if (error.code !== 'EEXIST') throw error
    })
    await writeFile(join(dirname(path), `${key.split('/').pop()}.meta.json`), JSON.stringify({
      contentType: options.contentType,
      originalFilename: options.originalFilename ?? null,
      storedAt: new Date().toISOString(),
    }, null, 2), 'utf8').catch(() => {})

    return {
      key,
      sizeBytes: bytes.byteLength,
      contentType: options.contentType,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key))
    } catch {
      return null
    }
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const path = this.path(key)
      const info = await stat(path)
      let contentType = 'application/octet-stream'
      try {
        const meta = JSON.parse(
          await readFile(join(dirname(path), `${key.split('/').pop()}.meta.json`), 'utf8'),
        )
        contentType = meta.contentType ?? contentType
      } catch { /* metadata is a convenience, not a requirement */ }

      return {
        key,
        sizeBytes: info.size,
        contentType,
        sha256: key.split('/').pop() ?? '',
      }
    } catch {
      return null
    }
  }
}
