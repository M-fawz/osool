/**
 * The eight steps of the broker's application, in order.
 *
 * One decision per screen — 03-DESIGN-DIRECTION §8, and the reason a broker who
 * uses this twice in their life can finish it. The order is not arbitrary:
 * capacity comes first because it decides whether step 2 exists at all, and the
 * category step comes after the entity step because the capital figure it
 * checks is captured there.
 *
 * The slugs are URL segments and are deliberately English and stable. A
 * bookmarked half-finished application must still resolve after a translation
 * change, and an Arabic slug in a URL is percent-encoded into something nobody
 * can read out over a telephone.
 */

export const APPLICATION_STEPS = [
  'capacity',
  'power-of-attorney',
  'entity',
  'category',
  'contracts',
  'documents',
  'declarations',
  'review',
] as const

export type ApplicationStep = (typeof APPLICATION_STEPS)[number]

export function isApplicationStep(value: string): value is ApplicationStep {
  return (APPLICATION_STEPS as readonly string[]).includes(value)
}

/**
 * The steps this particular application actually has.
 *
 * Step 2 exists only for an agent — REQ-REG-030 asks for power-of-attorney
 * details "if acting under a power of attorney", and showing a step that will
 * be skipped makes the progress indicator lie about how much is left. A broker
 * counting screens is entitled to a true count.
 */
export function stepsFor(capacity: string | null): ApplicationStep[] {
  if (capacity === 'AGENT_UNDER_POA') return [...APPLICATION_STEPS]
  return APPLICATION_STEPS.filter((s) => s !== 'power-of-attorney')
}

export function stepNumber(step: ApplicationStep, capacity: string | null): number {
  return stepsFor(capacity).indexOf(step) + 1
}

export function nextStep(step: ApplicationStep, capacity: string | null): ApplicationStep | null {
  const steps = stepsFor(capacity)
  const index = steps.indexOf(step)
  return index >= 0 && index < steps.length - 1 ? steps[index + 1]! : null
}

export function previousStep(step: ApplicationStep, capacity: string | null): ApplicationStep | null {
  const steps = stepsFor(capacity)
  const index = steps.indexOf(step)
  return index > 0 ? steps[index - 1]! : null
}
