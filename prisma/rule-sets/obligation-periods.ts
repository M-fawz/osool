import type { RuleSetDefinition } from './types'

/**
 * OBLIGATION_PERIODS — the statutory clocks attached to a registration.
 *
 * Every number in this file is a deadline someone can be found in breach of,
 * which is exactly why none of them may appear as a literal in a component or
 * a Server Action. Phase 2 computes the renewal window and the change-
 * notification tracking from here.
 *
 * `[NEEDS COUNSEL]` on `validityYears`: REQ-REG-060 establishes that a
 * registration has a validity period and that renewal falls due 90 days before
 * expiry, but 01-LEGAL-REFERENCE.md does not state the length of the period
 * itself. Five years is seeded as a working value and marked unconfirmed. Per
 * CLAUDE.md rule 10 and Part F rule 4, an unconfirmed requirement may warn and
 * flag for human review — it must not block a user action. The renewal-window
 * calculation therefore warns rather than lapsing a registration on this basis
 * until counsel confirms the period.
 */

export const obligationPeriods: RuleSetDefinition = {
  code: 'OBLIGATION_PERIODS',
  version: 1,
  description:
    'Statutory deadlines: registration validity, the renewal window, and the notification obligations.',
  legalSource: 'Law 120 of 1982; Executive Regulation 342 of 1982; GOEIC declarations',
  requirementIds: ['REQ-REG-060', 'REQ-REG-062', 'REQ-REG-063', 'REQ-REG-064'],
  effectiveFrom: new Date('2020-06-01T00:00:00.000Z'),
  effectiveTo: null,

  items: [
    {
      key: 'REGISTRATION_VALIDITY',
      position: 1,
      payload: {
        labelAr: 'مدة سريان القيد',
        labelEn: 'Registration validity period',
        validityYears: 5,
        needsCounsel: true,
        needsCounselNote:
          'REQ-REG-060 establishes that a validity period exists but 01-LEGAL-REFERENCE.md does not state its length. Five years is a working value. It must not gate a user action until confirmed — it may warn and flag.',
        blocking: false,
        relatedRequirements: ['REQ-REG-060'],
      },
    },
    {
      key: 'RENEWAL_WINDOW',
      position: 2,
      payload: {
        labelAr: 'ميعاد التجديد',
        labelEn: 'Renewal window',
        descriptionEn:
          'Renewal falls due 90 days before the expiry of the current registration, and the applicant acknowledges this on receipt of the card.',
        daysBeforeExpiry: 90,
        needsCounsel: false,
        blocking: false,
        relatedRequirements: ['REQ-REG-060'],
      },
    },
    {
      key: 'CHANGE_NOTIFICATION',
      position: 3,
      payload: {
        labelAr: 'الإخطار بالتغيير',
        labelEn: 'Change notification obligation',
        descriptionEn:
          'Any change to entity data or to any registered brokerage contract must be notified within thirty days.',
        days: 30,
        needsCounsel: false,
        blocking: false,
        relatedRequirements: ['REQ-REG-062'],
        relatedDeclarations: ['DECL-05'],
      },
    },
    {
      key: 'CESSATION_NOTIFICATION',
      position: 4,
      payload: {
        labelAr: 'الإخطار بالتوقف عن النشاط',
        labelEn: 'Cessation notification obligation',
        descriptionEn:
          'Cessation of activity, wholly or partially, in respect of any contract must be notified within thirty days.',
        days: 30,
        needsCounsel: false,
        blocking: false,
        relatedRequirements: ['REQ-REG-064'],
        relatedDeclarations: ['DECL-06'],
      },
    },
    {
      key: 'CONTRACT_REGISTRATION_BEFORE_WORK',
      position: 5,
      payload: {
        labelAr: 'قيد العقد قبل مباشرة العمل',
        labelEn: 'Contract must be registered before any work under it',
        descriptionEn:
          'Every new brokerage contract must be registered before any work is performed under it.',
        days: 0,
        needsCounsel: false,
        blocking: true,
        relatedRequirements: ['REQ-REG-063'],
        relatedDeclarations: ['DECL-06'],
      },
    },
    {
      key: 'POA_DECLARATION_MAX_AGE',
      position: 6,
      payload: {
        labelAr: 'أقصى مدة لإقرار سريان التوكيل',
        labelEn: 'Maximum age of a power-of-attorney validity declaration',
        descriptionEn:
          'A POA declaration older than this triggers a re-declaration requirement, per the system behaviour note on REQ-REG-041.',
        days: 90,
        needsCounsel: true,
        needsCounselNote:
          'REQ-REG-041 requires the declaration to speak as at its date but sets no maximum age. 90 days is a system-chosen default; it warns and flags rather than blocking.',
        blocking: false,
        relatedRequirements: ['REQ-REG-041'],
      },
    },
  ],
}
