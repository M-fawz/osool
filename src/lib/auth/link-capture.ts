import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Carrying a one-time link back to the person who caused it to be issued.
 *
 * Better Auth generates activation and verification tokens inside its own API
 * calls and hands the finished URL to a callback — it does not return it. That
 * is the right shape when a mail provider is doing the delivery, and it is a
 * problem when `EMAIL_PROVIDER=manual`, because then the only copy of the link
 * exists for the duration of that callback and is dropped.
 *
 * So the caller opens a capture scope around the Better Auth call, the mail
 * callback writes the URL into it, and the caller reads it back out.
 *
 * `AsyncLocalStorage` rather than a module-level variable, deliberately. A
 * module-level `Map` keyed by email works right up until two administrators
 * provision two accounts in the same isolate at the same moment, at which
 * point one of them is handed the other's activation link. The store is bound
 * to the async execution context, so concurrent calls cannot see each other's.
 *
 * Nothing here persists. Between requests, and between invocations of a
 * serverless function, there is no store at all — which is the property that
 * keeps this from being the outbox table 02-SYSTEM-ARCHITECTURE §4 rejects.
 */

export interface IssuedLink {
  /** What the link is for, as the recipient would understand it. */
  kind: 'activation' | 'reset' | 'verification'
  to: string
  url: string
}

const store = new AsyncLocalStorage<{ links: IssuedLink[] }>()

/**
 * Run `fn` with a capture scope open, and return what it produced alongside
 * every one-time link issued inside it.
 */
export async function captureIssuedLinks<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; links: IssuedLink[] }> {
  const scope = { links: [] as IssuedLink[] }
  const value = await store.run(scope, fn)
  return { value, links: scope.links }
}

/** Record a link, if anyone upstream asked to see it. A no-op otherwise. */
export function noteIssuedLink(link: IssuedLink): void {
  store.getStore()?.links.push(link)
}
