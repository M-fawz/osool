import type { RuleSetDefinition } from './types'

/**
 * RETENTION — REQ-AML-030, Regulatory Controls §خامساً.
 *
 * Six record types, and — the point of holding this as data rather than a
 * single "five years" constant — six *different* clocks. End of relationship,
 * end of operation, date of report, date of sending, date of the shelving
 * decision, and end of the training programme are not the same moment, and a
 * system that treated them as one would compute the wrong eligibility date for
 * five of the six.
 *
 * Row د carries an open end: five years *or until a final decision or judgment
 * is issued, whichever is longer*, where the competent authorities so request.
 * That cannot be computed from a date alone, so it is modelled as an indefinite
 * hold requiring a human to release it — `requiresAuthorityRelease`.
 *
 * 02-SYSTEM-ARCHITECTURE §7: retention lock means a record cannot be archived
 * or altered until the computed eligibility date; legal hold means it cannot be
 * archived at all until the hold is lifted with a reason.
 */

export const retention: RuleSetDefinition = {
  code: 'RETENTION',
  version: 1,
  description:
    'Record retention periods and their six distinct clock-start rules for supervised entities.',
  legalSource: 'Regulatory Controls for Real Estate Brokers, §خامساً',
  requirementIds: ['REQ-AML-030', 'REQ-AML-031', 'REQ-DPA-003'],
  effectiveFrom: new Date('2020-02-01T00:00:00.000Z'),
  effectiveTo: null,

  items: [
    {
      key: 'CDD_RECORDS',
      position: 1,
      payload: {
        rowRef: 'أ',
        labelAr: 'سجلات ومستندات العناية الواجبة',
        labelEn: 'Customer due diligence records and documents',
        descriptionEn:
          'Records obtained through customer due diligence, including requests to commence the relationship, copies of identity-verification documents for natural and legal persons, and copies of correspondence.',
        minimumYears: 5,
        clockStarts: 'END_OF_CONTRACT_OR_RELATIONSHIP',
        clockStartsEn: 'Date of ending the contract or agreement, or of ending the business relationship.',
        requiresAuthorityRelease: false,
      },
    },
    {
      key: 'OPERATION_RECORDS',
      position: 2,
      payload: {
        rowRef: 'ب',
        labelAr: 'سجلات العمليات المنفذة للعملاء',
        labelEn: 'Records of operations conducted for clients',
        descriptionEn:
          'Records relating to operations conducted for clients, containing data sufficient to identify the details of each operation individually.',
        minimumYears: 5,
        clockStarts: 'END_OF_CONTRACT_OR_END_OF_OPERATION',
        clockStartsEn:
          'Date of ending the contract or agreement; or, where no contract was signed, the date of ending the operation.',
        requiresAuthorityRelease: false,
      },
    },
    {
      key: 'UNUSUAL_OPERATION_REPORTS',
      position: 3,
      payload: {
        rowRef: 'ج',
        labelAr: 'تقارير العمليات غير العادية',
        labelEn: 'Reports of unusual operations',
        descriptionEn:
          'Reports of unusual operations, evidence of their review, and the results of any analysis performed.',
        minimumYears: 5,
        clockStarts: 'DATE_REPORT_ISSUED',
        clockStartsEn: 'Date the report was issued.',
        requiresAuthorityRelease: false,
      },
    },
    {
      key: 'SUSPICIOUS_OPERATION_RECORDS',
      position: 4,
      payload: {
        rowRef: 'د',
        labelAr: 'سجلات العمليات المشبوهة',
        labelEn: 'Records of suspicious operations',
        descriptionEn:
          'Records of suspicious operations, including copies of notifications sent to the Unit and their related data and documents.',
        minimumYears: 5,
        clockStarts: 'DATE_OF_SENDING',
        clockStartsEn: 'Date of sending.',
        // Five years or until a final decision or judgment is issued in respect
        // of the operation — whichever is longer — where the competent
        // authorities so request. Not computable from a date, so a human
        // releases it.
        requiresAuthorityRelease: true,
        openEndedNote:
          'Five years, or until a final decision or judgment is issued in respect of the operation, whichever is longer, where the competent authorities so request.',
        // REQ-AML-021 — this platform holds no suspicious-transaction content.
        // The rule is seeded because the Authority inspects against it; the
        // platform itself never stores a record of this type.
        heldByPlatform: false,
        confidentialityNote:
          'REQ-AML-021 — Osool holds no STR content. This row exists as a supervisory benchmark for inspection, not as a record type stored here.',
      },
    },
    {
      key: 'SHELVED_REPORT_RECORDS',
      position: 5,
      payload: {
        rowRef: 'ه',
        labelAr: 'سجلات البلاغات التي تقرر حفظها',
        labelEn: 'Records of reports the compliance manager decided to shelve',
        descriptionEn:
          'Records and documents of reports the compliance manager decided to shelve, with the written reasons for the decision.',
        minimumYears: 5,
        clockStarts: 'DATE_OF_SHELVING_DECISION',
        clockStartsEn: 'Date of the shelving decision.',
        requiresAuthorityRelease: false,
        heldByPlatform: false,
      },
    },
    {
      key: 'TRAINING_RECORDS',
      position: 6,
      payload: {
        rowRef: 'و',
        labelAr: 'سجلات برامج التدريب',
        labelEn: 'Training programme records',
        descriptionEn:
          'Records of training programmes, including all programmes staff received in AML/CFT, their names, the sections or departments they work in, the programme content, its duration, and the training provider, whether local or foreign.',
        minimumYears: 5,
        clockStarts: 'END_OF_TRAINING_PROGRAMME',
        clockStartsEn: 'Date the training programme ended.',
        requiresAuthorityRelease: false,
        heldByPlatform: true,
        relatedRequirements: ['REQ-AML-050'],
      },
    },
  ],
}
