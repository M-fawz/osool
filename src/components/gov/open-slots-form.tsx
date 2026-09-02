'use client'

import { useTranslations } from 'next-intl'
import { ActionForm } from '@/components/forms/action-form'
import { Field, Input, Select } from '@/components/ui/form'
import { Panel } from '@/components/ui/panel'
import { openSlotsAction } from '@/app/[locale]/appointments/actions'

/**
 * Publishing a day's periods.
 *
 * The clerk describes the day — hours, length, capacity — and the server
 * expands it. Twelve rows entered by hand is how a diary stops being kept: the
 * first week is filled in carefully, the fourth is not filled in at all, and
 * applicants see an empty calendar.
 *
 * The operation is idempotent on `(purpose, start, location)`, so running it
 * twice for the same morning does not silently double the counter's capacity —
 * a mistake that would stay invisible until twice as many people arrived as
 * there were chairs.
 */
export function OpenSlotsForm() {
  const t = useTranslations('appointments')
  const today = new Date().toISOString().slice(0, 10)

  return (
    <Panel title={t('openSlotsTitle')} description={t('openSlotsLead')}>
      <ActionForm
        action={openSlotsAction}
        applicationId=""
        submitLabel={t('openSlotsSubmit')}
        showAutoSaveNote={false}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('fieldPurpose')} htmlFor="slot-purpose" required>
            <Select id="slot-purpose" name="purpose" defaultValue="DOCUMENT_HANDOVER">
              <option value="DOCUMENT_HANDOVER">{t('purposeHandover')}</option>
              <option value="CARD_COLLECTION">{t('purposeCollection')}</option>
            </Select>
          </Field>

          <Field label={t('fieldDate')} htmlFor="slot-date" required>
            <Input id="slot-date" name="date" type="date" defaultValue={today} required dir="ltr" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('fieldLocationAr')} htmlFor="slot-location-ar" required>
            <Input id="slot-location-ar" name="locationAr" required lang="ar" dir="rtl" />
          </Field>

          <Field label={t('fieldLocationEn')} htmlFor="slot-location-en">
            <Input id="slot-location-en" name="locationEn" lang="en" dir="ltr" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('fieldStartHour')} htmlFor="slot-start" hint={t('hoursNote')} required>
            <Input
              id="slot-start"
              name="startHour"
              type="number"
              min={0}
              max={23}
              defaultValue={9}
              required
              dir="ltr"
              inputMode="numeric"
            />
          </Field>

          <Field label={t('fieldEndHour')} htmlFor="slot-end" required>
            <Input
              id="slot-end"
              name="endHour"
              type="number"
              min={1}
              max={24}
              defaultValue={14}
              required
              dir="ltr"
              inputMode="numeric"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('fieldMinutes')} htmlFor="slot-minutes" required>
            <Input
              id="slot-minutes"
              name="minutesPerSlot"
              type="number"
              min={10}
              max={240}
              step={5}
              defaultValue={30}
              required
              dir="ltr"
              inputMode="numeric"
            />
          </Field>

          <Field label={t('fieldCapacity')} htmlFor="slot-capacity" required>
            <Input
              id="slot-capacity"
              name="capacity"
              type="number"
              min={1}
              max={50}
              defaultValue={3}
              required
              dir="ltr"
              inputMode="numeric"
            />
          </Field>
        </div>
      </ActionForm>
    </Panel>
  )
}
