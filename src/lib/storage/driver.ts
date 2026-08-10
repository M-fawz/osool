export interface StoredObject {
  key: string
  sizeBytes: number
  contentType: string
  sha256: string
}

export interface PutOptions {
  contentType: string
  originalFilename?: string | null
}

/**
 * The storage contract.
 *
 * Note what is absent: there is no `delete`, and no `move`. An interface
 * cannot be misused in a way it does not describe, so the no-destruction rule
 * from 02-SYSTEM-ARCHITECTURE §7 is expressed here as a missing method rather
 * than as a comment asking people not to call one.
 */
export interface StorageDriver {
  readonly name: 'local' | 's3'
  put(key: string, bytes: Buffer, options: PutOptions): Promise<StoredObject>
  get(key: string): Promise<Buffer | null>
  head(key: string): Promise<StoredObject | null>
  /** A time-limited URL for the browser, where the driver supports one. */
  signedUrl?(key: string, expiresInSeconds: number): Promise<string>
}
