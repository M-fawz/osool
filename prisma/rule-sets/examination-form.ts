import type { RuleSetDefinition } from './types'

/**
 * EXAMINATION_FORM — REQ-REG-051, the internal review form GOEIC CR-CA-QR-31.
 *
 * The requirement lists what the form records. Each of those facts is a line
 * the examiner checks against the documents in the file, and each is seeded
 * here as a discrete item for the same reason the fifteen declarations are:
 * a single "I checked it" flag records that somebody clicked, not what they
 * looked at.
 *
 * `evidenceFrom` names the DOC_CHECKLIST item the examiner is meant to be
 * holding while they tick the line. That is what turns "approved without ever
 * comparing the tax number to the tax card" from an unanswerable question into
 * a computable one — and it is the same mechanism that lets a requested
 * completion be checked against the documented requirements list.
 */

export const examinationForm: RuleSetDefinition = {
  code: 'EXAMINATION_FORM',
  version: 1,
  description:
    'The lines of the internal review form an examiner verifies against the file, REQ-REG-051.',
  legalSource: 'GOEIC form CR-CA-QR-31; workflow boxes on CR-CA-QR7--01',
  requirementIds: ['REQ-REG-051'],
  effectiveFrom: new Date('2020-06-01T00:00:00.000Z'),
  effectiveTo: null,

  items: [
    {
      key: 'TRADE_NAME',
      position: 1,
      payload: {
        labelAr: 'الاسم التجاري',
        labelEn: 'Trade name',
        evidenceFrom: 'COMMERCIAL_REGISTER_EXTRACT',
      },
    },
    {
      key: 'TRADE_STYLE',
      position: 2,
      payload: {
        labelAr: 'السمة التجارية',
        labelEn: 'Trade style',
        evidenceFrom: 'COMMERCIAL_REGISTER_EXTRACT',
      },
    },
    {
      key: 'ESTABLISHMENT_TYPE',
      position: 3,
      payload: {
        labelAr: 'نوع المنشأة',
        labelEn: 'Establishment type',
        evidenceFrom: 'COMMERCIAL_REGISTER_EXTRACT',
      },
    },
    {
      key: 'CAPITAL',
      position: 4,
      payload: {
        labelAr: 'رأس المال المدفوع',
        labelEn: 'Paid-up capital',
        evidenceFrom: 'PROOF_OF_PAID_UP_CAPITAL',
        relatedRequirements: ['REQ-REG-021'],
      },
    },
    {
      key: 'ACTIVITY_ADDRESS',
      position: 5,
      payload: {
        labelAr: 'عنوان مزاولة النشاط',
        labelEn: 'Activity address',
        evidenceFrom: 'PREMISES_PROOF',
      },
    },
    {
      key: 'GOVERNORATE',
      position: 6,
      payload: {
        labelAr: 'المحافظة',
        labelEn: 'Governorate',
        evidenceFrom: 'PREMISES_PROOF',
      },
    },
    {
      key: 'ACTIVITY',
      position: 7,
      payload: {
        labelAr: 'النشاط',
        labelEn: 'Activity',
        evidenceFrom: 'COMMERCIAL_REGISTER_EXTRACT',
      },
    },
    {
      key: 'COMMERCIAL_REGISTER',
      position: 8,
      payload: {
        labelAr: 'رقم السجل التجاري ومكتب القيد',
        labelEn: 'Commercial register number and issuing office',
        evidenceFrom: 'COMMERCIAL_REGISTER_EXTRACT',
      },
    },
    {
      key: 'TAX_REGISTRATION',
      position: 9,
      payload: {
        labelAr: 'التسجيل الضريبي والمأمورية',
        labelEn: 'Tax registration and tax office',
        evidenceFrom: 'TAX_REGISTRATION_CARD',
      },
    },
    {
      key: 'TELEPHONE',
      position: 10,
      payload: {
        labelAr: 'التليفون',
        labelEn: 'Telephone',
        evidenceFrom: null,
      },
    },
    {
      key: 'APPLICANT_IDENTITY',
      position: 11,
      payload: {
        labelAr: 'هوية مقدم الطلب وصفته',
        labelEn: 'Applicant identity and capacity',
        evidenceFrom: 'IDENTITY_DOC_APPLICANT',
        relatedRequirements: ['REQ-REG-030', 'REQ-CDD-001'],
      },
    },
    {
      key: 'POWER_OF_ATTORNEY',
      position: 12,
      payload: {
        labelAr: 'التوكيل وسريانه',
        labelEn: 'Power of attorney and its validity',
        evidenceFrom: 'POWER_OF_ATTORNEY',
        conditionNote: 'Applies only where the applicant capacity is AGENT_UNDER_POA.',
        relatedRequirements: ['REQ-REG-041'],
      },
    },
    {
      key: 'CLIENT_DATA',
      position: 13,
      payload: {
        labelAr: 'بيانات العميل كاملة',
        labelEn: 'Full client data',
        evidenceFrom: null,
        relatedRequirements: ['REQ-REG-030'],
      },
    },
    {
      key: 'BROKERAGE_NATURE',
      position: 14,
      payload: {
        labelAr: 'طبيعة الوساطة (بيع / شراء / إيجار)',
        labelEn: 'Brokerage nature (sale / purchase / lease)',
        evidenceFrom: null,
        relatedRequirements: ['REQ-REG-010'],
      },
    },
    {
      key: 'CRIMINAL_RECORD',
      position: 15,
      payload: {
        labelAr: 'صحيفة الحالة الجنائية',
        labelEn: 'Criminal record extract',
        evidenceFrom: 'CRIMINAL_RECORD_EXTRACT',
        relatedDeclarations: ['DECL-03'],
      },
    },
    {
      key: 'COPIES_COUNT',
      position: 16,
      payload: {
        labelAr: 'عدد الأصول والصور',
        labelEn: 'Original and copy count',
        evidenceFrom: null,
      },
    },
  ],
}
