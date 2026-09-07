# Demonstrating Osool

What to click, in order, and which account to be while you click it. Everything
here was driven through a browser on 2026-09-07 and is asserted by
`npm run qa:browser` (56 checks).

---

## Before you start

```bash
npm run db:start          # embedded PostgreSQL on 127.0.0.1:5433
npm run dev               # http://localhost:3000
```

Use `npm run dev`, not `npm start`, for a demonstration. In development the
sign-up screen shows the email-confirmation link on the page, so you can open a
new broker account in front of an audience without a mail provider. A production
build withholds that link on purpose — the link is a bearer token for the
account.

If the register is empty, or you want the fourteen worked applications back:

```bash
npm run seed:phase1
```

**Every password below is `DevOnly!Osool2026`.** These accounts are on the
`.test` domain, which RFC 2606 reserves so it can never resolve, and their
password is published in this repository deliberately. They must never exist on
a register that supervises anyone real.

---

## The accounts

### Government

| Email | Role | Lands on | Demonstrates |
|---|---|---|---|
| `clerk@osool.test` | `REGISTRY_CLERK` | `/intake` | Intake, temporary numbers, assignment, the counter's diary |
| `examiner@osool.test` | `EXAMINER` | `/examination` | The examination screen and its field checks |
| `examiner2@osool.test` | `EXAMINER` | `/examination` | A second examiner, so files can be spread |
| `reviewer@osool.test` | `REVIEWER` | `/review` | The decision. Refused any file they examined themselves |
| `reviewer2@osool.test` | `REVIEWER` | `/review` | A second reviewer, so segregation of duties has somewhere to send a file |
| `issuer@osool.test` | `CARD_ISSUER` | `/issuance` | Fees, the printed card, delivery |
| `data@osool.test` | `DATA_MANAGER` | `/records` | Data extraction |
| `files@osool.test` | `FILES_HEAD` | `/archive` | Archiving and retention |
| `auditor@osool.test` | `AUDITOR` | `/audit` | The hash-chained audit trail |
| `aml@osool.test` | `AML_SUPERVISOR` | `/supervision` | Integrity signals |
| `analyst@osool.test` | `ANALYST` | `/supervision` | Signals, refused document content |
| `admin@osool.test` | `SYSTEM_ADMIN` | `/admin/users` | Accounts and roles — **refused all case data** |
| `inspector@osool.test` | `INSPECTOR` | — | **No screen yet.** Signs in and is refused everywhere. See the roadmap. |
| `suspended@osool.test` | `REGISTRY_CLERK` | — | A suspended account, refused on every screen |

### Brokers — one per stage of the workflow

| Email | Their application is at | Use it to show |
|---|---|---|
| `broker@osool.test` | `DRAFT` (empty) | Starting an application from nothing |
| `delta@osool.test` | `DRAFT` (complete) | A refusal: Category C requested on EGP 30,000 capital |
| `nile@osool.test` | `SUBMITTED` | **Booking an appointment** |
| `newcairo@osool.test` | `UNDER_INTAKE` | A file the clerk has just taken in |
| `haramain@osool.test` | `UNDER_EXAMINATION` | A file with the examiner |
| `mohandeseen@osool.test` | `AWAITING_COMPLETION` | Outstanding completion items |
| `heliopolis@osool.test` | `UNDER_REVIEW` | A file awaiting the decision |
| `october@osool.test` | `APPROVED` | Approved, before fees |
| `giza@osool.test` | `AWAITING_PAYMENT` | Fees due; card collection appointment |
| `maadi@osool.test` | `CARD_ISSUED` | The printed card |
| `zamalek@osool.test`, `alex@osool.test`, `shorouk@osool.test` | `ACTIVE` | A live registration in the register |
| `aswan@osool.test` | `REJECTED` | A refused application and its stated reason |

---

## The script

Sixteen steps, about twenty minutes. Each one names the account to be.

### Part one — a broker joins the register

**1. Open the front door.** `http://localhost:3000/en/login`
Point out the Arabic/English switch. Everything that follows works in both.

**2. Open a broker account.** Click **"Open a broker account"**.
Fill the firm (Arabic trade name, governorate, head office) and the owner
(Arabic and English name, email, a password of 12+ characters). Submit.

**3. Confirm the address.** The confirmation names the address and — in
development only — shows the link the Authority would have emailed. Open it.
Say plainly: in production that link is only ever in the email.

**4. Sign in as the new firm** and land on its portal. The firm's own trade name
is in the header. This account did not exist five minutes ago and no
administrator touched it.

**5. Show a real application instead.** Sign out, sign in as
`broker@osool.test`, open the draft. Walk a step or two: the entity data, the
document checklist, the declarations. Upload a scan — it is hashed on receipt,
stored under that hash, and a second upload of the same slot **supersedes**
rather than overwrites.

**6. Show the refusal.** Sign in as `delta@osool.test` and open its application.
Category C on EGP 30,000 of capital is refused, and the refusal says what is
blocked, why, what to do next, and who to ask — with the requirement it comes
from. This is the shape of every refusal in the product.

### Part two — booking the counter

**7. Sign in as `nile@osool.test`.** Open the application, then **Appointment**.

**8. Book it.** The calendar shows every open period with places remaining.
Choose one, give an attendee name and a telephone number, confirm. The screen
answers with **when, where, who is attending, and what to bring**.

**9. Switch to Arabic** on that same screen. Right-to-left, with the date and
time still reading left-to-right inside it.

### Part three — the Authority

**10. Sign in as `clerk@osool.test`.** The intake queue opens with the oldest
file first and the waiting time on every row.

**11. Show that the queue is real.** Look at the footer: it names the true
total. Page to 2, then 10. Set the page size to 200. Then search the queue for a
firm by name.
*(Until this session the queue stopped at fifty rows with no way past — 764 of
814 files were unreachable.)*

**12. Show the counter's diary.** `/appointments`. The booking made in step 8 is
there, with the attendance controls beside it.

**13. Take a file in.** Open a `SUBMITTED` file and give it a temporary number,
then assign it to an examiner.

**14. Follow it through.** Sign in as `examiner@osool.test` → the examination
screen. Then `reviewer@osool.test` → the decision. Point out that a reviewer is
never shown a file they examined themselves: segregation of duties is enforced
in the database, not only in the interface.

### Part four — the register itself

**15. Search the register.** As any officer, open `/register`. Search by Arabic
name, then by registration number. Filter by governorate and by status. Open a
row.

**16. Verify in public.** Sign out completely. Open `/verify` and enter a
registration number. This is what a member of the public sees — one answer about
one number, and nothing that would let anyone enumerate the register.

**Optional, and worth it:** sign in as `auditor@osool.test` and open `/audit`.
Every action in the demonstration you have just given is in the chain, with the
actor, the role, the time and the rule version. Then try `/audit` as
`broker@osool.test` and read the refusal.

---

## Two things to say out loud

**The administrator cannot see case data.** Sign in as `admin@osool.test` and
try to open a document. The refusal reads: *"Administration is not access. The
system administrator manages accounts and does not open case files."* That is
segregation of duties as code, not as policy.

**Nothing is ever deleted.** There is no delete path anywhere in the product,
and the database itself refuses one — a statement-level trigger. Records are
archived, retention-locked, or put under legal hold.

---

## If something goes wrong

**"Too many requests"** — the register rate-limits sign-ins: 40 per five minutes
from one address, 8 per fifteen minutes per account, 5 new accounts per hour.
Wait, or use a different account. The refusal is bilingual and says when to
retry.

**A blank page** — you are running a production build from before 2026-09-07.
Rebuild: `npm run build`.

**The register looks empty** — run `npm run seed:phase1`.
