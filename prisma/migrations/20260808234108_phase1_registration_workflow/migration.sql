-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CERTIFIED_CHEQUE', 'BANK_CHEQUE');

-- CreateEnum
CREATE TYPE "AuthenticationBody" AS ENUM ('REAL_ESTATE_PUBLICITY', 'EMBASSY', 'CONSULATE');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('APPLICANT_UPLOAD', 'ISSUED_CARD');

-- CreateEnum
CREATE TYPE "ExaminerRecommendation" AS ENUM ('RECOMMEND_APPROVAL', 'RECOMMEND_REFUSAL');

-- AlterTable
ALTER TABLE "application" ADD COLUMN     "applicantPartyId" TEXT;

-- AlterTable
ALTER TABLE "brokerage_contract" ADD COLUMN     "authenticationBody" "AuthenticationBody";

-- AlterTable
ALTER TABLE "completion" ADD COLUMN     "round" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "document" ADD COLUMN     "kind" "DocumentKind" NOT NULL DEFAULT 'APPLICANT_UPLOAD';

-- AlterTable
ALTER TABLE "party" ADD COLUMN     "commercialRegisterOffice" TEXT,
ADD COLUMN     "commercialRegisterRenewalDate" TIMESTAMP(3),
ADD COLUMN     "taxOffice" TEXT;

-- CreateTable
CREATE TABLE "application_entity_data" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "establishmentType" "PartyType" NOT NULL DEFAULT 'NATURAL_PERSON',
    "legalForm" TEXT,
    "tradeNameAr" TEXT NOT NULL,
    "tradeNameEn" TEXT,
    "tradeStyleAr" TEXT,
    "tradeStyleEn" TEXT,
    "headOfficeAddress" TEXT NOT NULL,
    "governorate" "Governorate" NOT NULL,
    "poBox" TEXT,
    "telephone" TEXT NOT NULL,
    "email" TEXT,
    "commercialRegisterNo" TEXT NOT NULL,
    "commercialRegisterOffice" TEXT NOT NULL,
    "commercialRegisterDate" TIMESTAMP(3) NOT NULL,
    "commercialRegisterRenewalDate" TIMESTAMP(3),
    "taxRegistrationNo" TEXT NOT NULL,
    "taxOffice" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "application_entity_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_contract_data" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 1,
    "clientNameAr" TEXT NOT NULL,
    "clientNameEn" TEXT NOT NULL,
    "clientNationality" TEXT NOT NULL,
    "authenticationBody" "AuthenticationBody" NOT NULL,
    "authenticationNumber" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "capacityActedIn" "BrokerType" NOT NULL,
    "contractValue" DECIMAL(18,2),
    "subjectDescription" TEXT NOT NULL,
    "subjectAddress" TEXT NOT NULL,
    "governorate" "Governorate",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "application_contract_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examination_record" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "examinerUserId" TEXT NOT NULL,
    "originalCount" INTEGER NOT NULL DEFAULT 1,
    "copyCount" INTEGER NOT NULL DEFAULT 0,
    "brokerageNature" "BrokerType"[],
    "proposedValidFrom" TIMESTAMP(3),
    "proposedValidTo" TIMESTAMP(3),
    "recommendation" "ExaminerRecommendation",
    "examinerNote" TEXT,
    "signedAt" TIMESTAMP(3),
    "reviewerUserId" TEXT,
    "reviewerNote" TEXT,
    "reviewSignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "examination_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examination_field_check" (
    "id" TEXT NOT NULL,
    "examination_record_id" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "examination_field_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_record" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "bankName" TEXT,
    "bankBranch" TEXT,
    "chequeNumber" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "fee_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_line" (
    "id" TEXT NOT NULL,
    "fee_record_id" TEXT NOT NULL,
    "feeKey" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "fee_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_issuance" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "documentId" TEXT,
    "issuedByUserId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliverySerial" TEXT,
    "deliveredToName" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "deliveredByUserId" TEXT,
    "renewalDateAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "numberObligationAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "card_issuance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_handling_record" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "dataExtractedByUserId" TEXT,
    "dataExtractedAt" TIMESTAMP(3),
    "dataNote" TEXT,
    "archivedByUserId" TEXT,
    "filedAt" TIMESTAMP(3),
    "pageCount" INTEGER,
    "serialRegisterNo" TEXT,
    "alphabeticalIndex" TEXT,
    "fileReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "file_handling_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "application_entity_data_applicationId_key" ON "application_entity_data"("applicationId");

-- CreateIndex
CREATE INDEX "application_entity_data_commercialRegisterNo_idx" ON "application_entity_data"("commercialRegisterNo");

-- CreateIndex
CREATE INDEX "application_contract_data_clientNameAr_idx" ON "application_contract_data"("clientNameAr");

-- CreateIndex
CREATE UNIQUE INDEX "application_contract_data_applicationId_position_key" ON "application_contract_data"("applicationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "examination_record_applicationId_key" ON "examination_record"("applicationId");

-- CreateIndex
CREATE INDEX "examination_record_examinerUserId_idx" ON "examination_record"("examinerUserId");

-- CreateIndex
CREATE INDEX "examination_record_reviewerUserId_idx" ON "examination_record"("reviewerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "examination_field_check_examination_record_id_fieldKey_key" ON "examination_field_check"("examination_record_id", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "fee_record_applicationId_key" ON "fee_record"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_line_fee_record_id_feeKey_key" ON "fee_line"("fee_record_id", "feeKey");

-- CreateIndex
CREATE UNIQUE INDEX "card_issuance_applicationId_key" ON "card_issuance"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "card_issuance_registrationId_key" ON "card_issuance"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "card_issuance_deliverySerial_key" ON "card_issuance"("deliverySerial");

-- CreateIndex
CREATE INDEX "card_issuance_issuedAt_idx" ON "card_issuance"("issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "file_handling_record_applicationId_key" ON "file_handling_record"("applicationId");

-- CreateIndex
CREATE INDEX "document_applicationId_kind_idx" ON "document"("applicationId", "kind");

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_applicantPartyId_fkey" FOREIGN KEY ("applicantPartyId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_entity_data" ADD CONSTRAINT "application_entity_data_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_contract_data" ADD CONSTRAINT "application_contract_data_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_record" ADD CONSTRAINT "examination_record_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_record" ADD CONSTRAINT "examination_record_examinerUserId_fkey" FOREIGN KEY ("examinerUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_record" ADD CONSTRAINT "examination_record_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_field_check" ADD CONSTRAINT "examination_field_check_examination_record_id_fkey" FOREIGN KEY ("examination_record_id") REFERENCES "examination_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_record" ADD CONSTRAINT "fee_record_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_record" ADD CONSTRAINT "fee_record_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_line" ADD CONSTRAINT "fee_line_fee_record_id_fkey" FOREIGN KEY ("fee_record_id") REFERENCES "fee_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_issuance" ADD CONSTRAINT "card_issuance_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_issuance" ADD CONSTRAINT "card_issuance_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_issuance" ADD CONSTRAINT "card_issuance_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_issuance" ADD CONSTRAINT "card_issuance_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_issuance" ADD CONSTRAINT "card_issuance_deliveredByUserId_fkey" FOREIGN KEY ("deliveredByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_handling_record" ADD CONSTRAINT "file_handling_record_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_handling_record" ADD CONSTRAINT "file_handling_record_dataExtractedByUserId_fkey" FOREIGN KEY ("dataExtractedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_handling_record" ADD CONSTRAINT "file_handling_record_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- Guardrails for the Phase 1 tables
--
-- Hand-written and appended to the generated migration, exactly as the init
-- migration does. A new table that is not in the protected array is a table
-- with a working DELETE path, and the whole guarantee in CLAUDE.md rule 2 is
-- only as good as the least-recently-updated list.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Constraints Prisma's schema language cannot express ─────────────────

-- REQ-REG-052, again and independently of the Application table. The internal
-- review form carries both signatures, and a form signed twice by one person
-- is the exact failure the requirement exists to prevent — so it is refused
-- where the signatures actually live, not only where the assignment does.
ALTER TABLE "examination_record"
  ADD CONSTRAINT "examination_examiner_reviewer_distinct"
  CHECK (
    "reviewerUserId" IS NULL
    OR "examinerUserId" <> "reviewerUserId"
  );

-- Money recorded is never negative. Fee amounts are not thresholds — they are
-- what the treasurer received — so they belong here rather than in a rule set.
ALTER TABLE "fee_line"
  ADD CONSTRAINT "fee_line_amount_non_negative"
  CHECK ("amount" >= 0);

ALTER TABLE "fee_record"
  ADD CONSTRAINT "fee_record_total_non_negative"
  CHECK ("totalAmount" >= 0);

-- A contract that expires before it begins is a transcription error, and one
-- that reaches the register is a contract nobody can compute a duty from.
ALTER TABLE "application_contract_data"
  ADD CONSTRAINT "application_contract_validity_ordered"
  CHECK ("validTo" > "validFrom");

ALTER TABLE "application_contract_data"
  ADD CONSTRAINT "application_contract_value_non_negative"
  CHECK ("contractValue" IS NULL OR "contractValue" >= 0);

-- Page counts and copy counts are counts.
ALTER TABLE "examination_record"
  ADD CONSTRAINT "examination_counts_non_negative"
  CHECK ("originalCount" >= 0 AND "copyCount" >= 0);

ALTER TABLE "file_handling_record"
  ADD CONSTRAINT "file_handling_page_count_non_negative"
  CHECK ("pageCount" IS NULL OR "pageCount" >= 0);

-- ── 2. Nothing is ever deleted, and nothing is ever truncated ──────────────

DO $$
DECLARE
  t text;
  protected text[] := ARRAY[
    'application_entity_data',
    'application_contract_data',
    'examination_record',
    'examination_field_check',
    'fee_record',
    'fee_line',
    'card_issuance',
    'file_handling_record'
  ];
BEGIN
  FOREACH t IN ARRAY protected LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'no_delete_' || t, t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION osool_forbid_delete()',
      'no_delete_' || t, t
    );

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'no_truncate_' || t, t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION osool_forbid_truncate()',
      'no_truncate_' || t, t
    );
  END LOOP;
END;
$$;
