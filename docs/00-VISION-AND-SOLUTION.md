# 00 — Vision & The Solution We Are Proposing

> **Read this first.** Every other document in `docs/` exists to serve what is written here.
> If a design or engineering decision does not serve this, it is the wrong decision.

---

## 1. Who this is for

**Osool (أصول)** is a proposal to the Government of Egypt — specifically to:

- **The General Organization for Export & Import Control (GOEIC)** — الهيئة العامة للرقابة على الصادرات والواردات, which operates the Real Estate Brokers Register (سجل الوسطاء العقاريين) through its Central Administration for Commercial Registrations.
- **The Ministry of Investment and Foreign Trade** — وزارة الاستثمار والتجارة الخارجية, GOEIC's parent and the AML/CFT supervisory authority for real-estate brokers.
- **With a data relationship to** the Anti-Money Laundering and Terrorist Financing Unit (EMLCU — وحدة مكافحة غسل الأموال وتمويل الإرهاب) at the Central Bank.

This is **not** a product for a private brokerage. It is a **regulator's platform**. The private brokers are the *supervised population*, not the customer.

---

## 2. The problem, stated in one paragraph

Egypt has just built a serious regulatory framework for real-estate brokerage — Ministerial Decree 578/2025 created a four-tier, capital-gated broker register effective January 2026; Law 120/1982 as amended makes registration mandatory to practise; the AML Regulatory Controls impose customer due diligence, compliance-officer appointment, five-year record retention and suspicious-transaction reporting on every broker. **But the register that enforces all of this still runs on paper.** Applications are submitted in person at roughly eleven branches on forms last revised in 2020, moved between a registry clerk, an examiner, a reviewer, a card issuer, a data manager and a files supervisor by physical handover, with each step evidenced by a signature in a box. Nobody at the centre can see, in real time, who is registered, whose registration has lapsed, which broker is handling deals above their permitted category, whether a declared compliance officer actually exists, or whether the same power of attorney is being reused across dozens of files. The register cannot be cross-checked, cannot be analysed, and cannot be audited.

---

## 3. What goes wrong because of that

These are the failure modes a paper register produces. They are the argument.

| Failure | What it looks like in practice |
|---|---|
| **Unregistered practice** | Anyone can act as a broker and take a commission. There is no way for a citizen, a developer, or a bank to verify a broker in seconds. Enforcement is reactive — it depends on someone complaining. |
| **Category evasion** | Decree 578/2025 ties permitted deal value to paid-up capital. On paper, nothing checks that a category-D broker (capital ≥ EGP 20,000, deals ≤ EGP 10M) is not brokering a EGP 300M transaction. The rule exists and is unenforceable. |
| **Lapsed registrations still trading** | Renewal is due 90 days before expiry. On paper, nobody is systematically notified and nobody systematically checks. |
| **Undeclared changes** | The law requires notifying the Authority within 30 days of any change to entity data or to a brokerage contract. There is no mechanism that makes this happen or detects that it did not. |
| **False declarations** | Applicants sign declarations that they hold no government post, are not on terrorism lists, have no first-degree relative in a tender committee, and have never been convicted. These are signed on paper and cross-checked against nothing. |
| **Document handling risk** | A physical file passes through six pairs of hands. A missing paper cannot be distinguished from a paper that was never submitted. The "استيفاءات" (completions requested) box on the review form is the single most exploitable point in the process — an examiner can request completions indefinitely, or waive them silently. |
| **No central intelligence** | GOEIC cannot answer: how many active brokers exist by governorate? Which examiners approve fastest and why? Which national ID appears as responsible manager across the most entities? Which brokers have never filed a single brokerage contract despite being registered? |
| **AML supervision is blind** | Brokers must appoint a compliance officer and notify both GOEIC and the EMLCU by letter. Those letters arrive as paper. There is no register of who the compliance officers are, whether they are qualified, whether one person is serving as compliance officer for forty different firms, or whether a broker has ever filed anything. |

---

## 4. The solution

**One platform with three surfaces, sharing one system of record.**

### Surface 1 — بوابة الوسيط · The Broker Portal
Public-facing self-service for the supervised population. A broker or their authorised agent creates an account, completes the registration application as a guided form, uploads the required documents from a phone camera, submits, tracks status, responds to requested completions, registers each brokerage contract, notifies changes, and renews. Replaces the physical trip to a branch.

**Design constraint: this must be usable by a broker with a mid-range Android phone and no computer skills.** If it is harder than WhatsApp, it will not be used, and non-adoption is the project's main risk.

### Surface 2 — مكتب المراجعة · The Government Back Office
Digitises the *existing* GOEIC workflow exactly as printed on the current forms — registry clerk intake and temporary number, examiner review, reviewer approval, requested completions, card issuance, delivery, data extraction, file archiving. Nothing about the legal process changes. What changes is that every step is timestamped, attributed, and irreversible.

**Design constraint: do not invent a new bureaucratic process.** Adoption depends on the officials recognising their own workflow. The system's value is in the audit trail and the automatic checks layered on top, not in reengineering how the Authority works.

### Surface 3 — الرقابة والتحليل · Supervision & Analytics
The layer that only exists once the data is digital: AML supervision (compliance-officer register, training records, inspection scheduling) and — the part that makes this proposal compelling — **automated integrity signals**.

---

## 5. The corruption-detection argument

This is the section to lead with when presenting. A paper register cannot be interrogated. A digital one can be, continuously and automatically.

The system computes and surfaces these signals without anyone asking:

**Against the supervised population**
1. A registered contract whose value exceeds the broker's category ceiling under Decree 578/2025.
2. Contract values clustering immediately below a category threshold — the signature of deliberate structuring.
3. An entity carrying real-estate brokerage activity in the Commercial Register with no corresponding entry in the Brokers Register.
4. A registration that expired while brokerage contracts continued to be submitted against it.
5. A registered broker that has never submitted a single contract — a shell registration.
6. The same national ID appearing as owner, responsible manager, or authorised signatory across an improbable number of entities.
7. The same power-of-attorney number reused across unrelated applications, or a POA declared still valid past a plausible date.
8. The same person named as the appointed compliance officer for many unrelated firms.
9. A declaration on file that contradicts other available data.
10. Ownership structures suggesting the entity is foreign-controlled where restrictions apply.

**Against the process itself — internal integrity**
11. An application approved while mandatory documents were absent.
12. Approval decided faster than any human could have read the file.
13. The same examiner repeatedly assigned to the same applicant.
14. The examiner and the reviewer being the same person — a segregation-of-duties breach the system prevents outright.
15. Repeated rounds of requested completions followed by an abrupt approval with no new document uploaded — the classic pattern of an obstacle removed by other means.
16. Completions requested that have no basis in the documented requirements list.
17. Decisions taken outside working hours or from an unexpected location.
18. A file that sat with one official far longer than the median without a recorded reason.

Signals 11–18 matter more than 1–10 politically, because they are the ones a paper system structurally cannot produce. **The pitch is: this platform does not accuse anyone. It makes the process legible, so that integrity becomes the default and irregularity becomes visible.**

---

## 6. What we claim, precisely

Do not overclaim. These are defensible:

- **Verification in seconds.** Any citizen, developer, bank, or notary can confirm a broker's registration number, category, permitted types, and validity — instead of having no way to check at all.
- **The category rule becomes enforceable.** Decree 578/2025's capital-to-deal-value tiers stop being unenforceable text.
- **Nothing is lost and nothing is silently changed.** Every document is hashed on upload; every decision is attributed and append-only; deletion does not exist.
- **The Authority gains a real-time picture** of the sector it supervises — by governorate, category, type, and status.
- **AML supervision becomes possible at all** — a live register of compliance officers, and the ability to see which supervised entities are participating and which are dormant.
- **Process integrity becomes measurable**, through the internal signals above.

Do **not** claim: that the system detects money laundering, that it replaces investigation, or that a signal is evidence of wrongdoing. Signals are triage, not verdicts. Say so in the interface itself.

---

## 7. Guiding principles for everyone building this

1. **Enforce, do not display.** The predecessor system printed the rules on screen and enforced none of them. A rule that is not enforced on the server does not exist.
2. **Nothing is ever deleted.** Archive, retain, legal-hold. There is no destructive action in this product.
3. **Every decision has an author, a timestamp, and a reason.** Especially every override.
4. **Segregation of duties is code, not policy.** The same person cannot examine and approve the same file.
5. **Rules are data.** Decree thresholds, document checklists, and required fields live in versioned configuration, because decrees change and a decree change must not require a deployment.
6. **Arabic first.** This is an Egyptian government system used in Arabic. English is a full second language, not a courtesy.
7. **Assume the user is not technical.** Both the broker and the government employee. Every blocked action explains the rule, why it applies, and the exact next step.
8. **Signals inform humans; they never decide.** No automatic rejection, no automatic accusation.

---

## 8. What is out of scope

Stated explicitly so it does not creep in:

- This is not a property marketplace. No listings, no search for properties, no buyer-seller matching.
- This is not a payments platform. Fee amounts may be recorded; money is not moved.
- This does not file suspicious-transaction reports to the EMLCU. That is the broker's own obligation through the EMLCU's channel. The platform records that an obligation exists and whether the entity is participating.
- This does not perform property title registration. That is الشهر العقاري's function. The platform may hold a reference to it.
- This does not replace investigation, prosecution, or inspection. It supports them.
