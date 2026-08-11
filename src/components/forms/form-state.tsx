'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'

/**
 * The state a Server Action hands back to the form that ran it.
 *
 * This lives in its own module, apart from `ActionForm`, for one reason that
 * cost this product every validation message in the interface:
 *
 *   React context is *positional*. A component that renders `<ActionForm>` sits
 *   **above** the provider `ActionForm` puts inside itself, so a hook called in
 *   that component's own body reads the default value — an empty error map —
 *   for ever, silently, with no warning from React or TypeScript.
 *
 * Eight of the nine forms in this product did exactly that. `ContractForm`
 * called `useFieldError('clientNameAr')` in its body and returned `<ActionForm>`
 * underneath. Every field error resolved to `undefined`, so a refused save drew
 * nothing at all: the applicant filled eleven fields, pressed Save, watched the
 * form empty itself, and was told nothing. Reproduced on production — the action
 * answered 200 in 253 ms with a validation failure and the page rendered zero
 * elements with `role="alert"`.
 *
 * The fix is not "remember to call the hook lower down". It is to stop asking
 * call sites to know where the provider is: `Field` and `ChoiceGroup` take an
 * `errorFor` field *name* and resolve it themselves, from inside the provider,
 * where the answer is always correct. `useFieldError` remains exported for the
 * few places that legitimately need it — every one of them below an
 * `<ActionForm>` — and now warns in development when it is used above one.
 */

export interface ActionFormState {
  errors: Record<string, string>
  pending: boolean
  /** False in the default context — the signal that no provider is above us. */
  inForm: boolean
}

export const ActionFormContext = React.createContext<ActionFormState>({
  errors: {},
  pending: false,
  inForm: false,
})

/**
 * Resolve a validation *key* into a sentence.
 *
 * The Zod schemas emit keys rather than prose so the Arabic lives in the
 * message catalogue with the rest of the Arabic. The `has` check is what makes
 * the runtime-only key safe — a key the catalogue does not carry falls back to
 * the generic sentence rather than printing `needsArabic` at the applicant.
 */
export function useErrorText(): (key: string | undefined) => string | undefined {
  const t = useTranslations('errors')
  return React.useCallback(
    (key) => {
      if (!key) return undefined
      const translate = t as unknown as (k: string) => string
      return t.has(key) ? translate(key) : translate('required')
    },
    [t],
  )
}

/**
 * The translated message for one field, or undefined.
 *
 * Only correct **below** an `<ActionForm>`. Prefer `errorFor` on `Field` and
 * `ChoiceGroup`, which cannot be got wrong.
 */
export function useFieldError(name: string | undefined): string | undefined {
  const state = React.useContext(ActionFormContext)
  const errorText = useErrorText()

  if (process.env.NODE_ENV !== 'production' && name && !state.inForm) {
    console.warn(
      `[osool] useFieldError(${JSON.stringify(name)}) was called outside an <ActionForm>. ` +
        'Field errors will never appear. Pass `errorFor` to <Field>/<ChoiceGroup> instead.',
    )
  }

  return errorText(name ? state.errors[name] : undefined)
}

export function useActionPending(): boolean {
  return React.useContext(ActionFormContext).pending
}
