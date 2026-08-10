'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'
import { Icon, AlertTriangle } from './icon'

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
 */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  htmlFor: string
  children: React.ReactElement
  className?: string
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined
  const errorId = error ? `${htmlFor}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: htmlFor,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
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

      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-xs text-blocking">
          <Icon as={AlertTriangle} size="xs" className="mt-px" />
          <span>{error}</span>
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
