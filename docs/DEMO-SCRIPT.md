# Demonstrating Osool

What to click, in order, and which account to be while you click it.

Everything in this file was driven through a real browser and is asserted by
`npm run qa:browser`. Nothing here is described from the code; if a step is
listed, it was watched happening.

---

## Before you start

```bash
npm run db:start          # embedded PostgreSQL on 127.0.0.1:5433 — leave it running
npm run build             # once; takes a few minutes
npm start                 # http://localhost:3000 — leave this terminal visible
```

**Use `npm start`, not `npm run dev`, to present.** This is the opposite of the
advice this file used to give, and the reason is measured rather than assumed:
on this machine `next dev` compiles each screen the first time it is opened, and
those compiles run to **50–160 seconds each**. Mid-demonstration that is
indistinguishable from a hung application. A production build has nothing left
to compile and every screen opens at once.

**Keep the `npm start` terminal where you can see it.** This is the one thing a
production build does differently, and it is worth knowing before you are in
front of people: in development the sign-up screen prints the account activation
link straight onto the page. A production build **withholds it on purpose** —
that link is a bearer token for the account, and putting it on a page would hand
the account to anyone looking at the screen.

The link is not lost. It is printed in that terminal, in a bordered box:

```
┌──────────────────────────────────────────────────────────┐
│ EMAIL — development driver. In production this is sent by Resend.
├──────────────────────────────────────────────────────────┤
│ To      : the address the firm just registered
│ Subject : Confirm your Osool account
├──────────────────────────────────────────────────────────┤
│ … https://…/verify-email?token=…
└──────────────────────────────────────────────────────────┘
```

Show that box when you reach step 4. It is a better moment than the on-page link
was: *this is the email the Authority would have sent, and in production it only
ever exists in the firm's inbox.*

If the register is empty, or you want the fourteen worked applications back:

```bash
npm run seed:phase1
```

---

## The accounts

**Every password below is `DevOnly!Osool2026`.**

These accounts are on the `.test` domain, which RFC 2606 reserves so that it can
never resolve, and their password is published in this repository deliberately —
it is what makes the product openable. **They must never exist on a register
that supervises anyone real.** Nothing here is a production credential, and none
of them will open a deployed register.

Sign in at `http://localhost:3000/en/login` — or `/ar/login` for Arabic, which
is the canonical locale.

**Every government account lands on `/en/dashboard`, not on its own screen.**
Checked this session by signing each one in. The dashboard is role-aware: it
greets the holder by name and role, offers *"What you can do now"*, and carries
only the links that role is allowed — the register, the appointment diary, the
audit trail. The screen named in the table is where that role's actual work is,
one click from the dashboard or by typing the address.

Two things that look like faults and are not. A clerk's dashboard can say
*"Your queue is clear"* while `/en/intake` holds 814 files — the dashboard counts
work **assigned to that person**, and the intake queue is everything waiting to
be taken in. And brokers get no dashboard at all: they land straight on
`/en/application`, which is their whole portal.

### Government

| Email | Password | Role | Their screen | What it demonstrates |
|---|---|---|---|---|
| `clerk@osool.test` | `DevOnly!Osool2026` | `REGISTRY_CLERK` | `/en/intake` | Intake, temporary numbers, assignment, and the counter's diary |
| `examiner@osool.test` | `DevOnly!Osool2026` | `EXAMINER` | `/en/examination` | The examination screen and its field checks |
| `examiner2@osool.test` | `DevOnly!Osool2026` | `EXAMINER` | `/en/examination` | A second examiner, so files can be spread |
| `reviewer@osool.test` | `DevOnly!Osool2026` | `REVIEWER` | `/en/review` | The decision. Refused any file they examined themselves |
| `reviewer2@osool.test` | `DevOnly!Osool2026` | `REVIEWER` | `/en/review` | A second reviewer, so segregation of duties has somewhere to send a file |
| `issuer@osool.test` | `DevOnly!Osool2026` | `CARD_ISSUER` | `/en/issuance` | Fees, the registration number, the printed card, the handover |
| `data@osool.test` | `DevOnly!Osool2026` | `DATA_MANAGER` | `/en/records` | Data extraction |
| `files@osool.test` | `DevOnly!Osool2026` | `FILES_HEAD` | `/en/archive` | Archiving and retention |
| `auditor@osool.test` | `DevOnly!Osool2026` | `AUDITOR` | `/en/audit` | The hash-chained audit trail |
| `aml@osool.test` | `DevOnly!Osool2026` | `AML_SUPERVISOR` | `/en/supervision` | Integrity signals and their evidence |
| `analyst@osool.test` | `DevOnly!Osool2026` | `ANALYST` | `/en/supervision` | Signals, with document content refused |
| `admin@osool.test` | `DevOnly!Osool2026` | `SYSTEM_ADMIN` | `/en/admin/users` | Accounts and roles — **refused all case data** |
| `inspector@osool.test` | `DevOnly!Osool2026` | `INSPECTOR` | — | **No screen yet.** Signs in, refused everywhere, with a proper four-part refusal. See the roadmap |
| `suspended@osool.test` | `DevOnly!Osool2026` | `REGISTRY_CLERK` | — | A suspended account: signs in, refused on every screen |

### Brokers — one per stage of the workflow

Every one of these is `BROKER_OWNER`, password `DevOnly!Osool2026`, signing in
at the same address and landing on `/en/application` — its own portal.

| Email | Firm | Its application is at | Use it to show |
|---|---|---|---|
| `broker@osool.test` | Al-Asala Real Estate Brokerage | `DRAFT` (empty) | Starting an application from nothing |
| `delta@osool.test` | Delta Misr Real Estate Brokerage | `DRAFT` (complete) | A refusal: Category C requested on EGP 30,000 of capital |
| `nile@osool.test` | Nile Real Estate Marketing | `SUBMITTED` | **Booking an appointment** |
| `newcairo@osool.test` | New Cairo Real Estate Investment | `UNDER_INTAKE` | A file the clerk has just taken in |
| `haramain@osool.test` | Al-Haramain Property Marketing | `UNDER_EXAMINATION` | A file with the examiner |
| `mohandeseen@osool.test` | Al-Mohandeseen Properties | `AWAITING_COMPLETION` | Outstanding completion items |
| `heliopolis@osool.test` | Heliopolis Real Estate Brokerage | `UNDER_REVIEW` | A file awaiting the decision |
| `october@osool.test` | October Property Marketing | `APPROVED` | Approved, before fees |
| `giza@osool.test` | Giza Property Marketing | `AWAITING_PAYMENT` | Fees due, and the card-collection appointment |
| `maadi@osool.test` | Maadi Real Estate Brokerage | `CARD_ISSUED` — registration `2026/0001` | The printed card |
| `zamalek@osool.test` | Zamalek Brokerage and Property | `ACTIVE` — `2026/0003` | A live registration in the register |
| `alex@osool.test` | Alexandria Investment and Property | `ACTIVE` — `2026/0004` | A live registration in the register |
| `shorouk@osool.test` | El Shorouk Property Marketing | `ACTIVE` — `2026/0002` | A live registration in the register |
| `aswan@osool.test` | Aswan Property Services Office | `REJECTED` | A refused application and its stated reason |

### What each role is for, in plain words

| Role | It exists to |
|---|---|
| **Registry clerk** | Stand at the counter. Receive an application, give it a temporary number, check it is complete enough to proceed, assign it to an examiner, and run the appointment diary |
| **Examiner** | Read one file properly. Check every field and document against the rules in force on the day, ask the firm for what is missing, and recommend — never decide |
| **Reviewer** | Be the second pair of eyes. Take the examiner's recommendation and make the decision. **Never the same person who examined the file** — enforced in the database, not just the interface |
| **Card issuer** | Handle what happens after approval: the fee, the registration number, the printed card, and the handover |
| **Data manager** | Extract and correct register data — the records side, not the case side |
| **Files head** | Archive, retention, and legal hold. The custodian of what the register must keep and for how long |
| **Auditor** | Read the hash-chained trail of everything anyone did. Reads only; an auditor changes nothing |
| **AML supervisor** | See the integrity signals and the evidence behind them. Signals inform; they never decide, and dismissing one requires a written reason |
| **Analyst** | The same signals, with document content withheld |
| **Inspector** | Field inspection. **Has no screen yet** — the role exists and is deliberately refused everywhere until the regulation says what it may see |
| **System administrator** | Manage accounts and roles, and **see no case data at all**. Administration is not access |
| **Broker owner** | The supervised side: apply, upload, book a counter appointment, and watch the file move |

---

## How long it runs, and what to drop

Six parts, **18 minutes** at a normal pace with the routes warmed. The timings
below are what the walkthrough actually takes, not a target.

| Part | What it shows | Minutes |
|---|---|---|
| 1 | A firm opens its own account | 4 |
| 2 | An application, an upload, and a refusal | 4 |
| 3 | Booking the counter | 3 |
| 4 | The Authority — clerk, examiner, reviewer, issuer | 4 |
| 5 | The register and the public verification | 2 |
| 6 | Arabic | 1 |

**If you are cut to ten minutes,** keep Parts 1, 4 and 6 and say the rest.
Those three are the argument: a firm can open its own account without an
official, a file moves between four officials who cannot substitute for one
another, and the whole thing is Arabic first. Parts 2, 3 and 5 are evidence that
the middle is real — worth showing when there is time, and describable when
there is not.

**Do not skip step 2** (the password control) even when short. It is eight
seconds and it is the first thing anybody in the room will try themselves.

**Have two browser windows open before you start** — one signed in as the broker
and one for the officials. Switching account is the slowest thing in the script,
and doing it six times in front of an audience is most of what makes a
demonstration drag.

---

# The script

Six parts. Each step names the account to be, the address to open, and what
should happen. Someone who has never seen the code can read this aloud.

---

## PART 1 — A firm opens its own account

**Account:** none yet. **Start at:** `http://localhost:3000/en/login`

1. **Open the front door.** Point out the Arabic/English switch in the corner.
   Everything that follows works in both.

2. **Show the password control.** Type anything into **Password** and click the
   eye at the end of the field. The password becomes readable; click again and
   it is masked. It is masked by default, it sits on the correct side of the
   field in both languages, and it is reachable from the keyboard — Tab from the
   password field, then Enter.

3. **Click "Open a broker account".** Fill in the firm — Arabic trade name,
   governorate, head office address — and the owner: Arabic and English name, an
   email address, and a password of at least twelve characters. The same eye
   control is on this screen.

4. **Submit.** The confirmation names the address it was sent to — and stops
   there. The activation link is **not** on the page, deliberately: it is a
   bearer token for the account, and a page that showed it would hand the
   account to anyone looking at the screen. Say that out loud; it is the point.

5. **Show the email instead.** Switch to the terminal running `npm start`. The
   whole message is printed there in a bordered box, activation link included —
   the `console` mail driver standing in for Resend. *This is what the Authority
   would have sent, and in production it only ever exists in the firm's inbox.*

6. **Copy the link, open it, set the password, and sign in.** The firm's own
   trade name is in the header. *This account did not exist five minutes ago and
   no administrator touched it.*

---

## PART 2 — An application

**Accounts:** `broker@osool.test`, then `delta@osool.test`

7. **Sign in as `broker@osool.test`** and open the draft application.

8. **Walk two or three steps.** The entity data, the document checklist, the
   declarations. Everything saves as you go.

9. **Upload a document.** It is hashed on receipt and stored under that hash. A
   second upload into the same slot **supersedes** the first rather than
   overwriting it — both are still there, and the trail says which replaced
   which.

10. **Submit it,** and show the status on the portal.

11. **Now the refusal.** Sign in as `delta@osool.test` and open its application.
    Category C on EGP 30,000 of paid-up capital is refused, and the refusal says
    **what is blocked, why, what to do next, and who to ask** — naming the
    requirement it comes from. That is the shape of every refusal in the
    product. There are no bare errors.

---

## PART 3 — Booking the counter

**Account:** `nile@osool.test`

12. **Sign in and open the application,** then **Appointment**.

13. **Read the calendar.** Every open period is listed with **places left**, so a
    nearly-full morning is distinguishable from an empty one. Periods that are
    full or closed are shown and cannot be chosen.

14. **Book one.** Choose a time, give an attendee name and a telephone number,
    and confirm.

15. **Read the confirmation back.** It states **when, where, who is attending,
    and what to bring**.

16. **Try to book a second.** You cannot — the picker is replaced by the live
    booking. One live appointment per application.

17. **Cancel it,** giving a reason. The place goes back into the pool and the
    picker returns. The reason is recorded; cancelling is not a penalty and the
    copy does not imply one.

*(If you cancel during the demonstration, book it again — step 19 looks for it
in the Authority's diary.)*

---

## PART 4 — The Authority

**Accounts:** `clerk@osool.test`, then `examiner@osool.test`, then
`reviewer@osool.test`, then `issuer@osool.test`

18. **Sign in as `clerk@osool.test`.** You land on the **dashboard**, which
    greets the clerk by name and role — not on the queue. Now open
    **`/en/intake`**, or the queue link on the dashboard. It opens with the
    oldest file first and the waiting time on every row.
    *If the dashboard says "Your queue is clear", that is correct and not a
    fault: it counts work assigned to this person. The intake queue is
    everything waiting to be taken in.*

19. **Show that the queue is real.** The footer names the true total — 814 files.
    Page to 2, then to 10, then to the last page. Set the page size to 200. Then
    search the queue for a firm by name.
    *Until recently this queue stopped at fifty rows with no way past, and 764 of
    those 814 files could not be reached from the interface at all.*

20. **Show the counter's diary.** `/en/appointments`. The booking from Part 3 is
    there, on its day, with the attendance controls beside it. Use the previous
    and next day links.

21. **Take a file in.** Open a `SUBMITTED` file, give it a temporary number, and
    assign it to an examiner.

22. **Follow it through.** Sign in as `examiner@osool.test` — the examination
    screen, field by field. Then `reviewer@osool.test` — the decision.
    **A reviewer is never shown a file they examined themselves.** That is
    enforced in the database, not only in the interface.

23. **Issue the card.** `issuer@osool.test` → `/en/issuance`: fees, the registration
    number, the card, the handover.

---

## PART 5 — The register, and the public

**Accounts:** any officer, then none at all

24. **Open `/en/register`.** Search by Arabic name. Search by the Latin name. Search
    by registration number — try `2026/0003`. Filter by status, and by
    governorate. Page through the results. Open a row.

25. **Sign out completely.** Open `/en/verify` and enter a registration number. This
    is what a member of the public sees: **one answer about one number**, and
    nothing that would let anybody enumerate the register or harvest it.

26. **Optional, and worth it.** Sign in as `auditor@osool.test` and open
    `/en/audit`. Every action in the demonstration you have just given is in the
    chain — the actor, their role, the time, and the rule version in force. Then
    open `/en/audit` as `broker@osool.test` and read the refusal.

---

## PART 6 — Arabic

Arabic is the canonical language of this register. English is a full mirror of
it, not a courtesy.

27. **Switch to Arabic** using the control in the header. The whole interface
    mirrors: the navigation moves to the right, the tables reverse, and the icons
    that mean "next" and "previous" swap.

28. **Repeat one flow you have already shown** — the appointment screen is the
    best one. Note that the date, the time and the registration number still read
    left to right inside the Arabic, because a reference number reversed is a
    different number.

29. **Show the password control again, in Arabic.** The eye is now at the *left*
    end of the field, and its spoken label is Arabic.

30. **Show a refusal in Arabic.** `delta@osool.test`, the same Category C refusal
    from Part 2. All four parts are there.

---

## Two things to say out loud

**The administrator cannot see case data.** Sign in as `admin@osool.test` and try
to open a document. The refusal reads: *"Administration is not access. The system
administrator manages accounts and does not open case files."* That is
segregation of duties as code, not as policy.

**Nothing is ever deleted.** There is no delete path anywhere in the product, and
the database itself refuses one — a statement-level trigger that raises SQLSTATE
`23001` with a four-part explanation. Records are archived, retention-locked, or
put under legal hold.

---

## If something goes wrong

**The button seems stuck on "Checking…"** — it is not, and the label tells you
which wait you are in. *"Checking…"* means the password is still being verified;
it changes to *"Opening your dashboard…"* the moment the password is accepted.
If the second one lasts more than a second or two you are on `npm run dev` and
the screen is being compiled — stop, and present from `npm start` instead (see
the top of this file).

**"Too many requests"** — the register rate-limits sign-ins: 40 per five minutes
from one address, **8 per fifteen minutes per account**, and 5 new accounts per
hour. A refused attempt spends budget too. Wait, or use one of the other
accounts. The refusal is bilingual and says when to retry.

**A blank page** — you built while a development server was also running; the
two fight over `.next`. Stop everything, `rm -rf .next`, and `npm run build`
again. This is worth doing once before the day rather than discovering it on
the day.

**The register looks empty** — run `npm run seed:phase1`.

**The database will not start** — check that nothing else holds port 5433, and
never blanket-kill Node on this machine: the embedded PostgreSQL is itself a Node
process, and killing every Node process takes the database down with it. The data
is safe on disk in `.postgres/`; `npm run db:start` brings it back.
