'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  changeAccountRoleAction,
  reactivateAccountAction,
  reissueActivationLinkAction,
  suspendAccountAction,
  type ActionResult,
} from './actions'
import { BlockedAction, Button, Field, Input, Notice, Select } from '@/components/ui/primitives'

/**
 * What an administrator can do to one account.
 *
 * Every control here demands a written reason before it will submit, and the
 * reason is what ends up in the audit trail — 02-SYSTEM-ARCHITECTURE §7. A
 * suspension with no stated cause is indistinguishable, six months later, from
 * a mistake, and the employee it happened to has no way to contest it.
 *
 * The panel is collapsed by default. An accounts screen where every row is
 * showing three forms is a screen nobody can scan, and the common case by a
 * wide margin is reading the list, not changing it.
 *
 * Nothing here decides anything. Each button calls a Server Action which
 * re-checks the role, re-validates the input, and applies the rule; this
 * component renders what it is told. CLAUDE.md rule 1.
 */

export interface AccountActionLabels {
  manage: string
  close: string
  changeRole: string
  newRole: string
  reason: string
  reasonHint: string
  suspend: string
  reactivate: string
  issueLink: string
  working: string
  doneTitle: string
  failedTitle: string
  failedNext: string
  failedWho: string
  linkTitle: string
  linkLead: string
  linkCopy: string
  linkCopied: string
  linkOnce: string
}

export function AccountActions({
  userId,
  status,
  isSelf,
  roles,
  labels,
  headings,
}: {
  userId: string
  status: string
  isSelf: boolean
  roles: Array<{ value: string; label: string }>
  labels: AccountActionLabels
  headings: { what: string; why: string; next: string; who: string }
}) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [pending, startTransition] = useTransition()
  const [failure, setFailure] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // `open` drives the element rather than the other way round, so that Escape
  // and the backdrop — which close the dialog without React knowing — stay in
  // step via onClose.
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  function run(action: (fd: FormData) => Promise<ActionResult>, formData: FormData, doneMessage: string) {
    setFailure(null)
    setDone(null)
    setLink(null)
    setCopied(false)
    formData.set('userId', userId)
    startTransition(async () => {
      const result = await action(formData)
      if (!result.ok) {
        setFailure(result.message)
        return
      }
      setDone(doneMessage)
      // Present only where the deployment has no outbound mail; see
      // src/lib/auth/provisioning.ts.
      if (result.activationUrl) setLink(result.activationUrl)
    })
  }

  /*
   * A modal dialog, not an expanded row and not a popover.
   *
   * The table sits inside a horizontal scroll container, and anything
   * absolutely positioned inside one of those is clipped at its edge — the
   * panel would be half-visible on exactly the narrow screens where it matters
   * most. `showModal()` puts the dialog in the browser's top layer, which no
   * ancestor's `overflow` can cut off, and brings focus trapping and Escape
   * with it rather than requiring both to be rebuilt here.
   */
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {labels.manage}
      </Button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-label={labels.manage}
        className="w-[min(28rem,92vw)] border border-rule-strong bg-paper p-0 text-ink backdrop:bg-navy-900/40"
      >
        <div className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
          {labels.manage}
        </p>
        <Button variant="ghost" size="sm" onClick={() => dialogRef.current?.close()}>
          {labels.close}
        </Button>
      </div>

      {done ? (
        <Notice tone="confirmed" title={labels.doneTitle} live>
          <p>{done}</p>
        </Notice>
      ) : null}

      {link ? (
        <Notice tone="caution" title={labels.linkTitle} live>
          <p>{labels.linkLead}</p>
          {/* Selectable rather than hidden behind the copy button alone: a
              browser that refuses clipboard access must not make the link
              unreachable, since it is the only copy that will ever exist. */}
          <p className="ltr-run mt-2 break-all border border-rule bg-paper p-2 font-mono text-xs text-ink">
            {link}
          </p>
          <p className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }}
            >
              {copied ? labels.linkCopied : labels.linkCopy}
            </Button>
            <span className="text-xs text-ink-muted">{labels.linkOnce}</span>
          </p>
        </Notice>
      ) : null}

      {failure ? (
        <BlockedAction
          what={labels.failedTitle}
          why={failure}
          nextStep={labels.failedNext}
          whoToAsk={labels.failedWho}
          headings={headings}
          tone="caution"
        />
      ) : null}

      {/* ── Change role ─────────────────────────────────────────────────── */}
      {!isSelf ? (
        <form
          action={(fd) => run(changeAccountRoleAction, fd, labels.changeRole)}
          className="space-y-3 border-t border-rule pt-3"
        >
          <Field label={labels.newRole} htmlFor={`role-${userId}`} required>
            <Select name="role" required>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={labels.reason} htmlFor={`role-reason-${userId}`} hint={labels.reasonHint} required>
            <Input name="reason" required minLength={8} autoComplete="off" />
          </Field>
          <Button type="submit" size="sm" variant="secondary" busy={pending}>
            {pending ? labels.working : labels.changeRole}
          </Button>
        </form>
      ) : null}

      {/* ── Suspend / reactivate ────────────────────────────────────────── */}
      {!isSelf ? (
        <form
          action={(fd) =>
            status === 'SUSPENDED'
              ? run(reactivateAccountAction, fd, labels.reactivate)
              : run(suspendAccountAction, fd, labels.suspend)
          }
          className="space-y-3 border-t border-rule pt-3"
        >
          <Field
            label={labels.reason}
            htmlFor={`status-reason-${userId}`}
            hint={labels.reasonHint}
            required
          >
            <Input name="reason" required minLength={4} autoComplete="off" />
          </Field>
          <Button
            type="submit"
            size="sm"
            variant={status === 'SUSPENDED' ? 'secondary' : 'danger'}
            busy={pending}
          >
            {pending ? labels.working : status === 'SUSPENDED' ? labels.reactivate : labels.suspend}
          </Button>
        </form>
      ) : null}

      {/* ── Activation link ─────────────────────────────────────────────── */}
      {status !== 'SUSPENDED' ? (
        <form
          action={(fd) => run(reissueActivationLinkAction, fd, labels.issueLink)}
          className="border-t border-rule pt-3"
        >
          <Button type="submit" size="sm" variant="secondary" busy={pending}>
            {pending ? labels.working : labels.issueLink}
          </Button>
        </form>
      ) : null}
        </div>
      </dialog>
    </>
  )
}
