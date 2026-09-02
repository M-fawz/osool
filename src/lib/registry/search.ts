import type { BrokerCategory, BrokerType, Governorate, Prisma, RegistrationStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'
import { DEFAULT_PAGE_SIZE, type PageRequest } from '@/lib/pagination'

/**
 * Searching the register.
 *
 * `verification.ts` answers one question — "is *this* number good?" — and
 * answers it for anyone, deliberately narrowly. This is the other half of
 * REQ-REG-061: the register as a list somebody can look through, by name, by
 * governorate, by category.
 *
 * ── Why this is not public ───────────────────────────────────────────────
 *
 * Verification takes a number the counterparty has already been shown and
 * confirms it. Search takes no number and returns names. Those are different
 * disclosures: a public, filterable list of every registered broker with their
 * governorate and category is a marketing database, and this product is
 * explicitly not a marketplace (00-VISION §8). Worse, it would let anyone
 * enumerate the entire supervised population, which is precisely the thing the
 * one-answer design of the public lookup exists to prevent.
 *
 * So search requires a session, and the officer's own role decides how much of
 * a row they see. A member of the public still gets verification, which is what
 * 00-VISION promises them: "confirm a broker's registration number, category,
 * permitted types, and validity".
 *
 * ── What a row shows ─────────────────────────────────────────────────────
 *
 * Firms and their standing. Never the people behind them: owners, managers and
 * signatories are identifying data under REQ-DPA-002 and belong on the case
 * file, not in a list view that an analyst can filter and export.
 */

export interface RegisterFilters {
  /** Free text over trade names and the registration number. */
  q?: string | null
  status?: RegistrationStatus | null
  category?: BrokerCategory | null
  type?: BrokerType | null
  governorate?: Governorate | null
  /** Registrations expiring on or before this date — the renewal worklist. */
  expiringBefore?: Date | null
}

export interface RegisterRow {
  id: string
  registrationNumber: string
  tradeNameAr: string
  tradeNameEn: string | null
  category: BrokerCategory
  types: BrokerType[]
  status: RegistrationStatus
  governorate: Governorate | null
  validFrom: Date
  validTo: Date
  /** Negative once the registration has run out. Drives the caution marks. */
  daysToExpiry: number
  brokerEntityId: string
}

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * Build the `where` from the filters.
 *
 * Kept separate so the count and the page use provably the same predicate. The
 * classic pagination bug is a total computed from a slightly different filter
 * than the rows, which produces a last page that is empty and a total nobody
 * can reconcile.
 */
function buildWhere(filters: RegisterFilters): Prisma.RegistrationWhereInput {
  const term = filters.q?.trim()

  return {
    archivedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.type ? { types: { has: filters.type } } : {}),
    ...(filters.governorate ? { brokerEntity: { governorate: filters.governorate } } : {}),
    ...(filters.expiringBefore ? { validTo: { lte: filters.expiringBefore } } : {}),
    ...(term
      ? {
          OR: [
            { registrationNumber: { contains: term, mode: 'insensitive' } },
            { brokerEntity: { tradeNameAr: { contains: term, mode: 'insensitive' } } },
            { brokerEntity: { tradeNameEn: { contains: term, mode: 'insensitive' } } },
            { brokerEntity: { tradeStyleAr: { contains: term, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }
}

export async function searchRegister(input: {
  filters: RegisterFilters
  page?: PageRequest
  now?: Date
}): Promise<{ rows: RegisterRow[]; total: number }> {
  const now = input.now ?? new Date()
  const page = input.page ?? {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    skip: 0,
    take: DEFAULT_PAGE_SIZE,
  }

  const where = buildWhere(input.filters)

  const [total, registrations] = await Promise.all([
    db.registration.count({ where }),
    db.registration.findMany({
      where,
      /*
       * Soonest to expire first, then by number.
       *
       * Not alphabetical, and not newest-first. The question an officer opens
       * this screen with is almost always "what needs attention", and what
       * needs attention in a register of time-limited registrations is the one
       * running out next. A name search overrides the ordering in practice by
       * returning one row.
       */
      orderBy: [{ validTo: 'asc' }, { registrationNumber: 'asc' }],
      skip: page.skip,
      take: page.take,
      include: {
        brokerEntity: {
          select: { id: true, tradeNameAr: true, tradeNameEn: true, governorate: true },
        },
      },
    }),
  ])

  const rows: RegisterRow[] = registrations.map((r) => ({
    id: r.id,
    registrationNumber: r.registrationNumber,
    tradeNameAr: r.brokerEntity.tradeNameAr,
    tradeNameEn: r.brokerEntity.tradeNameEn,
    category: r.category,
    types: r.types,
    status: r.status,
    governorate: r.brokerEntity.governorate,
    validFrom: r.validFrom,
    validTo: r.validTo,
    daysToExpiry: wholeDaysBetween(now, r.validTo),
    brokerEntityId: r.brokerEntity.id,
  }))

  return { rows, total }
}

/**
 * The counts that sit above the table.
 *
 * One query per status rather than a `groupBy`, because the numbers have to
 * respect the *other* filters the officer has set — a governorate filter with a
 * status breakdown means "how many of Cairo's are lapsed", which a global
 * groupBy cannot answer.
 */
export async function registerSummary(
  filters: RegisterFilters,
): Promise<Record<RegistrationStatus | 'ALL', number>> {
  const base = buildWhere({ ...filters, status: null })

  const statuses: RegistrationStatus[] = [
    'ACTIVE',
    'RENEWAL_DUE',
    'LAPSED',
    'SUSPENDED',
    'CANCELLED',
  ]

  const [all, ...counts] = await Promise.all([
    db.registration.count({ where: base }),
    ...statuses.map((status) => db.registration.count({ where: { ...base, status } })),
  ])

  const summary = { ALL: all } as Record<RegistrationStatus | 'ALL', number>
  for (const [index, status] of statuses.entries()) {
    summary[status] = counts[index] ?? 0
  }
  return summary
}

/**
 * Record that somebody searched the register. REQ-DPA-002.
 *
 * The filters are audited, not the results. Who looked at which broker matters;
 * a list of every row that happened to be on page four of somebody's search
 * would bloat the trail without answering a question anyone asks. The filters
 * are the intent, and the intent is the thing an inspector wants.
 */
export async function recordRegisterSearch(input: {
  actorUserId: string
  actorRole: Parameters<typeof recordAuditEvent>[0]['actorRole']
  actorLabel: string
  filters: RegisterFilters
  resultCount: number
  ipAddress: string | null
  userAgent: string | null
}): Promise<void> {
  await recordAuditEvent({
    accessType: 'READ',
    action: 'REGISTER_SEARCHED',
    entityType: 'Registration',
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    actorLabel: input.actorLabel,
    reason: 'The register was searched.',
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    payload: {
      q: input.filters.q ?? null,
      status: input.filters.status ?? null,
      category: input.filters.category ?? null,
      type: input.filters.type ?? null,
      governorate: input.filters.governorate ?? null,
      resultCount: input.resultCount,
    },
  })
}
