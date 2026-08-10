import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from 'node:crypto'
import { env } from '@/lib/env'

/**
 * Identifying data at rest — REQ-DPA-002.
 *
 * "Security: encryption at rest for identifying data, access control, and
 *  logging of read access, not only writes."
 *
 * A national ID number is the strongest identifier this register holds. It is
 * also the thing several integrity signals need to compare across entities —
 * 00-VISION §5's identity-reuse signal is "the same national ID appears as the
 * responsible manager of nine unrelated firms". Those two needs pull in
 * opposite directions, and the schema resolves them with two columns rather
 * than one compromise:
 *
 *   · `nationalIdEnc`  — AES-256-GCM. Reversible, authenticated, and a
 *     different ciphertext every time, so the column cannot be used to compare
 *     anything. This is the value a cleared officer can actually read.
 *   · `nationalIdHash` — HMAC-SHA256 under the same secret. Deterministic, so
 *     equal IDs produce equal hashes and duplicates are computable; keyed, so
 *     the ten-digit space cannot simply be enumerated the way a bare SHA-256
 *     of a national ID can be.
 *
 * Neither is a substitute for the other, and storing only the hash would make
 * the register unable to ever show an officer the number they are entitled to
 * see.
 */

/** Version tag on every ciphertext, so a future algorithm change is decodable. */
const VERSION = 'v1'

/**
 * The AES key and the HMAC key are derived separately from the same secret.
 * Using one key for both would let a ciphertext and a hash be related, which
 * is the sort of thing that is fine until it is not.
 */
function keys(): { enc: Buffer; mac: Buffer } {
  const secret = env.PII_ENCRYPTION_KEY
  return {
    enc: scryptSync(secret, 'osool-pii-encryption-v1', 32),
    mac: scryptSync(secret, 'osool-pii-mac-v1', 32),
  }
}

let cached: { enc: Buffer; mac: Buffer } | null = null
function derived() {
  cached ??= keys()
  return cached
}

/**
 * Encrypt an identifying value.
 *
 * Returns `v1:<iv>:<tag>:<ciphertext>`, all base64url. GCM rather than CBC
 * because the tag detects tampering: a national ID silently altered in the
 * database should fail to decrypt, not decrypt to a different person's number.
 */
export function encryptPii(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', derived().enc, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':')
}

export class PiiDecryptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PiiDecryptionError'
  }
}

export function decryptPii(stored: string): string {
  const parts = stored.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new PiiDecryptionError(
      'Stored value is not in the expected encrypted form. It was written by a different version, or it has been altered.',
    )
  }

  const [, ivB64, tagB64, ctB64] = parts as [string, string, string, string]

  try {
    const decipher = createDecipheriv('aes-256-gcm', derived().enc, Buffer.from(ivB64, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    // The authentication tag failed. Say what that means rather than leaking
    // the underlying OpenSSL message.
    throw new PiiDecryptionError(
      'This value failed its integrity check and cannot be read. It has been altered since it was written.',
    )
  }
}

/**
 * The deterministic, keyed fingerprint used for duplicate detection.
 *
 * Normalised first: Egyptian national IDs are written with spaces and
 * occasionally with Eastern Arabic digits, and `2 8 5 0 1 0 1…` must fingerprint
 * identically to `28501 01…` or the reuse signal never fires on the one case it
 * was built for.
 */
export function piiFingerprint(value: string): string {
  return createHmac('sha256', derived().mac).update(normaliseIdentifier(value)).digest('hex')
}

/** Eastern Arabic digits (٠١٢٣٤٥٦٧٨٩) mapped to Latin, and separators dropped. */
export function normaliseIdentifier(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s\-/\\.]/g, '')
    .trim()
}

/**
 * The Egyptian national ID checksum, as far as it can be checked locally.
 *
 * 02-SYSTEM-ARCHITECTURE §10 decision 4: "Checksum validation locally; no
 * external call assumed." So this is a structural check — fourteen digits, a
 * century marker, a decodable date of birth, a governorate code in range — and
 * deliberately not a claim that the person exists. It returns a reason rather
 * than a boolean so the interface can say which part is wrong.
 */
export function checkNationalIdStructure(raw: string): { ok: true; dateOfBirth: Date } | { ok: false; reason: 'LENGTH' | 'NON_NUMERIC' | 'CENTURY' | 'DATE' | 'GOVERNORATE' } {
  const value = normaliseIdentifier(raw)

  if (!/^\d+$/.test(value)) return { ok: false, reason: 'NON_NUMERIC' }
  if (value.length !== 14) return { ok: false, reason: 'LENGTH' }

  const century = Number(value[0])
  // 2 → born 1900–1999, 3 → 2000–2099. 1 exists on very old cards; it is
  // accepted because refusing it would refuse a living cardholder.
  if (![1, 2, 3].includes(century)) return { ok: false, reason: 'CENTURY' }

  const yearBase = century === 1 ? 1800 : century === 2 ? 1900 : 2000
  const year = yearBase + Number(value.slice(1, 3))
  const month = Number(value.slice(3, 5))
  const day = Number(value.slice(5, 7))

  if (month < 1 || month > 12 || day < 1 || day > 31) return { ok: false, reason: 'DATE' }
  const dateOfBirth = new Date(Date.UTC(year, month - 1, day))
  if (dateOfBirth.getUTCMonth() !== month - 1 || dateOfBirth.getUTCDate() !== day) {
    return { ok: false, reason: 'DATE' }
  }

  // Positions 8–9 are the governorate of registration. 01–35 are the
  // governorates and the special codes; 88 is "born abroad".
  const governorate = Number(value.slice(7, 9))
  if (!((governorate >= 1 && governorate <= 35) || governorate === 88)) {
    return { ok: false, reason: 'GOVERNORATE' }
  }

  return { ok: true, dateOfBirth }
}
