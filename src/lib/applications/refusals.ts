import type { ApplicationStatus, Role } from '@prisma/client'
import { roleLabels } from '@/lib/auth/roles'
import type { RuleViolation } from '@/lib/rules/violation'

/**
 * The refusals the workflow itself produces.
 *
 * These are not rule-set refusals — no decree sets them, and there is no
 * threshold to version. They come from the shape of the process: a step that
 * is not available yet, a role that does not perform this step, a file that
 * belongs to somebody else, a second signature from the person who wrote the
 * first.
 *
 * They still go through `RuleViolation`, because 03-DESIGN-DIRECTION §6 admits
 * no exceptions: every refusal in this product states what is blocked, why with
 * the rule named plainly, the exact next step, and who to ask. A workflow
 * refusal that said "invalid transition" would be the bare error the design
 * direction forbids, and it would be the one an official hits most often.
 */

const AUTHORITY_AR =
  'الإدارة المركزية للسجلات التجارية بالهيئة العامة للرقابة على الصادرات والواردات.'
const AUTHORITY_EN = 'The Central Administration for Commercial Registrations at GOEIC.'

/** The Arabic and English names of a status, as the workflow screens print it. */
export const statusLabels: Record<ApplicationStatus, { ar: string; en: string }> = {
  DRAFT: { ar: 'مسودة', en: 'Draft' },
  SUBMITTED: { ar: 'مُقدَّم', en: 'Submitted' },
  UNDER_INTAKE: { ar: 'قيد القيد الوارد', en: 'At intake' },
  UNDER_EXAMINATION: { ar: 'قيد الفحص', en: 'Under examination' },
  AWAITING_COMPLETION: { ar: 'بانتظار الاستيفاء', en: 'Awaiting completions' },
  UNDER_REVIEW: { ar: 'قيد المراجعة', en: 'Under review' },
  APPROVED: { ar: 'موافق عليه', en: 'Approved' },
  REJECTED: { ar: 'مرفوض', en: 'Refused' },
  AWAITING_PAYMENT: { ar: 'بانتظار سداد الرسوم', en: 'Awaiting fees' },
  CARD_ISSUED: { ar: 'صدرت البطاقة', en: 'Card issued' },
  ACTIVE: { ar: 'قيد ساري', en: 'Active registration' },
  WITHDRAWN: { ar: 'مسحوب', en: 'Withdrawn' },
}

/**
 * The step is not available from where the file currently stands.
 *
 * This is the refusal a second official sees when someone else has already
 * moved the file — two examiners with the same queue open, one clicks first.
 * So it names the state the file is actually in, which is the only piece of
 * information that makes the screen make sense again.
 */
export function stepNotAvailable(input: {
  action: string
  currentState: ApplicationStatus
}): RuleViolation {
  const state = statusLabels[input.currentState]

  return {
    code: 'TRANSITION_NOT_PERMITTED',
    severity: 'BLOCKING',
    requirementIds: ['REQ-REG-050'],
    legalSource: 'GOEIC workflow, REQ-REG-050 — the order of the eight steps',
    field: undefined,
    needsCounsel: false,
    evidence: { action: input.action, currentState: input.currentState },
    ar: {
      blocked: 'تعذّر تنفيذ هذا الإجراء على هذا الطلب.',
      why: `الطلب الآن في حالة «${state.ar}»، وهذا الإجراء غير متاح من هذه الحالة. ترتيب خطوات الفحص والمراجعة ثابت ولا يمكن تخطي خطوة منه.`,
      nextStep:
        'أعد تحميل الصفحة لعرض الحالة الحالية. إذا كان زميل قد نفّذ الخطوة قبلك، فالطلب انتقل بالفعل إلى الخطوة التالية.',
      whoToAsk: `إذا بدت الحالة غير صحيحة، راجع ${AUTHORITY_AR}`,
    },
    en: {
      blocked: 'This step cannot be performed on this application.',
      why: `The application is currently at "${state.en}", and this step is not available from there. The order of the workflow steps is fixed and none of them can be skipped.`,
      nextStep:
        'Reload the page to see the current state. If a colleague performed the step first, the file has already moved on.',
      whoToAsk: `If the state looks wrong, refer it to ${AUTHORITY_EN}`,
    },
  }
}

/** The role held does not perform this step. */
export function roleCannotPerform(input: {
  action: string
  role: Role
  allowedRoles: Role[]
}): RuleViolation {
  const held = roleLabels[input.role]
  const permittedAr = input.allowedRoles.map((r) => roleLabels[r].ar).join('، ')
  const permittedEn = input.allowedRoles.map((r) => roleLabels[r].en).join(', ')

  return {
    code: 'ROLE_NOT_PERMITTED_FOR_STEP',
    severity: 'BLOCKING',
    requirementIds: ['REQ-REG-050', 'REQ-REG-052'],
    legalSource: 'GOEIC workflow, REQ-REG-050 — each step has its own officer',
    needsCounsel: false,
    evidence: { action: input.action, role: input.role, allowedRoles: input.allowedRoles },
    ar: {
      blocked: 'تعذّر تنفيذ هذا الإجراء بصلاحيتك الحالية.',
      why: `صلاحيتك هي «${held.ar}»، وهذه الخطوة من اختصاص: ${permittedAr || '— لا أحد'}. كل خطوة في سير العمل مسندة إلى وظيفة بعينها.`,
      nextStep: 'أحل الملف إلى الموظف المختص بهذه الخطوة، أو اطلب تعديل صلاحيتك.',
      whoToAsk: 'مسؤول النظام بالهيئة هو من يمنح الصلاحيات.',
    },
    en: {
      blocked: 'Your role cannot perform this step.',
      why: `You hold "${held.en}", and this step belongs to: ${permittedEn || '— no role'}. Every step in the workflow is assigned to a specific post.`,
      nextStep: 'Pass the file to the officer whose step this is, or request a change of role.',
      whoToAsk: 'The system administrator at the Authority assigns roles.',
    },
  }
}

/** A broker acting on an application that is not their firm's. */
export function notYourApplication(): RuleViolation {
  return {
    code: 'APPLICATION_NOT_YOURS',
    severity: 'BLOCKING',
    requirementIds: ['REQ-DPA-001'],
    legalSource: 'Law 151 of 2020 — purpose limitation and data minimisation',
    needsCounsel: false,
    evidence: {},
    ar: {
      blocked: 'لا يمكن فتح هذا الطلب.',
      why: 'هذا الطلب يخص منشأة أخرى، ولا يُتاح لأي منشأة الاطلاع على طلبات غيرها.',
      nextStep: 'ارجع إلى صفحة طلباتك واختر طلباً يخص منشأتك.',
      whoToAsk: `إذا كنت تعتقد أن هذا الطلب يخصك، تواصل مع ${AUTHORITY_AR}`,
    },
    en: {
      blocked: 'This application cannot be opened.',
      why: 'It belongs to another firm, and no firm may see another firm’s applications.',
      nextStep: 'Return to your applications and open one belonging to your firm.',
      whoToAsk: `If you believe this application is yours, contact ${AUTHORITY_EN}`,
    },
  }
}

/**
 * REQ-REG-052 — segregation of duties.
 *
 * The most important refusal in the back office, and the one whose wording
 * matters most: it must not read as an accusation. The officer has not done
 * anything wrong by opening the screen; the control exists so that no single
 * person can carry a file from examination to approval, which protects them as
 * much as it protects the register.
 */
export function segregationOfDuties(input: { role: Role }): RuleViolation {
  const held = roleLabels[input.role]

  return {
    code: 'SEGREGATION_OF_DUTIES',
    severity: 'BLOCKING',
    requirementIds: ['REQ-REG-052'],
    legalSource: 'REQ-REG-052 — an integrity control this platform adds',
    needsCounsel: false,
    evidence: { role: input.role },
    ar: {
      blocked: 'لا يمكنك اتخاذ قرار في هذا الطلب.',
      why: `أنت فاحص هذا الطلب، ولا يجوز أن يكون الفاحص والمراجع للطلب الواحد شخصاً واحداً. هذا فصل للاختصاصات يحمي القرار ويحميك.`,
      nextStep: 'أحل الطلب إلى مراجع آخر لاتخاذ القرار.',
      whoToAsk: `للاستفسار عن توزيع المراجعة، راجع ${AUTHORITY_AR}`,
    },
    en: {
      blocked: 'You cannot decide this application.',
      why: `You examined it, and the examiner and the reviewer of one application must be different people. This separation protects the decision, and it protects you. You hold "${held.en}".`,
      nextStep: 'Pass the application to another reviewer for the decision.',
      whoToAsk: `For questions about how review is allocated, refer to ${AUTHORITY_EN}`,
    },
  }
}

/**
 * REQ-REG-052, the other half.
 *
 * Segregation of duties says the examiner and the reviewer must be different
 * people. It only means anything if the *examiner* is a specific person: a step
 * any examiner may perform on any file is a step with no accountable author,
 * and the segregation the next step enforces is then between one anonymous
 * officer and another.
 *
 * So the file names its examiner at assignment, and from that moment the
 * examiner's steps belong to that person. This refusal is what a colleague sees
 * on someone else's file. Like the segregation refusal it must not read as an
 * accusation — opening a colleague's file to look at it is ordinary, and the
 * officer has done nothing wrong by trying.
 *
 * `assignedTo` is deliberately a name and not an id: an officer who needs to
 * hand a file over needs to know who currently holds it.
 */
export function notTheAssignedOfficer(input: {
  role: Role
  post: 'examiner' | 'reviewer'
  assignedToName: string | null
}): RuleViolation {
  const held = roleLabels[input.role]
  const postAr = input.post === 'examiner' ? 'الفاحص المختص' : 'المراجع المختص'
  const postEn = input.post === 'examiner' ? 'the assigned examiner' : 'the assigned reviewer'

  const whyAr = input.assignedToName
    ? `هذا الطلب محال إلى ${input.assignedToName}، وخطوات ${postAr} يؤديها الموظف المُحال إليه الطلب وحده. صلاحيتك هي «${held.ar}» وهي صحيحة، لكن هذا الملف ليس ملفك.`
    : `هذا الطلب لم يُحل بعد إلى ${postAr}، وخطوات هذه المرحلة لا تُؤدى قبل الإحالة. الإحالة تُسجَّل ولا تحدث تلقائياً بمجرد فتح الملف.`

  const whyEn = input.assignedToName
    ? `This application is assigned to ${input.assignedToName}, and ${postEn}’s steps are performed by that officer alone. You hold "${held.en}", which is the right role — this is simply not your file.`
    : `This application has not been assigned to ${postEn} yet, and the steps of this stage are not performed before assignment. Assignment is recorded deliberately; it does not happen as a side effect of opening the file.`

  return {
    code: 'NOT_THE_ASSIGNED_OFFICER',
    severity: 'BLOCKING',
    requirementIds: ['REQ-REG-050', 'REQ-REG-052'],
    legalSource: 'GOEIC workflow, REQ-REG-050 step 2 — the file is examined by the officer it was assigned to',
    needsCounsel: false,
    evidence: { role: input.role, post: input.post, assigned: input.assignedToName !== null },
    ar: {
      blocked: 'لا يمكنك تنفيذ هذه الخطوة على هذا الطلب.',
      why: whyAr,
      nextStep: input.assignedToName
        ? 'ارجع إلى قائمة عملك واختر طلباً محالاً إليك. إذا كان يلزم نقل هذا الطلب إليك، فالإحالة تتم من كاتب القيد.'
        : 'أعد الطلب إلى كاتب القيد لإحالته إلى فاحص، ثم يتولى الفاحص المُحال إليه هذه الخطوة.',
      whoToAsk: `توزيع الملفات على الفاحصين من اختصاص كاتب القيد. للاستفسار، راجع ${AUTHORITY_AR}`,
    },
    en: {
      blocked: 'You cannot perform this step on this application.',
      why: whyEn,
      nextStep: input.assignedToName
        ? 'Return to your queue and open a file assigned to you. If this file should be yours, reassignment is done by the registry clerk.'
        : 'Send the file back to the registry clerk to be assigned to an examiner; the assigned examiner then performs this step.',
      whoToAsk: `Allocation of files to examiners is the registry clerk’s function. For questions, refer to ${AUTHORITY_EN}`,
    },
  }
}

/**
 * A step that requires something to have been recorded first — completions with
 * no items, a card with no fee record, a delivery with no card.
 */
export function precondition(input: {
  code: string
  requirementIds: string[]
  legalSource: string
  ar: { blocked: string; why: string; nextStep: string; whoToAsk?: string }
  en: { blocked: string; why: string; nextStep: string; whoToAsk?: string }
  evidence?: Record<string, unknown>
}): RuleViolation {
  return {
    code: input.code,
    severity: 'BLOCKING',
    requirementIds: input.requirementIds,
    legalSource: input.legalSource,
    needsCounsel: false,
    evidence: input.evidence ?? {},
    ar: { ...input.ar, whoToAsk: input.ar.whoToAsk ?? AUTHORITY_AR },
    en: { ...input.en, whoToAsk: input.en.whoToAsk ?? AUTHORITY_EN },
  }
}

export { AUTHORITY_AR, AUTHORITY_EN }

// ── When authorisation fails inside a Server Action ─────────────────────────

/**
 * The refusals for an action whose *authorisation* failed rather than whose
 * rules did.
 *
 * Pages call `guard()` and render a refusal. Server Actions called
 * `requireRole()`, which throws — and nothing caught it, so the throw escaped
 * into Next's error boundary and the officer got a generic client error. That
 * is the bare error 03-DESIGN-DIRECTION §6 forbids, in the one situation where
 * the user is least equipped to guess what happened.
 *
 * It is not a theoretical path. The page rendered because the officer held the
 * role at the time; the action runs later. An administrator changing a role, a
 * suspension, or a session expiring between the two is ordinary, and each of
 * the three deserves its own next step rather than one shrug.
 */
export function noLongerPermitted(input: { role: Role }): RuleViolation {
  const role = roleLabels[input.role]
  return {
    code: 'ROLE_NOT_PERMITTED_NOW',
    severity: 'BLOCKING',
    requirementIds: ['REQ-REG-050'],
    legalSource: 'GOEIC workflow — role permissions, 02-SYSTEM-ARCHITECTURE §4',
    needsCounsel: false,
    evidence: { role: input.role },
    ar: {
      blocked: 'لم يُنفَّذ هذا الإجراء.',
      why: `صلاحيتك الحالية (${role.ar}) لا تسمح بهذه الخطوة. ربما تغيّرت صلاحيتك بعد فتح هذه الصفحة.`,
      nextStep: 'أعد تحميل الصفحة لعرض ما تستطيع عمله بصلاحيتك الحالية. لم يتغيّر شيء في الملف.',
      whoToAsk: AUTHORITY_AR,
    },
    en: {
      blocked: 'This action was not carried out.',
      why: `Your current role (${role.en}) does not perform this step. Your role may have changed since this page was opened.`,
      nextStep: 'Reload the page to see what your current role can do. Nothing on the file was changed.',
      whoToAsk: AUTHORITY_EN,
    },
  }
}

export function sessionNoLongerValid(): RuleViolation {
  return {
    code: 'SESSION_NOT_VALID',
    severity: 'BLOCKING',
    requirementIds: ['REQ-DPA-002'],
    legalSource: '02-SYSTEM-ARCHITECTURE §4',
    needsCounsel: false,
    evidence: {},
    ar: {
      blocked: 'لم يُنفَّذ هذا الإجراء.',
      why: 'انتهت جلستك، فلم يعد بالإمكان التحقق من هويتك عند تنفيذ هذه الخطوة.',
      nextStep: 'سجّل الدخول مرة أخرى ثم أعد المحاولة. لم يتغيّر شيء في الملف.',
      whoToAsk: AUTHORITY_AR,
    },
    en: {
      blocked: 'This action was not carried out.',
      why: 'Your session has ended, so your identity could not be confirmed when the step was taken.',
      nextStep: 'Sign in again and retry. Nothing on the file was changed.',
      whoToAsk: AUTHORITY_EN,
    },
  }
}

export function accountIsSuspended(reason: string | null): RuleViolation {
  return {
    code: 'ACCOUNT_SUSPENDED',
    severity: 'BLOCKING',
    requirementIds: ['REQ-DPA-002'],
    legalSource: '02-SYSTEM-ARCHITECTURE §4',
    needsCounsel: false,
    evidence: reason ? { reason } : {},
    ar: {
      blocked: 'لم يُنفَّذ هذا الإجراء.',
      why: reason
        ? `حسابك موقوف حالياً: ${reason}`
        : 'حسابك موقوف حالياً، والحسابات الموقوفة لا تُجري أي إجراء على الملفات.',
      nextStep: 'راجع مدير النظام لرفع الإيقاف. لم يتغيّر شيء في الملف.',
      whoToAsk: AUTHORITY_AR,
    },
    en: {
      blocked: 'This action was not carried out.',
      why: reason
        ? `Your account is suspended: ${reason}`
        : 'Your account is suspended, and a suspended account cannot act on files.',
      nextStep: 'Ask a system administrator to lift the suspension. Nothing on the file was changed.',
      whoToAsk: AUTHORITY_EN,
    },
  }
}
