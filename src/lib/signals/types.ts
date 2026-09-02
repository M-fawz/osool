import type { SignalFamily, SignalSeverity } from '@prisma/client'

/**
 * What a detector produces.
 *
 * Deliberately not a Signal row: a detector computes a *finding* and the
 * engine decides whether it is new, which is what keeps a detector from having
 * to know about deduplication, notification, or the audit trail. A detector is
 * a question asked of the data.
 */

export interface SignalCandidate {
  /** The INTEGRITY_SIGNALS rule item key. */
  signalType: string
  family: SignalFamily
  severity: SignalSeverity

  /** What the signal is about. At least one of these is always set. */
  applicationId?: string | null
  brokerageContractId?: string | null
  subjectType?: string | null
  subjectId?: string | null

  /**
   * The facts, so a human can check the reasoning instead of trusting a score.
   *
   * 02-SYSTEM-ARCHITECTURE §8 requires this. It is also what makes a dismissal
   * defensible: the officer who wrote "reviewed, the two firms are a parent and
   * its subsidiary" was answering something specific.
   */
  evidence: Record<string, unknown>

  /** One factual sentence each. Never an accusation, never a conclusion. */
  summaryAr: string
  summaryEn: string
}

export interface DetectorContext {
  now: Date
  /** The INTEGRITY_SIGNALS parameters in force. */
  parameters: Map<string, Record<string, unknown>>
  ruleSetId: string
  ruleSetVersion: number
}

export interface Detector {
  /** The rule item key this detector is configured by. */
  key: string
  /** A one-line statement of what it looks for, printed in the QA matrix. */
  looksFor: string
  run: (context: DetectorContext) => Promise<SignalCandidate[]>
}

/** Read a numeric parameter, with the seeded value as the only source. */
export function numberParam(
  context: DetectorContext,
  key: string,
  name: string,
  fallback: number,
): number {
  const value = context.parameters.get(key)?.[name]
  return typeof value === 'number' ? value : fallback
}

export function severityOf(context: DetectorContext, key: string): SignalSeverity {
  const value = context.parameters.get(key)?.severity
  return value === 'HIGH' || value === 'LOW' || value === 'MEDIUM' ? value : 'MEDIUM'
}

export function isEnabled(context: DetectorContext, key: string): boolean {
  return context.parameters.get(key)?.enabled !== false
}
