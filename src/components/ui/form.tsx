'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'
import { Icon, AlertTriangle, Eye, EyeOff } from './icon'
import { useHydrated } from '@/lib/hooks/use-hydrated'
import { useFieldError } from '@/components/forms/form-state'

/**
 * Form controls.
 *
 * The important thing here is not visual. The previous `Field` computed a
 * `hint` id and an `error` id, rendered them on the paragraphs, and then never
 * connected either one to the input — so a screen reader announced the label
 * and nothing else, and the reason a submission had been refused was visible
 * only to people who could see it. In a system whose entire design direction
 * insists that a refusal must always say why (§6), that was the worst place in
 * the product to lose the explanation.
 *
 * `Field` now clones its control and wires `aria-describedby`, `aria-invalid`
 * and `aria-required` onto it, so a call site cannot forget. Everything else
 * in this file exists to be that control.
 */

const controlBase = [
  'w-full rounded-xs border bg-paper text-ink',
  'border-rule-strong',
  'placeholder:text-ink-faint',
  'focus-visible:border-navy-600 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-navy-600',
  'disabled:cursor-not-allowed disabled:bg-paper-sunk disabled:text-ink-faint',
  // The invalid ring is a border weight change as well as a colour change,
  // because colour alone is not allowed to carry meaning here (§7).
  'aria-[invalid=true]:border-blocking aria-[invalid=true]:border-2',
].join(' ')

/** 44px, matching the touch minimum, because one control set serves both products. */
const controlSize = 'min-h-11 px-3 py-2 text-base'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(controlBase, controlSize, className)} {...props} />
  },
)

/**
 * A password field with a reveal control.
 *
 * ── Why a register wants this ────────────────────────────────────────────
 *
 * A masked field is the right default: this screen is used at a counter, in an
 * office, with other people behind the person typing. But a password that can
 * only ever be typed blind is also the single most common reason a correct
 * credential is reported as a rejected one — and on this product the refusal
 * copy deliberately declines to say *which* of the two fields was wrong
 * (see the sign-in form), so there is nothing else to go on. The reveal is how
 * somebody checks their own typing before blaming the system.
 *
 * ── The details that are easy to get wrong ───────────────────────────────
 *
 * `type="button"`. A `<button>` inside a form defaults to `type="submit"`, so
 * without this, revealing the password submits the form.
 *
 * The label is a prop, not a string in here. Everything in this product is
 * Arabic first, and an English `aria-label` on an Arabic screen is the kind of
 * omission only a screen-reader user meets.
 *
 * The space for the control is reserved unconditionally and matches its width,
 * so the text never runs under the icon and nothing moves when the control
 * appears. 44px is the touch minimum from 03-DESIGN-DIRECTION, which this has
 * to meet in both axes because officials use this on a phone.
 *
 * That reservation is written on the wrapper rather than as `pe-11` on the
 * input, and the reason is a bug this had on its first run. A password field
 * carries `dir="ltr"`, because a password beginning with `!` renders with the
 * symbol at the wrong end inside Arabic text — it is a Latin island, in the
 * sense of the `Ltr` component. But a logical property always resolves against
 * the element's *own* direction, so on an Arabic screen `pe-11` padded the
 * right of the field while the button sat at the page's end, on the left. The
 * two were on opposite sides and a revealed password ran straight under the
 * icon. The variant is evaluated on the wrapper, which has the page's
 * direction, and what it sets on the input is physical — so the padding and
 * the control cannot disagree about which side they are on.
 *
 * The button renders only once hydrated. Before that its handler does not
 * exist, and a control that is drawn but inert is worse than one that is not
 * drawn yet — the space it will occupy is already reserved, so its arrival
 * shifts nothing. This is the same reasoning as the submit gate in
 * src/lib/hooks/use-hydrated.ts, for the same window.
 *
 * Revealing is not persisted anywhere. It resets on every render of the
 * screen, because "show my password" is a decision about this moment and this
 * room, and a remembered one would eventually be wrong.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    /** Accessible name for the control while the password is hidden. */
    showLabel: string
    /** Accessible name for the control while the password is shown. */
    hideLabel: string
  }
>(function PasswordInput({ className, showLabel, hideLabel, ...props }, ref) {
  const hydrated = useHydrated()
  const [shown, setShown] = React.useState(false)

  return (
    <div className="relative ltr:[&>input]:pr-11 rtl:[&>input]:pl-11">
      <input
        ref={ref}
        {...props}
        type={shown ? 'text' : 'password'}
        className={cn(controlBase, controlSize, className)}
      />
      {hydrated ? (
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          // The pressed state is what tells a screen reader whether the
          // password is currently visible; the label alone would only say what
          // the next click does.
          aria-pressed={shown}
          aria-label={shown ? hideLabel : showLabel}
          aria-controls={props.id}
          // Never a tab stop between the password and the submit button by
          // accident — it is reachable, but after the field it belongs to.
          className={cn(
            'absolute inset-y-0 end-0 flex w-11 items-center justify-center',
            'text-ink-muted transition-colors hover:text-ink',
            'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-navy-600',
          )}
        >
          <Icon as={shown ? EyeOff : Eye} size="sm" />
        </button>
      ) : null}
    </div>
  )
})

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(controlBase, 'px-3 py-2 text-base leading-relaxed', className)}
      {...props}
    />
  )
})

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        controlBase,
        controlSize,
        // The native arrow sits on the wrong side in RTL on some engines, so
        // it is replaced with one drawn into the background and positioned
        // logically. `appearance-none` on a select still keeps the native
        // dropdown behaviour, which is what a keyboard user expects.
        'appearance-none bg-[length:1rem] bg-no-repeat pe-9',
        'ltr:bg-[position:right_0.75rem_center] rtl:bg-[position:left_0.75rem_center]',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234a5261' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {children}
    </select>
  )
})

/**
 * A labelled control.
 *
 * Pass exactly one form control as the child. It is cloned so that the
 * description wiring cannot be forgotten at the call site.
 *
 * `errorFor` is the name of the field in the Server Action's error map. Prefer
 * it to passing `error` from a `useFieldError` call at the call site: this
 * component renders *inside* `<ActionForm>`, so the lookup here always finds
 * the provider, and a call site above the provider silently never can. See
 * src/components/forms/form-state.tsx — that mistake cost this product every
 * validation message on eight of its nine forms.
 */
export function Field({
  label,
  hint,
  error,
  errorFor,
  required,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: string
  /** An already-resolved message. `errorFor` is the safer way in. */
  error?: string
  /** The field name to look up in the enclosing form's error map. */
  errorFor?: string
  required?: boolean
  htmlFor: string
  children: React.ReactElement
  className?: string
}) {
  const fromForm = useFieldError(errorFor)
  const message = error ?? fromForm

  const hintId = hint ? `${htmlFor}-hint` : undefined
  const errorId = message ? `${htmlFor}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: htmlFor,
        'aria-describedby': describedBy,
        'aria-invalid': message ? true : undefined,
        'aria-required': required || undefined,
      })
    : children

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {required ? (
          // `aria-hidden` on the asterisk, `aria-required` on the control:
          // the star is a visual convention, not the announcement.
          <span className="ms-1 text-blocking" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {control}

      {/* The hint stays visible alongside an error. Hiding the format rule at
          the moment the format is wrong is precisely backwards. */}
      {hint ? (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}

      {message ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-xs text-blocking"
        >
          <Icon as={AlertTriangle} size="xs" className="mt-px" />
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  )
}

/**
 * A group of related controls.
 *
 * A `fieldset` rather than a `div` with a heading, so that the group's name is
 * announced with each control inside it — which matters on the declaration
 * screens, where fifteen checkboxes share one legal preamble.
 */
export function FieldGroup({
  legend,
  description,
  children,
  className,
}: {
  legend: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <fieldset className={cn('min-w-0 border-0 p-0', className)}>
      <legend className="mb-1 text-sm font-semibold text-navy-700">{legend}</legend>
      {description ? <p className="mb-3 text-xs text-ink-muted">{description}</p> : null}
      <div className="space-y-4">{children}</div>
    </fieldset>
  )
}
