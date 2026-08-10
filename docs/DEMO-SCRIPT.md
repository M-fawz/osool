# Demonstration script — ten minutes

**Audience:** a government stakeholder who is not technical.
**Setting:** one screen, one phone, one presenter.

Read the italics; they are the words. Everything else is what to do.

---

## Before you start

```bash
npm run db:start          # terminal 1 — leave running
npm run dev               # terminal 2 — leave running
npm run seed:phase1       # terminal 3 — once
```

Open four browser windows and sign in to each before the audience arrives. Switching accounts
mid-demonstration costs ninety seconds and the room's attention.

| Window | Account | Password |
|---|---|---|
| 1 — the broker | `broker@osool.test` | `DevOnly!Osool2026` |
| 2 — the examiner | `examiner@osool.test` | `DevOnly!Osool2026` |
| 3 — the reviewer | `reviewer2@osool.test` | `DevOnly!Osool2026` |
| 4 — the auditor | `auditor@osool.test` | `DevOnly!Osool2026` |

Have a phone on the same Wi-Fi with `http://<your-ip>:3000` already open on the sign-in page.

---

## 0 · The problem (1 minute)

*Do not open the laptop yet.*

> There is a register of real-estate brokers in Egypt. It is required by law — Law 120 of 1982.
> Nobody outside this building can consult it.
>
> A family buying an apartment cannot check whether the person taking their deposit is registered
> at all. A broker who wants to register drives to a GOEIC branch with a folder of papers, and if
> one paper is missing, drives home and comes back. And when an application is approved, the
> reasons live in one officer's memory and one signature on one form in one drawer.
>
> None of that is a software problem. It is a records problem, and it is what we are here to fix.
>
> Three questions this register cannot answer today: *Is this broker registered?* *Who approved
> this file, and on what evidence?* *Is the same power of attorney being used across nine
> unrelated firms?*
>
> Let me show you what answering them looks like.

---

## 1 · The broker, on a phone (2 minutes)

*Pick up the phone. Sign in as `broker@osool.test`. Hold it up so the room can see it is a phone
and not a laptop pretending.*

> This is the whole broker experience. It is a phone, in Arabic, right to left.

*Open the application. Scroll through the first step.*

> One question per screen. "In what capacity are you applying?" — five options, and each one has a
> sentence saying when it applies. Not the legal name of the answer: a description of the
> applicant's actual situation.
>
> *(tap "لماذا نطلب هذا؟" under the national ID field)*
>
> Every field that isn't obvious carries this. One sentence, the real reason, in plain Arabic. A
> form that asks for a tax office number without saying why reads as bureaucracy for its own sake,
> and people guess or give up.

*Go to the documents step. Tap "تصوير بالكاميرا" on any outstanding item.*

> The camera. One tap — not the gallery, the camera. And when the photo is taken it comes back
> **large**, so the applicant can see with their own eyes that the registration number on it is
> legible before they move on. The commonest failure in the paper process is an illegible
> photocopy, and it is discovered three weeks later.

*Go back and show the progress bar at the top.*

> "Step 6 of 7." That count is true. It is computed by the same rule the server uses to decide
> whether the application can be submitted, so the interface cannot tell them they are finished
> when the system disagrees.

---

## 2 · A refusal, enforced (2 minutes)

*Switch to the laptop. Window 1, sign out and in as `delta@osool.test` — or simply open
`/application` and open the Delta Misr draft.*

> This is a real Egyptian firm's application, in Mansoura. They have applied under Category C.
>
> Category C permits contracts up to fifty million pounds. Ministerial Decree 578 of 2025 sets its
> minimum paid-up capital at fifty thousand pounds. This applicant has thirty thousand.

*Open the review step. The refusal is on screen.*

> Read what it says.
>
> *What is blocked:* "This application cannot be submitted."
> *Why:* "Paid-up capital of EGP 30,000 does not meet the minimum for Category C (EGP 50,000) —
> Ministerial Decree 578 of 2025, Article 2."
> *What to do next:* "Either raise the paid-up capital to at least EGP 50,000, or apply under
> Category D, which permits contracts up to EGP 10,000,000."
> *Who to ask:* the Central Administration for Commercial Registrations.
>
> Four parts, in that order, every refusal in this system. Never "invalid input".
>
> Two things about that message matter more than how it reads.
>
> First: **the fifty thousand is not in the software.** It is a row in a configuration table with
> an effective date. When a decree amends it, somebody with the right authority changes the row.
> No developer, no deployment. And a decision taken today stays explainable against today's figures
> after the decree changes them, because the file records which version it was judged under.
>
> Second: **this refusal is on the server.** The old system showed rules like this in the browser.
> Anyone who knew how could bypass it in ten seconds. Here the browser refusing is a courtesy; the
> server refusing is the control.

---

## 3 · The examiner's screen (2 minutes)

*Window 2 — `examiner@osool.test`. Open the queue.*

> This is where officials decide whether they will use the system, so it is the screen we thought
> hardest about.
>
> The queue: what is waiting for me, oldest first. The waiting column turns amber after a week —
> a file that has sat for three weeks should not look like one that arrived this morning.

*Open the Al-Haramain file.*

> The examiner has one job: **does what was submitted match what was supplied?**
>
> So the internal review form — the same form GOEIC prints today, the same sixteen lines — *is*
> the comparison. Each line carries three things: the fact as the applicant declared it, the
> document that answers it, and the tick.

*Click a document name in a row. It appears in the pane beside it.*

> The document appears beside the data. The examiner never navigates away from the thing they are
> comparing. On paper this is a folder open on a desk; on the old system it was a download, another
> tab, and a lost place.
>
> *(scroll to الاستيفاءات)*
>
> And completions. In the paper process this is a free-text box, and it is the most exploitable
> step in the whole workflow — "documents incomplete" is unanswerable and unreviewable. Here every
> completion is a numbered item that names which documented requirement it cites. A completion
> that cites nothing is still allowed, and still recorded as citing nothing, because how often
> that happens is exactly what supervision needs to be able to count.

---

## 4 · Segregation of duties (1 minute)

*Window 3 — `reviewer2@osool.test`. Open the review queue.*

> The reviewer's queue. Note what it says at the top: applications you examined yourself do not
> appear here.
>
> That is not a display filter. The same official cannot examine a file and then approve it — and
> the system enforces that in three independent places: in the queue, in the action, and in the
> database itself as a constraint. Drop any two and it still holds.
>
> This protects the decision. It also protects the officer: nobody can later suggest that one
> person carried a file through alone, because it is arithmetically impossible.

*Open a file and show the examiner's conclusion at the top.*

> The reviewer does not re-read the whole file. They read what the examiner concluded, how many of
> the sixteen lines were actually checked, and — if any required document is still missing — a
> panel that says so before they can approve.

---

## 5 · The trail (1 minute)

*Window 4 — `auditor@osool.test`. Open the audit trail. Then open the Shorouk application's file
and scroll to مسار الطلب.*

> Every hand the file passed through. Named, with a role, to the second.
>
> The applicant submitted. Samia Roushdy entered it in the incoming register under a temporary
> number. She assigned it to Ahmed Abdelrahman. He completed the review form and signed it. Nadia
> Selim — a different person — approved it. Reham Adel recorded the fees and issued the card.
> Ihab Mounir extracted the data. Magdy Anwar filed it.
>
> Eight steps, five people, and the register can say who did each one without asking anybody.
>
> *(switch to the audit trail)*
>
> Underneath it, this. Every event in the system, including **who read a file**, not only who
> changed one. Each row carries a cryptographic fingerprint of the row before it, so altering
> anything in the history breaks the chain and the system says exactly where.
>
> And nothing in this product can be deleted. Not an application, not a document, not an account.
> The database itself refuses it. That is not a policy anyone can be persuaded to waive.

---

## 6 · What becomes possible (1 minute)

*Close the laptop.*

> Everything you have seen is the register doing its own job properly. Here is what it makes
> possible that is impossible today.
>
> Because every approval names its examiner and its reviewer, because every completion names the
> requirement it cites, because every document carries a fingerprint and a timestamp — the
> Authority can ask questions of its own process that currently have no answer:
>
> - Which applications were **approved while a required document was absent**?
> - Where were **completions requested repeatedly and then an approval issued with no new document
>   uploaded**?
> - Is the **same power of attorney** being used across firms with no connection to each other?
> - Is the **same individual** the compliance manager of eleven unrelated brokers?
> - Which files were decided **out of hours**, or in **four minutes**?
>
> None of those is an accusation, and the system will never treat them as one. Nothing here
> automatically rejects, sanctions, or accuses. A signal is triage: it says *look at this*, it
> shows the evidence that produced it, and dismissing it requires a written reason that is itself
> recorded.
>
> That is Phase 4. It is only possible because of what Phase 1 records — and Phase 1 is what you
> have just watched work.
>
> The next phase is the one the public sees: a citizen types a registration number and learns, in
> one screen, whether that broker is genuinely registered, for what, and until when.
>
> That capability does not exist in Egypt today at all.

---

## If something goes wrong on the day

| Symptom | Do this |
|---|---|
| A page is slow the first time | Development mode compiles each route on first visit. Open every screen once before the audience arrives. |
| "Not authorised" | You are in the wrong window. Check the name and role at the bottom of the sidebar. |
| A queue is empty | That role's work has been done. Re-run `npm run seed:phase1` to top the register up. |
| The card will not generate | Chromium renders it. `npx playwright install chromium`. |

**Do not** show the terminal. **Do not** apologise for the data being demonstration data — say so
once, at the start of section 1, and move on.
