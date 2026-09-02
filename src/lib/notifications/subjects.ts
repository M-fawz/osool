import { db } from '@/lib/db'
import type {
  ApplicationSubject,
  AppointmentSubject,
  RegistrationSubject,
} from './catalogue'

/**
 * Loading the facts a notification needs, from an id.
 *
 * Kept apart from the catalogue so that the message bodies stay pure functions
 * of their input — a template that queried the database would be untestable
 * without one, and the email test matrix depends on being able to render every
 * message from fixed facts.
 *
 * Each loader returns `undefined` rather than throwing when the subject has
 * gone. A notification is never important enough to fail a workflow step over,
 * and that principle has to hold here too.
 */

export async function applicationSubject(
  applicationId: string,
): Promise<ApplicationSubject | undefined> {
  const application = await db.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      temporaryNumber: true,
      brokerEntityId: true,
      examinerId: true,
      entityData: { select: { tradeNameAr: true, tradeNameEn: true } },
      brokerEntity: { select: { tradeNameAr: true, tradeNameEn: true } },
    },
  })

  if (!application) return undefined

  return {
    id: application.id,
    temporaryNumber: application.temporaryNumber,
    brokerEntityId: application.brokerEntityId,
    examinerId: application.examinerId,
    // The declared name leads — it is what the applicant recognises as theirs —
    // and the firm's registered name is the fallback for a file whose entity
    // step has not been filled in yet, which is a real state at intake.
    tradeNameAr: application.entityData?.tradeNameAr ?? application.brokerEntity.tradeNameAr,
    tradeNameEn: application.entityData?.tradeNameEn ?? application.brokerEntity.tradeNameEn,
  }
}

export async function registrationSubject(
  registrationId: string,
): Promise<RegistrationSubject | undefined> {
  const registration = await db.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      registrationNumber: true,
      brokerEntityId: true,
      validFrom: true,
      validTo: true,
    },
  })
  return registration ?? undefined
}

export async function appointmentSubject(
  appointmentId: string,
): Promise<AppointmentSubject | undefined> {
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      applicationId: true,
      brokerEntityId: true,
      purpose: true,
      attendeeName: true,
      slot: {
        select: { startsAt: true, endsAt: true, locationAr: true, locationEn: true },
      },
    },
  })

  if (!appointment) return undefined

  return {
    id: appointment.id,
    applicationId: appointment.applicationId,
    brokerEntityId: appointment.brokerEntityId,
    purpose: appointment.purpose,
    startsAt: appointment.slot.startsAt,
    endsAt: appointment.slot.endsAt,
    locationAr: appointment.slot.locationAr,
    locationEn: appointment.slot.locationEn,
    attendeeName: appointment.attendeeName,
  }
}
