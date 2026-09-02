-- CreateEnum
CREATE TYPE "CompletionCategory" AS ENUM ('DOCUMENT', 'APPLICATION_DATA', 'DECLARATION', 'CONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "AppointmentPurpose" AS ENUM ('DOCUMENT_HANDOVER', 'CARD_COLLECTION');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'CANCELLED', 'RESCHEDULED', 'ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SENT', 'FAILED', 'SUPPRESSED');

-- AlterTable
ALTER TABLE "completion" ADD COLUMN     "category" "CompletionCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "fieldKey" TEXT,
ADD COLUMN     "legalReference" TEXT,
ADD COLUMN     "requiredCorrectionAr" TEXT,
ADD COLUMN     "requiredCorrectionEn" TEXT;

-- CreateTable
CREATE TABLE "number_series" (
    "id" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "number_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_slot" (
    "id" TEXT NOT NULL,
    "purpose" "AppointmentPurpose" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "locationAr" TEXT NOT NULL,
    "locationEn" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "appointment_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "brokerEntityId" TEXT NOT NULL,
    "purpose" "AppointmentPurpose" NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "attendeeName" TEXT NOT NULL,
    "attendeePhone" TEXT,
    "bookedByUserId" TEXT NOT NULL,
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "cancelledByUserId" TEXT,
    "rescheduledToId" TEXT,
    "attendanceRecordedAt" TIMESTAMP(3),
    "attendanceRecordedByUserId" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_event" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" "RegistrationStatus",
    "toState" "RegistrationStatus" NOT NULL,
    "actorUserId" TEXT,
    "actorRole" "Role",
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

    CONSTRAINT "registration_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "status" "NotificationStatus" NOT NULL DEFAULT 'SENT',
    "recipientUserId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "subjectAr" TEXT NOT NULL,
    "subjectEn" TEXT NOT NULL,
    "applicationId" TEXT,
    "appointmentId" TEXT,
    "registrationId" TEXT,
    "signalId" TEXT,
    "providerMessageId" TEXT,
    "failureReason" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_bucket" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastRefusedAt" TIMESTAMP(3),
    "refusedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "number_series_series_year_key" ON "number_series"("series", "year");

-- CreateIndex
CREATE INDEX "appointment_slot_purpose_startsAt_idx" ON "appointment_slot"("purpose", "startsAt");

-- CreateIndex
CREATE INDEX "appointment_slot_startsAt_idx" ON "appointment_slot"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_rescheduledToId_key" ON "appointment"("rescheduledToId");

-- CreateIndex
CREATE INDEX "appointment_applicationId_status_idx" ON "appointment"("applicationId", "status");

-- CreateIndex
CREATE INDEX "appointment_slotId_status_idx" ON "appointment"("slotId", "status");

-- CreateIndex
CREATE INDEX "appointment_brokerEntityId_idx" ON "appointment"("brokerEntityId");

-- CreateIndex
CREATE INDEX "appointment_status_bookedAt_idx" ON "appointment"("status", "bookedAt");

-- CreateIndex
CREATE INDEX "registration_event_registrationId_occurredAt_idx" ON "registration_event"("registrationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_dedupeKey_key" ON "notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_eventKey_sentAt_idx" ON "notification"("eventKey", "sentAt");

-- CreateIndex
CREATE INDEX "notification_recipientUserId_sentAt_idx" ON "notification"("recipientUserId", "sentAt");

-- CreateIndex
CREATE INDEX "notification_applicationId_sentAt_idx" ON "notification"("applicationId", "sentAt");

-- CreateIndex
CREATE INDEX "notification_status_sentAt_idx" ON "notification"("status", "sentAt");

-- CreateIndex
CREATE INDEX "rate_limit_bucket_windowStartedAt_idx" ON "rate_limit_bucket"("windowStartedAt");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_bucket_scope_identifier_key" ON "rate_limit_bucket"("scope", "identifier");

-- AddForeignKey
ALTER TABLE "appointment_slot" ADD CONSTRAINT "appointment_slot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "appointment_slot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_brokerEntityId_fkey" FOREIGN KEY ("brokerEntityId") REFERENCES "broker_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_bookedByUserId_fkey" FOREIGN KEY ("bookedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_rescheduledToId_fkey" FOREIGN KEY ("rescheduledToId") REFERENCES "appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_attendanceRecordedByUserId_fkey" FOREIGN KEY ("attendanceRecordedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_event" ADD CONSTRAINT "registration_event_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_event" ADD CONSTRAINT "registration_event_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "signal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- Everything below is hand-written. Prisma generated the tables above; these
-- are the guarantees the schema language cannot express, and they are the ones
-- that matter.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. A slot cannot be over-booked ────────────────────────────────────────
--
-- The booking code locks the slot row and checks the count before it writes.
-- This is the same rule stated where it cannot be forgotten: if the booking
-- code is ever wrong, or someone updates the table by hand, the database
-- refuses. Two brokers cannot hold the same place.
ALTER TABLE "appointment_slot"
  ADD CONSTRAINT "appointment_slot_capacity_positive" CHECK ("capacity" > 0);

ALTER TABLE "appointment_slot"
  ADD CONSTRAINT "appointment_slot_not_overbooked"
  CHECK ("bookedCount" >= 0 AND "bookedCount" <= "capacity");

ALTER TABLE "appointment_slot"
  ADD CONSTRAINT "appointment_slot_ends_after_start" CHECK ("endsAt" > "startsAt");

-- ── 2. One live booking per application per purpose ────────────────────────
--
-- A partial index, because the cancelled and rescheduled rows must stay — the
-- history of who was booked when is the point — and only the live ones are
-- constrained. BOOKED is the only live state: ATTENDED and NO_SHOW are settled
-- facts about a visit that has already happened, and re-booking after either is
-- legitimate.
CREATE UNIQUE INDEX "appointment_one_live_per_application_purpose"
  ON "appointment" ("applicationId", "purpose")
  WHERE "status" = 'BOOKED';

-- ── 3. Seed the number series from the numbers already issued ──────────────
--
-- The counters replace MAX(SUBSTRING(...)) over the numbered tables. Existing
-- registers already carry numbers, so the counters have to start from where
-- those left off or the next allocation collides with a number in use.
--
-- The parse is deliberately strict: only `PREFIX-YYYY/NNNN` shapes count, and
-- anything else is ignored rather than guessed at. `regexp_replace` strips the
-- prefix; `::int` is what makes 10000 sort after 9999, which was the whole
-- defect being fixed.
INSERT INTO "number_series" ("id", "series", "year", "lastValue", "createdAt", "updatedAt")
SELECT
  'seed-temporary-' || y::text,
  'TEMPORARY',
  y,
  m,
  NOW(),
  NOW()
FROM (
  SELECT
    substring("temporaryNumber" from 'T-([0-9]{4})/')::int AS y,
    MAX(substring("temporaryNumber" from 'T-[0-9]{4}/([0-9]+)$')::int) AS m
  FROM "application"
  WHERE "temporaryNumber" ~ '^T-[0-9]{4}/[0-9]+$'
  GROUP BY 1
) s
ON CONFLICT ("series", "year") DO NOTHING;

INSERT INTO "number_series" ("id", "series", "year", "lastValue", "createdAt", "updatedAt")
SELECT 'seed-registration-' || y::text, 'REGISTRATION', y, m, NOW(), NOW()
FROM (
  SELECT
    substring("registrationNumber" from '^([0-9]{4})/')::int AS y,
    MAX(substring("registrationNumber" from '^[0-9]{4}/([0-9]+)$')::int) AS m
  FROM "registration"
  WHERE "registrationNumber" ~ '^[0-9]{4}/[0-9]+$'
  GROUP BY 1
) s
ON CONFLICT ("series", "year") DO NOTHING;

INSERT INTO "number_series" ("id", "series", "year", "lastValue", "createdAt", "updatedAt")
SELECT 'seed-delivery-' || y::text, 'DELIVERY', y, m, NOW(), NOW()
FROM (
  SELECT
    substring("deliverySerial" from 'D-([0-9]{4})/')::int AS y,
    MAX(substring("deliverySerial" from 'D-[0-9]{4}/([0-9]+)$')::int) AS m
  FROM "card_issuance"
  WHERE "deliverySerial" ~ '^D-[0-9]{4}/[0-9]+$'
  GROUP BY 1
) s
ON CONFLICT ("series", "year") DO NOTHING;

-- ── 4. The new tables of record join the no-delete guarantee ───────────────
--
-- CLAUDE.md rule 2 and 02-SYSTEM-ARCHITECTURE §7. A table added later that
-- quietly sits outside the guard is how "nothing is ever deleted" stops being
-- true, so every new table of record is enrolled in the same statement-level
-- triggers as the originals.
--
-- `rate_limit_bucket` is deliberately not in this list, and its schema comment
-- says why: it holds transient counters, not records. It is updated in place
-- and never grows a row it would need to lose.
DO $$
DECLARE
  t text;
  protected text[] := ARRAY[
    'number_series',
    'appointment_slot', 'appointment',
    'registration_event',
    'notification'
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

-- ── 5. Registration events are append-only, like application events ────────
DROP TRIGGER IF EXISTS "no_update_registration_event" ON "registration_event";
CREATE TRIGGER "no_update_registration_event"
  BEFORE UPDATE ON "registration_event"
  FOR EACH STATEMENT EXECUTE FUNCTION osool_forbid_update();
