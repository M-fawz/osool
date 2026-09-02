import type { ApplicationStatus, Prisma, Role } from '@prisma/client'
import { db } from '@/lib/db'
import { DEFAULT_PAGE_SIZE, type PageRequest } from '@/lib/pagination'

/**
 * The queues. One per government role, and each one is that role's landing
 * screen.
 *
 * 03-DESIGN-DIRECTION §8: "Design it like a professional tool: dense,
 * keyboard-driven, information-rich, with the queue always visible and the next
 * action always obvious." An official who has to navigate to find their work
 * has been given a filing cabinet, not a system.
 *
 * Oldest first, always. A queue sorted newest-first quietly buries the file
 * that has been waiting longest, which is the one an applicant is telephoning
 * about — and "abnormal dwell time" is an integrity signal in 00-VISION §5
 * precisely because a register that lets files age invisibly is a register
 * where files age.
 */

/** Which states each role is waiting on, and what they do about them. */
export const QUEUE_STATES: Partial<Record<Role, ApplicationStatus[]>> = {
  REGISTRY_CLERK: ['SUBMITTED', 'UNDER_INTAKE'],
  EXAMINER: ['UNDER_EXAMINATION'],
  REVIEWER: ['UNDER_REVIEW'],
  CARD_ISSUER: ['APPROVED', 'AWAITING_PAYMENT', 'CARD_ISSUED'],
  DATA_MANAGER: ['APPROVED', 'AWAITING_PAYMENT', 'ACTIVE'],
  FILES_HEAD: ['ACTIVE'],
  AUDITOR: [
    'SUBMITTED', 'UNDER_INTAKE', 'UNDER_EXAMINATION', 'AWAITING_COMPLETION',
    'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'AWAITING_PAYMENT', 'CARD_ISSUED', 'ACTIVE',
  ],
}

/** Where each role's queue lives, so the sidebar and the dashboard agree. */
export const QUEUE_ROUTES: Partial<Record<Role, string>> = {
  REGISTRY_CLERK: '/intake',
  EXAMINER: '/examination',
  REVIEWER: '/review',
  CARD_ISSUER: '/issuance',
  DATA_MANAGER: '/records',
  FILES_HEAD: '/archive',
}

export interface QueueRow {
  id: string
  status: ApplicationStatus
  temporaryNumber: string | null
  tradeNameAr: string
  tradeNameEn: string | null
  requestedCategory: string | null
  requestedTypes: string[]
  paidUpCapital: string | null
  submittedAt: Date | null
  /** Last movement of any kind, which is what "waiting since" actually means. */
  lastMovedAt: Date
  /** Whole days since the last movement. Drawn as a caution past a week. */
  waitingDays: number
  examinerName: string | null
  reviewerName: string | null
  openCompletions: number
  registrationNumber: string | null
}

function wholeDaysSince(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000))
}

/**
 * The rows waiting on a set of states.
 *
 * `excludeExaminedBy` is how REQ-REG-052 reaches the interface: a reviewer's
 * queue does not show files they examined themselves. The server refuses the
 * decision anyway — that is the control — but a queue that offers a file the
 * system will then refuse is a queue that wastes an official's time and teaches
 * them to distrust it.
 */
export async function loadQueue(input: {
  states: ApplicationStatus[]
  excludeExaminedBy?: string | null
  /** Free text over the firm's name and the temporary number. */
  search?: string | null
  page?: PageRequest
  now?: Date
}): Promise<{ rows: QueueRow[]; total: number }> {
  const now = input.now ?? new Date()
  const page = input.page ?? { page: 1, pageSize: DEFAULT_PAGE_SIZE, skip: 0, take: DEFAULT_PAGE_SIZE }
  const term = input.search?.trim()

  const where: Prisma.ApplicationWhereInput = {
    status: { in: input.states },
    archivedAt: null,
    ...(input.excludeExaminedBy ? { NOT: { examinerId: input.excludeExaminedBy } } : {}),
    ...(term
      ? {
          OR: [
            { temporaryNumber: { contains: term, mode: 'insensitive' } },
            { entityData: { tradeNameAr: { contains: term, mode: 'insensitive' } } },
            { entityData: { tradeNameEn: { contains: term, mode: 'insensitive' } } },
            { brokerEntity: { tradeNameAr: { contains: term, mode: 'insensitive' } } },
            { brokerEntity: { tradeNameEn: { contains: term, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const [total, applications] = await Promise.all([
    db.application.count({ where }),
    db.application.findMany({
      where,
      // Oldest movement first: the file that has waited longest is the one at
      // the top of the screen.
      orderBy: { updatedAt: 'asc' },
      skip: page.skip,
      take: page.take,
      include: {
        entityData: { select: { tradeNameAr: true, tradeNameEn: true } },
        brokerEntity: { select: { tradeNameAr: true, tradeNameEn: true } },
        examiner: { select: { name: true, nameAr: true } },
        reviewer: { select: { name: true, nameAr: true } },
        registration: { select: { registrationNumber: true } },
        _count: { select: { completions: { where: { status: 'REQUESTED' } } } },
      },
    }),
  ])

  const rows: QueueRow[] = applications.map((a) => ({
    id: a.id,
    status: a.status,
    temporaryNumber: a.temporaryNumber,
    // The declared name leads, because that is what the examiner is checking.
    // The entity's own name is the fallback for a file whose entity step is
    // not filled in yet, which is a real state a clerk can be looking at.
    tradeNameAr: a.entityData?.tradeNameAr ?? a.brokerEntity.tradeNameAr,
    tradeNameEn: a.entityData?.tradeNameEn ?? a.brokerEntity.tradeNameEn,
    requestedCategory: a.requestedCategory,
    requestedTypes: a.requestedTypes,
    paidUpCapital: a.paidUpCapital?.toString() ?? null,
    submittedAt: a.submittedAt,
    lastMovedAt: a.updatedAt,
    waitingDays: wholeDaysSince(a.updatedAt, now),
    examinerName: a.examiner?.nameAr ?? a.examiner?.name ?? null,
    reviewerName: a.reviewer?.nameAr ?? a.reviewer?.name ?? null,
    openCompletions: a._count.completions,
    registrationNumber: a.registration?.registrationNumber ?? null,
  }))

  return { rows, total }
}

/** The queue for a role, with that role's own rules applied. */
export async function loadQueueForRole(
  role: Role,
  actorUserId: string,
  options: { page?: PageRequest; search?: string | null; now?: Date } = {},
): Promise<{ rows: QueueRow[]; total: number }> {
  const states = QUEUE_STATES[role]
  if (!states || states.length === 0) return { rows: [], total: 0 }

  return loadQueue({
    states,
    // REQ-REG-052, applied to what the reviewer is even shown.
    excludeExaminedBy: role === 'REVIEWER' ? actorUserId : null,
    page: options.page,
    search: options.search,
    now: options.now,
  })
}

/**
 * The broker's own applications, newest first — the portal's landing list.
 *
 * Paged like everything else. This one previously had no `take` at all, which
 * on the portal is the least dangerous version of the problem — a firm has a
 * handful of applications — right up until a large brokerage with years of
 * renewals opens the page and the server materialises all of them.
 */
export async function loadBrokerApplications(
  brokerEntityId: string,
  page?: PageRequest,
): Promise<{
  rows: Awaited<ReturnType<typeof brokerApplicationRows>>
  total: number
}> {
  const where = { brokerEntityId, archivedAt: null }
  const [total, rows] = await Promise.all([
    db.application.count({ where }),
    brokerApplicationRows(where, page),
  ])
  return { rows, total }
}

function brokerApplicationRows(
  where: Prisma.ApplicationWhereInput,
  page?: PageRequest,
) {
  return db.application.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    skip: page?.skip ?? 0,
    take: page?.take ?? DEFAULT_PAGE_SIZE,
    include: {
      entityData: { select: { tradeNameAr: true, tradeNameEn: true } },
      registration: { select: { registrationNumber: true, validFrom: true, validTo: true } },
      _count: { select: { completions: { where: { status: 'REQUESTED' } } } },
    },
  })
}
