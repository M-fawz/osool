import type { Application, Role } from '@prisma/client'
import { db } from '@/lib/db'
import { isBrokerRole } from '@/lib/auth/roles'
import type { Session } from '@/lib/auth/session'

/**
 * May this person open this document?
 *
 * The route used to answer with one line: any government role that can see case
 * data could open any document in the register. That is a *role* check standing
 * in for an *object* check, and the difference is the whole of this file: a
 * files clerk in Aswan could read the identity card attached to an application
 * in Cairo that nobody had assigned them to, and the audit trail would record it
 * as an ordinary view.
 *
 * §4's table already says what each post is for, and this is that table applied
 * to one file at a time. Three of the entries are the interesting ones:
 *
 *   · **`ANALYST` — "Explicitly cannot: see document contents."** Written down,
 *     and previously not enforced anywhere. An analyst works on aggregates; a
 *     scanned national ID is not an aggregate.
 *   · **`AUDITOR` — "Read everything, including the audit trail."** So the
 *     auditor is the one role with a genuinely unrestricted grant, and it is
 *     unrestricted on purpose: an oversight function that can be excluded from
 *     files is not an oversight function.
 *   · **`SYSTEM_ADMIN` — "Administration is not access."** Refused, like
 *     everywhere else.
 *
 * Everyone else gets the file when the file is theirs: the officer it is
 * assigned to, or an officer whose stage the file is currently at. That is the
 * paper reality — a file sits on one desk at a time — expressed as a rule.
 *
 * One thing this deliberately does *not* do is apply REQ-REG-052 to reading.
 * An officer who examined an application must be able to open its documents —
 * reading them is what examining *was*. Segregation of duties restricts the
 * decision, and `transition()` refuses that decision under a row lock whatever
 * this function says. Denying the examiner sight of the file they examined
 * would not add a control; it would break the one step the file is on.
 *
 * The `basis` on an allowed answer is written into the audit event, so the trail
 * records not just that a document was read but on what authority.
 */

export type AccessDecision =
  | { allowed: true; basis: string }
  | { allowed: false; reason: string; reasonAr: string }

/** The stages at which a file legitimately sits on each post's desk. */
const STAGE_ACCESS: Partial<Record<Role, Application['status'][]>> = {
  REGISTRY_CLERK: ['SUBMITTED', 'UNDER_INTAKE'],
  REVIEWER: ['UNDER_REVIEW'],
  CARD_ISSUER: ['APPROVED', 'AWAITING_PAYMENT', 'CARD_ISSUED'],
  DATA_MANAGER: ['APPROVED', 'AWAITING_PAYMENT', 'CARD_ISSUED', 'ACTIVE'],
  FILES_HEAD: ['ACTIVE'],
}

export interface DocumentForAccess {
  id: string
  applicationId: string | null
  application: {
    id: string
    brokerEntityId: string
    status: Application['status']
    examinerId: string | null
    reviewerId: string | null
    intakeClerkId: string | null
    cardIssuerId: string | null
  } | null
}

/** The include a caller needs so this function has what it reads. */
export const documentForAccess = {
  application: {
    select: {
      id: true,
      brokerEntityId: true,
      status: true,
      examinerId: true,
      reviewerId: true,
      intakeClerkId: true,
      cardIssuerId: true,
    },
  },
} as const

function refuse(reason: string, reasonAr: string): AccessDecision {
  return { allowed: false, reason, reasonAr }
}

export async function canOpenDocument(
  session: Pick<Session, 'userId' | 'role' | 'brokerEntityId'>,
  document: DocumentForAccess,
): Promise<AccessDecision> {
  const application = document.application

  // ── The supervised population ────────────────────────────────────────────
  if (isBrokerRole(session.role)) {
    if (!application) {
      return refuse(
        'This document is not attached to an application your firm can access.',
        'هذا المستند غير مرتبط بطلب يخص منشأتك.',
      )
    }
    if (!session.brokerEntityId || session.brokerEntityId !== application.brokerEntityId) {
      return refuse(
        'This document belongs to another firm’s application.',
        'هذا المستند يخص طلب منشأة أخرى.',
      )
    }
    return { allowed: true, basis: 'OWN_FIRM' }
  }

  // ── The two roles with a written answer ──────────────────────────────────
  if (session.role === 'SYSTEM_ADMIN') {
    return refuse(
      'Administration is not access. The system administrator manages accounts and does not open case files.',
      'إدارة النظام ليست اطّلاعاً. مسؤول النظام يدير الحسابات ولا يفتح ملفات الطلبات.',
    )
  }

  if (session.role === 'ANALYST') {
    return refuse(
      'The analyst role works on aggregates and does not open document contents.',
      'صلاحية المحلل تعمل على البيانات المجمّعة ولا تتيح فتح محتوى المستندات.',
    )
  }

  if (session.role === 'AUDITOR') {
    return { allowed: true, basis: 'AUDIT_OVERSIGHT' }
  }

  if (!application) {
    return refuse(
      'This document is not attached to any application.',
      'هذا المستند غير مرتبط بأي طلب.',
    )
  }

  // ── On the file by name ──────────────────────────────────────────────────
  if (application.examinerId === session.userId) return { allowed: true, basis: 'ASSIGNED_EXAMINER' }
  if (application.reviewerId === session.userId) return { allowed: true, basis: 'DECIDING_REVIEWER' }
  if (application.intakeClerkId === session.userId) return { allowed: true, basis: 'INTAKE_CLERK' }
  if (application.cardIssuerId === session.userId) return { allowed: true, basis: 'CARD_ISSUER' }

  // ── At this post's stage ─────────────────────────────────────────────────
  const stages = STAGE_ACCESS[session.role]
  if (stages?.includes(application.status)) {
    return { allowed: true, basis: `STAGE:${application.status}` }
  }

  // ── Supervision, over the registered population only ─────────────────────
  if (session.role === 'AML_SUPERVISOR' || session.role === 'INSPECTOR') {
    const supervised = await db.registration.findFirst({
      where: { brokerEntityId: application.brokerEntityId, archivedAt: null },
      select: { id: true },
    })
    if (supervised) return { allowed: true, basis: 'SUPERVISED_ENTITY' }

    return refuse(
      'Supervision covers registered brokers. This application has not produced a registration yet.',
      'الرقابة تشمل الوسطاء المقيدين. هذا الطلب لم ينتج عنه قيد بعد.',
    )
  }

  return refuse(
    'This application is not at your stage and is not assigned to you.',
    'هذا الطلب ليس في مرحلة اختصاصك ولم يُحل إليك.',
  )
}

/** Load a document with everything `canOpenDocument` needs, in one query. */
export async function loadDocumentForAccess(id: string) {
  return db.document.findUnique({
    where: { id },
    include: documentForAccess,
  })
}
