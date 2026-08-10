-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SYSTEM_ADMIN', 'REGISTRY_CLERK', 'EXAMINER', 'REVIEWER', 'CARD_ISSUER', 'DATA_MANAGER', 'FILES_HEAD', 'AML_SUPERVISOR', 'INSPECTOR', 'ANALYST', 'AUDITOR', 'BROKER_OWNER', 'BROKER_STAFF', 'BROKER_AGENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BrokerType" AS ENUM ('SELL', 'BUY', 'DUAL', 'RENTAL');

-- CreateEnum
CREATE TYPE "BrokerCategory" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('NATURAL_PERSON', 'LEGAL_PERSON');

-- CreateEnum
CREATE TYPE "ApplicantCapacity" AS ENUM ('SOLE_TRADER', 'CHAIRMAN', 'RESPONSIBLE_MANAGER', 'GENERAL_PARTNER', 'AGENT_UNDER_POA');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_INTAKE', 'UNDER_EXAMINATION', 'AWAITING_COMPLETION', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'AWAITING_PAYMENT', 'CARD_ISSUED', 'ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('ACTIVE', 'RENEWAL_DUE', 'LAPSED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApplicationKind" AS ENUM ('NEW_REGISTRATION', 'RENEWAL', 'AMENDMENT');

-- CreateEnum
CREATE TYPE "CompletionStatus" AS ENUM ('REQUESTED', 'SATISFIED', 'WAIVED');

-- CreateEnum
CREATE TYPE "ComplianceRole" AS ENUM ('MANAGER', 'DEPUTY');

-- CreateEnum
CREATE TYPE "SignalState" AS ENUM ('OPEN', 'UNDER_REVIEW', 'DISMISSED_WITH_REASON', 'ESCALATED');

-- CreateEnum
CREATE TYPE "SignalSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SignalFamily" AS ENUM ('SUPERVISED_POPULATION', 'PROCESS_INTEGRITY');

-- CreateEnum
CREATE TYPE "AuditAccessType" AS ENUM ('READ', 'WRITE');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'REMEDIATION_REQUESTED', 'REMEDIATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Governorate" AS ENUM ('CAIRO', 'GIZA', 'ALEXANDRIA', 'QALYUBIA', 'PORT_SAID', 'SUEZ', 'DAKAHLIA', 'SHARQIA', 'GHARBIA', 'MONUFIA', 'BEHEIRA', 'KAFR_EL_SHEIKH', 'DAMIETTA', 'ISMAILIA', 'NORTH_SINAI', 'SOUTH_SINAI', 'BENI_SUEF', 'FAYOUM', 'MINYA', 'ASYUT', 'SOHAG', 'QENA', 'LUXOR', 'ASWAN', 'RED_SEA', 'NEW_VALLEY', 'MATROUH');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "nameAr" TEXT,
    "brokerEntityId" TEXT,
    "createdByUserId" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "lastSignInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party" (
    "id" TEXT NOT NULL,
    "type" "PartyType" NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "nationality" TEXT,
    "nationalIdEnc" TEXT,
    "nationalIdHash" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "placeOfBirth" TEXT,
    "sex" TEXT,
    "occupation" TEXT,
    "employer" TEXT,
    "legalForm" TEXT,
    "commercialRegisterNo" TEXT,
    "commercialRegisterDate" TIMESTAMP(3),
    "taxRegistrationNo" TEXT,
    "addressLine" TEXT,
    "governorate" "Governorate",
    "poBox" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ownership" (
    "id" TEXT NOT NULL,
    "ownerPartyId" TEXT NOT NULL,
    "ownedPartyId" TEXT NOT NULL,
    "percentage" DECIMAL(7,4) NOT NULL,
    "controlByOtherMeans" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ownership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broker_entity" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "tradeNameAr" TEXT NOT NULL,
    "tradeNameEn" TEXT,
    "tradeStyleAr" TEXT,
    "tradeStyleEn" TEXT,
    "headOfficeAddress" TEXT,
    "governorate" "Governorate",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "broker_entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration" (
    "id" TEXT NOT NULL,
    "brokerEntityId" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "category" "BrokerCategory" NOT NULL,
    "types" "BrokerType"[],
    "paidUpCapital" DECIMAL(18,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "decidedUnderRuleSetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
    "id" TEXT NOT NULL,
    "kind" "ApplicationKind" NOT NULL DEFAULT 'NEW_REGISTRATION',
    "brokerEntityId" TEXT NOT NULL,
    "registrationId" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "temporaryNumber" TEXT,
    "pageCount" INTEGER,
    "requestedCategory" "BrokerCategory",
    "requestedTypes" "BrokerType"[],
    "paidUpCapital" DECIMAL(18,2),
    "applicantCapacity" "ApplicantCapacity",
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "submittedUnderRuleSetIds" JSONB,
    "intakeClerkId" TEXT,
    "examinerId" TEXT,
    "reviewerId" TEXT,
    "cardIssuerId" TEXT,
    "rejectionReason" TEXT,
    "powerOfAttorneyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_transition" (
    "id" TEXT NOT NULL,
    "fromState" "ApplicationStatus" NOT NULL,
    "toState" "ApplicationStatus" NOT NULL,
    "action" TEXT NOT NULL,
    "allowedRoles" "Role"[],
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "application_transition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_event" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" "Role" NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" "ApplicationStatus",
    "toState" "ApplicationStatus" NOT NULL,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "ruleSetVersions" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "application_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "completion" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "itemNumber" INTEGER NOT NULL,
    "checklistItemKey" TEXT,
    "descriptionAr" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "status" "CompletionStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionReason" TEXT,
    "satisfiedByDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "completion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "declarationKey" TEXT NOT NULL,
    "textAr" TEXT NOT NULL,
    "textEn" TEXT,
    "affirmed" BOOLEAN NOT NULL,
    "qualification" TEXT,
    "assertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "ruleSetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "declaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "power_of_attorney" (
    "id" TEXT NOT NULL,
    "poaType" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "notarisationOffice" TEXT NOT NULL,
    "notarisedOn" TIMESTAMP(3),
    "principalPartyId" TEXT,
    "agentPartyId" TEXT,
    "stillValidDeclaredAt" TIMESTAMP(3),
    "principalAliveDeclaredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "power_of_attorney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brokerage_contract" (
    "id" TEXT NOT NULL,
    "brokerEntityId" TEXT NOT NULL,
    "registrationId" TEXT,
    "clientNameAr" TEXT NOT NULL,
    "clientNameEn" TEXT,
    "clientNationality" TEXT,
    "authenticationNumber" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "capacityActedIn" "BrokerType" NOT NULL,
    "contractValue" DECIMAL(18,2),
    "subjectDescription" TEXT,
    "subjectAddress" TEXT,
    "governorate" "Governorate",
    "ceasedAt" TIMESTAMP(3),
    "cessationNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "brokerage_contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_officer_tenure" (
    "id" TEXT NOT NULL,
    "brokerEntityId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "role" "ComplianceRole" NOT NULL,
    "startedOn" TIMESTAMP(3) NOT NULL,
    "endedOn" TIMESTAMP(3),
    "functionalLevel" TEXT,
    "qualifications" TEXT,
    "experienceYears" INTEGER,
    "authorityNotifiedAt" TIMESTAMP(3),
    "unitNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "compliance_officer_tenure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_record" (
    "id" TEXT NOT NULL,
    "brokerEntityId" TEXT NOT NULL,
    "programmeTitle" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerIsLocal" BOOLEAN NOT NULL DEFAULT true,
    "content" TEXT,
    "durationHours" INTEGER,
    "startedOn" TIMESTAMP(3) NOT NULL,
    "endedOn" TIMESTAMP(3) NOT NULL,
    "attendeeCount" INTEGER,
    "attendees" JSONB,
    "unitNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "training_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection" (
    "id" TEXT NOT NULL,
    "brokerEntityId" TEXT NOT NULL,
    "inspectorUserId" TEXT NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledOn" TIMESTAMP(3) NOT NULL,
    "conductedOn" TIMESTAMP(3),
    "isFieldVisit" BOOLEAN NOT NULL DEFAULT false,
    "checklistRuleSetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "checklistItemKey" TEXT,
    "descriptionAr" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "severity" "SignalSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "remediationDueOn" TIMESTAMP(3),
    "remediatedOn" TIMESTAMP(3),
    "remediationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" TEXT NOT NULL,
    "checklistItemKey" TEXT,
    "applicationId" TEXT,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalFilename" TEXT,
    "supersedesDocumentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signal" (
    "id" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "family" "SignalFamily" NOT NULL,
    "severity" "SignalSeverity" NOT NULL DEFAULT 'MEDIUM',
    "state" "SignalState" NOT NULL DEFAULT 'OPEN',
    "applicationId" TEXT,
    "brokerageContractId" TEXT,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "evidence" JSONB NOT NULL,
    "ruleSetId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disposedByUserId" TEXT,
    "disposedAt" TIMESTAMP(3),
    "dispositionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_set" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "description" TEXT,
    "legalSource" TEXT,
    "requirementIds" TEXT[],
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "rule_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_item" (
    "id" TEXT NOT NULL,
    "ruleSetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "rule_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "seq" BIGINT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorRole" "Role",
    "actorLabel" TEXT,
    "accessType" "AuditAccessType" NOT NULL DEFAULT 'WRITE',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "fromState" TEXT,
    "toState" TEXT,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "ruleSetVersions" JSONB,
    "payload" JSONB,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_hold" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "placedByUserId" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),
    "liftedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "legal_hold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_role_status_idx" ON "user"("role", "status");

-- CreateIndex
CREATE INDEX "user_brokerEntityId_idx" ON "user"("brokerEntityId");

-- CreateIndex
CREATE INDEX "user_archivedAt_idx" ON "user"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "session_expiresAt_idx" ON "session"("expiresAt");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "party_nameAr_idx" ON "party"("nameAr");

-- CreateIndex
CREATE INDEX "party_nameEn_idx" ON "party"("nameEn");

-- CreateIndex
CREATE INDEX "party_nationalIdHash_idx" ON "party"("nationalIdHash");

-- CreateIndex
CREATE INDEX "party_commercialRegisterNo_idx" ON "party"("commercialRegisterNo");

-- CreateIndex
CREATE INDEX "party_type_archivedAt_idx" ON "party"("type", "archivedAt");

-- CreateIndex
CREATE INDEX "ownership_ownedPartyId_effectiveFrom_idx" ON "ownership"("ownedPartyId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ownership_ownerPartyId_effectiveFrom_idx" ON "ownership"("ownerPartyId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "broker_entity_tradeNameAr_idx" ON "broker_entity"("tradeNameAr");

-- CreateIndex
CREATE INDEX "broker_entity_governorate_archivedAt_idx" ON "broker_entity"("governorate", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "registration_registrationNumber_key" ON "registration"("registrationNumber");

-- CreateIndex
CREATE INDEX "registration_brokerEntityId_status_idx" ON "registration"("brokerEntityId", "status");

-- CreateIndex
CREATE INDEX "registration_status_validTo_idx" ON "registration"("status", "validTo");

-- CreateIndex
CREATE INDEX "registration_category_idx" ON "registration"("category");

-- CreateIndex
CREATE UNIQUE INDEX "application_temporaryNumber_key" ON "application"("temporaryNumber");

-- CreateIndex
CREATE INDEX "application_status_updatedAt_idx" ON "application"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "application_brokerEntityId_idx" ON "application"("brokerEntityId");

-- CreateIndex
CREATE INDEX "application_examinerId_idx" ON "application"("examinerId");

-- CreateIndex
CREATE INDEX "application_reviewerId_idx" ON "application"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "application_transition_fromState_toState_action_key" ON "application_transition"("fromState", "toState", "action");

-- CreateIndex
CREATE INDEX "application_event_applicationId_occurredAt_idx" ON "application_event"("applicationId", "occurredAt");

-- CreateIndex
CREATE INDEX "application_event_actorUserId_idx" ON "application_event"("actorUserId");

-- CreateIndex
CREATE INDEX "completion_applicationId_status_idx" ON "completion"("applicationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "completion_applicationId_itemNumber_key" ON "completion"("applicationId", "itemNumber");

-- CreateIndex
CREATE INDEX "declaration_declarationKey_affirmed_idx" ON "declaration"("declarationKey", "affirmed");

-- CreateIndex
CREATE UNIQUE INDEX "declaration_applicationId_declarationKey_key" ON "declaration"("applicationId", "declarationKey");

-- CreateIndex
CREATE INDEX "power_of_attorney_number_year_idx" ON "power_of_attorney"("number", "year");

-- CreateIndex
CREATE UNIQUE INDEX "power_of_attorney_number_year_notarisationOffice_key" ON "power_of_attorney"("number", "year", "notarisationOffice");

-- CreateIndex
CREATE INDEX "brokerage_contract_brokerEntityId_validFrom_idx" ON "brokerage_contract"("brokerEntityId", "validFrom");

-- CreateIndex
CREATE INDEX "brokerage_contract_registrationId_idx" ON "brokerage_contract"("registrationId");

-- CreateIndex
CREATE INDEX "brokerage_contract_clientNameAr_idx" ON "brokerage_contract"("clientNameAr");

-- CreateIndex
CREATE INDEX "compliance_officer_tenure_brokerEntityId_role_startedOn_idx" ON "compliance_officer_tenure"("brokerEntityId", "role", "startedOn");

-- CreateIndex
CREATE INDEX "compliance_officer_tenure_partyId_idx" ON "compliance_officer_tenure"("partyId");

-- CreateIndex
CREATE INDEX "training_record_brokerEntityId_endedOn_idx" ON "training_record"("brokerEntityId", "endedOn");

-- CreateIndex
CREATE INDEX "inspection_brokerEntityId_scheduledOn_idx" ON "inspection"("brokerEntityId", "scheduledOn");

-- CreateIndex
CREATE INDEX "inspection_status_scheduledOn_idx" ON "inspection"("status", "scheduledOn");

-- CreateIndex
CREATE INDEX "finding_inspectionId_status_idx" ON "finding"("inspectionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "document_supersedesDocumentId_key" ON "document"("supersedesDocumentId");

-- CreateIndex
CREATE INDEX "document_applicationId_checklistItemKey_idx" ON "document"("applicationId", "checklistItemKey");

-- CreateIndex
CREATE INDEX "document_sha256_idx" ON "document"("sha256");

-- CreateIndex
CREATE INDEX "signal_state_severity_detectedAt_idx" ON "signal"("state", "severity", "detectedAt");

-- CreateIndex
CREATE INDEX "signal_family_state_idx" ON "signal"("family", "state");

-- CreateIndex
CREATE INDEX "signal_signalType_idx" ON "signal"("signalType");

-- CreateIndex
CREATE INDEX "rule_set_code_effectiveFrom_effectiveTo_idx" ON "rule_set"("code", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "rule_set_code_version_key" ON "rule_set"("code", "version");

-- CreateIndex
CREATE INDEX "rule_item_ruleSetId_position_idx" ON "rule_item"("ruleSetId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "rule_item_ruleSetId_key_key" ON "rule_item"("ruleSetId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "audit_event_seq_key" ON "audit_event"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "audit_event_hash_key" ON "audit_event"("hash");

-- CreateIndex
CREATE INDEX "audit_event_entityType_entityId_occurredAt_idx" ON "audit_event"("entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_event_actorUserId_occurredAt_idx" ON "audit_event"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_event_action_occurredAt_idx" ON "audit_event"("action", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_event_accessType_occurredAt_idx" ON "audit_event"("accessType", "occurredAt");

-- CreateIndex
CREATE INDEX "legal_hold_entityType_entityId_liftedAt_idx" ON "legal_hold"("entityType", "entityId", "liftedAt");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_brokerEntityId_fkey" FOREIGN KEY ("brokerEntityId") REFERENCES "broker_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership" ADD CONSTRAINT "ownership_ownerPartyId_fkey" FOREIGN KEY ("ownerPartyId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership" ADD CONSTRAINT "ownership_ownedPartyId_fkey" FOREIGN KEY ("ownedPartyId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_entity" ADD CONSTRAINT "broker_entity_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration" ADD CONSTRAINT "registration_brokerEntityId_fkey" FOREIGN KEY ("brokerEntityId") REFERENCES "broker_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration" ADD CONSTRAINT "registration_decidedUnderRuleSetId_fkey" FOREIGN KEY ("decidedUnderRuleSetId") REFERENCES "rule_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_brokerEntityId_fkey" FOREIGN KEY ("brokerEntityId") REFERENCES "broker_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_intakeClerkId_fkey" FOREIGN KEY ("intakeClerkId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_examinerId_fkey" FOREIGN KEY ("examinerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_cardIssuerId_fkey" FOREIGN KEY ("cardIssuerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_powerOfAttorneyId_fkey" FOREIGN KEY ("powerOfAttorneyId") REFERENCES "power_of_attorney"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_event" ADD CONSTRAINT "application_event_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_event" ADD CONSTRAINT "application_event_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion" ADD CONSTRAINT "completion_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion" ADD CONSTRAINT "completion_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion" ADD CONSTRAINT "completion_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion" ADD CONSTRAINT "completion_satisfiedByDocumentId_fkey" FOREIGN KEY ("satisfiedByDocumentId") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration" ADD CONSTRAINT "declaration_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration" ADD CONSTRAINT "declaration_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "rule_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_of_attorney" ADD CONSTRAINT "power_of_attorney_principalPartyId_fkey" FOREIGN KEY ("principalPartyId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_of_attorney" ADD CONSTRAINT "power_of_attorney_agentPartyId_fkey" FOREIGN KEY ("agentPartyId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brokerage_contract" ADD CONSTRAINT "brokerage_contract_brokerEntityId_fkey" FOREIGN KEY ("brokerEntityId") REFERENCES "broker_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brokerage_contract" ADD CONSTRAINT "brokerage_contract_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_officer_tenure" ADD CONSTRAINT "compliance_officer_tenure_brokerEntityId_fkey" FOREIGN KEY ("brokerEntityId") REFERENCES "broker_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_officer_tenure" ADD CONSTRAINT "compliance_officer_tenure_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_record" ADD CONSTRAINT "training_record_brokerEntityId_fkey" FOREIGN KEY ("brokerEntityId") REFERENCES "broker_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_brokerEntityId_fkey" FOREIGN KEY ("brokerEntityId") REFERENCES "broker_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_inspectorUserId_fkey" FOREIGN KEY ("inspectorUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_checklistRuleSetId_fkey" FOREIGN KEY ("checklistRuleSetId") REFERENCES "rule_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding" ADD CONSTRAINT "finding_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_supersedesDocumentId_fkey" FOREIGN KEY ("supersedesDocumentId") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal" ADD CONSTRAINT "signal_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal" ADD CONSTRAINT "signal_brokerageContractId_fkey" FOREIGN KEY ("brokerageContractId") REFERENCES "brokerage_contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal" ADD CONSTRAINT "signal_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "rule_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal" ADD CONSTRAINT "signal_disposedByUserId_fkey" FOREIGN KEY ("disposedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_set" ADD CONSTRAINT "rule_set_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_item" ADD CONSTRAINT "rule_item_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "rule_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_hold" ADD CONSTRAINT "legal_hold_placedByUserId_fkey" FOREIGN KEY ("placedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- Guardrails
--
-- Everything below is hand-written and appended to the generated migration.
-- It expresses three rules that Prisma's schema language cannot, and that this
-- product cannot be correct without.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Segregation of duties — REQ-REG-052 ─────────────────────────────────
-- The examiner and the reviewer of the same application must be different
-- natural persons. Enforced here in the database *and* again in the Server
-- Action, because 02-SYSTEM-ARCHITECTURE §4 requires both and because a
-- constraint that lives only in application code is a policy, not a control.
ALTER TABLE "application"
  ADD CONSTRAINT "application_examiner_reviewer_distinct"
  CHECK (
    "examinerId" IS NULL
    OR "reviewerId" IS NULL
    OR "examinerId" <> "reviewerId"
  );

-- Paid-up capital and contract values are never negative. The category floors
-- themselves are versioned rule data and deliberately absent from this file.
ALTER TABLE "application"
  ADD CONSTRAINT "application_capital_non_negative"
  CHECK ("paidUpCapital" IS NULL OR "paidUpCapital" >= 0);

ALTER TABLE "registration"
  ADD CONSTRAINT "registration_capital_non_negative"
  CHECK ("paidUpCapital" >= 0);

ALTER TABLE "registration"
  ADD CONSTRAINT "registration_validity_ordered"
  CHECK ("validTo" > "validFrom");

-- REQ-CDD-002 — an ownership percentage outside 0..100 cannot participate
-- meaningfully in the 25% beneficial-owner cascade.
ALTER TABLE "ownership"
  ADD CONSTRAINT "ownership_percentage_range"
  CHECK ("percentage" >= 0 AND "percentage" <= 100);

-- ── 2. Nothing is ever deleted ─────────────────────────────────────────────
-- CLAUDE.md rule 2 and 02-SYSTEM-ARCHITECTURE §7. Archive, retention lock, and
-- legal hold are the only operations that exist. A DELETE against any table
-- below raises, so the guarantee survives a future contributor who has not
-- read the documentation, an ORM call written in haste, and a stray psql
-- session alike.
--
-- "session" and "verification" are deliberately absent: they hold ephemeral
-- credentials rather than records, a revoked session must not be
-- resurrectable, and the fact of every sign-in, sign-out, and token use is
-- written to "audit_event" before the row goes.
CREATE OR REPLACE FUNCTION osool_forbid_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'Deletion is not permitted on %. This register has no destructive delete: archive the record, or place a legal hold. See docs/02-SYSTEM-ARCHITECTURE.md section 7.',
    TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
  protected text[] := ARRAY[
    'user', 'account',
    'party', 'ownership',
    'broker_entity', 'registration',
    'application', 'application_transition', 'application_event',
    'completion', 'declaration', 'power_of_attorney', 'brokerage_contract',
    'compliance_officer_tenure', 'training_record',
    'inspection', 'finding',
    'document', 'signal',
    'rule_set', 'rule_item',
    'audit_event', 'legal_hold'
  ];
BEGIN
  FOREACH t IN ARRAY protected LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION osool_forbid_delete()',
      'no_delete_' || t, t
    );
  END LOOP;
END;
$$;

-- ── 3. The audit trail is append-only ──────────────────────────────────────
-- A hash chain detects tampering after the fact. This refuses it outright.
-- Without this, an UPDATE could rewrite a row and recompute its hash; the
-- chain would still verify and the trail would be a lie.
CREATE OR REPLACE FUNCTION osool_forbid_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'Rows in % are append-only and cannot be modified after they are written.',
    TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_audit_event
  BEFORE UPDATE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION osool_forbid_update();

CREATE TRIGGER no_update_application_event
  BEFORE UPDATE ON "application_event"
  FOR EACH ROW EXECUTE FUNCTION osool_forbid_update();

-- The audit sequence must be gapless as well as unique. src/lib/audit takes a
-- transaction-scoped advisory lock on this key before reading the tail of the
-- chain, so two concurrent writers cannot both claim the same predecessor.
-- Recorded here so the number has one documented home.
COMMENT ON TABLE "audit_event" IS
  'Append-only, hash-chained. Advisory lock key 8410077 serialises writers. Never UPDATE or DELETE.';
