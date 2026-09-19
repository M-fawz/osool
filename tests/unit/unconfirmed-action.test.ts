import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notFound, redirect } from 'next/navigation'
// Next's own class, from the path its client throws it from. If a Next upgrade
// moves it, this import fails loudly — which is the point: the `outdated`
// branch depends on recognising exactly this error.
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { guardAction, isUnconfirmed, unconfirmed } from '@/lib/actions/unconfirmed'

/**
 * A Server Action call that does not come back must become an outcome the form
 * can draw — never a rejection that reaches the route error boundary and takes
 * the step, and everything typed into it, down with it.
 *
 * Reported from the broker's entity step as `net::ERR_NETWORK_CHANGED` →
 * `TypeError: Failed to fetch at fetchServerAction` → "[osool] unhandled route
 * error". These pin how each kind of rejection is read.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

function thrown(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('expected the call to throw')
}

describe('unconfirmed()', () => {
  it.each([
    ['Chromium', 'Failed to fetch'],
    ['Firefox', 'NetworkError when attempting to fetch resource.'],
    ['Safari', 'Load failed'],
  ])('reads the %s fetch failure as a lost connection', (_browser, message) => {
    expect(unconfirmed(new TypeError(message))).toEqual({
      ok: false,
      kind: 'unconfirmed',
      reason: 'connection',
    })
  })

  it('reads a response stream cut off part-way as a lost connection', () => {
    expect(unconfirmed(new Error('Connection closed.')).reason).toBe('connection')
  })

  it('reads anything at all as a lost connection while the browser says it is offline', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(unconfirmed(new Error('whatever the browser said')).reason).toBe('connection')
  })

  it('reads an action the server no longer knows as an outdated screen', () => {
    const error = new UnrecognizedActionError('Server Action "abc" was not found on the server.')
    expect(unconfirmed(error).reason).toBe('outdated')
  })

  it('reads a server-side throw as a fault, and keeps its digest as the reference', () => {
    const error = Object.assign(new Error('An error occurred in the Server Components render.'), {
      digest: '2745101937',
    })
    expect(unconfirmed(error)).toEqual({
      ok: false,
      kind: 'unconfirmed',
      reason: 'fault',
      reference: '2745101937',
    })
  })

  it('never carries the error message itself, which could name a table or a case', () => {
    const outcome = unconfirmed(new Error('relation "Party" does not exist'))
    expect(outcome).toEqual({ ok: false, kind: 'unconfirmed', reason: 'fault' })
    expect(JSON.stringify(outcome)).not.toContain('Party')
  })

  it('does not mistake an ordinary TypeError for the network', () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'ok')")
    expect(unconfirmed(error).reason).toBe('fault')
  })

  it('rethrows redirect(), which Next delivers as a rejection and must still navigate', () => {
    const error = thrown(() => redirect('/en/dashboard'))
    expect(() => unconfirmed(error)).toThrow()
  })

  it('rethrows notFound() for the same reason', () => {
    const error = thrown(() => notFound())
    expect(() => unconfirmed(error)).toThrow()
  })
})

describe('guardAction()', () => {
  it('passes a resolved outcome through untouched', async () => {
    const outcome = { ok: true as const, next: '/application/x/category' }
    const guarded = guardAction(async () => outcome)
    await expect(guarded(null, new FormData())).resolves.toBe(outcome)
  })

  it('turns a rejected call into an Unconfirmed outcome instead of rejecting', async () => {
    const guarded = guardAction<{ ok: true }, FormData>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const outcome = await guarded(null, new FormData())
    expect(isUnconfirmed(outcome)).toBe(true)
  })

  it('never hands the server a previous state it did not produce', async () => {
    const seen: unknown[] = []
    const guarded = guardAction<{ ok: true }, FormData>(async (previous) => {
      seen.push(previous)
      return { ok: true }
    })
    await guarded({ ok: false, kind: 'unconfirmed', reason: 'connection' }, new FormData())
    expect(seen).toEqual([null])
  })
})

/**
 * Every `useActionState` in the product goes through `useGuardedAction`.
 *
 * Source is read rather than rendered because the failure is structural: a new
 * form that hands `useActionState` a raw Server Action works perfectly until
 * the first time somebody's Wi-Fi changes mid-save.
 */
describe('forms that run a Server Action through useActionState', () => {
  const SRC = join(process.cwd(), 'src')

  function tsxFilesUnder(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) out.push(...tsxFilesUnder(full))
      else if (entry.endsWith('.tsx')) out.push(full)
    }
    return out
  }

  const CALLS = tsxFilesUnder(SRC).flatMap((path) => {
    const source = readFileSync(path, 'utf8')
    return [...source.matchAll(/useActionState\s*(?:<[^()]*>)?\s*\(\s*([A-Za-z_.]+)/gs)].map(
      (match) => ({ name: relative(process.cwd(), path), argument: match[1]! }),
    )
  })

  it('finds the forms to check', () => {
    // ActionForm, the sign-up form, and the signal take form at the time of
    // writing. Zero would make the next assertion vacuously green.
    expect(CALLS.length).toBeGreaterThanOrEqual(3)
  })

  it.each(CALLS)('$name wraps its action in useGuardedAction', ({ argument }) => {
    expect(argument).toBe('useGuardedAction')
  })
})
