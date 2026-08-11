# Osool — User Guide

Plain-language guide to the digital Real Estate Brokers Register.
**Production:** https://osool-cyan.vercel.app · Arabic is the default; add `/en` for English.

This guide describes what the system does **today**, on the deployed demonstration. Where something
is not built, it says so rather than pretending.

---

## Before you start — two things everyone needs to know

1. **The system sends no email.** No confirmations, no "your application was approved", no password
   reset. Everything is seen by signing in and looking. This is a deliberate demonstration setting,
   but it shapes how you must run any walkthrough.
2. **There is no sign-up page.** Accounts are created for you. A broker cannot register themselves
   on the deployed system today.

---

## 1. Broker / الوسيط

### How to sign in

Go to https://osool-cyan.vercel.app/login and enter your email and password. That is the only
sign-in page — `/sign-in` does not exist. After signing in you land on **طلباتي** (`/application`).

There is no "forgot password" screen. If you lose your password, the Authority's administrator must
help you.

### How to start an application

Press **«ابدأ طلب قيد جديد»**.

> **Note:** if you already have an unfinished application, this button quietly opens *that one*
> instead of creating a new one. You will not be told. This is intended (one application at a time)
> but the label is misleading.

### The seven steps

| # | Step | What it asks |
|---|---|---|
| 1 | **الصفة** | In what capacity you apply — sole trader, chairman, responsible manager, general partner, or attorney — plus your name and national ID |
| 2 | **المنشأة** | The firm: trade name, address, governorate, phone, commercial register, tax registration |
| 3 | **النوع والفئة** | Which brokerage types, your paid-up capital, and which registration category |
| 4 | **العقود** | Your brokerage contracts — client, notarisation, dates, project |
| 5 | **المستندات** | Upload the required documents |
| 6 | **الإقرارات** | 15 binding declarations |
| 7 | **المراجعة والإرسال** | Check everything, then send |

Each step saves when you press **«حفظ ومتابعة»**. You can leave and come back.

> **Important:** an individual step will accept a value that the final submission later refuses.
> For example you can *select* category ب with capital below its floor at step 3; you are stopped at
> step 7 with an explanation. Do not assume a saved step means an acceptable application.

### Which category can I choose?

Set by ministerial decree and shown live as you type your capital:

| Category | Contract value | Minimum paid-up capital |
|---|---|---|
| فئة أ | No maximum | 1,000,000 EGP |
| فئة ب | Up to 100,000,000 EGP | 500,000 EGP |
| فئة ج | Up to 50,000,000 EGP | 50,000 EGP |
| فئة د | Up to 10,000,000 EGP | 20,000 EGP |

Choose one your capital supports. If you do not, submission is refused with the decree named
(قرار وزاري ٥٧٨ لسنة ٢٠٢٥، المادة ٢) and told to either raise your capital or apply in the lower
category.

### What documents are required

The list adapts to your legal form. **A sole trader (منشأة فردية) must upload 7 items:**

| Document | Accepted | Max advertised |
|---|---|---|
| وثيقة إثبات الهوية لمقدم الطلب | JPEG, PNG, HEIC, PDF | 10 MB |
| مستخرج السجل التجاري ساري | JPEG, PNG, HEIC, PDF | 10 MB |
| البطاقة الضريبية | JPEG, PNG, HEIC, PDF | 10 MB |
| ما يثبت رأس المال المدفوع | PDF, JPEG, PNG | 10 MB |
| ما يثبت مقر مزاولة النشاط | PDF, JPEG, PNG | 10 MB |
| صحيفة الحالة الجنائية | PDF, JPEG, PNG | 10 MB |
| وثيقة هوية صاحب المنشأة الفردية | PDF, JPEG, PNG | 10 MB |

التوكيل الرسمي appears but is marked **«غير مطلوب في حالتك»** unless you apply through an attorney.

A company (شخص اعتباري) is asked instead for the articles of association, beneficial-owner identity
documents, representation authorisation, signature specimens and, where relevant, the preliminary
contract — those carry a 25 MB advertised limit.

> ### ⚠ The real size limit is about 4.5 MB, not 10 or 25
> Anything larger fails with a bare English error — *Request Entity Too Large* — with no Arabic and
> no guidance. A photo from a modern phone often exceeds this. **Until it is fixed, keep uploads
> under 4 MB.** Use your phone's "actual size / medium" setting, or scan to PDF.

Each item offers **«تصوير بالكاميرا»** (camera) or **«اختيار ملف»** (choose a file).

If you upload the wrong type you get a clear four-part refusal — what failed, why, what to do next,
and whom to ask. Replacing a document creates **version 2**; the old one is kept, never deleted.

### The declarations

15 items in three groups: eligibility conditions, continuing obligations after registration, and
declarations that your information is true. Item 10 asks you to choose whether you work for
government. Each is timestamped when you accept it. They are legally binding.

### Submitting, and your reference number

Press **«إرسال الطلب إلى الهيئة»** at step 7.

> **You will not receive a reference number when you submit.** Your card will read
> **«رقم الطلب — لم يُخصّص بعد»**. The number (format `T-2026/0013`) is allocated only when a
> registry clerk books your file in, and nothing tells you when that happens. Until then you have
> nothing to quote. Sign in and check.

### How to come back to your application

Sign in and go to **`/application`**. Your application is listed with its reference, status and last
update. Press **«فتح الطلب»**. Verified: signing out and back in finds the same application.

### Responding to a request for completion (استيفاء)

If an examiner needs something more, your card shows **«مطلوب منك استيفاء ١ بنداً»** and the status
becomes **«بانتظار الاستيفاء»**. **Nothing notifies you — you must check.**

Open the application. At the top of step 7 you will see **«استيفاءات مطلوبة من الهيئة»** with the
examiner's exact wording. Editing is re-enabled. Fix what was asked — usually by replacing a
document — then press **«إعادة إرسال الطلب بعد الاستيفاء»**.

### How do I know if I am approved or refused?

By signing in and reading the status. Nothing is sent to you.

| Status shown | Meaning |
|---|---|
| مسودة | Draft, not yet sent |
| مُقدَّم | Submitted, waiting to be booked in |
| قيد القيد الوارد | Being booked into the incoming register |
| قيد الفحص | With an examiner |
| بانتظار الاستيفاء | **Waiting for you** to supply something |
| قيد المراجعة | With a reviewer for decision |
| موافق عليه | Approved |
| بانتظار السداد | Fees stage (this does *not* mean you owe money online) |
| صدرت البطاقة | Card issued |
| نشط | Registered and active |
| لم يُقبل | Refused |
| مسحوب | Withdrawn |

A refusal is final in the current build — there is no appeal or re-open route.

### Getting the card

Once approved, the Authority records the fees, issues the card and marks it delivered. Your
registration lives at **`/registration`** — but note there is currently **no link to it anywhere in
the application**; you must type the URL.

---

## 2. Registry clerk / كاتب القيد — `clerk@osool.test`

You are the front door.

1. Sign in; you land on **لوحة العمل**.
   > Your dashboard may say **«قائمتك خالية الآن»** even when files are waiting. Do not trust it —
   > open `/intake` directly.
2. **القيد الوارد** (`/intake`) lists submitted applications.
3. Open a file, enter **عدد الأوراق المستلمة** (the number of sheets received), and press
   **«قيد الطلب وتخصيص رقم مؤقت»**. This allocates the temporary number, e.g. `T-2026/0013`.
4. Then choose an examiner and press **«إحالة إلى الفحص»**. The screen reminds you that the
   assignment is recorded in your name and that examiners do not choose their own files.

**You cannot:** examine, decide, or reassign a file once assigned (there is no reassignment at all —
choose carefully).

---

## 3. Examiner / الفاحص — `examiner@osool.test`

1. **الفحص** (`/examination`) lists the files assigned to you.
2. Open one. The screen puts the **internal review form** beside the applicant's data, and pairs
   each line with the document that evidences it — trade name against the commercial register, paid
   capital against the capital proof, and so on.
3. Tick each of the 16 lines as you satisfy yourself, and record عدد الأصول / عدد الصور.
   > **The system will let you sign with none of them ticked.** Only the recommendation is enforced.
   > The verification is the control — do it properly.
4. Enter the proposed registration validity dates, choose **التوصية** (approve or refuse), add your
   notes, and press **«حفظ نموذج المراجعة»**.
   > Save *before* you sign. Signing first discards unsaved entries.
5. Press **«التوقيع وإحالة الطلب إلى المراجعة»**. If the form is incomplete you are refused, citing
   GOEIC form CR-CA-QR-31.

### Requesting a completion (استيفاء)

In **الاستيفاءات**, choose the checklist item, write what the applicant must do in Arabic (and
optionally English), press **«إضافة بند استيفاء»**, then **«إرسال الاستيفاءات إلى مقدّم الطلب»**.

Each request **must cite a specific checklist item** — a free-text demand is refused by design.

> **Two things to know.** The applicant is not notified; and while the file is out with them it
> disappears from every government queue, including yours. Keep your own note of what you have sent
> out until this is fixed.

**You cannot:** review or decide a file you examined, or reach issuance.

---

## 4. Reviewer / المراجع — `reviewer2@osool.test`

1. **المراجعة** (`/review`) lists files an examiner has signed and referred.
2. Open one. You see **«ما انتهى إليه الفاحص»** — the examiner's name, recommendation, verified
   count, proposed validity, sheet counts, notes — plus every completion raised and whether it was
   satisfied, and the full case file beneath.
3. Choose **الموافقة على القيد** or **رفض الطلب**, add your note, and submit.

**You cannot:** examine, act on a file you examined yourself (the system enforces this in the
database, not just the interface), or reach issuance. You *can* read the audit trail.

> The reviewer has only two options. There is no "send back to the examiner", so a weak examination
> forces you to approve or refuse rather than correct.

---

## 5. Card issuer / مسؤول الإصدار — `issuer@osool.test`

Handles `/issuance` after approval: record fees → issue card → deliver, moving the file to **نشط**.

> Honest note: these three transitions were **not** verified end to end during the audit. The screens
> exist and are correctly role-gated. Test this yourself before demonstrating it.

Fee amounts are typed freely — there is no published tariff in the system yet.

---

## 6. Auditor / المدقق — `auditor@osool.test`

**سجل التدقيق** (`/audit`) shows every event: who acted, in what role, on what, when, from which
state to which, and why.

The trail is **append-only and hash-chained** — each entry is cryptographically linked to the one
before, so tampering is detectable. During this audit all 277 entries were independently recomputed
with zero breaks.

It records **reading as well as writing** — viewing a document, opening a case file, and viewing the
audit trail itself are all events.

**You cannot** change anything, anywhere. That is the point.

---

## 7. System administrator / مسؤول النظام — `mahmoud.fawzy@osool.gov.eg`

**Can:** create government accounts, assign their roles, suspend them, and view the account list at
`/admin/users`. When an account is created, the activation link is shown **once** on screen — copy
it immediately, because no email is sent and it cannot be recovered.

**Cannot:** see any case data whatsoever. Not applications, not documents, not even the audit trail.
Every case screen refuses.

**Is this right?** Yes. In a regulator's system, whoever controls accounts must not also be able to
read or influence cases — otherwise the person who can grant themselves any role can also quietly
read or change any file, and the audit trail is worth less because the administrator is above it.

**But there is a gap.** No one can reassign a stuck file, no one can see the register as a whole,
and no one can answer "how many applications are stuck and where". The answer is **not** to give the
administrator case access. It is a **third role — `REGISTRY_SUPERVISOR` (رئيس قسم القيد)** — that can
reassign, return a file to examination and reinstate a withdrawal, each with a written reason, and
can see everything in flight, but cannot decide an application or create accounts.

Recommendation: keep the administrator exactly as strict as it is, and add the supervisor.

---

## 8. Demo Data

> ## DEMO DATA — NOT REAL
> Everything below is fictional. Do not enter real people's information into a demonstration system.

### Step 1 — الصفة

| Field | Value | Required | Format |
|---|---|---|---|
| الصفة | **تاجر فرد** | Yes | Choose sole trader — the simplest path |
| الاسم بالكامل بالعربية | **أحمد تجريبي عبد الله** | Yes | Arabic text |
| الاسم بالحروف اللاتينية | **Ahmed Demo Abdullah** | No | |
| الرقم القومي | **29001010123456** | Yes | Exactly 14 digits, or it is refused |
| الجنسية | **مصري** | No | |

### Step 2 — المنشأة

| Field | Value | Required |
|---|---|---|
| نوع المنشأة | **منشأة فردية** | Yes |
| الاسم التجاري بالعربية | **مؤسسة أصول التجريبية للوساطة العقارية** | Yes |
| الاسم التجاري بالحروف اللاتينية | **Osool Demo Real Estate Brokerage** | No |
| العنوان | **١٢ شارع ديمو، مدينة نصر، القاهرة** | Yes |
| المحافظة | **القاهرة** | Yes |
| التليفون | **01000000000** | Yes |
| البريد الإلكتروني | **demo@osool.test** | No |
| رقم السجل التجاري | **4471** | Yes |
| مكتب السجل التجاري | **مكتب سجل تجاري القاهرة** | Yes |
| تاريخ القيد بالسجل التجاري | **2026-01-15** | Yes |
| رقم التسجيل الضريبي | **555889777** | Yes |
| المأمورية الضريبية | **مأمورية ضرائب مدينة نصر أول** | Yes |

### Step 3 — النوع والفئة

| Field | Value | Note |
|---|---|---|
| أنواع الوساطة | **سمسار بيع** + **سمسار إيجار** | More than one allowed |
| رأس المال المدفوع | **250000** | Yes |
| فئة القيد | **فئة ج** | 250,000 supports ج but not ب |

> To demonstrate the rule engine, deliberately choose **فئة ب** first. Step 3 accepts it; step 7
> refuses with the decree cited. Then correct it to ج.

### Step 4 — العقود

| Field | Value |
|---|---|
| اسم العميل بالعربية | **شركة النيل التجريبية للتطوير العقاري** |
| اسم العميل بالحروف اللاتينية | **Nile Demo Development Company** |
| جنسية العميل | **مصري** |
| جهة التوثيق | **الشهر العقاري** |
| رقم التوثيق | **2026/4471** |
| سريان العقد | **2026-02-01** to **2026-12-31** |
| صفة الوساطة | **سمسار بيع** |
| قيمة العقد | **5000000** (optional) |
| وصف المشروع | **وحدة سكنية رقم ١٢ بالدور الرابع، مشروع ديمو الإسكاني** |
| عنوان المشروع | **مدينة نصر، القاهرة** |

### Step 5 — المستندات

Make simple PDFs, each stating clearly on its face:

> **DEMO / FICTIONAL DOCUMENT — NOT A REAL GOVERNMENT DOCUMENT**
> **مستند تجريبي — ليس مستنداً حكومياً حقيقياً**

| File | Contents | Size |
|---|---|---|
| `demo-commercial-register.pdf` | Register number 4471-DEMO-2026, trade name, issue/expiry, capital 250,000 EGP | keep under 4 MB |
| `demo-tax-card.pdf` | Tax file 555-DEMO-889, activity "real estate brokerage" | under 4 MB |
| `demo-id.pdf` | Name أحمد تجريبي عبد الله, national number 29001010123456 (fictional) | under 4 MB |
| `demo-contract.pdf` | Lease of the premises — use for both the capital proof and the premises proof | under 4 MB |
| `demo-criminal-record.pdf` | Criminal record extract, recently dated | under 4 MB |

To demonstrate the refusals: upload a `.txt` file to see the four-part rejection, and a file over
5 MB to see the platform error described above.

### Step 6 — الإقرارات

Accept all 15. On item 10 choose **«لست من العاملين بالحكومة أو القطاع العام»**.

### Step 7

Review and press **«إرسال الطلب إلى الهيئة»**.

---

## 9. A 15-minute demonstration script

1. **Broker** (`broker@osool.test`) — fill the wizard with the data above, choosing **فئة ب** on
   purpose. Upload a `.txt` to the tax card to show the four-part refusal. Fix it.
2. At step 7, show the capital refusal quoting the ministerial decree. Correct to **فئة ج**, submit.
3. Point out honestly: **no reference number yet**.
4. **Clerk** (`clerk@osool.test`) — `/intake`, book in with 12 sheets, show the number appear, assign
   to أحمد عبد الرحمن سيد.
5. **Broker** — show `T-2026/0013` now on the card.
6. **Examiner** (`examiner@osool.test`) — show each data line beside its source document. Raise a
   completion on the criminal record; show that it must cite a checklist item.
7. **Broker** — show «مطلوب منك استيفاء»، replace the document, show «النسخة ٢ — النسخ السابقة
   محفوظة ولا تُحذف», resubmit.
8. **Examiner** — tick the lines, recommend approval, save, then sign.
9. **Reviewer** (`reviewer2@osool.test`) — approve. Note this is a different person, enforced in the
   database.
10. **Auditor** (`auditor@osool.test`) — show the hash-chained trail with every hand that touched
    the file, including who merely *read* it.

Between roles, sign out fully. Switching accounts repeatedly in one browser session can leave the
sign-in form failing silently — if that happens, use a fresh browser profile or clear cookies.

---

## 10. Known rough edges you will meet in a demo

| You will see | Why |
|---|---|
| No reference number until intake | Not implemented at submit |
| No email at any point | `EMAIL_PROVIDER=manual` |
| Broker portal shows no name or role | Not implemented |
| Two different firm names on one screen | Portal shows the entity, card shows the application |
| Clerk dashboard says the list is empty when it is not | Bug |
| «الخطوة ١ من ٧» vs "0 of 6 steps" | Inconsistent counting |
| English phrases in the Arabic trail | Transition descriptions are not translated |
| A file awaiting completion vanishes from every government queue | Bug |
| `/registration` has no link | Not wired up |
| Uploads over ~4.5 MB fail in English | Platform limit below the advertised limit |
