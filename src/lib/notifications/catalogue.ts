import type { Role } from '@prisma/client'
import { baseUrl } from '@/lib/env'
import { escapeHtml, type NoticeFact, type NoticeParts } from '@/lib/email/notice'
import { account, brokerContacts, officer, officersHolding, type Recipient } from './recipients'

/**
 * Every notification this register sends, in one list.
 *
 * One entry per *business event*, not per template and not per screen. That is
 * the distinction that keeps the mailbox honest: an event happens once, so the
 * message goes once, and a second Server Action that reaches the same event
 * reuses this entry rather than writing a second message that says nearly the
 * same thing.
 *
 * Each entry answers four questions and nothing else:
 *
 *   · **when** — named in `trigger`, which is also what the test matrix prints;
 *   · **who** — `resolve`, which applies the access rules in `recipients.ts`;
 *   · **what it says** — `build`, in both languages;
 *   · **whether it repeats** — `dedupe`, which produces the unique key.
 *
 * Deliberately *not* here: anything that would tell an unauthorised reader that
 * a supervisory report exists. REQ-AML-021 is the hardest constraint in the
 * product, and a notification is the easiest way to breach it by accident — so
 * no message about a signal is ever addressed to a broker, and the two signal
 * events resolve only to supervisory roles.
 */

export type NotificationEventKey =
  // ── The application, as the applicant experiences it ────────────────────
  | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_RETURNED'
  | 'APPLICATION_APPROVED'
  | 'APPLICATION_REJECTED'
  | 'FEES_RECORDED'
  | 'CARD_ISSUED'
  | 'CARD_DELIVERED'
  // ── The application, as the Authority works it ──────────────────────────
  | 'APPLICATION_AWAITING_INTAKE'
  | 'APPLICATION_ASSIGNED'
  | 'COMPLETIONS_SUBMITTED'
  | 'APPLICATION_READY_FOR_REVIEW'
  // ── The counter ────────────────────────────────────────────────────────
  | 'APPOINTMENT_BOOKED'
  | 'APPOINTMENT_CANCELLED'
  | 'APPOINTMENT_RESCHEDULED'
  | 'APPOINTMENT_REMINDER'
  | 'APPOINTMENT_MISSED'
  // ── The registration, after it exists ──────────────────────────────────
  | 'REGISTRATION_RENEWAL_DUE'
  | 'REGISTRATION_LAPSED'
  // ── Supervision ────────────────────────────────────────────────────────
  | 'SUPERVISORY_CONCERN_RAISED'
  | 'PROCESS_INTEGRITY_CONCERN_RAISED'
  // ── Accounts ───────────────────────────────────────────────────────────
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_REINSTATED'

export interface ApplicationSubject {
  id: string
  temporaryNumber: string | null
  brokerEntityId: string
  examinerId: string | null
  tradeNameAr: string
  tradeNameEn: string | null
}

export interface AppointmentSubject {
  id: string
  applicationId: string
  brokerEntityId: string
  purpose: 'DOCUMENT_HANDOVER' | 'CARD_COLLECTION'
  startsAt: Date
  endsAt: Date
  locationAr: string
  locationEn: string | null
  attendeeName: string
}

export interface RegistrationSubject {
  id: string
  registrationNumber: string
  brokerEntityId: string
  validFrom: Date
  validTo: Date
}

export interface SignalSubject {
  id: string
  signalType: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  family: 'SUPERVISED_POPULATION' | 'PROCESS_INTEGRITY'
  titleAr: string
  titleEn: string
  /** A short factual summary. Never document content, never an accusation. */
  summaryAr: string
  summaryEn: string
}

export interface AccountSubject {
  userId: string
  reason: string | null
}

/** Everything an event may be about. Each event uses the part it needs. */
export interface NotifySubject {
  application?: ApplicationSubject
  appointment?: AppointmentSubject
  registration?: RegistrationSubject
  signal?: SignalSubject
  accountChange?: AccountSubject
  /** Free facts a caller wants on the message — a decision note, a count. */
  extra?: Record<string, string | number | null | undefined>
}

export interface BuiltMessage {
  subjectAr: string
  subjectEn: string
  parts: NoticeParts
}

export interface EventDefinition {
  /** Plain-language trigger, printed verbatim in the email test matrix. */
  trigger: string
  /** Which roles could ever receive it. Documentation and a safety net. */
  audience: Array<Role | 'BROKER'>
  resolve: (subject: NotifySubject) => Promise<Recipient[]>
  build: (subject: NotifySubject, recipient: Recipient) => BuiltMessage
  /** The identity of this send. Two sends with one key never both go out. */
  dedupe: (subject: NotifySubject, recipient: Recipient) => string
}

// ── Small helpers the entries share ────────────────────────────────────────

const CAIRO = 'Africa/Cairo'

function reference(application: ApplicationSubject | undefined): string {
  return application?.temporaryNumber ?? application?.id.slice(-8).toUpperCase() ?? '—'
}

function firmName(application: ApplicationSubject | undefined): string {
  return application?.tradeNameAr ?? '—'
}

/** A date the way the register prints it: Latin numerals, Cairo, unambiguous. */
function stamp(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CAIRO,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function stampWithTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CAIRO,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function brokerPortalUrl(applicationId: string): string {
  return `${baseUrl}/application/${applicationId}`
}

function caseFileUrl(applicationId: string): string {
  return `${baseUrl}/applications/${applicationId}`
}

function applicationFacts(application: ApplicationSubject | undefined): NoticeFact[] {
  if (!application) return []
  return [
    { labelAr: 'الرقم المرجعي', labelEn: 'Reference', value: reference(application) },
    { labelAr: 'المنشأة', labelEn: 'Firm', value: firmName(application), rtl: true },
  ]
}

const openInPortalAr = 'فتح الطلب'
const openInPortalEn = 'Open the application'

/** Nobody is ever emailed a decision without being told what happens next. */
function whatHappensNext(ar: string, en: string): Pick<NoticeParts, 'arFooterNote' | 'enFooterNote'> {
  return { arFooterNote: ar, enFooterNote: en }
}

const purposeLabels = {
  DOCUMENT_HANDOVER: {
    ar: 'تسليم المستندات الأصلية',
    en: 'Handing over the original documents',
  },
  CARD_COLLECTION: {
    ar: 'استلام بطاقة القيد',
    en: 'Collecting the registration card',
  },
} as const

function appointmentFacts(appointment: AppointmentSubject): NoticeFact[] {
  return [
    {
      labelAr: 'الغرض',
      labelEn: 'Purpose',
      value: purposeLabels[appointment.purpose].ar,
      rtl: true,
    },
    { labelAr: 'الموعد', labelEn: 'Date and time', value: stampWithTime(appointment.startsAt) },
    {
      labelAr: 'المكان',
      labelEn: 'Location',
      value: appointment.locationAr,
      rtl: true,
    },
    { labelAr: 'اسم الحاضر', labelEn: 'Attending', value: appointment.attendeeName, rtl: true },
  ]
}

const severityLabels = {
  LOW: { ar: 'منخفضة', en: 'Low' },
  MEDIUM: { ar: 'متوسطة', en: 'Medium' },
  HIGH: { ar: 'مرتفعة', en: 'High' },
} as const

// ═══════════════════════════════════════════════════════════════════════════
// The catalogue
// ═══════════════════════════════════════════════════════════════════════════

export const CATALOGUE: Record<NotificationEventKey, EventDefinition> = {
  // ── To the applicant ─────────────────────────────────────────────────────

  APPLICATION_SUBMITTED: {
    trigger: 'The broker submits a draft and it passes the completeness evaluation.',
    audience: ['BROKER'],
    resolve: (s) => brokerContacts(s.application?.brokerEntityId ?? null),
    dedupe: (s, r) => `APPLICATION_SUBMITTED:${s.application?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'تم استلام طلب القيد',
      subjectEn: 'Your application has been received',
      parts: {
        previewText: 'The Authority has received your registration application.',
        arTitle: 'تم استلام طلبك',
        arBody: [
          'استلمت الهيئة طلب قيدك في سجل الوسطاء العقاريين. لا يلزمك أي إجراء الآن.',
          'سيُقيَّد الطلب في السجل الوارد ويُمنح رقماً مؤقتاً، ثم يُحال إلى فاحص لمراجعة المستندات.',
        ],
        enTitle: 'Your application has been received',
        enBody: [
          'The Authority has received your application for registration in the Real Estate Brokers Register. Nothing is required from you at this point.',
          'It will be entered in the incoming register under a temporary number, then assigned to an examiner who will review the documents.',
        ],
        facts: applicationFacts(s.application),
        action: s.application
          ? { url: brokerPortalUrl(s.application.id), labelAr: openInPortalAr, labelEn: openInPortalEn }
          : undefined,
        ...whatHappensNext(
          'ستصلك رسالة عند كل تغيّر في حالة الطلب. يمكنك متابعة الحالة في أي وقت من بوابة الوسيط.',
          'You will be emailed at every change of state. You can check the status at any time in the broker portal.',
        ),
      },
    }),
  },

  APPLICATION_RETURNED: {
    trigger:
      'The assigned examiner requests completions — the application moves to AWAITING_COMPLETION.',
    audience: ['BROKER'],
    resolve: (s) => brokerContacts(s.application?.brokerEntityId ?? null),
    dedupe: (s, r) =>
      `APPLICATION_RETURNED:${s.application?.id}:${s.extra?.round ?? 1}:${r.userId}`,
    build: (s) => {
      const count = Number(s.extra?.itemCount ?? 0)
      return {
        subjectAr: 'الطلب يحتاج إلى استيفاء',
        subjectEn: 'Your application needs corrections',
        parts: {
          previewText: 'Some items on your application need to be corrected before it can proceed.',
          arTitle: 'الطلب مُعاد إليك للاستيفاء',
          arBody: [
            `راجع الفاحص طلبك وحدّد <strong>${count}</strong> بنداً يحتاج إلى استيفاء قبل استكمال الفحص.`,
            'كل بند مذكور على حدة مع سبب الملاحظة والمطلوب لمعالجتها. الطلب لم يُرفض، وهو محفوظ كما هو في انتظار ردّك.',
          ],
          enTitle: 'Your application has been returned for correction',
          enBody: [
            `The examiner has reviewed your application and identified <strong>${count}</strong> item(s) that need correcting before the examination can continue.`,
            'Each item is listed separately with what is wrong and what is needed to put it right. The application has not been refused; it is held exactly as it stands, waiting for your response.',
          ],
          facts: [
            ...applicationFacts(s.application),
            { labelAr: 'عدد البنود', labelEn: 'Items to correct', value: String(count) },
          ],
          action: s.application
            ? {
                url: brokerPortalUrl(s.application.id),
                labelAr: 'عرض البنود المطلوبة',
                labelEn: 'See what needs correcting',
              }
            : undefined,
          ...whatHappensNext(
            'بعد معالجة كل البنود، أعد تقديم الطلب من البوابة ليعود إلى الفاحص نفسه.',
            'Once every item is dealt with, resubmit from the portal and the file returns to the same examiner.',
          ),
        },
      }
    },
  },

  APPLICATION_APPROVED: {
    trigger: 'The reviewer approves — the application moves to APPROVED.',
    audience: ['BROKER'],
    resolve: (s) => brokerContacts(s.application?.brokerEntityId ?? null),
    dedupe: (s, r) => `APPLICATION_APPROVED:${s.application?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'تمت الموافقة على طلب القيد',
      subjectEn: 'Your application has been approved',
      parts: {
        previewText: 'Your registration application has been approved. Fees are now payable.',
        arTitle: 'تمت الموافقة على طلبك',
        arBody: [
          'وافقت الهيئة على طلب قيدك. الخطوة التالية هي سداد الرسوم المقررة، ثم إصدار بطاقة القيد.',
          'يُسدَّد نقداً أو بشيك مقبول الدفع؛ المنصة تسجّل السداد ولا تُحصّل أي مبلغ.',
        ],
        enTitle: 'Your application has been approved',
        enBody: [
          'The Authority has approved your registration application. The next step is payment of the prescribed fees, after which the registration card is issued.',
          'Payment is made in cash or by certified cheque. This platform records the payment; it does not collect money.',
        ],
        facts: applicationFacts(s.application),
        action: s.application
          ? { url: brokerPortalUrl(s.application.id), labelAr: openInPortalAr, labelEn: openInPortalEn }
          : undefined,
        ...whatHappensNext(
          'بعد تسجيل السداد ستتمكن من حجز موعد لاستلام البطاقة.',
          'Once the payment is recorded you will be able to book an appointment to collect the card.',
        ),
      },
    }),
  },

  APPLICATION_REJECTED: {
    trigger: 'The reviewer refuses — the application moves to REJECTED.',
    audience: ['BROKER'],
    resolve: (s) => brokerContacts(s.application?.brokerEntityId ?? null),
    dedupe: (s, r) => `APPLICATION_REJECTED:${s.application?.id}:${r.userId}`,
    build: (s) => {
      const note = String(s.extra?.reason ?? '').trim()
      return {
        subjectAr: 'قرار في طلب القيد',
        subjectEn: 'A decision on your application',
        parts: {
          previewText: 'A decision has been taken on your registration application.',
          arTitle: 'لم تتم الموافقة على الطلب',
          arBody: [
            'راجعت الهيئة طلب قيدك، ولم تتم الموافقة عليه.',
            note
              ? `<strong>سبب القرار:</strong> ${escapeHtml(note)}`
              : 'سبب القرار مدوّن على ملف الطلب في البوابة.',
          ],
          enTitle: 'Your application was not approved',
          enBody: [
            'The Authority has reviewed your registration application, and it has not been approved.',
            note
              ? `<strong>Reason for the decision:</strong> ${escapeHtml(note)}`
              : 'The reason for the decision is recorded on the application file in the portal.',
          ],
          facts: applicationFacts(s.application),
          action: s.application
            ? {
                url: brokerPortalUrl(s.application.id),
                labelAr: 'عرض القرار كاملاً',
                labelEn: 'Read the full decision',
              }
            : undefined,
          ...whatHappensNext(
            'الملف والمستندات محفوظة بالكامل ولم يُحذف منها شيء. يمكنك تقديم طلب جديد بعد معالجة أسباب القرار.',
            'The file and its documents are retained in full and nothing has been deleted. You may submit a fresh application once the reasons for the decision have been addressed.',
          ),
        },
      }
    },
  },

  FEES_RECORDED: {
    trigger: 'A card issuer or data manager records the fee receipt.',
    audience: ['BROKER'],
    resolve: (s) => brokerContacts(s.application?.brokerEntityId ?? null),
    dedupe: (s, r) => `FEES_RECORDED:${s.application?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'تم تسجيل سداد الرسوم',
      subjectEn: 'Your fee payment has been recorded',
      parts: {
        previewText: 'The Authority has recorded your fee payment.',
        arTitle: 'تم تسجيل السداد',
        arBody: [
          'سجّلت الهيئة سداد رسوم طلبك. الخطوة التالية هي إصدار بطاقة القيد.',
        ],
        enTitle: 'Your payment has been recorded',
        enBody: [
          'The Authority has recorded the fees paid on your application. The next step is issuing the registration card.',
        ],
        facts: [
          ...applicationFacts(s.application),
          ...(s.extra?.receiptNumber
            ? [
                {
                  labelAr: 'رقم الإيصال',
                  labelEn: 'Receipt number',
                  value: String(s.extra.receiptNumber),
                },
              ]
            : []),
        ],
        action: s.application
          ? {
              url: `${brokerPortalUrl(s.application.id)}`,
              labelAr: 'حجز موعد الاستلام',
              labelEn: 'Book a collection appointment',
            }
          : undefined,
        ...whatHappensNext(
          'احجز موعداً لاستلام البطاقة من البوابة. الحضور في الموعد المحجوز التزام على الطرفين.',
          'Book an appointment in the portal to collect the card. A booked appointment is a commitment on both sides.',
        ),
      },
    }),
  },

  CARD_ISSUED: {
    trigger: 'The card issuer issues the registration card and the permanent number is allocated.',
    audience: ['BROKER'],
    resolve: (s) => brokerContacts(s.application?.brokerEntityId ?? null),
    dedupe: (s, r) => `CARD_ISSUED:${s.application?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'صدرت بطاقة القيد',
      subjectEn: 'Your registration card has been issued',
      parts: {
        previewText: 'Your registration card has been issued.',
        arTitle: 'صدرت بطاقة القيد',
        arBody: [
          'صدرت بطاقة قيدك في سجل الوسطاء العقاريين تحت الرقم المبيّن أدناه.',
          'يجب إثبات رقم القيد على جميع المطبوعات والعقود واللافتات — REQ-REG-061.',
        ],
        enTitle: 'Your registration card has been issued',
        enBody: [
          'Your registration card has been issued under the number shown below.',
          'The registration number must appear on all printed matter, contracts, and signage — REQ-REG-061.',
        ],
        facts: [
          ...(s.registration
            ? [
                {
                  labelAr: 'رقم القيد',
                  labelEn: 'Registration number',
                  value: s.registration.registrationNumber,
                },
                { labelAr: 'ساري من', labelEn: 'Valid from', value: stamp(s.registration.validFrom) },
                { labelAr: 'ساري حتى', labelEn: 'Valid to', value: stamp(s.registration.validTo) },
              ]
            : []),
          ...applicationFacts(s.application),
        ],
        action: s.application
          ? {
              url: brokerPortalUrl(s.application.id),
              labelAr: 'تنزيل البطاقة',
              labelEn: 'Download the card',
            }
          : undefined,
        ...whatHappensNext(
          'احضر في الموعد المحجوز لاستلام البطاقة الأصلية. يمكن لأي جهة التحقق من قيدك عبر صفحة التحقق العامة.',
          'Attend your booked appointment to collect the original card. Anyone can verify your registration on the public verification page.',
        ),
      },
    }),
  },

  CARD_DELIVERED: {
    trigger: 'The card issuer records delivery in the delivery ledger — the file becomes ACTIVE.',
    audience: ['BROKER'],
    resolve: (s) => brokerContacts(s.application?.brokerEntityId ?? null),
    dedupe: (s, r) => `CARD_DELIVERED:${s.application?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'تم تسليم بطاقة القيد',
      subjectEn: 'Your registration card has been handed over',
      parts: {
        previewText: 'Your registration card has been handed over and your registration is active.',
        arTitle: 'تم التسليم — القيد ساري',
        arBody: [
          'تسلّمت بطاقة القيد، وقيدك الآن ساري في سجل الوسطاء العقاريين.',
          'يقع عليك التزامان مستمران: إثبات رقم القيد على كل المطبوعات، وتجديد القيد قبل انتهاء مدته.',
        ],
        enTitle: 'Handed over — your registration is active',
        enBody: [
          'The registration card has been handed over, and your registration is now active in the Real Estate Brokers Register.',
          'Two continuing obligations rest with you: showing the registration number on all printed matter, and renewing before the registration expires.',
        ],
        facts: s.registration
          ? [
              {
                labelAr: 'رقم القيد',
                labelEn: 'Registration number',
                value: s.registration.registrationNumber,
              },
              { labelAr: 'ساري حتى', labelEn: 'Valid to', value: stamp(s.registration.validTo) },
            ]
          : applicationFacts(s.application),
        ...whatHappensNext(
          'ستصلك رسالة تذكير قبل موعد التجديد بوقت كافٍ.',
          'You will be reminded in good time before renewal falls due.',
        ),
      },
    }),
  },

  // ── To the Authority ─────────────────────────────────────────────────────

  APPLICATION_AWAITING_INTAKE: {
    trigger: 'A broker submits — the application arrives in the registry clerks’ queue.',
    audience: ['REGISTRY_CLERK'],
    resolve: () => officersHolding(['REGISTRY_CLERK']),
    dedupe: (s, r) => `APPLICATION_AWAITING_INTAKE:${s.application?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'طلب جديد في السجل الوارد',
      subjectEn: 'A new application is waiting at intake',
      parts: {
        previewText: 'A new application is waiting to be entered in the incoming register.',
        arTitle: 'طلب جديد بانتظار القيد',
        arBody: ['وصل طلب قيد جديد وينتظر إثباته في السجل الوارد ومنحه رقماً مؤقتاً.'],
        enTitle: 'A new application is waiting at intake',
        enBody: [
          'A new registration application has arrived and is waiting to be entered in the incoming register under a temporary number.',
        ],
        facts: [{ labelAr: 'المنشأة', labelEn: 'Firm', value: firmName(s.application), rtl: true }],
        action: s.application
          ? { url: `${baseUrl}/intake`, labelAr: 'فتح قائمة القيد', labelEn: 'Open the intake queue' }
          : undefined,
      },
    }),
  },

  APPLICATION_ASSIGNED: {
    trigger: 'The registry clerk assigns the file to a named examiner.',
    audience: ['EXAMINER'],
    resolve: (s) => officer(s.application?.examinerId ?? null),
    dedupe: (s, r) => `APPLICATION_ASSIGNED:${s.application?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'أُحيل إليك طلب للفحص',
      subjectEn: 'An application has been assigned to you',
      parts: {
        previewText: 'An application has been assigned to you for examination.',
        arTitle: 'طلب محال إليك',
        arBody: [
          'أُحيل إليك طلب قيد لفحصه. خطوات الفحص على هذا الملف مقصورة عليك وحدك.',
        ],
        enTitle: 'An application has been assigned to you',
        enBody: [
          'A registration application has been assigned to you for examination. The examination steps on this file are yours alone.',
        ],
        facts: applicationFacts(s.application),
        action: s.application
          ? {
              url: `${baseUrl}/examination/${s.application.id}`,
              labelAr: 'فتح الملف',
              labelEn: 'Open the case file',
            }
          : undefined,
      },
    }),
  },

  COMPLETIONS_SUBMITTED: {
    trigger: 'The broker resubmits after correcting the returned items.',
    audience: ['EXAMINER'],
    resolve: (s) => officer(s.application?.examinerId ?? null),
    dedupe: (s, r) =>
      `COMPLETIONS_SUBMITTED:${s.application?.id}:${s.extra?.round ?? 1}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'ورد استيفاء على طلب محال إليك',
      subjectEn: 'Corrections have been submitted on your file',
      parts: {
        previewText: 'The applicant has responded to the completions you requested.',
        arTitle: 'ورد ردّ على الاستيفاء',
        arBody: [
          'ردّ مقدّم الطلب على البنود التي طلبتَ استيفاءها، وعاد الملف إلى الفحص.',
          'ما إذا كانت البنود قد استُوفيت فعلاً تقديرٌ يخصّك؛ النظام سجّل الردّ فقط.',
        ],
        enTitle: 'Corrections have been submitted',
        enBody: [
          'The applicant has responded to the completions you requested, and the file has returned to examination.',
          'Whether the items are actually satisfied is your judgement; the system has recorded only that a response was made.',
        ],
        facts: applicationFacts(s.application),
        action: s.application
          ? {
              url: `${baseUrl}/examination/${s.application.id}`,
              labelAr: 'فتح الملف',
              labelEn: 'Open the case file',
            }
          : undefined,
      },
    }),
  },

  APPLICATION_READY_FOR_REVIEW: {
    trigger: 'The assigned examiner signs the internal review form and passes the file on.',
    audience: ['REVIEWER'],
    // REQ-REG-052 reaches the mailbox: the examiner of this file is excluded
    // even where they also hold the reviewer role.
    resolve: (s) => officersHolding(['REVIEWER'], { excludeUserId: s.application?.examinerId }),
    dedupe: (s, r) => `APPLICATION_READY_FOR_REVIEW:${s.application?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'طلب جاهز للمراجعة والقرار',
      subjectEn: 'An application is ready for review',
      parts: {
        previewText: 'An examined application is waiting for a review decision.',
        arTitle: 'طلب بانتظار القرار',
        arBody: [
          'أنهى الفاحص فحص هذا الطلب ووقّع نموذج المراجعة الداخلية. الملف الآن بانتظار قرار المراجع.',
        ],
        enTitle: 'An application is waiting for a decision',
        enBody: [
          'The examiner has completed this application and signed the internal review form. The file is now waiting for a reviewer’s decision.',
        ],
        facts: [
          ...applicationFacts(s.application),
          ...(s.extra?.recommendation
            ? [
                {
                  labelAr: 'توصية الفاحص',
                  labelEn: 'Examiner’s recommendation',
                  value: String(s.extra.recommendation),
                },
              ]
            : []),
        ],
        action: s.application
          ? { url: `${baseUrl}/review/${s.application.id}`, labelAr: 'فتح الملف', labelEn: 'Open the case file' }
          : undefined,
        ...whatHappensNext(
          'لا يجوز أن يراجع الطلبَ من فحصه. إذا كنت فاحص هذا الملف فلن يقبل النظام قرارك عليه.',
          'The officer who examined a file may not decide it. If you examined this one, the system will refuse your decision on it.',
        ),
      },
    }),
  },

  // ── The counter ──────────────────────────────────────────────────────────

  APPOINTMENT_BOOKED: {
    trigger: 'A broker books a slot for document handover or card collection.',
    audience: ['BROKER'],
    resolve: (s) => brokerContacts(s.appointment?.brokerEntityId ?? null),
    dedupe: (s, r) => `APPOINTMENT_BOOKED:${s.appointment?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'تأكيد حجز الموعد',
      subjectEn: 'Your appointment is confirmed',
      parts: {
        previewText: 'Your appointment at the Authority is confirmed.',
        arTitle: 'تم تأكيد موعدك',
        arBody: [
          'حُجز موعدك بالهيئة، وهذه الرسالة تأكيد له. احتفظ بها أو اطبعها وأحضرها معك.',
          '<strong>الحضور في الموعد المحجوز التزام.</strong> إن تعذّر عليك الحضور، ألغِ الحجز من البوابة لتُتاح الفترة لغيرك.',
        ],
        enTitle: 'Your appointment is confirmed',
        enBody: [
          'Your appointment at the Authority is booked, and this message confirms it. Keep it, or print it and bring it with you.',
          '<strong>Booking an appointment is a commitment to attend.</strong> If you cannot come, cancel it in the portal so the slot is freed for somebody else.',
        ],
        facts: s.appointment ? appointmentFacts(s.appointment) : [],
        action: s.appointment
          ? {
              url: brokerPortalUrl(s.appointment.applicationId),
              labelAr: 'إدارة الموعد',
              labelEn: 'Manage the appointment',
            }
          : undefined,
        ...whatHappensNext(
          'ستصلك رسالة تذكير قبل الموعد بيوم.',
          'A reminder will be sent the day before.',
        ),
      },
    }),
  },

  APPOINTMENT_CANCELLED: {
    trigger: 'The booking is cancelled, by the broker or because the Authority closed the slot.',
    audience: ['BROKER'],
    resolve: (s) => brokerContacts(s.appointment?.brokerEntityId ?? null),
    dedupe: (s, r) => `APPOINTMENT_CANCELLED:${s.appointment?.id}:${r.userId}`,
    build: (s) => {
      const reason = String(s.extra?.reason ?? '').trim()
      return {
        subjectAr: 'أُلغي الموعد',
        subjectEn: 'Your appointment has been cancelled',
        parts: {
          previewText: 'Your appointment at the Authority has been cancelled.',
          arTitle: 'أُلغي موعدك',
          arBody: [
            'أُلغي الموعد المبيّن أدناه ولم يعد قائماً.',
            reason ? `<strong>السبب:</strong> ${escapeHtml(reason)}` : 'لم يُسجَّل سبب للإلغاء.',
          ],
          enTitle: 'Your appointment has been cancelled',
          enBody: [
            'The appointment shown below has been cancelled and no longer stands.',
            reason ? `<strong>Reason:</strong> ${escapeHtml(reason)}` : 'No reason was recorded for the cancellation.',
          ],
          facts: s.appointment ? appointmentFacts(s.appointment) : [],
          action: s.appointment
            ? {
                url: brokerPortalUrl(s.appointment.applicationId),
                labelAr: 'حجز موعد آخر',
                labelEn: 'Book another appointment',
              }
            : undefined,
        },
      }
    },
  },

  APPOINTMENT_MISSED: {
    trigger:
      'The counter records that a booked appointment was not attended — the appointment moves to NO_SHOW.',
    audience: ['BROKER'],
    resolve: (s) => brokerContacts(s.appointment?.brokerEntityId ?? null),
    dedupe: (s, r) => `APPOINTMENT_MISSED:${s.appointment?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'لم يُسجَّل حضورك للموعد',
      subjectEn: 'You were not recorded as attending your appointment',
      parts: {
        previewText: 'Your appointment was recorded as not attended. You can book another.',
        arTitle: 'لم يُسجَّل حضورك',
        arBody: [
          'سُجِّل أن الموعد المبيّن أدناه لم يُحضر. هذه واقعة تُقيَّد في الملف فحسب.',
          /*
           * The one sentence this message exists to carry. Neither Decree 578
           * nor the AML Controls attaches a consequence to a missed
           * appointment, so the message must not imply one — and the applicant,
           * reading a government email about a step they missed, will assume
           * the worst unless told otherwise.
           */
          '<strong>لا يترتب على ذلك أي أثر على طلبك.</strong> لم يُرفض شيء ولم تُفقد أي خطوة، ويمكنك حجز موعد آخر متى شئت.',
        ],
        enTitle: 'You were not recorded as attending',
        enBody: [
          'The appointment shown below was recorded as not attended. That is a fact noted on the file and nothing more.',
          '<strong>No consequence follows for your application.</strong> Nothing has been refused and no step has been lost. You may book another appointment whenever it suits you.',
        ],
        facts: s.appointment ? appointmentFacts(s.appointment) : [],
        action: s.appointment
          ? {
              url: brokerPortalUrl(s.appointment.applicationId),
              labelAr: 'حجز موعد آخر',
              labelEn: 'Book another appointment',
            }
          : undefined,
      },
    }),
  },

  APPOINTMENT_RESCHEDULED: {
    trigger: 'The broker moves a booking to a different slot.',
    audience: ['BROKER'],
    resolve: (s) => brokerContacts(s.appointment?.brokerEntityId ?? null),
    dedupe: (s, r) => `APPOINTMENT_RESCHEDULED:${s.appointment?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'تم تغيير موعدك',
      subjectEn: 'Your appointment has been moved',
      parts: {
        previewText: 'Your appointment at the Authority has been moved to a new time.',
        arTitle: 'موعدك الجديد',
        arBody: [
          'نُقل موعدك إلى الوقت المبيّن أدناه. الموعد السابق لم يعد قائماً.',
        ],
        enTitle: 'Your new appointment',
        enBody: [
          'Your appointment has been moved to the time shown below. The previous booking no longer stands.',
        ],
        facts: s.appointment ? appointmentFacts(s.appointment) : [],
        action: s.appointment
          ? {
              url: brokerPortalUrl(s.appointment.applicationId),
              labelAr: 'إدارة الموعد',
              labelEn: 'Manage the appointment',
            }
          : undefined,
      },
    }),
  },

  APPOINTMENT_REMINDER: {
    trigger: 'The reminder sweep runs and the appointment is within the reminder window.',
    audience: ['BROKER'],
    resolve: (s) => brokerContacts(s.appointment?.brokerEntityId ?? null),
    dedupe: (s, r) => `APPOINTMENT_REMINDER:${s.appointment?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'تذكير بموعدك غداً',
      subjectEn: 'A reminder about your appointment',
      parts: {
        previewText: 'A reminder about your appointment at the Authority.',
        arTitle: 'تذكير بالموعد',
        arBody: [
          'هذه رسالة تذكير بموعدك بالهيئة. أحضر معك أصول المستندات وبطاقة الرقم القومي.',
        ],
        enTitle: 'A reminder about your appointment',
        enBody: [
          'This is a reminder of your appointment at the Authority. Bring the original documents and your national ID card.',
        ],
        facts: s.appointment ? appointmentFacts(s.appointment) : [],
        action: s.appointment
          ? {
              url: brokerPortalUrl(s.appointment.applicationId),
              labelAr: 'إدارة الموعد',
              labelEn: 'Manage the appointment',
            }
          : undefined,
        ...whatHappensNext(
          'إن تعذّر عليك الحضور، ألغِ الحجز من البوابة لتُتاح الفترة لغيرك.',
          'If you cannot attend, cancel in the portal so the slot is freed for somebody else.',
        ),
      },
    }),
  },

  // ── The registration ─────────────────────────────────────────────────────

  REGISTRATION_RENEWAL_DUE: {
    trigger: 'The lifecycle sweep finds a registration inside the renewal window.',
    audience: ['BROKER'],
    resolve: (s) => brokerContacts(s.registration?.brokerEntityId ?? null),
    dedupe: (s, r) => `REGISTRATION_RENEWAL_DUE:${s.registration?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'اقترب موعد تجديد القيد',
      subjectEn: 'Your registration is due for renewal',
      parts: {
        previewText: 'Your registration is approaching its renewal date.',
        arTitle: 'موعد التجديد يقترب',
        arBody: [
          'يقترب انتهاء مدة قيدك في سجل الوسطاء العقاريين. القيد ما زال ساريًا حتى التاريخ المبيّن أدناه.',
          'مزاولة الوساطة بقيد منتهٍ مخالفة. جدّد قبل التاريخ المذكور لتفادي انقطاع القيد.',
        ],
        enTitle: 'Your registration is due for renewal',
        enBody: [
          'Your registration in the Real Estate Brokers Register is approaching its expiry. It remains valid until the date shown below.',
          'Practising brokerage on an expired registration is a breach. Renew before that date to avoid an interruption.',
        ],
        facts: s.registration
          ? [
              {
                labelAr: 'رقم القيد',
                labelEn: 'Registration number',
                value: s.registration.registrationNumber,
              },
              { labelAr: 'ساري حتى', labelEn: 'Valid to', value: stamp(s.registration.validTo) },
            ]
          : [],
        action: { url: `${baseUrl}/application`, labelAr: 'بدء التجديد', labelEn: 'Start the renewal' },
      },
    }),
  },

  REGISTRATION_LAPSED: {
    trigger: 'The lifecycle sweep finds a registration whose validity has run out.',
    audience: ['BROKER'],
    resolve: (s) => brokerContacts(s.registration?.brokerEntityId ?? null),
    dedupe: (s, r) => `REGISTRATION_LAPSED:${s.registration?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'انتهت مدة القيد',
      subjectEn: 'Your registration has expired',
      parts: {
        previewText: 'Your registration in the Brokers Register has expired.',
        arTitle: 'انتهت مدة قيدك',
        arBody: [
          'انتهت مدة قيدك في سجل الوسطاء العقاريين، وحالته الآن «منتهٍ».',
          'لا يجوز مزاولة أعمال الوساطة العقارية بقيد منتهٍ. القيد وسجله محفوظان بالكامل ولم يُحذف منهما شيء.',
        ],
        enTitle: 'Your registration has expired',
        enBody: [
          'Your registration in the Real Estate Brokers Register has reached the end of its validity and now stands as lapsed.',
          'Brokerage may not be practised on a lapsed registration. The registration and its record are retained in full; nothing has been deleted.',
        ],
        facts: s.registration
          ? [
              {
                labelAr: 'رقم القيد',
                labelEn: 'Registration number',
                value: s.registration.registrationNumber,
              },
              { labelAr: 'انتهى في', labelEn: 'Expired on', value: stamp(s.registration.validTo) },
            ]
          : [],
        action: { url: `${baseUrl}/application`, labelAr: 'تقديم طلب تجديد', labelEn: 'Apply to renew' },
      },
    }),
  },

  // ── Supervision. Never to a broker, ever. REQ-AML-021 ────────────────────

  SUPERVISORY_CONCERN_RAISED: {
    trigger:
      'A signal about the supervised population is raised — a category ceiling, an identity reused across firms, a contradiction on a declaration.',
    audience: ['AML_SUPERVISOR'],
    resolve: () => officersHolding(['AML_SUPERVISOR']),
    dedupe: (s, r) => `SUPERVISORY_CONCERN_RAISED:${s.signal?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'إشارة رقابية تحتاج إلى فحص',
      subjectEn: 'A supervisory signal needs review',
      parts: {
        previewText: 'A supervisory signal has been raised and is waiting for review.',
        arTitle: 'إشارة رقابية جديدة',
        arBody: [
          `رصد النظام إشارة رقابية بدرجة <strong>${s.signal ? severityLabels[s.signal.severity].ar : '—'}</strong> تحتاج إلى فحص.`,
          s.signal?.summaryAr ?? '',
          '<strong>الإشارة ليست اتهاماً ولا قرينة.</strong> هي فرز يستدعي نظر موظف مختص، ولا يترتب عليها أي إجراء تلقائي. حفظُها يستلزم سبباً مكتوباً.',
        ].filter(Boolean),
        enTitle: 'A new supervisory signal',
        enBody: [
          `The system has raised a <strong>${s.signal ? severityLabels[s.signal.severity].en.toLowerCase() : '—'}</strong> severity supervisory signal for review.`,
          s.signal?.summaryEn ?? '',
          '<strong>A signal is not an accusation and not evidence.</strong> It is triage that calls for a person to look, and nothing follows from it automatically. Dismissing it requires a written reason.',
        ].filter(Boolean),
        facts: s.signal
          ? [
              { labelAr: 'نوع الإشارة', labelEn: 'Signal', value: s.signal.titleEn },
              {
                labelAr: 'الدرجة',
                labelEn: 'Severity',
                value: severityLabels[s.signal.severity].en,
              },
              { labelAr: 'رُصدت في', labelEn: 'Raised', value: stampWithTime(new Date()) },
              ...(s.application
                ? [{ labelAr: 'الرقم المرجعي', labelEn: 'Reference', value: reference(s.application) }]
                : []),
            ]
          : [],
        action: { url: `${baseUrl}/supervision`, labelAr: 'فتح قائمة الإشارات', labelEn: 'Open the signals queue' },
        ...whatHappensNext(
          'التفاصيل والأدلة داخل النظام وحده. هذه الرسالة لا تحمل أي محتوى من الملف.',
          'The detail and the evidence are inside the system only. This message carries no content from the file.',
        ),
      },
    }),
  },

  PROCESS_INTEGRITY_CONCERN_RAISED: {
    trigger:
      'A signal about the Authority’s own process is raised — an approval faster than any human could have read the file, completions with no basis in the checklist, a decision taken out of hours.',
    audience: ['AUDITOR'],
    resolve: () => officersHolding(['AUDITOR']),
    dedupe: (s, r) => `PROCESS_INTEGRITY_CONCERN_RAISED:${s.signal?.id}:${r.userId}`,
    build: (s) => ({
      subjectAr: 'إشارة على سلامة الإجراءات',
      subjectEn: 'A process-integrity signal needs review',
      parts: {
        previewText: 'A process-integrity signal has been raised and is waiting for review.',
        arTitle: 'إشارة على سلامة الإجراءات',
        arBody: [
          `رصد النظام إشارة بدرجة <strong>${s.signal ? severityLabels[s.signal.severity].ar : '—'}</strong> تتعلق بسلامة إجراءات الهيئة نفسها.`,
          s.signal?.summaryAr ?? '',
          '<strong>الإشارة ليست اتهاماً لأي موظف.</strong> الغرض منها أن يكون الإجراء قابلاً للقراءة، لا أن يُتهم أحد. حفظُها يستلزم سبباً مكتوباً.',
        ].filter(Boolean),
        enTitle: 'A process-integrity signal',
        enBody: [
          `The system has raised a <strong>${s.signal ? severityLabels[s.signal.severity].en.toLowerCase() : '—'}</strong> severity signal about the Authority’s own process.`,
          s.signal?.summaryEn ?? '',
          '<strong>A signal is not an accusation against any officer.</strong> Its purpose is to make the process legible, not to accuse anyone. Dismissing it requires a written reason.',
        ].filter(Boolean),
        facts: s.signal
          ? [
              { labelAr: 'نوع الإشارة', labelEn: 'Signal', value: s.signal.titleEn },
              {
                labelAr: 'الدرجة',
                labelEn: 'Severity',
                value: severityLabels[s.signal.severity].en,
              },
              ...(s.application
                ? [{ labelAr: 'الرقم المرجعي', labelEn: 'Reference', value: reference(s.application) }]
                : []),
            ]
          : [],
        action: s.application
          ? { url: caseFileUrl(s.application.id), labelAr: 'فتح الملف', labelEn: 'Open the case file' }
          : { url: `${baseUrl}/supervision`, labelAr: 'فتح قائمة الإشارات', labelEn: 'Open the signals queue' },
      },
    }),
  },

  // ── Accounts. The one family an administrator is party to ────────────────

  ACCOUNT_SUSPENDED: {
    trigger: 'An administrator suspends an account.',
    audience: ['BROKER', 'EXAMINER', 'REVIEWER', 'REGISTRY_CLERK', 'CARD_ISSUER', 'DATA_MANAGER'],
    resolve: (s) => (s.accountChange ? account(s.accountChange.userId) : Promise.resolve([])),
    dedupe: (s) => `ACCOUNT_SUSPENDED:${s.accountChange?.userId}:${s.extra?.at ?? Date.now()}`,
    build: (s) => {
      const reason = s.accountChange?.reason?.trim()
      return {
        subjectAr: 'تم إيقاف حسابك',
        subjectEn: 'Your account has been suspended',
        parts: {
          previewText: 'Your Osool account has been suspended.',
          arTitle: 'تم إيقاف حسابك',
          arBody: [
            'أُوقف حسابك على منصة أصول، ولن تتمكن من الدخول إليه حتى يُعاد تفعيله.',
            reason ? `<strong>السبب:</strong> ${escapeHtml(reason)}` : 'لم يُسجَّل سبب مع الإيقاف.',
          ],
          enTitle: 'Your account has been suspended',
          enBody: [
            'Your Osool account has been suspended and you will not be able to sign in until it is reinstated.',
            reason ? `<strong>Reason:</strong> ${escapeHtml(reason)}` : 'No reason was recorded with the suspension.',
          ],
          ...whatHappensNext(
            'بياناتك وملفاتك محفوظة كما هي ولم يُحذف منها شيء. لمراجعة القرار، تواصل مع مسؤول النظام بالهيئة.',
            'Your data and files are retained exactly as they stand; nothing has been deleted. To query the decision, contact the system administrator at the Authority.',
          ),
        },
      }
    },
  },

  ACCOUNT_REINSTATED: {
    trigger: 'An administrator reinstates a suspended account.',
    audience: ['BROKER', 'EXAMINER', 'REVIEWER', 'REGISTRY_CLERK', 'CARD_ISSUER', 'DATA_MANAGER'],
    resolve: (s) => (s.accountChange ? account(s.accountChange.userId) : Promise.resolve([])),
    dedupe: (s) => `ACCOUNT_REINSTATED:${s.accountChange?.userId}:${s.extra?.at ?? Date.now()}`,
    build: () => ({
      subjectAr: 'أُعيد تفعيل حسابك',
      subjectEn: 'Your account has been reinstated',
      parts: {
        previewText: 'Your Osool account has been reinstated.',
        arTitle: 'أُعيد تفعيل حسابك',
        arBody: ['أُعيد تفعيل حسابك على منصة أصول، ويمكنك الدخول إليه الآن بكلمة المرور نفسها.'],
        enTitle: 'Your account has been reinstated',
        enBody: [
          'Your Osool account has been reinstated. You can sign in again now, with the same password.',
        ],
        action: { url: `${baseUrl}/login`, labelAr: 'تسجيل الدخول', labelEn: 'Sign in' },
      },
    }),
  },
}

export const ALL_EVENT_KEYS = Object.keys(CATALOGUE) as NotificationEventKey[]
