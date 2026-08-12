# How to demonstrate Osool

**For the person standing in front of the room.** Follow it top to bottom and the
system takes you from an empty application to an issued registration card.

Everything you need is here. You do not need any real document, and you do not
need anyone from the development team.

**Time:** about 20 minutes at a talking pace. Any step can be stopped and picked
up later — nothing is lost.

---

## Before you start

| | |
|---|---|
| **Open** | <https://osool-cyan.vercel.app> |
| **Language** | Arabic is the default. The button in the top bar switches to English and back at any point, including mid-form. |
| **Demo documents** | `docs/demo-documents/` in this repository — 13 PDFs, each watermarked **DEMO / TEST DATA — NOT A REAL GOVERNMENT DOCUMENT**. Copy the folder to the machine you are demonstrating from. |
| **Accounts** | Table below. All are seeded demonstration accounts. |

> **One thing to say out loud at the start.** This is a *regulator's* system. The
> broker is the supervised party, not the customer. Every screen you are about to
> see exists because a government officer has to be able to answer "why was this
> registration granted, by whom, against which rules, on what evidence".

### The accounts

| Step | Sign in as | Password |
|---|---|---|
| 1. The broker | `nile@osool.test` | `DevOnly!Osool2026` |
| 2. Registry clerk | `clerk@osool.test` | `DevOnly!Osool2026` |
| 3. Examiner | `examiner@osool.test` | `DevOnly!Osool2026` |
| 4. Reviewer *(a different person — this matters)* | `reviewer2@osool.test` | `DevOnly!Osool2026` |
| 5. Card issuer | `issuer@osool.test` | `DevOnly!Osool2026` |
| Optional — the auditor | `auditor@osool.test` | `DevOnly!Osool2026` |
| Optional — the administrator | `mahmoud.fawzy@osool.gov.eg` | `MahmoudFawzy@123` |

Sign out from the menu in the **top right**, which also shows who you are signed
in as and in what role. Point at it when you switch — it is how the audience
follows whose screen they are looking at.

---

## Part 1 — The broker applies

### 1.1 Sign in

Go to <https://osool-cyan.vercel.app/login>, sign in as `nile@osool.test`.

You land on **طلباتي / My applications**.

> **Say:** every application this firm has ever filed, and where each one stands.
> The sentence under each one says what is happening to it *now* and what, if
> anything, the broker has to do.

### 1.2 Start the application

Press **ابدأ طلب قيد جديد / Start a new registration application**.

> If this firm already has an unfinished draft, the button opens that one instead
> of making a second. Say so — it is deliberate: a register that cannot delete
> anything must not accumulate empty files.

### 1.3 Step 1 — Capacity (الصفة)

| Field | Enter |
|---|---|
| In what capacity are you applying | **صاحب منشأة فردية / Sole trader** |
| Applicant's name in Arabic | `محمود عبد الرحمن حسن` |
| Applicant's name in Latin script | `Mahmoud Abdelrahman Hassan` |
| National ID number | `28001011201234` |
| Nationality | `مصري` |

> **Open "لماذا نطلب هذا؟"** under the capacity choice. Every field that needs a
> reason has one. **Say:** the national ID is encrypted at rest, and a *keyed
> fingerprint* is stored beside it — which is what lets the system notice that
> the same person is the responsible manager of nine different firms, without
> anybody being able to read the number.

Press **حفظ ومتابعة / Save and continue**.

### 1.4 Step 2 — The firm (المنشأة)

| Field | Enter |
|---|---|
| Establishment type | **شخص طبيعي / Natural person** |
| Legal form | `منشأة فردية` |
| Trade name (Arabic) | `مؤسسة أصول التجريبية للوساطة العقارية` |
| Trade name (Latin) | `Osool Demonstration Real Estate Brokerage` |
| Trade style (Arabic / Latin) | `أصول` / `Osool` |
| Head office address | `١٢ شارع التجربة، المعادي، القاهرة` |
| Governorate | **القاهرة / Cairo** |
| PO box | `11728` |
| Telephone | `0227351234` |
| Email | `demo@osool.test` |
| Commercial register number | `123456` |
| Commercial register office | `القاهرة` |
| Commercial register date | `2022-03-15` |
| Renewal date | `2027-03-15` |
| Tax registration number | `555-123-456` |
| Tax office | `مأمورية ضرائب المعادي` |

> **A demonstration worth doing.** Type `CR-123456` into the commercial register
> number and press save. The form comes back with **"بند واحد يحتاج إلى تصحيح
> قبل الحفظ"**, names the field, links to it, says *"هذا الحقل يقبل الأرقام
> وعلامات الفصل فقط"* — and **everything else you typed is still there**. Then
> correct it to `123456` and save.
>
> **Say:** until this week that refusal happened on the server and was displayed
> nowhere. The applicant saw the form empty itself and nothing else.

### 1.5 Step 3 — Type and category (النوع والفئة)

| Field | Enter |
|---|---|
| Types | tick **سمسار بيع** and **سمسار إيجار** |
| Paid-up capital | `250000` |
| Category | **فئة ج / Category C** |

> **The best 30 seconds in the demonstration.** Before choosing C, choose
> **فئة أ / Category A** and try to continue. The system refuses, in four parts —
> what is blocked, why, what to do instead, who to ask — and **names the decree**:
> «قرار وزاري ٥٧٨ لسنة ٢٠٢٥، المادة ٢».
>
> **Say:** that threshold is not in the code. It is versioned data with an
> effective date, so amending the decree is a configuration change, not a
> deployment — and an application decided last March is still judged against
> March's rules, not today's.

Then set it back to **C** and save.

### 1.6 Step 4 — Contracts (العقود)

| Field | Enter |
|---|---|
| Client's name in Arabic | `شركة النور للاستثمار العقاري — بيانات تجريبية` |
| Client's name in Latin script | `Al-Nour Real Estate Investment (DEMO)` |
| Client's nationality | `مصري` |
| Authenticating body | **الشهر العقاري / Real Estate Publicity** |
| Authentication number | `2026/1234` — *digits and separators only; the hint under the field says so* |
| Valid from → to | `2026-01-01` → `2026-12-31` |
| Capacity acted in | **سمسار بيع / Sale broker** |
| Contract value | `1500000` |
| Description | `بيانات تجريبية — وساطة في بيع وحدة سكنية بمساحة ١٢٠ م٢` |
| Address | `١٢ شارع التجربة، المعادي، القاهرة` |
| Governorate | **القاهرة / Cairo** |

Press **حفظ / Save**. The contract becomes a card. Then **حفظ ومتابعة**.

### 1.7 Step 5 — Documents (المستندات) — 7 uploads

The checklist filters itself: a sole trader sees **7 required items**, and the
power of attorney is marked *"غير مطلوب في حالتك"*.

For each item, press **اختيار ملف / Choose file** and pick the matching PDF from
`docs/demo-documents/`:

| On screen | File |
|---|---|
| وثيقة إثبات الهوية لمقدم الطلب | `DEMO-IDENTITY_DOC_APPLICANT.pdf` |
| مستخرج السجل التجاري ساري | `DEMO-COMMERCIAL_REGISTER_EXTRACT.pdf` |
| البطاقة الضريبية | `DEMO-TAX_REGISTRATION_CARD.pdf` |
| ما يثبت رأس المال المدفوع | `DEMO-PROOF_OF_PAID_UP_CAPITAL.pdf` |
| ما يثبت مقر مزاولة النشاط | `DEMO-PREMISES_PROOF.pdf` |
| صحيفة الحالة الجنائية | `DEMO-CRIMINAL_RECORD_EXTRACT.pdf` |
| وثيقة هوية صاحب المنشأة الفردية | `DEMO-OWNER_IDENTITY_DOC.pdf` |

> **Open "ما هذا المستند ولماذا يُطلب؟"** on any card. Four answers: what it is,
> why the Authority needs it, what to photograph, and what happens if you have
> not got one. Above it, the accepted formats and the size ceiling.
>
> **Say:** this is what stops a broker driving to a GOEIC branch to ask what a
> field means. And if you are on a phone, **تصوير بالكاميرا** opens the rear
> camera directly — one tap, no gallery.

The counter at the top reads **تم رفع ٧ من ٧**.

### 1.8 Step 6 — Declarations (الإقرارات)

Fifteen declarations. Affirm each one.

> **Say:** each is recorded separately, with its own timestamp and its own IP, and
> the wording is copied onto the record *as it was asserted* — so the register can
> always show what this applicant actually signed, not what the rule set says
> today.

### 1.9 Step 7 — Review and submit (المراجعة والإرسال)

Read the summary, then press **تقديم الطلب / Submit**.

> **Say:** the completeness check runs again here, on the server, against a fresh
> read. The review screen already told the applicant the same answer — that was a
> courtesy. This is the control. A submission arriving by `curl` with no documents
> meets the same wall.

**The status becomes مُقدَّم / Submitted.**

> **The honest bit, and worth saying:** there is no reference number yet. The card
> says *"لم يُخصَّص بعد"*. The Authority allocates the number when a clerk books
> the file in — which is how the paper process works. The broker can always find
> the application again from **طلباتي**.

Sign out.

---

## Part 2 — The government

### 2.1 Registry clerk — book it in

Sign in as `clerk@osool.test` → **الوارد / Intake**.

The new application is in the queue. Open it.

1. **Page count:** `24` → book the file in.
   **A temporary number is allocated: `T-2026/00xx`.** Read it out. This is what
   the broker quotes from now on.
2. **Assign an examiner:** choose **أحمد عبد الرحمن سيد** (`examiner@osool.test`).

Sign out.

### 2.2 Examiner — find something wrong

Sign in as `examiner@osool.test` → **الفحص / Examination** → open the file.

The screen puts the document *beside* the data — the register extract on one
side, what the applicant typed on the other.

**Raise a completion (استيفاء):**

- Checklist item: **ما يثبت مقر مزاولة النشاط**
- In Arabic: `صورة عقد الإيجار غير واضحة — يرجى إعادة رفعها بجودة أعلى.`
- Press **إضافة**, then **طلب الاستيفاءات**.

**Status becomes بانتظار الاستيفاء / Awaiting completion.**

> **Say:** the completion cites a checklist item. That is not decoration — the
> platform counts completions requested with *no* basis in the documented
> requirements, because a completion invented to delay a file is a process-
> integrity problem, and it is only countable because the citation exists.

Sign out.

### 2.3 Broker — answer it

Sign in as `nile@osool.test`.

The application card now says the Authority has asked for something, and the file
is editable again. Open it, go to **المستندات**, and press **استبدال الملف** on
the premises item — upload `DEMO-PREMISES_PROOF.pdf` again.

> **Say:** the old file is not overwritten. It is **superseded** — version 1 stays
> exactly where it is, version 2 points at it. Nothing in this system is ever
> deleted, and the examiner can always see what was originally filed.

Go to **المراجعة والإرسال** and resubmit. **Status returns to قيد الفحص.**

Sign out.

### 2.4 Examiner — sign and refer

Sign in as `examiner@osool.test`, open the file.

Work down the sixteen verification lines, ticking each. Then:

| Field | Enter |
|---|---|
| Originals / copies | `1` / `2` |
| Nature of brokerage | **بيع** and **إيجار** |
| Proposed validity | `2026-09-01` → `2029-08-31` |
| Recommendation | **التوصية بالموافقة / Recommend approval** |
| Note | `بيانات تجريبية — استُوفيت جميع البنود.` |

Save, then press **الإحالة للمراجعة / Send to review**.

**Status becomes قيد المراجعة / Under review.**

> **Try this, deliberately.** While still signed in as the examiner, go to
> `/review`. You are refused. The person who examined a file **cannot** decide it —
> enforced in the guard, in the transition, and by a CHECK constraint in the
> database itself. Three independent places, because this is the control the
> whole process exists to provide.

Sign out.

### 2.5 Reviewer — decide

Sign in as **`reviewer2@osool.test`** — *a different person*. Say so.

**المراجعة / Review** → open the file → **الموافقة / Approve**, with a note:
`بيانات تجريبية — الطلب مستوفٍ للشروط.`

**Status becomes موافق عليه / Approved.**

Sign out.

### 2.6 Card issuer — fees, card, delivery

Sign in as `issuer@osool.test` → **الرسوم وإصدار الكارنيه** → open the file.

1. **Fees:** payment method **نقداً / Cash**, receipt number `2026/00042`, and an
   amount against each mandatory heading (`100`, `200`, `50`, `25`, `10` will do).
   Record them.
   > **Say:** the amounts are typed in because the legal reference states no
   > tariff for any of the eight headings, and inventing one would print invented
   > figures on a receipt. The notice on the screen says exactly that.
2. **Issue the card.** A permanent registration number is allocated —
   `2026/00xx` — and a PDF card is generated, in Arabic, correctly shaped.
3. **Delivery:** recipient `محمود عبد الرحمن حسن`, tick both acknowledgements.

**Status becomes قيد ساري / Active.**

Sign out.

---

## Part 3 — The result

### 3.1 The broker

Sign in as `nile@osool.test` → **قيدي / My registration**.

The registration number is the largest thing on the screen — because REQ-REG-061
requires the registrant to print it on everything they issue. Below it, the
validity dates, the category, the types, and **تحميل الكارنيه** to download the
card.

### 3.2 Anyone at all

Sign out completely. Go to **/verify** and look the registration number up.

> **Say:** this is the public register. It confirms a live registration and
> nothing else — no national ID, no address, no case file. A public lookup that
> leaked the broker's identity documents would be worse than no lookup.

### 3.3 The auditor *(optional, and the strongest thing you can show)*

Sign in as `auditor@osool.test` → **سجل التدقيق / Audit trail**.

Every act in the demonstration you just gave is there: who, in what role, from
what state to what state, at what time, from what IP, under which version of the
rules. **Reads are recorded too, not only writes.**

> **Say:** the trail is hash-chained — each row carries a hash over its own
> contents *and its predecessor's*. Altering any historical row breaks every hash
> after it. It is verified independently with `npm run audit:verify`; the last run
> recomputed **735 events with zero mismatches**.

---

## If something goes wrong mid-demonstration

| What you see | What to do |
|---|---|
| A form refuses and names fields | That is the system working. Read the refusal aloud — it is some of the best copy in the product — and fix the field. |
| A button spins and nothing happens | Wait. Serverless cold starts take a few seconds; the button stays busy until the next screen is actually there. |
| "لا يمكن تعديل هذا الطلب الآن" | The file is with the Authority. That is correct — data is frozen during examination. |
| You are refused a screen | You are signed in as the wrong role. Check the name and role in the top-right menu. |
| A step looks already done | You are probably reusing an application from an earlier run. Start a new one, or use a different broker account. |

**Other broker accounts, if you want a clean start:** `giza@`, `maadi@`,
`zamalek@`, `october@`, `shorouk@`, `heliopolis@`, `newcairo@`, `delta@`,
`aswan@`, `haramain@`, `mohandeseen@` — all `@osool.test`, all with the same
password.

---

## The one thing not to claim

If anyone asks whether this could go live on Monday: **no**, and the reasons are
in `docs/QA_BUSINESS_REPORT.md`. The two that matter most are that brokers
cannot obtain an account without the Authority creating one, and that the system
sends no notifications — a broker learns about a completion request only by
logging in and looking.

It is a working demonstration of a proposal, and a good one. Say that, and the
room will trust the rest of it.
