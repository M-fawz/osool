/**
 * Canonical serialisation for the audit hash chain.
 *
 * The hash of an audit event has to be reproducible years later, on a
 * different machine, by someone auditing the register. That is only true if
 * two people serialising the same event always produce byte-identical input.
 * `JSON.stringify` does not give that: object key order follows insertion
 * order, so the same event built by two different code paths can hash
 * differently.
 *
 * So: keys sorted at every depth, no whitespace, dates as ISO-8601 UTC to the
 * millisecond, `undefined` and `null` both rendered as null, and field values
 * length-prefixed at the top level so that no combination of field contents
 * can be rearranged into a different event that hashes the same.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

function normalise(value: unknown): Json {
  if (value === undefined || value === null) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(normalise)

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>
    const out: Record<string, Json> = {}
    for (const key of Object.keys(source).sort()) {
      out[key] = normalise(source[key])
    }
    return out
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot canonicalise a non-finite number into an audit event.')
    }
    return value
  }

  return value as Json
}

/** Deterministic JSON: sorted keys, no whitespace, stable date format. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalise(value))
}

/**
 * The exact byte sequence hashed for one audit event.
 *
 * Length-prefixing each field (`name:length:value`) removes any ambiguity
 * about where one field ends and the next begins. Without it, an event with
 * action `"A"` / reason `"BC"` and one with action `"AB"` / reason `"C"` could
 * be made to produce the same concatenation.
 */
export function canonicalAuditPayload(fields: Record<string, unknown>): string {
  const parts: string[] = []
  for (const key of Object.keys(fields).sort()) {
    const rendered = canonicalJson(fields[key])
    parts.push(`${key}:${rendered.length}:${rendered}`)
  }
  return parts.join('|')
}
