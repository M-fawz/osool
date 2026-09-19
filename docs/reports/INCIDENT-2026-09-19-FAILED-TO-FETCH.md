# Incident — `TypeError: Failed to fetch` on the broker's entity step

**Reported:** 19 September 2026, by the project owner, while filling in step 3 (the firm) as a broker.
**Status:** fixed and verified against a production build (§5). One unrelated, pre-existing defect found along the way is recorded, not fixed (§7).

---

## 1. What was seen

```
net::ERR_NETWORK_CHANGED
net::ERR_INTERNET_DISCONNECTED
TypeError: Failed to fetch  at fetchServerAction (server-action-reducer.js:48:23)
The above error occurred in the <EntityForm> component. It was handled by the error boundary.
[osool] unhandled route error TypeError: Failed to fetch
```

The step disappeared. In its place was the route's "This page could not be shown" notice, and
everything typed into the form was gone.

## 2. Root cause

**The network dropped, and the product had no answer for it.**

The two `net::` lines are Chromium reporting that the machine changed network and then had none.
The request never reached the server. So the trigger was not a server restart, a server-side
exception, or the payload size: the server log shows no failed action, and a Server Action body for
this form is a few hundred bytes.

The defect is what the page did next:

1. A Server Action is a `fetch` from the browser. When the fetch fails, Next's
   `fetchServerAction` rejects with the browser's `TypeError`.
2. `ActionForm` ran the action through `useActionState`. React **rethrows a rejected action
   during render**, so the rejection went to the nearest error boundary,
   `src/app/[locale]/error.tsx`.
3. That boundary replaces the whole route segment. The step, the form, and the seventeen fields
   the broker had copied off two documents were unmounted. What replaced them described an
   "unexpected fault", which is not what happened and gives the broker nothing to act on.

`ActionForm` already snapshotted and restored the fields after a *refusal*. A refusal is a value
the action returns. A dropped connection is a rejection the action never returns, so none of that
machinery ever ran.

**The same failure existed in four more places:**

| Where | What a dropped connection did |
|---|---|
| Every `ActionForm`: all 23 broker and back-office forms | Route error boundary, typed values lost |
| The sign-up form (`useActionState` directly) | Route error boundary, all fields lost |
| Taking a signal for review (`useActionState` directly) | Route error boundary |
| Marking attendance at the counter (async `startTransition`) | Route error boundary. React 19 sends errors thrown in an async transition there too, taking down the whole appointments list |
| Recording a declaration (`await` in an event handler) | An unhandled promise rejection. The spinner stopped and nothing on the screen said the declaration had not been recorded |

The last two also **threw away the action's answer when it did come back.** A rule refusal at the
counter or on a declaration was never shown.

## 3. The fix

### 3.1 A rejection becomes an outcome — `src/lib/actions/unconfirmed.ts`

`guardAction(action)` returns the same action, answering with an `Unconfirmed` value instead of
rejecting. `unconfirmed(error)` reads the rejection and names one of three reasons, because each
one needs a different next step:

| Reason | How it is recognised | What the person is told to do |
|---|---|---|
| `connection` | the browser's fetch `TypeError` ("Failed to fetch" / "NetworkError…" / "Load failed"), a response stream cut off part-way, or `navigator.onLine === false` | Check the connection and press again. What was typed is still on screen. To check first whether it was recorded, open the page in a new tab |
| `outdated` | Next's `UnrecognizedActionError`: the register was redeployed while the page stayed open | Nothing was recorded. Note what was typed, reload, and enter it again |
| `fault` | anything else, i.e. the server ran the action and it threw | Press again. The server's `digest` is shown as a fault reference. The error message itself is never carried, because it could name a table or a case |

**What it deliberately lets through:** `redirect()` and `notFound()` also travel as rejections.
Next implements them as thrown errors its own boundaries turn into navigation. They are rethrown
first, through Next's public `unstable_rethrow`, so a redirect is never swallowed.

**Why the connection copy does not say "nothing was saved":** `ERR_NETWORK_CHANGED` can land after
the server has committed. The screen cannot know, so it says it cannot know.

### 3.2 Guarded only after hydration — `src/components/forms/use-guarded-action.ts`

The guard is a client function, and a client function cannot be posted by a browser without
JavaScript. React decides how to render `<form action>` on the server from the action given to
`useActionState`. A Server Action reference yields the hidden `$ACTION_*` inputs that make the form
post natively; a client function yields `action="javascript:throw …"`. Handing it the guard
directly would have made every form in the product JavaScript-only. That is the same trap
`form-state.tsx` already documents, arrived at by a different road.

So `useGuardedAction` returns the raw Server Action for the server render and the hydrating
render, and the guarded one from the first effect after hydration. React allows this:
`useActionState` stores its action in a queue that every render updates, while the dispatch
function on the `<form>` keeps its identity.

### 3.3 Where it is applied

| File | Change |
|---|---|
| `src/components/forms/action-form.tsx` | `useActionState(useGuardedAction(action))`. An `Unconfirmed` outcome is restored, scrolled to and drawn like a refusal. The refusal rendering moved into the shared `RefusalNotice` |
| `src/components/forms/unconfirmed-notice.tsx` (new) | The four-part notice for the three reasons, in the caution tone: a dropped connection is not the register saying no |
| `src/components/forms/refusal-notice.tsx` (new) | The one rendering of a `RuleViolation`, in the reader's language |
| `src/components/forms/restore.ts` (new) | `restore()`, moved out of `ActionForm` so the sign-up form can share it |
| `src/app/[locale]/signup/signup-form.tsx` | Guarded, and now snapshots/restores its fields, so "what you entered is still on this screen" is true there too. It had no restore before, so React 19's post-action reset would also have emptied it on an ordinary validation refusal. That was reasoned from the code, not re-observed. The fixed behaviour was observed: a too-short password is refused and the other seven fields keep their values |
| `src/components/gov/signal-card.tsx` | Take-for-review guarded. Its refusal line was always English; it now follows the locale |
| `src/components/gov/attendance-controls.tsx` | Guarded. Refusals and unconfirmed outcomes are drawn under the buttons instead of being discarded |
| `src/components/application/declarations-step.tsx` | Each declaration's answer is read. A refusal, a validation message, or an unconfirmed outcome is drawn under the declaration it belongs to |
| `messages/{ar,en}.json` | 7 new keys, Arabic and English, parity enforced |

### 3.4 Guards against it coming back

| Guard | What it asserts |
|---|---|
| `tests/unit/unconfirmed-action.test.ts` (18 tests) | Each browser's fetch failure → `connection`, `UnrecognizedActionError` → `outdated`, a server throw → `fault` with its digest and never its message, an ordinary `TypeError` is not mistaken for the network, and `redirect()`/`notFound()` are rethrown. Also scans the source: **every `useActionState` in `src/` must be handed `useGuardedAction(...)`**, so a new form cannot quietly reintroduce the defect |
| `tests/unit/credential-form-safety.test.ts` | Narrowed to what its own comment describes: a form submitted by `onSubmit` *with no `action`*. The sign-up form now carries both an `action` (a native POST) and an `onSubmit` (the snapshot), which the old filter mistook for a GET-fallback form. Every original assertion still runs against the three credential screens |
| `scripts/qa/browser.mjs` §8 | In a real browser, on the entity step: a connection reset while online, a server 500, going offline, and an unrecognised action. Each must produce the right inline notice in four parts, keep the typed value, and not reach the error boundary. Then, back online, the same button must reach the server again |
| `scripts/qa/browser.mjs` §9 | Every documented demo account signs in and opens every screen in its own navigation, plus, for brokers, every step of their application. Fails on a page error, a 5xx, a blank page, or the route error boundary |

## 4. Not done, and why

- **Idempotency keys on Server Actions.** After a `connection` failure the screen tells the person
  it cannot know whether the save landed. The wizard steps are upserts, so a second press is
  harmless. State transitions are refused by `transition()` if the file has already moved on. But
  a few actions create a row: a new contract, opening appointment slots, fee lines. Pressing again
  after a drop that landed server-side would record a second one. Closing that properly needs a
  per-submission key checked on the server, which is a change to every writing action. That is
  its own piece of work, and the copy is honest about the risk in the meantime.
- **The route error boundary itself is unchanged.** It is still the right answer to a genuine
  render fault. The change is that a failed network call no longer counts as one.

## 5. Verification

Everything below ran on this machine against **`npm run build && npm start`**, the production
build, on the local embedded PostgreSQL (`127.0.0.1:5433`). `/api/health` reported
`deployment: production` with the database reachable in 2 ms. Nothing here touched the deployed
system or its database.

### 5.1 The gate

| Check | Result |
|---|---|
| `npm run ci` (typecheck, lint, no-deletes, one-archiver, i18n parity, all tests, production build) | **exit 0** |
| Tests | **216 passed / 24 files / 0 failed**. Was 198 / 23; the new file adds 18 |
| i18n | 921 keys in each locale, parity enforced |
| Design-system detector | no new findings. The 3 it reports predate this change: two `border-s-4` on the signal card, one 14px in the email template |
| Final `next build` after the last source edit | exit 0 |

### 5.2 The fix itself, in a browser

| Check | Result |
|---|---|
| Connection reset mid-request, browser still online (the reported `ERR_NETWORK_CHANGED` shape) | inline `connection` notice in four parts, typed value kept, no error boundary |
| Server answers 500 | inline `fault` notice, typed value kept |
| Browser offline (`ERR_INTERNET_DISCONNECTED`) | inline `connection` notice, typed value kept |
| Server no longer recognises the action (redeploy) | inline `outdated` notice, typed value kept |
| Back online, same button | reaches the server, which answers with a validation refusal. Nothing was written |
| **JavaScript disabled** | the entity form is still served as a native `POST` with React's hidden `$ACTION_*` inputs, not `javascript:throw`, and a native submit is answered by the server's own validation refusal |

Screenshots (gitignored): `.proof/screens/connection-reset.png`, and in Arabic, right-to-left, `.proof/screens/connection-reset-ar.png`.

### 5.3 Every account, every role

| Harness | What it drives | Result |
|---|---|---|
| `scripts/qa/routes.mjs` | every route as every role over HTTP, refusals in four parts, AR/EN mirror, cross-tenant probe, server-side authorisation on writes | **142 passed, 0 failed** |
| `scripts/qa/workflow.mjs` | broker → clerk → examiner → completion → broker → a *different* reviewer → approval → fees → card → delivery, with the database checked after each transition | **82 passed, 0 failed** (after the two assertion corrections in §6) |
| `scripts/qa/database.mjs` | 29 integrity checks: no cascades, delete/truncate guards refuse, no orphans, no gaps in the audit sequence, segregation of duties, ciphertext national IDs | **29 passed, 0 failed** |
| `npx tsx scripts/verify-chain.ts` | recomputes the audit hash chain | **INTACT**, events 1…6,903 |
| `npm run qa:browser` | sections 1–9 | **133 passed, 2 failed** on the final run. Sections 1–7: 97/97. §8: 10/10. §9: 26 of 28 accounts clean; the 2 failures are both the pre-existing #418 in §7 below |

**Section 9, account by account.** Every documented account signed in, landed on its dashboard,
and opened every screen its own navigation offers. Brokers also opened all eight steps of their
application and the appointments screen.

| Account | Role | Result |
|---|---|---|
| `admin@` | SYSTEM_ADMIN | OK |
| `clerk@` | REGISTRY_CLERK | OK |
| `examiner@`, `examiner2@` | EXAMINER | OK |
| `reviewer@`, `reviewer2@` | REVIEWER | OK |
| `issuer@` | CARD_ISSUER | OK. #418 once on `/en/issuance` (run 1); see §7 |
| `data@` | DATA_MANAGER | OK |
| `files@` | FILES_HEAD | OK. #418 once on `/en/archive` (run 2) |
| `auditor@` | AUDITOR | OK |
| `aml@` | AML_SUPERVISOR | OK |
| `analyst@` | ANALYST | OK |
| `inspector@` | INSPECTOR | OK. Refused everywhere, in four parts, by design: no screen has a `REQ-*` yet |
| `suspended@` | REGISTRY_CLERK, suspended | OK. Signs in, refused on every screen, by design |
| `broker@`, `delta@`, `nile@`, `newcairo@`, `haramain@`, `mohandeseen@`, `heliopolis@`, `october@`, `giza@`, `maadi@`, `zamalek@`, `alex@`, `shorouk@`, `aswan@` | BROKER_OWNER | OK. #418 once each: `nile@` documents step (run 1), `october@` review step and `zamalek@` declarations step (run 3) |

No account produced a `TypeError`, a 5xx, a blank page, or the route error boundary on any run.

## 6. What the verification changed, and what it cost

- **Three harness assertions were wrong, and were corrected rather than satisfied.**
  1. `workflow.mjs` looked for the new file on page 1 of the clerk's queue. The queue is
     oldest-first and the local one holds over a thousand files, so it is on the last page. It
     now searches every page.
  2. `workflow.mjs` counted *every* orphaned firm in the database. The local one has twenty,
     all created on 2 September by the double-press race fixed then. It now asks whether *this
     run* orphaned one. The standing property belongs to `database.mjs`, which passes.
  3. §9 of the browser harness first judged a page while its `loading.tsx` skeleton was still
     up, and called the inspector's dashboard blank. Fifteen reloads were all complete. It now
     waits the skeleton out, and fails a page that is still on it after 30 s.
- **`nile@osool.test` now has two extra ACTIVE applications on the local database.** Both are
  from running `workflow.mjs` twice during this verification, which drives its walk as that firm.
  Under rule 2 they cannot be removed. The seeded SUBMITTED file is untouched and the
  appointment demonstration still works from it. `DEMO-SCRIPT.md` part 3 now says which card to
  open, and `workflow.mjs` warns about it in its header. Browser harness §5 had assumed nile's
  first card was the SUBMITTED one; it now selects it by what the card says. **Production was
  not touched.**

## 7. Found, not fixed: an intermittent hydration mismatch (React #418)

The new §9 sweep is the first check in this project that listens for page errors on every
screen, and it found one that predates this work:

- `Minified React error #418`, "the server rendered HTML didn't match the client". **5 times in
  about 830 page loads** across three full sweeps, plus twice in targeted replays. A different
  screen each time: `/en/issuance`, `/en/register`, `/en/archive`, and brokers' documents,
  declarations and review steps.
- **Recoverable.** React re-renders on the client. Nothing crashes and nothing visible changes.
- **Not caused by this change.** Reproduced on a production build of `46dcc00` (before this
  work), built in a separate git worktree.
- **Production-only so far.** 0 mismatches in 48 loads against a development server, so the
  development build's diff, which would name the element, could not be captured.
- **Leading hypothesis, unproved:** `src/app/[locale]/layout.tsx` exports an async
  `generateMetadata`, so every page streams its metadata into the body for hoisting into
  `<head>`. A race there would be timing-dependent and page-independent, which is the pattern.
  The first test is `htmlLimitedBots: /.*/` in `next.config.ts` and a few hundred sweep loads.

Recorded as **P0.20** in `docs/reports/PROGRESS.md`. §9 stays strict, so until it is fixed a
full harness run can fail on it once or twice. That is the defect showing, not a flaky check.
