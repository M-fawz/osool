'use client'

import { useEffect, useState } from 'react'

/**
 * Whether React has taken over the markup the server sent.
 *
 * ── Why a form needs to know this ────────────────────────────────────────
 *
 * A `<form onSubmit={…}>` with no `action` and no `method` is only a form in
 * the React sense. Until the bundle has loaded and hydrated, the handler is not
 * attached, and the element is still a plain HTML form — so submitting it does
 * what the HTML default has always been: a **GET to the current URL with every
 * field appended as a query parameter**.
 *
 * On the sign-in screen that produced this:
 *
 *     /en/login?email=clerk%40osool.test&password=%3Credacted%3E
 *
 * The password is then in the address bar, in browser history, in the server's
 * access log, and in the `Referer` of whatever the page loads next. It is also
 * the reason signing in "did nothing": the page simply reloaded to the sign-in
 * screen, which is indistinguishable from a rejected password.
 *
 * The window is real. Hydration is not instant on a cold cache, on a slow
 * connection, or on a development server compiling the route on first request —
 * and a sign-in screen is precisely where people type fast and press Enter.
 *
 * ── The two halves of the fix ────────────────────────────────────────────
 *
 * This hook gates the submit control until the handler exists, so the fallback
 * submission cannot be reached by a click or by Enter. The forms also carry
 * `method="post"`, so that if one ever escapes anyway the fields travel in the
 * request body and never in a URL. Neither alone is sufficient: the gate keeps
 * the user out of a dead 405, and the method keeps the credential out of the
 * log.
 *
 * `false` on the server and on the first client render, which is what keeps the
 * two trees identical — flipping to `true` in an effect is the only point at
 * which hydration is known to have finished.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated
}
