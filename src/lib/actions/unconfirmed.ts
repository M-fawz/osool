import { unstable_isUnrecognizedActionError, unstable_rethrow } from 'next/navigation'

/**
 * What a form shows when a Server Action call did not come back with an answer.
 *
 * ── The failure this exists for ──────────────────────────────────────────
 *
 * A Server Action is a `fetch` from the browser. When that fetch fails — the
 * laptop changes Wi-Fi network, the phone drops to no signal, the train enters
 * a tunnel — the promise the form is waiting on **rejects** instead of
 * resolving to an outcome. `useActionState` rethrows a rejection during render,
 * so it reaches the route's error boundary, and that boundary *replaces the
 * whole step*. Reported from the entity step as:
 *
 *     net::ERR_NETWORK_CHANGED
 *     TypeError: Failed to fetch  at fetchServerAction
 *     [osool] unhandled route error TypeError: Failed to fetch
 *
 * The broker had copied seventeen fields off two documents. The boundary threw
 * all of them away and showed a notice about an "unexpected fault", which is
 * not what happened and gives them nothing to act on.
 *
 * This module turns the rejection into an outcome, the same kind of value a
 * refusal is, so the form can keep what was typed and say what actually went
 * wrong.
 *
 * ── The three reasons, and why they are told apart ───────────────────────
 *
 *   · `connection` — the request did not complete. The screen cannot know
 *     whether the register received it: a network change can land after the
 *     server has committed. The copy says exactly that and does not guess.
 *   · `outdated`   — the server did not recognise the action. That happens
 *     when the register was redeployed while this page stayed open. Nothing ran,
 *     and pressing the button again will fail the same way, so the next step is
 *     a reload rather than a retry.
 *   · `fault`      — the server ran the action and it threw. In production the
 *     message is redacted and a `digest` is attached; the digest is kept and
 *     shown as a reference, because it is the one thing support can look up.
 *
 * ── What is deliberately NOT caught ──────────────────────────────────────
 *
 * `redirect()` and `notFound()` travel as rejections too — Next implements them
 * as thrown errors that its own boundaries catch and turn into navigation.
 * Catching those would silently stop a redirect from happening. They are
 * rethrown first, before anything else is decided.
 */

export type UnconfirmedReason = 'connection' | 'outdated' | 'fault'

export interface Unconfirmed {
  ok: false
  kind: 'unconfirmed'
  reason: UnconfirmedReason
  /** The server's error digest, when it sent one. Never the message itself. */
  reference?: string
}

/**
 * Decide what a rejected action call means.
 *
 * Throws, unchanged, anything that is Next's own control flow.
 */
export function unconfirmed(error: unknown): Unconfirmed {
  unstable_rethrow(error)

  if (unstable_isUnrecognizedActionError(error)) {
    return { ok: false, kind: 'unconfirmed', reason: 'outdated' }
  }

  if (isConnectionFailure(error)) {
    return { ok: false, kind: 'unconfirmed', reason: 'connection' }
  }

  const digest = (error as { digest?: unknown } | null)?.digest
  return {
    ok: false,
    kind: 'unconfirmed',
    reason: 'fault',
    ...(typeof digest === 'string' && digest.length > 0 ? { reference: digest } : {}),
  }
}

export function isUnconfirmed(value: unknown): value is Unconfirmed {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'unconfirmed'
  )
}

/**
 * The same action, answering with an `Unconfirmed` instead of rejecting.
 *
 * The previous state is passed through with any `Unconfirmed` replaced by
 * `null`: the server never produced that value and has no type for it.
 */
export function guardAction<State, Payload>(
  action: (previous: State | null, payload: Payload) => Promise<State>,
): (previous: State | Unconfirmed | null, payload: Payload) => Promise<State | Unconfirmed> {
  return async (previous, payload) => {
    try {
      return await action(isUnconfirmed(previous) ? null : previous, payload)
    } catch (error) {
      return unconfirmed(error)
    }
  }
}

/**
 * `fetch` rejects with a `TypeError` when the request cannot be completed, and
 * with nothing else. The wording is the browser's own and differs between them:
 * Chromium "Failed to fetch", Firefox "NetworkError when attempting to fetch
 * resource.", Safari "Load failed". React's Flight client adds one more when
 * the response stream is cut off part-way: "Connection closed."
 *
 * A browser that words it some other way falls through to `fault`, which still
 * keeps the form and still says it was not confirmed. The distinction only
 * sharpens the copy; it is never what keeps the screen alive.
 */
function isConnectionFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (!(error instanceof Error)) return false
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return true
  return error.message === 'Connection closed.'
}
