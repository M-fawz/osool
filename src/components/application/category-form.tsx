'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import type { BrokerCategory, BrokerType } from '@prisma/client'
import { saveCategoryAction } from '@/app/[locale]/application/actions'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/notice'
import { ChoiceGroup, ChoiceOption } from './choice'
import { ActionForm } from '@/components/forms/action-form'
import { WhyWeAsk } from './why-we-ask'

/**
 * Step 4 — types, category, and capital. REQ-REG-010, REQ-REG-020, REQ-REG-021.
 *
 * The one screen where a regulatory threshold is visible while the applicant is
 * still deciding, and the design consequence is specific: the bands are read
 * from the BROKER_CATEGORY rule set on the server and passed in as data. There
 * is no number in this file, and there must never be one — a decree amending
 * the floors has to change what this screen says without anyone editing it.
 *
 * The capital field comes *before* the category list, because the capital is
 * the fact and the category is the consequence. Asking for the category first
 * and then refusing it is how the paper process wastes a journey to a GOEIC
 * branch; here the list simply re-labels itself as the figure is typed.
 *
 * Nothing is disabled. An applicant may still choose a category their capital
 * does not support, save it, and come back — because the capital figure is
 * often the thing that turns out to be wrong, and a form that will not let you
 * record your intention while you go and check is a form you abandon. The
 * refusal under REQ-REG-021 lands at submission, in full, with the decree named.
 */

export interface CategoryBand {
  key: BrokerCategory
  label: string
  minimumPaidUpCapital: number
  contractValueCeiling: number | null
  /** Preformatted by the server, so Latin grouping is identical in both locales. */
  minimumFormatted: string
  ceilingFormatted: string | null
}

export interface TypeOption {
  key: BrokerType
  label: string
  /** Null where the rule set carries no definition in the reader's language. */
  definition: string | null
}

export function CategoryForm({
  applicationId,
  bands,
  types,
  defaults,
  legalSource,
}: {
  applicationId: string
  bands: CategoryBand[]
  types: TypeOption[]
  defaults: {
    requestedTypes: BrokerType[]
    requestedCategory: BrokerCategory | null
    paidUpCapital: number | null
  }
  legalSource: string
}) {
  const t = useTranslations('apply')
  const [capital, setCapital] = React.useState<number | null>(defaults.paidUpCapital)
  const [category, setCategory] = React.useState<BrokerCategory | null>(defaults.requestedCategory)

  const chosen = bands.find((b) => b.key === category)
  const shortfall =
    chosen && capital !== null && capital < chosen.minimumPaidUpCapital
      ? chosen.minimumPaidUpCapital - capital
      : null

  return (
    <ActionForm
      action={saveCategoryAction}
      applicationId={applicationId}
      submitLabel={t('saveAndContinue')}
      onSavedGoTo="/application"
    >
      <div className="space-y-2">
        <ChoiceGroup
          legend={t('typesHeading')}
          description={t('typesLead')}
          errorFor="requestedTypes"
        >
          {types.map((type) => (
            <ChoiceOption
              key={type.key}
              type="checkbox"
              name="requestedTypes"
              value={type.key}
              label={type.label}
              help={type.definition ?? undefined}
              defaultChecked={defaults.requestedTypes.includes(type.key)}
            />
          ))}
        </ChoiceGroup>
        <WhyWeAsk label={t('whyWeAsk')}>{t('whyTypes')}</WhyWeAsk>
      </div>

      <section className="space-y-4 border-t border-rule pt-6">
        <h2 className="text-md font-semibold text-navy-700">{t('capitalHeading')}</h2>
        <Field
          label={t('paidUpCapital')}
          htmlFor="paidUpCapital"
          required
          errorFor="paidUpCapital"
        >
          <Input
            name="paidUpCapital"
            inputMode="numeric"
            defaultValue={defaults.paidUpCapital ?? ''}
            dir="ltr"
            className="tabular"
            onChange={(event) => {
              const raw = event.currentTarget.value.replace(/[,\s]/g, '')
              const value = raw === '' ? null : Number(raw)
              setCapital(Number.isFinite(value as number) ? (value as number) : null)
            }}
          />
        </Field>
      </section>

      <section className="space-y-2 border-t border-rule pt-6">
        <ChoiceGroup
          legend={t('categoryHeading')}
          description={capital === null ? t('categoryEnterCapitalFirst') : undefined}
          errorFor="requestedCategory"
        >
          {bands.map((band) => {
            const affordable = capital !== null && capital >= band.minimumPaidUpCapital
            return (
              <ChoiceOption
                key={band.key}
                name="requestedCategory"
                value={band.key}
                label={band.label}
                help={
                  band.ceilingFormatted
                    ? t('categoryCeiling', { amount: band.ceilingFormatted })
                    : t('categoryNoCeiling')
                }
                meta={
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{t('categoryCapitalFloor', { amount: band.minimumFormatted })}</span>
                    {capital !== null && !affordable ? (
                      // Not colour alone: the words say it too. A colour-blind
                      // applicant reads the same fact — 03-DESIGN-DIRECTION §7.
                      <span className="font-medium text-blocking">
                        · {t('categoryUnavailable')}
                      </span>
                    ) : null}
                  </span>
                }
                defaultChecked={defaults.requestedCategory === band.key}
                onChange={(isChecked) => {
                  if (isChecked) setCategory(band.key)
                }}
                checked={category === band.key}
              />
            )
          })}
        </ChoiceGroup>

        <WhyWeAsk label={t('whyWeAsk')}>{t('whyCategory')}</WhyWeAsk>
      </section>

      {shortfall !== null && chosen ? (
        <Notice tone="caution" live>
          <CapitalShortfall
            categoryLabel={chosen.label}
            minimumFormatted={chosen.minimumFormatted}
            legalSource={legalSource}
            alternative={bands
              .filter((b) => capital !== null && capital >= b.minimumPaidUpCapital)
              .sort((a, b) => b.minimumPaidUpCapital - a.minimumPaidUpCapital)[0]}
          />
        </Notice>
      ) : null}
    </ActionForm>
  )
}

/**
 * The warning shown while the applicant is still choosing.
 *
 * Deliberately a `Notice`, not a `BlockedAction`: nothing is blocked yet. The
 * full four-part refusal, with the decree cited and the shortfall computed by
 * the rules engine, is what they meet at submission — and showing it here, on a
 * value they may be halfway through typing, would cry wolf.
 *
 * Both sentences come from the message catalogue with the figures interpolated,
 * so the Arabic lives where the rest of the Arabic lives and stays reviewable
 * as copy rather than as code.
 */
function CapitalShortfall({
  categoryLabel,
  minimumFormatted,
  legalSource,
  alternative,
}: {
  categoryLabel: string
  minimumFormatted: string
  legalSource: string
  alternative: CategoryBand | undefined
}) {
  const t = useTranslations('apply')

  return (
    <span className="block space-y-1">
      <span className="block">
        {t('capitalBelowChosen', { category: categoryLabel, minimum: minimumFormatted })}
      </span>
      {alternative ? (
        <span className="block">
          {t('highestCategoryAvailable', {
            category: alternative.label,
            band: alternative.ceilingFormatted
              ? t('categoryCeiling', { amount: alternative.ceilingFormatted })
              : t('categoryNoCeiling'),
          })}
        </span>
      ) : null}
      <span className="block text-xs text-ink-faint">
        <bdi>{legalSource}</bdi>
      </span>
    </span>
  )
}
