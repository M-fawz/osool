import { z } from 'zod'
import { checkNationalIdStructure, normaliseIdentifier } from '@/lib/crypto/pii'

/**
 * The application's schemas — one per step of the broker portal.
 *
 * 02-SYSTEM-ARCHITECTURE §2: "One schema definition; the server is the
 * authority, the client reuses it for immediate feedback." Every one of these
 * runs in the Server Action before anything is written. The client may run them
 * too, and it makes no difference to what is accepted: assume every client
 * check is bypassed, because with one `curl` it is.
 *
 * ── On the error messages ──────────────────────────────────────────────────
 * Every message here is a **key**, not a sentence — `errors.required`, not
 * "This field is required". The interface is Arabic-first with a full English
 * mirror, and a Zod schema that carried English prose would either put English
 * on an Arabic screen or force a second parallel schema. The keys resolve
 * through next-intl in `application.errors`, so the Arabic is written where all
 * the other Arabic is written and stays reviewable as copy rather than as code.
 */

const required = { message: 'required' }

/** Trimmed, non-empty, bounded. The shape almost every free-text field wants. */
function text(max: number, min = 1) {
  return z
    .string()
    .trim()
    .min(min, min > 1 ? { message: 'tooShort' } : required)
    .max(max, { message: 'tooLong' })
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: 'tooLong' })
    .optional()
    .transform((v) => (v ? v : null))

/**
 * Arabic script must actually be present in a field labelled "in Arabic".
 *
 * Without this the two name columns quietly become one: the register holds the
 * Latin form twice and cannot be searched in Arabic, which is the search that
 * matters most here. The check is for *presence* of Arabic, not absence of
 * Latin — real Egyptian trade names contain digits, ampersands, and Latin brand
 * words, and refusing "شركة النيل للتسويق العقاري - Nile Marketing" would be
 * refusing the correct answer.
 */
const ARABIC = /[؀-ۿ]/
const arabicText = (max: number) => text(max).refine((v) => ARABIC.test(v), { message: 'needsArabic' })

/** Latin script must be present in a field labelled "in English". */
const LATIN = /[A-Za-z]/
const latinText = (max: number) => text(max).refine((v) => LATIN.test(v), { message: 'needsLatin' })

const optionalLatinText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: 'tooLong' })
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || LATIN.test(v), { message: 'needsLatin' })

/**
 * A telephone number as Egyptian forms are actually filled in: `01001234567`,
 * `+20 2 2735 1234`, `02-27351234`. Digits, spaces, dashes, and one optional
 * leading `+`, with between seven and fifteen digits in it — the E.164 range.
 * Stricter than that and half the correct answers are refused; looser and the
 * column stops being a telephone number.
 */
const telephone = z
  .string()
  .trim()
  .min(1, required)
  .max(32, { message: 'tooLong' })
  .refine((v) => /^\+?[\d\s\-()]+$/.test(v), { message: 'telephoneFormat' })
  .refine((v) => {
    const digits = v.replace(/\D/g, '').length
    return digits >= 7 && digits <= 15
  }, { message: 'telephoneFormat' })

/**
 * The Egyptian national ID — fourteen digits, structurally checked.
 *
 * 02-SYSTEM-ARCHITECTURE §10 decision 4: checksum validation locally, no
 * external call assumed. So this proves the number is *well-formed*, never that
 * the person exists. The distinction is written into the error key
 * (`nationalIdFormat`, not `nationalIdNotFound`) so no screen can imply the
 * register has verified an identity it has not.
 */
const nationalId = z
  .string()
  .trim()
  .min(1, required)
  .transform(normaliseIdentifier)
  .refine((v) => checkNationalIdStructure(v).ok, { message: 'nationalIdFormat' })

/** A registration or tax reference: digits and separators, nothing else. */
const reference = (max: number) =>
  text(max).refine((v) => /^[\d\s\-/]+$/.test(v), { message: 'referenceFormat' })

/** A date arriving from a form as `YYYY-MM-DD`. */
const isoDate = z
  .string()
  .trim()
  .min(1, required)
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'dateFormat' })
  .transform((v) => new Date(`${v}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), { message: 'dateFormat' })

const optionalIsoDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), { message: 'dateFormat' })

/**
 * Money as typed: `1,000,000` and `1000000` are the same figure, and a form
 * that refuses the first is a form people give up on. Never negative.
 */
const money = z
  .string()
  .trim()
  .min(1, required)
  .transform((v) => Number(v.replace(/[,\s]/g, '')))
  .refine((n) => Number.isFinite(n), { message: 'numberFormat' })
  .refine((n) => n >= 0, { message: 'negative' })
  .refine((n) => n <= 1_000_000_000_000, { message: 'tooLarge' })

const optionalMoney = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.trim() ? Number(v.replace(/[,\s]/g, '')) : null))
  .refine((n) => n === null || (Number.isFinite(n) && n >= 0), { message: 'numberFormat' })

// ── Enumerations, mirrored from the Prisma enums ────────────────────────────

export const APPLICANT_CAPACITIES = [
  'SOLE_TRADER',
  'CHAIRMAN',
  'RESPONSIBLE_MANAGER',
  'GENERAL_PARTNER',
  'AGENT_UNDER_POA',
] as const

export const BROKER_TYPES = ['SELL', 'BUY', 'DUAL', 'RENTAL'] as const
export const BROKER_CATEGORIES = ['A', 'B', 'C', 'D'] as const
export const AUTHENTICATION_BODIES = ['REAL_ESTATE_PUBLICITY', 'EMBASSY', 'CONSULATE'] as const
export const ESTABLISHMENT_TYPES = ['NATURAL_PERSON', 'LEGAL_PERSON'] as const
export const POA_TYPES = ['GENERAL', 'SPECIAL'] as const

export const GOVERNORATES = [
  'CAIRO', 'GIZA', 'ALEXANDRIA', 'QALYUBIA', 'PORT_SAID', 'SUEZ', 'DAKAHLIA', 'SHARQIA',
  'GHARBIA', 'MONUFIA', 'BEHEIRA', 'KAFR_EL_SHEIKH', 'DAMIETTA', 'ISMAILIA', 'NORTH_SINAI',
  'SOUTH_SINAI', 'BENI_SUEF', 'FAYOUM', 'MINYA', 'ASYUT', 'SOHAG', 'QENA', 'LUXOR', 'ASWAN',
  'RED_SEA', 'NEW_VALLEY', 'MATROUH',
] as const

// ── Step 1 — applicant capacity and identity, REQ-REG-030 · CDD §5.1 ────────

export const CapacitySchema = z.object({
  applicantCapacity: z.enum(APPLICANT_CAPACITIES, { message: 'required' }),
  applicantNameAr: arabicText(160),
  applicantNameEn: optionalLatinText(160),
  applicantNationalId: nationalId,
  applicantNationality: text(60).default('مصري'),
})

export type CapacityInput = z.infer<typeof CapacitySchema>

// ── Step 2 — power of attorney, REQ-REG-041 ─────────────────────────────────

export const PowerOfAttorneySchema = z
  .object({
    poaType: z.enum(POA_TYPES, { message: 'required' }),
    number: reference(40),
    year: z
      .string()
      .trim()
      .min(1, required)
      .transform((v) => Number(normaliseIdentifier(v)))
      .refine((n) => Number.isInteger(n) && n >= 1900 && n <= 2200, { message: 'yearRange' }),
    notarisationOffice: text(160),
    notarisedOn: optionalIsoDate,
    // REQ-REG-041 — both parts of the declaration, each recorded separately.
    // A single "I confirm the power of attorney" would collapse two distinct
    // assertions, and it is the second one — that the principal is alive — that
    // a lapsed POA fails.
    declaresStillValid: z.literal(true, { message: 'declarationRequired' }),
    declaresPrincipalAlive: z.literal(true, { message: 'declarationRequired' }),
  })
  .refine((v) => v.notarisedOn === null || v.notarisedOn.getUTCFullYear() === v.year, {
    message: 'poaYearMismatch',
    path: ['notarisedOn'],
  })

export type PowerOfAttorneyInput = z.infer<typeof PowerOfAttorneySchema>

// ── Step 3 — entity data, REQ-REG-030 ───────────────────────────────────────

export const EntityDataSchema = z
  .object({
    establishmentType: z.enum(ESTABLISHMENT_TYPES, { message: 'required' }),
    legalForm: optionalText(120),

    tradeNameAr: arabicText(200),
    tradeNameEn: optionalLatinText(200),
    tradeStyleAr: optionalText(200),
    tradeStyleEn: optionalText(200),

    headOfficeAddress: text(300),
    governorate: z.enum(GOVERNORATES, { message: 'required' }),
    poBox: optionalText(40),
    telephone,
    email: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || z.string().email().safeParse(v).success, { message: 'emailFormat' }),

    commercialRegisterNo: reference(40),
    commercialRegisterOffice: text(160),
    commercialRegisterDate: isoDate,
    commercialRegisterRenewalDate: optionalIsoDate,

    taxRegistrationNo: reference(40),
    taxOffice: text(160),
  })
  .refine(
    (v) =>
      v.commercialRegisterRenewalDate === null ||
      v.commercialRegisterRenewalDate.getTime() >= v.commercialRegisterDate.getTime(),
    { message: 'renewalBeforeIssue', path: ['commercialRegisterRenewalDate'] },
  )

export type EntityDataInput = z.infer<typeof EntityDataSchema>

// ── Step 4 — types, category, capital. REQ-REG-010 · 020 · 021 ──────────────

export const CategorySchema = z.object({
  requestedTypes: z
    .array(z.enum(BROKER_TYPES))
    .min(1, { message: 'chooseAtLeastOneType' })
    .max(BROKER_TYPES.length),
  requestedCategory: z.enum(BROKER_CATEGORIES, { message: 'required' }),
  paidUpCapital: money,
})

export type CategoryInput = z.infer<typeof CategorySchema>

// ── Step 5 — brokerage contract data, REQ-REG-030 ───────────────────────────

export const ContractDataSchema = z
  .object({
    clientNameAr: arabicText(200),
    clientNameEn: latinText(200),
    clientNationality: text(60),
    authenticationBody: z.enum(AUTHENTICATION_BODIES, { message: 'required' }),
    authenticationNumber: reference(60),
    validFrom: isoDate,
    validTo: isoDate,
    capacityActedIn: z.enum(BROKER_TYPES, { message: 'required' }),
    contractValue: optionalMoney,
    subjectDescription: text(600),
    subjectAddress: text(300),
    governorate: z.enum(GOVERNORATES).optional().nullable(),
  })
  .refine((v) => v.validTo.getTime() > v.validFrom.getTime(), {
    message: 'validToBeforeFrom',
    path: ['validTo'],
  })

export type ContractDataInput = z.infer<typeof ContractDataSchema>

// ── Step 7 — declarations, REQ-REG-040 ──────────────────────────────────────

export const DeclarationSchema = z.object({
  declarationKey: z.string().trim().regex(/^DECL-\d{2}$/, { message: 'required' }),
  affirmed: z.boolean(),
  qualification: optionalText(400),
})

export type DeclarationInput = z.infer<typeof DeclarationSchema>

// ── The government workflow ─────────────────────────────────────────────────

/** REQ-REG-050 step 1 — the clerk records how many pages arrived. */
export const IntakeSchema = z.object({
  pageCount: z
    .string()
    .trim()
    .min(1, required)
    .transform((v) => Number(normaliseIdentifier(v)))
    .refine((n) => Number.isInteger(n) && n >= 1 && n <= 5000, { message: 'pageCountRange' }),
})

/** REQ-REG-050 step 2 — الاستيفاءات, itemised. Free text alone is refused. */
export const CompletionItemSchema = z.object({
  /**
   * The DOC_CHECKLIST item this completion cites. Optional in the schema and
   * asked for in the interface, because 00-VISION §5's "completions with no
   * basis in the documented requirements" signal counts the ones without it —
   * and a field that cannot be left blank can never produce that count.
   */
  checklistItemKey: optionalText(80),
  descriptionAr: arabicText(500),
  descriptionEn: optionalText(500),
})

export const RequestCompletionsSchema = z.object({
  items: z.array(CompletionItemSchema).min(1, { message: 'atLeastOneCompletion' }).max(20),
})

/** REQ-REG-051 — the examiner's form and recommendation. */
export const ExaminationSchema = z.object({
  originalCount: z
    .string()
    .trim()
    .transform((v) => Number(normaliseIdentifier(v || '1')))
    .refine((n) => Number.isInteger(n) && n >= 0 && n <= 999, { message: 'countRange' }),
  copyCount: z
    .string()
    .trim()
    .transform((v) => Number(normaliseIdentifier(v || '0')))
    .refine((n) => Number.isInteger(n) && n >= 0 && n <= 999, { message: 'countRange' }),
  brokerageNature: z.array(z.enum(BROKER_TYPES)).min(1, { message: 'chooseAtLeastOneType' }),
  proposedValidFrom: isoDate,
  proposedValidTo: isoDate,
  recommendation: z.enum(['RECOMMEND_APPROVAL', 'RECOMMEND_REFUSAL'], { message: 'required' }),
  examinerNote: optionalText(2000),
  verifiedFieldKeys: z.array(z.string().trim().max(80)),
}).refine((v) => v.proposedValidTo.getTime() > v.proposedValidFrom.getTime(), {
  message: 'validToBeforeFrom',
  path: ['proposedValidTo'],
})

/** REQ-REG-050 step 3 — the decision. A refusal must say why. */
export const ReviewDecisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT'], { message: 'required' }),
    note: optionalText(2000),
  })
  .refine((v) => v.decision === 'APPROVE' || (v.note !== null && v.note.length >= 10), {
    message: 'refusalNeedsReason',
    path: ['note'],
  })

/** REQ-REG-050 step 4 — fees recorded, never processed. */
export const FeeRecordSchema = z
  .object({
    paymentMethod: z.enum(['CASH', 'CERTIFIED_CHEQUE', 'BANK_CHEQUE'], { message: 'required' }),
    receiptNumber: reference(60),
    bankName: optionalText(160),
    bankBranch: optionalText(160),
    chequeNumber: optionalText(60),
    lines: z
      .array(z.object({ feeKey: z.string().trim().min(1), amount: money }))
      .min(1, { message: 'atLeastOneFeeLine' }),
  })
  .refine((v) => v.paymentMethod === 'CASH' || (v.bankName !== null && v.bankBranch !== null), {
    // REQ-REG-050 step 4 — "cash or certified/bank cheque, with issuing bank
    // and branch". The bank is part of the record for a cheque, not optional
    // colour, because it is what makes the payment traceable at all.
    message: 'chequeNeedsBank',
    path: ['bankName'],
  })

/** REQ-REG-050 step 6 — delivery, and the two acknowledgements. */
export const DeliverySchema = z.object({
  deliveredToName: text(160),
  renewalDateAcknowledged: z.literal(true, { message: 'acknowledgementRequired' }),
  numberObligationAcknowledged: z.literal(true, { message: 'acknowledgementRequired' }),
})

/** REQ-REG-050 steps 7 and 8. */
export const DataExtractionSchema = z.object({
  dataNote: optionalText(2000),
})

export const ArchiveSchema = z.object({
  pageCount: z
    .string()
    .trim()
    .min(1, required)
    .transform((v) => Number(normaliseIdentifier(v)))
    .refine((n) => Number.isInteger(n) && n >= 1 && n <= 5000, { message: 'pageCountRange' }),
  serialRegisterNo: text(60),
  alphabeticalIndex: text(60),
  fileReference: optionalText(80),
})

/**
 * Flatten a Zod failure into `{ field: errorKey }`.
 *
 * One entry per field, first issue wins: a field showing two contradictory
 * messages at once is a field nobody knows how to fix.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_'
    if (!(path in out)) out[path] = issue.message
  }
  return out
}
