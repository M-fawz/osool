import type { RuleSetDefinition } from './types'

/**
 * FEE_SCHEDULE — the eight fee headings on GOEIC form CR-CA-QR7--01,
 * REQ-REG-030, recorded at REQ-REG-050 step 4.
 *
 * ── Why there are no amounts in this file ──────────────────────────────────
 * 01-LEGAL-REFERENCE.md lists the headings and states no figure for any of
 * them. CLAUDE.md rule 3 is explicit: "If a rule has no ID there, it does not
 * go into the code — raise it instead." Inventing plausible-looking fee
 * amounts would be the worst kind of wrong here, because they would look
 * authoritative on a printed receipt and nobody downstream would know they had
 * been guessed.
 *
 * So each item carries `amount: null` and `amountSource: 'NOT_IN_LEGAL_
 * REFERENCE'`. The treasurer enters what was actually received, which is a
 * receipt rather than a threshold and belongs on the FeeRecord anyway. When
 * counsel supplies the tariff, it becomes version 2 of this rule set with an
 * effective date — no code change.
 *
 * 02-SYSTEM-ARCHITECTURE §11: fees are recorded, never processed. Nothing in
 * this system moves money.
 */

const NOT_STATED = 'NOT_IN_LEGAL_REFERENCE' as const

export const feeSchedule: RuleSetDefinition = {
  code: 'FEE_SCHEDULE',
  version: 1,
  description:
    'The eight fee headings recorded against a new-registration application. Headings only — no tariff is stated in the legal reference.',
  legalSource: 'GOEIC form CR-CA-QR7--01 (issue 4, 1/6/2020)',
  requirementIds: ['REQ-REG-030'],
  effectiveFrom: new Date('2020-06-01T00:00:00.000Z'),
  effectiveTo: null,

  items: [
    {
      key: 'DEPOSIT',
      position: 1,
      payload: {
        labelAr: 'تأمين',
        labelEn: 'Deposit',
        amount: null,
        amountSource: NOT_STATED,
        mandatory: true,
      },
    },
    {
      key: 'FIRST_REGISTRATION',
      position: 2,
      payload: {
        labelAr: 'رسم القيد لأول مرة',
        labelEn: 'First-time registration fee',
        amount: null,
        amountSource: NOT_STATED,
        mandatory: true,
      },
    },
    {
      key: 'PUBLICATION',
      position: 3,
      payload: {
        labelAr: 'رسم النشر',
        labelEn: 'Publication fee',
        amount: null,
        amountSource: NOT_STATED,
        mandatory: true,
      },
    },
    {
      key: 'COMMERCIAL_SYNDICATE',
      position: 4,
      payload: {
        labelAr: 'النقابة التجارية',
        labelEn: 'Commercial syndicate',
        amount: null,
        amountSource: NOT_STATED,
        mandatory: true,
      },
    },
    {
      key: 'COPIES',
      position: 5,
      payload: {
        labelAr: 'رسم الصور',
        labelEn: 'Copies',
        amount: null,
        amountSource: NOT_STATED,
        mandatory: false,
        conditionNote: 'Charged per copy requested; zero where no copies were taken.',
      },
    },
    {
      key: 'MARTYRS_FUND',
      position: 6,
      payload: {
        labelAr: 'صندوق تكريم الشهداء',
        labelEn: "Martyrs' honouring fund",
        amount: null,
        amountSource: NOT_STATED,
        mandatory: true,
      },
    },
    {
      key: 'SURPLUS_CAPACITY',
      position: 7,
      payload: {
        labelAr: 'الطاقة الفائضة',
        labelEn: 'Surplus capacity',
        amount: null,
        amountSource: NOT_STATED,
        mandatory: false,
      },
    },
    {
      key: 'URGENT_BOOKING',
      position: 8,
      payload: {
        labelAr: 'خدمة الحجز العاجل',
        labelEn: 'Urgent booking service',
        amount: null,
        amountSource: NOT_STATED,
        mandatory: false,
        conditionNote: 'Charged only where the applicant asked for the urgent service.',
      },
    },
  ],
}
