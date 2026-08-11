import type { BrokerCategory, BrokerType, Governorate } from '@prisma/client'
import { db } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'

/**
 * The public verification lookup. REQ-REG-061.
 *
 * "Public lookup exists so third parties can verify a number they are shown."
 * 00-VISION §4: "Any citizen, developer, bank, or notary can confirm a broker's
 * registration number, category, permitted types, and validity — instead of
 * having no way to check at all." That sentence is the whole specification, and
 * this function returns exactly those four things and nothing else.
 *
 * What it deliberately does not return, and why each one matters:
 *
 *   · No personal names, no national IDs, no owners, no managers. The register
 *     is of *firms*; the people behind them are identifying data under
 *     REQ-DPA-002 and no counterparty needs them to check a number.
 *   · No application, no case, no supervisory state. A public endpoint that
 *     distinguished "under examination" from "not registered" would leak the
 *     existence of live files to anyone who could guess a number.
 *   · No reason for a negative answer. 01-LEGAL-REFERENCE Part A: an entity
 *     that is not in good standing "appears as unverified in public lookup" —
 *     one answer, whether the number was never issued, has lapsed, or is
 *     suspended. Publishing which of those it is would be a sanction this
 *     screen has no authority to impose, and CLAUDE.md rule 8 forbids the
 *     system deciding anything of the kind on its own.
 *
 * The lookup is audited with a null actor. src/lib/audit names this case
 * explicitly — "null only for unauthenticated events: a public verification
 * lookup, a failed sign-in" — because REQ-DPA-002 audits reads, not only
 * writes, and because who is checking which brokers is itself a signal.
 */

export interface VerifiedRegistration {
  outcome: 'verified'
  registrationNumber: string
  tradeNameAr: string
  tradeNameEn: string | null
  category: BrokerCategory
  types: BrokerType[]
  /** Nullable on the entity, so nullable here. A missing one is omitted, never guessed. */
  governorate: Governorate | null
  validFrom: Date
  validTo: Date
}

export interface UnverifiedRegistration {
  outcome: 'unverified'
  registrationNumber: string
}

export type VerificationResult = VerifiedRegistration | UnverifiedRegistration

/**
 * Registration numbers are shown to the public on letterheads and signage, so
 * they arrive typed by hand, from a photograph, or pasted with stray
 * whitespace. Arabic-Indic digits are normalised because a number read off an
 * Arabic document is very often keyed in Arabic-Indic form, and refusing it
 * would be refusing the register's own notation.
 */
export function normaliseRegistrationNumber(raw: string): string {
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩'
  const easternArabicIndic = '۰۱۲۳۴۵۶۷۸۹'
  return raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String(arabicIndic.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(easternArabicIndic.indexOf(d)))
    .replace(/[\s‎‏]+/g, '')
    .replace(/[\\|]/g, '/')
}

/** A number that could not possibly be one, refused before it reaches the database. */
export function looksLikeRegistrationNumber(value: string): boolean {
  return /^[0-9]{4}\/[0-9]{1,6}$/.test(value)
}

export async function verifyRegistrationNumber(
  rawNumber: string,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<VerificationResult> {
  const registrationNumber = normaliseRegistrationNumber(rawNumber)

  if (!looksLikeRegistrationNumber(registrationNumber)) {
    return { outcome: 'unverified', registrationNumber }
  }

  const record = await db.registration.findUnique({
    where: { registrationNumber },
    select: {
      id: true,
      registrationNumber: true,
      category: true,
      types: true,
      status: true,
      validFrom: true,
      validTo: true,
      archivedAt: true,
      brokerEntity: {
        select: { tradeNameAr: true, tradeNameEn: true, governorate: true },
      },
    },
  })

  // Validity is recomputed here rather than trusted from the status column.
  // A registration that lapsed overnight has an ACTIVE row until whatever
  // updates it next runs, and a public answer that a lapsed registration is
  // current is the one wrong answer this page must never give.
  const now = new Date()
  const current =
    record !== null &&
    record.archivedAt === null &&
    record.status === 'ACTIVE' &&
    record.validFrom <= now &&
    record.validTo >= now

  await recordAuditEvent({
    accessType: 'READ',
    action: 'PUBLIC_VERIFICATION_LOOKUP',
    entityType: 'Registration',
    entityId: record?.id ?? null,
    actorUserId: null,
    actorRole: null,
    actorLabel: 'public verification (unauthenticated)',
    reason: `Public lookup of ${registrationNumber}.`,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
    payload: { registrationNumber, outcome: current ? 'verified' : 'unverified' },
  })

  if (!record || !current) {
    return { outcome: 'unverified', registrationNumber }
  }

  return {
    outcome: 'verified',
    registrationNumber: record.registrationNumber,
    tradeNameAr: record.brokerEntity.tradeNameAr,
    tradeNameEn: record.brokerEntity.tradeNameEn,
    category: record.category,
    types: record.types,
    governorate: record.brokerEntity.governorate,
    validFrom: record.validFrom,
    validTo: record.validTo,
  }
}
