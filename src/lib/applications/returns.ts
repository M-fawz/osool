import type { CompletionCategory, CompletionStatus } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * What was wrong, what has been put right, and what is still outstanding.
 *
 * A returned application used to arrive at the applicant as one word —
 * "AWAITING_COMPLETION" — and a count. The items were in the database, itemised
 * exactly as 02-SYSTEM-ARCHITECTURE §5 requires, and nothing on the portal read
 * them out. So the broker knew something was wrong and had to telephone the
 * Authority to find out what, which is the paper process with a login page in
 * front of it.
 *
 * This assembles the answer to four questions, which are the four an applicant
 * actually has:
 *
 *   · **What is wrong?** Every item, grouped by the part of the file it belongs
 *     to, with the requirement it rests on where the examiner cited one.
 *   · **What do I need to do?** The required correction, as a separate sentence
 *     from the problem — conflating the two is why the same item comes back a
 *     second time.
 *   · **What have I already fixed?** Items marked satisfied, kept visible
 *     rather than disappearing, because an applicant who cannot see their own
 *     progress cannot tell whether the work took.
 *   · **What is still pending?** The outstanding count, which is the one number
 *     that decides whether they can resubmit.
 *
 * And one the register needs: **has this happened before?** Round numbers are
 * on every item, so "returned twice" is a fact anyone can read rather than
 * something inferred from the length of the event trail. 00-VISION §5 signal 15
 * — completions, then a sudden approval — depends on that being legible.
 */

export interface ReturnedItem {
  id: string
  /** 1–4 on the printed form, unbounded here, numbered across the whole file. */
  itemNumber: number
  round: number
  category: CompletionCategory
  checklistItemKey: string | null
  fieldKey: string | null
  problemAr: string
  problemEn: string | null
  requiredCorrectionAr: string | null
  requiredCorrectionEn: string | null
  legalReference: string | null
  status: CompletionStatus
  requestedAt: Date
  requestedByName: string | null
  resolvedAt: Date | null
  resolutionReason: string | null
  satisfiedByDocumentId: string | null
}

export interface ReturnRound {
  round: number
  requestedAt: Date
  requestedByName: string | null
  items: ReturnedItem[]
  outstanding: number
  satisfied: number
  waived: number
}

export interface ReturnHistory {
  /** Every item ever raised on this application, newest round first. */
  rounds: ReturnRound[]
  /** How many times the file has been sent back. 0 means never. */
  timesReturned: number
  /** Outstanding across all rounds — what stops a resubmission. */
  outstandingTotal: number
  /** Satisfied across all rounds — what the applicant has already done. */
  satisfiedTotal: number
  /** Items grouped for the applicant's screen. Outstanding only. */
  outstandingByCategory: Array<{ category: CompletionCategory; items: ReturnedItem[] }>
  /** True where the file is with the applicant right now. */
  awaitingApplicant: boolean
  /**
   * Whether any outstanding item actually says what would put it right.
   *
   * `requiredCorrectionAr` arrived with the categorised composer; items raised
   * before it describe the fault and stop there. The applicant's screen reads
   * this to decide whether it may promise "what is needed", rather than
   * promising it over a list that cannot deliver it.
   */
  outstandingHasCorrections: boolean
}

/** The order the categories are shown in — documents first, because most are. */
const CATEGORY_ORDER: CompletionCategory[] = [
  'DOCUMENT',
  'APPLICATION_DATA',
  'CONTRACT',
  'DECLARATION',
  'OTHER',
]

export const completionCategoryLabels: Record<CompletionCategory, { ar: string; en: string }> = {
  DOCUMENT: { ar: 'المستندات', en: 'Documents' },
  APPLICATION_DATA: { ar: 'بيانات الطلب', en: 'Application information' },
  CONTRACT: { ar: 'عقود الوساطة', en: 'Brokerage contracts' },
  DECLARATION: { ar: 'الإقرارات', en: 'Declarations' },
  OTHER: { ar: 'متطلبات أخرى', en: 'Other requirements' },
}

export async function loadReturnHistory(applicationId: string): Promise<ReturnHistory> {
  const [application, completions] = await Promise.all([
    db.application.findUnique({ where: { id: applicationId }, select: { status: true } }),
    db.completion.findMany({
      where: { applicationId },
      include: {
        requestedBy: { select: { name: true, nameAr: true } },
      },
      orderBy: [{ round: 'desc' }, { itemNumber: 'asc' }],
    }),
  ])

  const items: ReturnedItem[] = completions.map((c) => ({
    id: c.id,
    itemNumber: c.itemNumber,
    round: c.round,
    category: c.category,
    checklistItemKey: c.checklistItemKey,
    fieldKey: c.fieldKey,
    problemAr: c.descriptionAr,
    problemEn: c.descriptionEn,
    requiredCorrectionAr: c.requiredCorrectionAr,
    requiredCorrectionEn: c.requiredCorrectionEn,
    legalReference: c.legalReference,
    status: c.status,
    requestedAt: c.requestedAt,
    requestedByName: c.requestedBy.nameAr ?? c.requestedBy.name,
    resolvedAt: c.resolvedAt,
    resolutionReason: c.resolutionReason,
    satisfiedByDocumentId: c.satisfiedByDocumentId,
  }))

  const byRound = new Map<number, ReturnedItem[]>()
  for (const item of items) {
    const bucket = byRound.get(item.round)
    if (bucket) bucket.push(item)
    else byRound.set(item.round, [item])
  }

  const rounds: ReturnRound[] = [...byRound.entries()]
    .sort(([a], [b]) => b - a)
    .map(([round, roundItems]) => {
      const first = roundItems[0]!
      return {
        round,
        requestedAt: first.requestedAt,
        requestedByName: first.requestedByName,
        items: roundItems,
        outstanding: roundItems.filter((i) => i.status === 'REQUESTED').length,
        satisfied: roundItems.filter((i) => i.status === 'SATISFIED').length,
        waived: roundItems.filter((i) => i.status === 'WAIVED').length,
      }
    })

  const outstanding = items.filter((i) => i.status === 'REQUESTED')

  const outstandingByCategory = CATEGORY_ORDER.map((category) => ({
    category,
    items: outstanding.filter((i) => i.category === category),
  })).filter((group) => group.items.length > 0)

  return {
    rounds,
    timesReturned: rounds.length,
    outstandingTotal: outstanding.length,
    satisfiedTotal: items.filter((i) => i.status === 'SATISFIED').length,
    outstandingByCategory,
    awaitingApplicant: application?.status === 'AWAITING_COMPLETION',
    outstandingHasCorrections: outstanding.some(
      (i) => Boolean(i.requiredCorrectionAr) || Boolean(i.requiredCorrectionEn),
    ),
  }
}

/**
 * The one-line summary a queue row or a card needs.
 *
 * Deliberately says "returned twice" rather than "2 completion rounds": an
 * officer triaging a queue is asking how often this file has been sent back,
 * and internal vocabulary makes them translate before they can answer.
 */
export function returnSummary(
  history: ReturnHistory,
  locale: 'ar' | 'en',
): string | null {
  if (history.timesReturned === 0) return null

  if (locale === 'ar') {
    const times =
      history.timesReturned === 1
        ? 'مرة واحدة'
        : history.timesReturned === 2
          ? 'مرتين'
          : `${history.timesReturned} مرات`
    return history.outstandingTotal > 0
      ? `أُعيد للاستيفاء ${times} — ${history.outstandingTotal} بنداً ما زالت مطلوبة.`
      : `أُعيد للاستيفاء ${times} — استُوفيت جميع البنود.`
  }

  const times = history.timesReturned === 1 ? 'once' : `${history.timesReturned} times`
  return history.outstandingTotal > 0
    ? `Returned for correction ${times} — ${history.outstandingTotal} item(s) still outstanding.`
    : `Returned for correction ${times} — every item has been dealt with.`
}
