import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { env } from '@/lib/env'
import type { PutOptions, StorageDriver, StoredObject } from './driver'

/**
 * Any S3-compatible endpoint.
 *
 * Deliberately not AWS-specific: 02-SYSTEM-ARCHITECTURE §10 decision 1 notes a
 * government deployment may require in-country hosting, so this must work
 * against MinIO or a national provider as readily as against AWS. That is why
 * `S3_ENDPOINT` exists and `forcePathStyle` is set.
 */
export class S3Driver implements StorageDriver {
  readonly name = 's3' as const
  private readonly client: S3Client
  private readonly bucket: string

  constructor() {
    if (!env.S3_BUCKET) throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET.')
    this.bucket = env.S3_BUCKET
    this.client = new S3Client({
      region: env.S3_REGION,
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
      ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.S3_ACCESS_KEY_ID,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    })
  }

  async put(key: string, bytes: Buffer, options: PutOptions): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: options.contentType,
        // The hash travels with the object, so integrity can be checked
        // without re-reading the whole body.
        ChecksumSHA256: Buffer.from(key.split('/').pop() ?? '', 'hex').toString('base64'),
        Metadata: options.originalFilename ? { 'original-filename': encodeURIComponent(options.originalFilename) } : undefined,
      }),
    )
    return {
      key,
      sizeBytes: bytes.byteLength,
      contentType: options.contentType,
      sha256: key.split('/').pop() ?? '',
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      const bytes = await result.Body?.transformToByteArray()
      return bytes ? Buffer.from(bytes) : null
    } catch {
      return null
    }
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return {
        key,
        sizeBytes: result.ContentLength ?? 0,
        contentType: result.ContentType ?? 'application/octet-stream',
        sha256: key.split('/').pop() ?? '',
      }
    } catch {
      return null
    }
  }
}
