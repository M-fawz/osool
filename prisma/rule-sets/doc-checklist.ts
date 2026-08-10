import type { RuleSetDefinition } from './types'

/**
 * DOC_CHECKLIST — REQ-REG-030 and Part C of 01-LEGAL-REFERENCE.md
 * (CDD §5.1 for natural persons, §5.2 for legal persons).
 *
 * This rule set drives three things that must not drift apart:
 *   · what the broker portal asks a given applicant kind to upload;
 *   · what the examiner sees as outstanding;
 *   · what a requested completion (استيفاء) may legitimately cite.
 *
 * That last one matters. "Completions requested that have no basis in the
 * documented requirements list" is integrity signal 16 in 00-VISION §5, and it
 * is only computable because a Completion carries a `checklistItemKey` that
 * either resolves against this rule set or does not.
 *
 * `appliesTo` selects by applicant kind. An item marked `mandatory: false` is
 * conditional — `conditionNote` says when it becomes required.
 */

export const docChecklist: RuleSetDefinition = {
  code: 'DOC_CHECKLIST',
  version: 1,
  description: 'Required documents per applicant kind for a new registration application.',
  legalSource:
    'GOEIC form CR-CA-QR7--01 (issue 4, 1/6/2020); EMLCU CDD Procedures for DNFBPs §§5.1–5.2',
  requirementIds: ['REQ-REG-030', 'REQ-CDD-002', 'REQ-CDD-003'],
  effectiveFrom: new Date('2020-06-01T00:00:00.000Z'),
  effectiveTo: null,

  items: [
    // ── Both applicant kinds ────────────────────────────────────────────────
    {
      key: 'IDENTITY_DOC_APPLICANT',
      position: 1,
      payload: {
        labelAr: 'وثيقة إثبات الهوية لمقدم الطلب',
        labelEn: 'Identity-verification document for the applicant',
        descriptionEn:
          'National ID card, passport, refugee travel document, or armed-forces military card. Must be valid and free of any indication of tampering.',
        appliesTo: ['NATURAL_PERSON', 'LEGAL_PERSON'],
        mandatory: true,
        acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'],
        maxSizeMb: 10,
        legalSource: 'CDD §5.1',
      },
    },
    {
      key: 'COMMERCIAL_REGISTER_EXTRACT',
      position: 2,
      payload: {
        labelAr: 'مستخرج السجل التجاري ساري',
        labelEn: 'Valid extract from the Commercial Register',
        descriptionEn:
          'A valid extract, or a document proving registration with the competent administrative body.',
        appliesTo: ['NATURAL_PERSON', 'LEGAL_PERSON'],
        mandatory: true,
        acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'],
        maxSizeMb: 10,
        legalSource: 'CDD §5.2',
      },
    },
    {
      key: 'TAX_REGISTRATION_CARD',
      position: 3,
      payload: {
        labelAr: 'البطاقة الضريبية',
        labelEn: 'Tax registration card',
        descriptionEn: 'Showing the tax registration number and the competent tax office.',
        appliesTo: ['NATURAL_PERSON', 'LEGAL_PERSON'],
        mandatory: true,
        acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'],
        maxSizeMb: 10,
        legalSource: 'REQ-REG-030',
      },
    },
    {
      key: 'PROOF_OF_PAID_UP_CAPITAL',
      position: 4,
      payload: {
        labelAr: 'ما يثبت رأس المال المدفوع',
        labelEn: 'Proof of paid-up capital',
        descriptionEn:
          'Evidence of the paid-up capital relied on for the requested category. Checked against the category floor under REQ-REG-021.',
        appliesTo: ['NATURAL_PERSON', 'LEGAL_PERSON'],
        mandatory: true,
        acceptedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
        maxSizeMb: 10,
        legalSource: 'D578 Article 2',
        relatedRequirements: ['REQ-REG-020', 'REQ-REG-021'],
      },
    },
    {
      key: 'PREMISES_PROOF',
      position: 5,
      payload: {
        labelAr: 'ما يثبت مقر مزاولة النشاط',
        labelEn: 'Proof of the head office or main premises',
        descriptionEn: 'Lease or title document for the address at which the activity is practised.',
        appliesTo: ['NATURAL_PERSON', 'LEGAL_PERSON'],
        mandatory: true,
        acceptedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
        maxSizeMb: 10,
        legalSource: 'REQ-REG-030',
      },
    },
    {
      key: 'CRIMINAL_RECORD_EXTRACT',
      position: 6,
      payload: {
        labelAr: 'صحيفة الحالة الجنائية',
        labelEn: 'Criminal record extract',
        descriptionEn: 'Evidencing the assertion made in declaration DECL-03.',
        appliesTo: ['NATURAL_PERSON', 'LEGAL_PERSON'],
        mandatory: true,
        acceptedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
        maxSizeMb: 10,
        relatedDeclarations: ['DECL-03'],
      },
    },

    // ── Legal persons ───────────────────────────────────────────────────────
    {
      key: 'ARTICLES_OF_ASSOCIATION',
      position: 7,
      payload: {
        labelAr: 'عقد التأسيس والنظام الأساسي',
        labelEn: 'Memorandum and articles of association',
        descriptionEn:
          'Or the official gazette in which they were published, together with any published amendments.',
        appliesTo: ['LEGAL_PERSON'],
        mandatory: true,
        acceptedMimeTypes: ['application/pdf'],
        maxSizeMb: 25,
        legalSource: 'CDD §5.2',
      },
    },
    {
      key: 'REPRESENTATION_AUTHORISATION',
      position: 8,
      payload: {
        labelAr: 'ما يفيد تفويض من يمثل الشركة',
        labelEn: 'Documents evidencing authorisation of the natural person(s) representing the entity',
        appliesTo: ['LEGAL_PERSON'],
        mandatory: true,
        acceptedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
        maxSizeMb: 10,
        legalSource: 'CDD §5.2',
      },
    },
    {
      key: 'BENEFICIAL_OWNER_IDENTITY_DOCS',
      position: 9,
      payload: {
        labelAr: 'وثائق هوية المستفيدين الحقيقيين',
        labelEn: 'Identity documents of beneficial owners',
        descriptionEn:
          'Identity documents of natural persons holding controlling stakes of 25% or more; failing that, of natural persons controlling by other means; failing both, of the chairman or equivalent.',
        appliesTo: ['LEGAL_PERSON'],
        mandatory: true,
        acceptedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
        maxSizeMb: 25,
        legalSource: 'CDD §5.2',
        relatedRequirements: ['REQ-CDD-001', 'REQ-CDD-002'],
      },
    },
    {
      key: 'SIGNATURE_SPECIMENS',
      position: 10,
      payload: {
        labelAr: 'نماذج التوقيعات المعتمدة',
        labelEn: 'Signature specimens for persons authorised to deal',
        appliesTo: ['LEGAL_PERSON'],
        mandatory: true,
        acceptedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
        maxSizeMb: 10,
        legalSource: 'CDD §5.2',
      },
    },
    {
      key: 'PRELIMINARY_CONTRACT_UNDER_FORMATION',
      position: 11,
      payload: {
        labelAr: 'العقد الابتدائي للشركة تحت التأسيس',
        labelEn: 'Preliminary contract where the company is under formation',
        descriptionEn:
          'Signed by the founders showing each one’s share, together with the founders’ agent’s power of attorney.',
        appliesTo: ['LEGAL_PERSON'],
        mandatory: false,
        conditionNote: 'Required only where the applicant company is still under formation.',
        acceptedMimeTypes: ['application/pdf'],
        maxSizeMb: 25,
        legalSource: 'CDD §5.2',
      },
    },

    // ── Natural persons ─────────────────────────────────────────────────────
    {
      key: 'OWNER_IDENTITY_DOC',
      position: 12,
      payload: {
        labelAr: 'وثيقة هوية صاحب المنشأة الفردية',
        labelEn: 'Identity document of the sole establishment’s owner',
        appliesTo: ['NATURAL_PERSON'],
        mandatory: true,
        acceptedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
        maxSizeMb: 10,
        legalSource: 'CDD §5.2',
      },
    },

    // ── Conditional on acting under a power of attorney ─────────────────────
    {
      key: 'POWER_OF_ATTORNEY',
      position: 13,
      payload: {
        labelAr: 'التوكيل الرسمي',
        labelEn: 'Official power of attorney',
        descriptionEn:
          'Required where the application is submitted by an agent. Number, year, and notarisation office are captured separately so reuse across applicants is detectable.',
        appliesTo: ['NATURAL_PERSON', 'LEGAL_PERSON'],
        mandatory: false,
        conditionNote:
          'Required when the applicant capacity is AGENT_UNDER_POA. Accompanied by the declaration under REQ-REG-041 that the POA remains in force and the principal remains alive.',
        acceptedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
        maxSizeMb: 10,
        legalSource: 'CDD §5.1; GOEIC form CR-CA-QR7-17',
        relatedRequirements: ['REQ-REG-041'],
      },
    },
  ],
}
