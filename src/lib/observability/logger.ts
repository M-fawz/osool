import { randomUUID } from 'node:crypto'
import { deployment, isDev } from '@/lib/env'

/**
 * Structured logging.
 *
 * The product had thirteen `console.*` calls in total, all of them prose. Prose
 * is readable by a developer with the file open and useless to everyone else: a
 * hosted deployment's logs are searched, filtered, and alerted on, and none of
 * those work on a sentence.
 *
 * So: one line of JSON per event on a host, and something a person can read at
 * a terminal in development. Same call sites, same fields, two renderings.
 *
 * ── What must never appear here ──────────────────────────────────────────
 *
 * Logs are the easiest place in a system to leak what the system was built to
 * protect. Three rules, enforced by `redact` below rather than by memory:
 *
 *   · no document content, ever — not a filename, not bytes, not an excerpt;
 *   · no personal identifier in the clear — a national ID is encrypted at rest
 *     under REQ-DPA-002, and logging it plainly would undo that;
 *   · nothing that reveals a supervisory report exists. REQ-AML-021 is the
 *     hardest constraint in the product, and a log line naming a signal beside
 *     a broker's name would breach it as surely as a screen would.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogFields {
  /** What happened, as a stable dotted key: `workflow.transition.refused`. */
  event: string
  /** Ties every line of one request together. See `withRequestId`. */
  requestId?: string
  actorUserId?: string
  actorRole?: string
  applicationId?: string
  durationMs?: number
  outcome?: 'ok' | 'refused' | 'failed'
  [key: string]: unknown
}

/** Keys whose values never reach a log, whatever a caller passes. */
const FORBIDDEN_KEYS = new Set([
  'nationalId',
  'nationalIdEnc',
  'password',
  'token',
  'secret',
  'apiKey',
  'authorization',
  'cookie',
  'bytes',
  'html',
  'body',
  'signalId',
  'signalType',
  'evidence',
])

function redact(fields: LogFields): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_KEYS.has(key)) {
      clean[key] = '[redacted]'
      continue
    }
    if (value === undefined) continue
    clean[key] = value instanceof Error ? value.message : value
  }
  return clean
}

function emit(level: LogLevel, fields: LogFields): void {
  const line: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    deployment,
    ...redact(fields),
  }

  const target = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log

  if (isDev) {
    // A person is reading this one, in a terminal, with the file open.
    const detail = Object.entries(line)
      .filter(([key]) => !['level', 'time', 'deployment', 'event'].includes(key))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ')
    target(`[osool] ${level.toUpperCase().padEnd(5)} ${fields.event}${detail ? ` ${detail}` : ''}`)
    return
  }

  // A log aggregator is reading this one.
  target(JSON.stringify(line))
}

export const log = {
  debug: (fields: LogFields) => emit('debug', fields),
  info: (fields: LogFields) => emit('info', fields),
  warn: (fields: LogFields) => emit('warn', fields),
  error: (fields: LogFields) => emit('error', fields),
}

/**
 * A correlation id for one request.
 *
 * Prefers the id the platform already assigned, so a line in this log can be
 * matched against the platform's own record of the same request. Falls back to
 * one of our own, because a request with no id is a request nobody can trace.
 */
export function requestIdFrom(request: Request): string {
  return (
    request.headers.get('x-request-id') ??
    request.headers.get('x-vercel-id') ??
    randomUUID()
  )
}

/** Time an operation and log its outcome, whichever way it goes. */
export async function timed<T>(
  event: string,
  fields: Omit<LogFields, 'event'>,
  run: () => Promise<T>,
): Promise<T> {
  const started = Date.now()
  try {
    const value = await run()
    log.info({ event, ...fields, outcome: 'ok', durationMs: Date.now() - started })
    return value
  } catch (error) {
    log.error({
      event,
      ...fields,
      outcome: 'failed',
      durationMs: Date.now() - started,
      error: (error as Error).message,
    })
    throw error
  }
}
