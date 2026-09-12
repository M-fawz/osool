'use client'

import * as React from 'react'
import { Link } from '@/i18n/navigation'
import { ActionFormContext } from '@/components/forms/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input, PasswordInput, Select } from '@/components/ui/form'
import { Notice } from '@/components/ui/notice'
import { signUpBroker, type SignUpOutcome } from './actions'

/**
 * The sign-up form.
 *
 * `ActionForm` is not reused here: it is built around a wizard step and takes
 * an `applicationId`, a "save and exit" destination and an auto-save notice,
 * none of which mean anything on a public form with no session and no
 * application. What is reused is the part that matters — the field-error
 * context, published from *inside* this component so that `Field`'s `errorFor`
 * resolves correctly. See form-state.tsx: a hook called above the provider
 * silently reads an empty map, which is how this product previously lost every
 * validation message in the interface.
 *
 * The success state replaces the form rather than sitting above it. A filled-in
 * sign-up form left on screen after it has succeeded invites a second
 * submission, which would be refused as a duplicate address and read as a
 * failure.
 */
export function SignUpForm({
  labels,
  governorates,
}: {
  labels: Record<string, string>
  governorates: Array<{ value: string; label: string }>
}) {
  const [state, formAction, pending] = React.useActionState<SignUpOutcome | null, FormData>(
    signUpBroker,
    null,
  )

  const errors = state && !state.ok && state.kind === 'validation' ? state.errors : {}

  if (state?.ok) {
    return (
      <div className="space-y-4">
        {/* The address is rendered as its own element rather than interpolated
            into the sentence. next-intl parses messages as ICU, so a `{email}`
            placeholder in the catalogue is an *argument* — passing it through
            `String.replace` after the fact never reaches it, and the applicant
            is left reading "sent to" with nothing after it. It also has to be
            `ltr`: an address inside an Arabic sentence otherwise reorders
            around the `@`. */}
        <Notice tone="confirmed" title={labels.sentTitle!} live>
          <p>{labels.sentLead!}</p>
          <p className="ltr-run mt-2 font-medium">{state.email}</p>
        </Notice>

        {/* Only ever present off production — see `demonstrationLink` in
            src/lib/auth/self-registration.ts. The link is a bearer token for
            the account, so production shows it to nobody, whatever the mail
            driver is set to. */}
        {state.verificationLink ? (
          <Notice tone="informational" title={labels.devLinkTitle!}>
            <p className="mb-2">{labels.devLinkLead!}</p>
            <a
              href={state.verificationLink}
              className="ltr-run block break-all text-xs text-navy-600 underline underline-offset-2"
            >
              {state.verificationLink}
            </a>
          </Notice>
        ) : null}

        <Button asChild size="touch" className="w-full">
          <Link href="/login">{labels.backToSignIn!}</Link>
        </Button>
      </div>
    )
  }

  return (
    <ActionFormContext.Provider value={{ errors, pending, inForm: true }}>
      <form action={formAction} className="space-y-5" noValidate>
        {state && !state.ok && state.kind === 'refused' ? (
          <Notice tone="blocking" title={labels.refusedTitle!} live>
            <p>{labels.refusedLead!}</p>
            {state.code === 'EMAIL_ALREADY_REGISTERED' ? (
              <p className="mt-2">
                <Link href="/login" className="underline underline-offset-2">
                  {labels.backToSignIn!}
                </Link>
                {' · '}
                <Link href="/forgot-password" className="underline underline-offset-2">
                  {labels.forgot!}
                </Link>
              </p>
            ) : null}
          </Notice>
        ) : null}

        <fieldset className="space-y-5">
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
            {labels.firmLegend!}
          </legend>

          <Field label={labels.tradeNameAr!} htmlFor="tradeNameAr" errorFor="tradeNameAr" required>
            <Input id="tradeNameAr" name="tradeNameAr" dir="rtl" required autoComplete="organization" />
          </Field>

          <Field label={labels.tradeNameEn!} htmlFor="tradeNameEn" errorFor="tradeNameEn">
            <Input id="tradeNameEn" name="tradeNameEn" dir="ltr" />
          </Field>

          <Field label={labels.governorate!} htmlFor="governorate" errorFor="governorate" required>
            <Select id="governorate" name="governorate" required defaultValue="">
              <option value="" disabled>
                {labels.governoratePlaceholder!}
              </option>
              {governorates.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={labels.headOfficeAddress!}
            htmlFor="headOfficeAddress"
            errorFor="headOfficeAddress"
            required
          >
            <Input id="headOfficeAddress" name="headOfficeAddress" required autoComplete="street-address" />
          </Field>
        </fieldset>

        <fieldset className="space-y-5 border-t border-rule pt-5">
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
            {labels.ownerLegend!}
          </legend>

          <Field label={labels.ownerNameAr!} htmlFor="ownerNameAr" errorFor="ownerNameAr" required>
            <Input id="ownerNameAr" name="ownerNameAr" dir="rtl" required autoComplete="name" />
          </Field>

          <Field label={labels.ownerNameEn!} htmlFor="ownerNameEn" errorFor="ownerNameEn" required>
            <Input id="ownerNameEn" name="ownerNameEn" dir="ltr" required />
          </Field>

          <Field label={labels.email!} htmlFor="email" errorFor="email" required hint={labels.emailHint!}>
            <Input
              id="email"
              name="email"
              type="email"
              dir="ltr"
              inputMode="email"
              autoComplete="email"
              required
            />
          </Field>

          <Field
            label={labels.password!}
            htmlFor="password"
            errorFor="password"
            required
            hint={labels.passwordHint!}
          >
            <PasswordInput
              id="password"
              name="password"
              dir="ltr"
              autoComplete="new-password"
              minLength={12}
              required
              showLabel={labels.showPassword!}
              hideLabel={labels.hidePassword!}
            />
          </Field>
        </fieldset>

        <Button type="submit" size="touch" className="w-full" disabled={pending}>
          {pending ? labels.submitting! : labels.submit!}
        </Button>

        <p className="text-center text-xs text-ink-faint">
          {labels.haveAccount!}{' '}
          <Link href="/login" className="underline underline-offset-2 hover:text-ink">
            {labels.backToSignIn!}
          </Link>
        </p>
      </form>
    </ActionFormContext.Provider>
  )
}
