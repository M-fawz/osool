'use client'

import { useTranslations } from 'next-intl'
import { ActionForm } from '@/components/forms/action-form'
import { Field, Input } from '@/components/ui/form'
import { cancelAppointmentAction } from '@/app/[locale]/appointments/actions'

/**
 * Giving a place back.
 *
 * The reason is required, and the hint says why in the applicant's terms rather
 * than the register's: the Authority uses cancellations to size the counter,
 * and a one-word reason is worth more than none. It is not a penalty and the
 * copy does not imply one — nothing in Decree 578 or the AML Controls attaches
 * a consequence to cancelling, and this platform invents none.
 *
 * Deliberately not a confirmation dialogue. Cancelling here is reversible in
 * the only sense that matters — the applicant can book again immediately, from
 * the same screen — so an "are you sure?" would be friction protecting nothing.
 */
export function CancelAppointmentForm({
  appointmentId,
  applicationId,
}: {
  appointmentId: string
  applicationId: string
}) {
  const t = useTranslations('appointments')

  return (
    <ActionForm
      action={cancelAppointmentAction}
      applicationId={applicationId}
      submitLabel={t('cancelBooking')}
      showAutoSaveNote={false}
    >
      <input type="hidden" name="appointmentId" value={appointmentId} />

      <Field label={t('cancelReason')} htmlFor="cancel-reason" hint={t('cancelReasonHint')} required>
        <Input id="cancel-reason" name="reason" required maxLength={500} />
      </Field>
    </ActionForm>
  )
}
