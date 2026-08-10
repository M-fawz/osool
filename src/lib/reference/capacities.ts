import type { ApplicantCapacity, AuthenticationBody, PaymentMethod, PartyType } from '@prisma/client'

/**
 * The five capacities in REQ-REG-030, explained the way a form should explain
 * them.
 *
 * This choice changes everything after it — whether step 2 exists, which
 * documents the checklist asks for, which declarations carry an exemption — and
 * it is the first thing a broker sees. The legal names alone ("شريك متضامن")
 * are not enough to choose between: they are the names of the answers, not
 * descriptions of the situations. So each carries one sentence that describes
 * the applicant's actual circumstances, written in the second person.
 *
 * Bilingual in code rather than in `messages/`, matching `roleLabels` and
 * `governorateLabels`: the examiner's screen and the refusal copy need the same
 * strings server-side, and one home for a name is better than two.
 */

export const capacityLabels: Record<
  ApplicantCapacity,
  { ar: string; en: string; helpAr: string; helpEn: string }
> = {
  SOLE_TRADER: {
    ar: 'تاجر فرد',
    en: 'Sole trader',
    helpAr: 'المنشأة مسجّلة باسمك أنت شخصياً، والسجل التجاري صادر باسمك، وليست شركة.',
    helpEn:
      'The firm is registered in your own name — the commercial register is in your name and it is not a company.',
  },
  CHAIRMAN: {
    ar: 'رئيس مجلس إدارة',
    en: 'Chairman of the board',
    helpAr: 'تتقدّم بالطلب باسم شركة أنت رئيس مجلس إدارتها.',
    helpEn: 'You are applying on behalf of a company whose board you chair.',
  },
  RESPONSIBLE_MANAGER: {
    ar: 'مدير مسئول',
    en: 'Responsible manager',
    helpAr: 'عيّنتك الشركة مديراً مسئولاً عن نشاط الوساطة العقارية أمام الجهات الرسمية.',
    helpEn:
      'The company has appointed you as the manager responsible for its real-estate brokerage activity before the authorities.',
  },
  GENERAL_PARTNER: {
    ar: 'شريك متضامن',
    en: 'General partner',
    helpAr: 'أنت شريك متضامن في شركة أشخاص، ومسئول عن التزاماتها في أموالك الخاصة.',
    helpEn:
      'You are a general partner in a partnership, personally liable for its obligations.',
  },
  AGENT_UNDER_POA: {
    ar: 'وكيل بتوكيل رسمي',
    en: 'Agent under a power of attorney',
    helpAr:
      'تتقدّم بالطلب نيابة عن صاحب المنشأة بموجب توكيل موثّق. ستُسأل عن رقم التوكيل وسنته ومكتب التوثيق في الخطوة التالية.',
    helpEn:
      'You are applying on behalf of the firm’s owner under a notarised power of attorney. The next step asks for its number, year, and notarisation office.',
  },
}

export const CAPACITY_ORDER: ApplicantCapacity[] = [
  'SOLE_TRADER',
  'CHAIRMAN',
  'RESPONSIBLE_MANAGER',
  'GENERAL_PARTNER',
  'AGENT_UNDER_POA',
]

export const establishmentTypeLabels: Record<PartyType, { ar: string; en: string; helpAr: string; helpEn: string }> = {
  NATURAL_PERSON: {
    ar: 'منشأة فردية',
    en: 'Sole establishment',
    helpAr: 'سجل تجاري باسم شخص طبيعي واحد.',
    helpEn: 'A commercial register entry in one natural person’s name.',
  },
  LEGAL_PERSON: {
    ar: 'شركة',
    en: 'Company',
    helpAr: 'شخص اعتباري له عقد تأسيس ونظام أساسي.',
    helpEn: 'A legal person with a memorandum and articles of association.',
  },
}

/** REQ-REG-030 — who authenticated the brokerage contract. */
export const authenticationBodyLabels: Record<AuthenticationBody, { ar: string; en: string }> = {
  REAL_ESTATE_PUBLICITY: { ar: 'الشهر العقاري', en: 'Real Estate Publicity and Documentation' },
  EMBASSY: { ar: 'سفارة', en: 'Embassy' },
  CONSULATE: { ar: 'قنصلية', en: 'Consulate' },
}

/** REQ-REG-050 step 4 — cash, or a cheque with its bank named. */
export const paymentMethodLabels: Record<PaymentMethod, { ar: string; en: string }> = {
  CASH: { ar: 'نقداً', en: 'Cash' },
  CERTIFIED_CHEQUE: { ar: 'شيك معتمد', en: 'Certified cheque' },
  BANK_CHEQUE: { ar: 'شيك بنكي', en: 'Bank cheque' },
}

export const poaTypeLabels: Record<'GENERAL' | 'SPECIAL', { ar: string; en: string; helpAr: string; helpEn: string }> = {
  GENERAL: {
    ar: 'توكيل عام',
    en: 'General power of attorney',
    helpAr: 'يخوّل الوكيل في أعمال متعددة وليس في هذا الطلب وحده.',
    helpEn: 'Authorises the agent for a range of matters, not this application alone.',
  },
  SPECIAL: {
    ar: 'توكيل خاص',
    en: 'Special power of attorney',
    helpAr: 'يخوّل الوكيل في مسألة محددة، مثل تقديم هذا الطلب.',
    helpEn: 'Authorises the agent for one specified matter, such as filing this application.',
  },
}
