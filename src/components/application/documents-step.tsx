'use client'

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { BlockedAction } from '@/components/ui/notice'
import { Status } from '@/components/ui/status'
import { Stamp } from '@/components/ui/bidi'
import { Check, Icon, Info } from '@/components/ui/icon'
import type { RuleViolation } from '@/lib/rules/violation'
import { WhyWeAsk } from './why-we-ask'

/**
 * Step 6 — documents.
 *
 * The step where a broker on a phone either succeeds or drives to a GOEIC
 * branch, so the decisions here are about the phone specifically:
 *
 *   · **One tap to the camera.** `capture="environment"` on a file input opens
 *     the rear camera directly, skipping the gallery picker. That single
 *     attribute is the difference between "photograph your commercial register"
 *     and "photograph it, find it in your gallery, and select it".
 *   · **The photo is shown back, large.** The commonest failure is a legible
 *     photo of the wrong page, or an illegible photo of the right one, and
 *     neither is detectable from a filename. The image comes back through the
 *     authorised, audited document route — the same bytes the examiner will
 *     see, not a local preview that might differ.
 *   · **Real progress, from the real upload.** `XMLHttpRequest` rather than
 *     `fetch`, because only XHR reports upload progress, and a six-megabyte
 *     photo on a mobile connection with a spinner that says nothing is a photo
 *     the applicant cancels halfway.
 *   · **Failure says what to do.** An oversized or wrong-format file comes back
 *     as the four-part refusal from the server, with the actual limit in it.
 *
 * Drag and drop is added on top for the desktop case. It is never the only way
 * to do anything.
 *
 * ## The one check that happens here rather than on the server
 *
 * CLAUDE.md rule 1 says a rule not enforced server-side does not exist, and the
 * size limit *is* enforced server-side — `receiveApplicationDocument` refuses an
 * oversized file against the DOC_CHECKLIST rule set, and that check is
 * unchanged and authoritative.
 *
 * The check below is not that rule. It is the request-body ceiling of the host
 * this deployment runs on: a serverless platform rejects an oversized body at
 * the edge, before any of this application's code runs, and answers with its own
 * error page. So the server cannot produce the refusal — there is nothing left
 * to refuse with. Catching it in the browser is the only place the applicant can
 * be told, in Arabic, what happened and what to do about it. It is a message,
 * not an authorisation, and the server still decides.
 */

export interface DocumentItem {
  key: string
  label: string
  description: string | null
  /** Why this conditional item is being asked for, from the rule set. */
  conditionNote: string | null
  required: boolean
  acceptedMimeTypes: string[]
  maxSizeMb: number
  document: {
    id: string
    mimeType: string
    sizeBytes: number
    uploadedAt: string
    version: number
  } | null
}

type ItemState =
  | { phase: 'idle' }
  | { phase: 'uploading'; percent: number }
  | { phase: 'failed'; violation: RuleViolation | null }

export function DocumentsStep({
  applicationId,
  items,
  continueHref,
  requestCeilingMb,
}: {
  applicationId: string
  items: DocumentItem[]
  continueHref: string
  /**
   * The largest body the host will pass through, from `uploadRequestCeilingMb`.
   * Not a regulatory limit — see the note at the top of this file.
   */
  requestCeilingMb: number
}) {
  const t = useTranslations('apply')
  const router = useRouter()
  const [states, setStates] = React.useState<Record<string, ItemState>>({})

  const required = items.filter((i) => i.required)
  const supplied = required.filter((i) => i.document)

  const upload = React.useCallback(
    (key: string, file: File) => {
      if (file.size > requestCeilingMb * 1024 * 1024) {
        setStates((s) => ({
          ...s,
          [key]: { phase: 'failed', violation: tooLargeForHost(file.size, requestCeilingMb) },
        }))
        return
      }

      setStates((s) => ({ ...s, [key]: { phase: 'uploading', percent: 0 } }))

      const body = new FormData()
      body.append('file', file)
      body.append('checklistItemKey', key)

      const request = new XMLHttpRequest()
      request.open('POST', `/api/applications/${applicationId}/documents`)

      request.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) return
        setStates((s) => ({
          ...s,
          [key]: { phase: 'uploading', percent: Math.round((event.loaded / event.total) * 100) },
        }))
      })

      request.addEventListener('load', () => {
        if (request.status >= 200 && request.status < 300) {
          setStates((s) => ({ ...s, [key]: { phase: 'idle' } }))
          // Re-render from the server, so what appears is what the register
          // actually holds rather than what the browser hopes it holds.
          router.refresh()
          return
        }

        let violation: RuleViolation | null = null
        try {
          violation = JSON.parse(request.responseText)?.violation ?? null
        } catch {
          violation = null
        }
        setStates((s) => ({ ...s, [key]: { phase: 'failed', violation } }))
      })

      request.addEventListener('error', () => {
        setStates((s) => ({ ...s, [key]: { phase: 'failed', violation: null } }))
      })

      request.send(body)
    },
    [applicationId, requestCeilingMb, router],
  )

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-ink-muted" aria-live="polite">
        {t('documentsProgress', { done: supplied.length, total: required.length })}
      </p>

      {items.map((item) => (
        <DocumentCard
          key={item.key}
          item={item}
          state={states[item.key] ?? { phase: 'idle' }}
          onFile={(file) => upload(item.key, file)}
          onDismissFailure={() => setStates((s) => ({ ...s, [item.key]: { phase: 'idle' } }))}
        />
      ))}

      <WhyWeAsk label={t('whyWeAsk')}>{t('whyDocuments')}</WhyWeAsk>

      <div className="border-t border-rule pt-5">
        <Button size="touch" asChild>
          <a href={continueHref}>{t('saveAndContinue')}</a>
        </Button>
      </div>
    </div>
  )
}

function DocumentCard({
  item,
  state,
  onFile,
  onDismissFailure,
}: {
  item: DocumentItem
  state: ItemState
  onFile: (file: File) => void
  onDismissFailure: () => void
}) {
  const t = useTranslations('apply')
  const tCommon = useTranslations('common')
  const tBlocked = useTranslations('blocked')
  const locale = useLocale() as 'ar' | 'en'
  const [dragOver, setDragOver] = React.useState(false)

  const cameraRef = React.useRef<HTMLInputElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const accept = item.acceptedMimeTypes.join(',')
  const isImage = item.document?.mimeType.startsWith('image/') ?? false
  const busy = state.phase === 'uploading'

  return (
    <section
      className={cn(
        'border bg-paper',
        item.document ? 'border-rule' : item.required ? 'border-rule-strong' : 'border-rule',
        dragOver && 'border-2 border-navy-600 bg-navy-50',
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        const file = event.dataTransfer.files[0]
        if (file) onFile(file)
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-md font-medium text-ink">{item.label}</h3>
          {item.description ? (
            <p className="mt-0.5 max-w-reading text-sm text-ink-muted">{item.description}</p>
          ) : null}

          {/* The facts an applicant needs *before* photographing anything, and
              which the card used to carry in its props without ever drawing:
              what this accepts and how large it may be. */}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-faint">
            <span>
              {t('docAccepts')}: <span className="ltr-run">{formatAccepted(item.acceptedMimeTypes)}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t('docMaxSize')}: <span className="ltr-run">{item.maxSizeMb} MB</span>
            </span>
          </p>

          {/* A conditional item that says nothing about its condition reads as
              an arbitrary demand. This is the rule set's own wording. */}
          {item.conditionNote ? (
            <p className="mt-1 max-w-reading text-xs text-ink-faint">
              {t('docCondition')}: {item.conditionNote}
            </p>
          ) : null}
        </div>

        {item.document ? (
          <Status tone="confirmed">{t('documentsSupplied')}</Status>
        ) : item.required ? (
          <Status tone="caution">{t('documentsOutstanding')}</Status>
        ) : (
          <Status tone="neutral">{t('documentsOptional')}</Status>
        )}
      </div>

      <DocumentHelp itemKey={item.key} />

      {item.document ? (
        <div className="border-t border-rule px-4 py-3">
          {isImage ? (
            /*
              Shown at a size somebody can actually read. A 96px thumbnail
              confirms that *a* photograph exists, which is not the question —
              the question is whether the registration number on it is legible,
              and that needs the whole width of the screen.
            */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/documents/${item.document.id}`}
              alt={item.label}
              className="max-h-96 w-full border border-rule bg-paper-sunk object-contain"
            />
          ) : (
            <a
              href={`/api/documents/${item.document.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-navy-600 hover:underline"
            >
              <Icon as={Check} size="sm" className="text-confirmed" />
              {t('viewFile')}
            </a>
          )}

          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-faint">
            <span>{formatBytes(item.document.sizeBytes, locale)}</span>
            <span aria-hidden="true">·</span>
            <span>{t('uploadedOn')}</span>
            <Stamp value={item.document.uploadedAt} />
          </p>
          {item.document.version > 1 ? (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-faint">
              <Icon as={Info} size="xs" className="mt-px" />
              <span>{t('versionNote', { n: item.document.version })}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {state.phase === 'failed' ? (
        <div className="border-t border-rule p-4">
          {state.violation ? (
            <BlockedAction
              what={locale === 'ar' ? state.violation.ar.blocked : state.violation.en.blocked}
              why={locale === 'ar' ? state.violation.ar.why : state.violation.en.why}
              nextStep={locale === 'ar' ? state.violation.ar.nextStep : state.violation.en.nextStep}
              whoToAsk={locale === 'ar' ? state.violation.ar.whoToAsk : state.violation.en.whoToAsk}
              headings={{
                what: tBlocked('whatHeading'),
                why: tBlocked('whyHeading'),
                next: tBlocked('nextHeading'),
                who: tBlocked('whoHeading'),
              }}
            />
          ) : (
            <p role="alert" className="text-sm text-blocking">
              {t('uploadFailed')}
            </p>
          )}
          <Button size="touch" variant="secondary" className="mt-3" onClick={onDismissFailure}>
            {tCommon('close')}
          </Button>
        </div>
      ) : null}

      {busy ? (
        <div className="border-t border-rule px-4 py-3">
          <p className="text-sm text-ink-muted">{t('uploading')}</p>
          <div
            className="mt-2 h-2 w-full bg-rule"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={state.percent}
          >
            <div className="h-full bg-navy-600 transition-[width]" style={{ width: `${state.percent}%` }} />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 border-t border-rule px-4 py-3">
          <Button
            type="button"
            size="touch"
            variant={item.document ? 'secondary' : 'primary'}
            onClick={() => cameraRef.current?.click()}
          >
            {t('capturePhoto')}
          </Button>
          <Button type="button" size="touch" variant="secondary" onClick={() => fileRef.current?.click()}>
            {item.document ? t('replaceFile') : t('chooseFile')}
          </Button>

          {/* Two inputs, not one. `capture` on a single input would force the
              camera on desktop, where there frequently is not one, and remove
              the ability to pick an existing PDF at all. */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) onFile(file)
              event.currentTarget.value = ''
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) onFile(file)
              event.currentTarget.value = ''
            }}
          />
        </div>
      )}
    </section>
  )
}

/**
 * What this document is, why the Authority wants it, what to photograph, and
 * what happens if the applicant does not have one.
 *
 * Four questions, because those are the four a person actually has in front of
 * a line that says «البطاقة الضريبية» and nothing else. Collapsed by default:
 * thirteen cards each carrying four paragraphs is a wall, and the applicant who
 * already knows what a tax card is should not have to scroll past an
 * explanation of one.
 *
 * The copy lives in the message catalogue rather than in the DOC_CHECKLIST rule
 * set, and the split is deliberate. The rule set is the authority on *what is
 * required* — the item, whether it is mandatory, the accepted types, the size
 * ceiling — and those are drawn above from the rule data. This is help text: it
 * is translated like every other sentence in the interface, it carries no
 * threshold, and changing it must not bump a regulatory version that decisions
 * are stamped against.
 *
 * An item with no entry renders nothing at all rather than an empty disclosure,
 * so a checklist item added to the rule set tomorrow degrades quietly.
 */
function DocumentHelp({ itemKey }: { itemKey: string }) {
  const t = useTranslations('apply')
  const key = (suffix: string) => `docHelp.${itemKey}.${suffix}` as 'docHelp.POWER_OF_ATTORNEY.what'

  if (!t.has(key('what'))) return null

  const parts: Array<{ heading: string; body: string }> = [
    { heading: t('docHelpWhat'), body: t(key('what')) },
    { heading: t('docHelpWhy'), body: t(key('why')) },
    { heading: t('docHelpUpload'), body: t(key('upload')) },
    { heading: t('docHelpMissing'), body: t(key('missing')) },
  ]

  return (
    <details className="group border-t border-rule">
      <summary
        className={cn(
          'flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-4',
          'text-sm font-medium text-navy-600 hover:underline',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <Icon as={Info} size="xs" />
        <span>{t('docHelpToggle')}</span>
      </summary>

      <dl className="space-y-3 border-s-2 border-brass-300 bg-paper-sunk px-4 py-3 text-sm leading-relaxed">
        {parts.map((part) => (
          <div key={part.heading}>
            <dt className="font-semibold text-navy-700">{part.heading}</dt>
            <dd className="mt-0.5 max-w-reading text-ink-muted">{part.body}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

/** `application/pdf, image/jpeg` → `PDF · JPEG`. */
function formatAccepted(mimeTypes: string[]): string {
  const seen = new Set<string>()
  for (const type of mimeTypes) {
    const tail = type.split('/')[1] ?? type
    seen.add(tail === 'jpeg' ? 'JPG' : tail.toUpperCase())
  }
  return [...seen].join(' · ')
}

/**
 * The refusal for a file the host will not carry.
 *
 * Shaped as a `RuleViolation` so it renders through exactly the same
 * `BlockedAction` as every server refusal — an applicant should not be able to
 * tell which side of the wire said no. `severity: 'ADVISORY'` and an empty
 * `requirementIds` are honest: no regulatory requirement is being enforced here,
 * and claiming a REQ-* ID for a hosting limit would put a false citation in
 * front of a user. CLAUDE.md rule 3.
 */
function tooLargeForHost(sizeBytes: number, ceilingMb: number): RuleViolation {
  const actualMb = (sizeBytes / (1024 * 1024)).toFixed(1)
  const ceiling = Number.isInteger(ceilingMb) ? String(ceilingMb) : ceilingMb.toFixed(1)

  return {
    code: 'UPLOAD_EXCEEDS_HOST_LIMIT',
    severity: 'ADVISORY',
    requirementIds: [],
    legalSource: '',
    needsCounsel: false,
    evidence: { sizeBytes, ceilingMb },
    ar: {
      blocked: 'لم يُرسل الملف.',
      why: `حجم الملف ${actualMb} ميجابايت، وأقصى حجم يقبله النظام في الرفعة الواحدة ${ceiling} ميجابايت.`,
      nextStep:
        'أعد التصوير بجودة أقل من إعدادات الكاميرا، أو صوّر صفحة واحدة في كل مرة بدلاً من المستند كاملاً.',
      whoToAsk:
        'إذا كان المستند لا يمكن تصغيره، راجع الإدارة المركزية للسجلات التجارية بالهيئة العامة للرقابة على الصادرات والواردات.',
    },
    en: {
      blocked: 'The file was not sent.',
      why: `It is ${actualMb} MB, and the largest this service accepts in one upload is ${ceiling} MB.`,
      nextStep:
        'Retake the photo at a lower quality in your camera settings, or photograph one page at a time.',
      whoToAsk:
        'If the document cannot be made smaller, contact the Central Administration for Commercial Registrations at GOEIC.',
    },
  }
}

/** Sizes in the reader's language, with the number kept Latin. */
function formatBytes(bytes: number, locale: 'ar' | 'en'): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} ${locale === 'ar' ? 'م.ب' : 'MB'}`
  const kb = Math.max(1, Math.round(bytes / 1024))
  return `${kb} ${locale === 'ar' ? 'ك.ب' : 'KB'}`
}
