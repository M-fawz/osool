# Demonstration data — every field and every document

> ### These are not real government documents
>
> Everything in this file is invented. The names are fictional, the numbers have
> the *shape* of a real reference without being one, and the PDFs in
> `docs/demo-documents/` carry a diagonal watermark and a bilingual banner
> reading **DEMO / TEST DATA — NOT A REAL GOVERNMENT DOCUMENT** on every page.
> None of them bears an emblem, a seal, a signature, or the name of an issuing
> authority. They exist so the workflow can be exercised without anyone handing
> over a real commercial register extract, and they are not valid for any
> purpose beyond that.

Everything below was derived from the workflow as it actually runs — the
checklist is read from the `DOC_CHECKLIST` rule set in the production database,
not from a list someone maintained by hand.

---

## 1. How to regenerate the documents

```bash
npx tsx scripts/demo-documents.ts          # 13 PDFs into docs/demo-documents/
npx tsx scripts/demo-documents.ts --png    # …and PNGs into .proof/, to look at
```

The script reads the checklist from the rule set, so an item added to
`DOC_CHECKLIST` tomorrow gets a demo document without anyone remembering to add
one. It renders through the product's own Chromium pipeline, which is the only
way the Arabic comes out shaped and ordered correctly — a demonstration whose
documents show reversed isolated letters demonstrates the wrong thing.

The `--png` output exists to be *looked at*. A PDF whose Arabic shaping failed
still opens, still contains the right code points, and still passes any
text-based assertion; the damage is visible only in the glyphs.

---

## 2. Step 1 — Capacity · الصفة

| Field | Required | Why it is asked | Demo value | If it is missing |
|---|---|---|---|---|
| Capacity (`applicantCapacity`) | **Yes** | Decides the rest of the steps and which documents are asked for. An agent gets a power-of-attorney step; a sole trader does not. | **صاحب منشأة فردية** (`SOLE_TRADER`) | Cannot continue |
| Name in Arabic (`applicantNameAr`) | **Yes** | The register is searched in Arabic. Must contain Arabic script. | `محمود عبد الرحمن حسن` | Refused: *اكتب هذا الحقل بالعربية* |
| Name in Latin (`applicantNameEn`) | Optional | Correspondence and the Latin index. Must contain Latin script if given. | `Mahmoud Abdelrahman Hassan` | Left blank |
| National ID (`applicantNationalId`) | **Yes** | Identity verification before registration. Stored encrypted, with a keyed fingerprint beside it so duplicate use across firms is detectable without the number being readable. | `28001011201234` | Refused: 14 digits required |
| Nationality (`applicantNationality`) | Optional | Participates in the beneficial-owner cascade. | `مصري` | Left blank |

---

## 3. Step 2 — The firm · المنشأة

| Field | Required | Why it is asked | Demo value | If it is missing |
|---|---|---|---|---|
| Establishment type | **Yes** | Selects the document checklist: a legal person is asked for six more items than a sole trader. | **شخص طبيعي** (`NATURAL_PERSON`) | Cannot continue |
| Legal form | **Yes** | Checked by the examiner against the register extract. | `منشأة فردية` | Refused |
| Trade name Arabic | **Yes** | The name the registration is issued in. Arabic script required. | `مؤسسة أصول التجريبية للوساطة العقارية` | Refused: *اكتب هذا الحقل بالعربية* |
| Trade name Latin | Optional | Latin index. | `Osool Demonstration Real Estate Brokerage` | Left blank |
| Trade style Arabic / Latin | Optional | Distinct from the trade name on the Authority's form. | `أصول` / `Osool` | Left blank |
| Head office address | **Yes** | Inspections and official correspondence go here. Must match the premises document. | `١٢ شارع التجربة، المعادي، القاهرة` | Refused |
| Governorate | **Yes** | Supervisory geography. | **القاهرة** (`CAIRO`) | Refused |
| PO box | Optional | — | `11728` | Left blank |
| Telephone | **Yes** | Digits, spaces, dashes, one optional `+`, 7–15 digits. | `0227351234` | Refused: *أدخل رقم تليفون صحيحاً* |
| Email | Optional | — | `demo@osool.test` | Left blank |
| **Commercial register number** | **Yes** | Proves the firm exists in law. **Digits and separators only.** | `123456` | Refused: *هذا الحقل يقبل الأرقام وعلامات الفصل فقط* |
| Commercial register office | **Yes** | The register holds four separate CR facts; the office is the one an examiner asks about when an extract looks wrong. | `القاهرة` | Refused |
| CR date / renewal date | **Yes** / Optional | Validity of the extract. | `2022-03-15` / `2027-03-15` | Refused / left blank |
| **Tax registration number** | **Yes** | **Digits and separators only.** | `555-123-456` | Refused: same as above |
| Tax office | **Yes** | The number alone does not identify the file. | `مأمورية ضرائب المعادي` | Refused |

> The two fields marked **digits and separators only** are the ones that used to
> fail silently. They now carry the hint *«أرقام وعلامات فصل فقط — مثل ١٢٣٤٥ أو
> 2026/1234. لا تُقبل الحروف»* under the label.

---

## 4. Step 3 — Type and category · النوع والفئة

| Field | Required | Why it is asked | Demo value | If it is missing |
|---|---|---|---|---|
| Types (`requestedTypes`) | **Yes**, at least one | A broker holds one or more of exactly four types. | **سمسار بيع** + **سمسار إيجار** (`SELL`, `RENTAL`) | Refused: *اختر نوعاً واحداً على الأقل* |
| Paid-up capital | **Yes** | Compared against the floor for the requested category. | `250000` | Refused |
| Category | **Yes** | The band the registration is granted in. | **فئة ج** (`C`) | Refused |

**Deliberately failing case, worth showing:** category **أ / A** with `250000`.
The step accepts it — you can save and come back — and the *submission* refuses
it in four parts, naming «قرار وزاري ٥٧٨ لسنة ٢٠٢٥، المادة ٢» and stating the
floor. The bands are versioned rule data, not constants.

---

## 5. Step 4 — Contracts · العقود

At least one brokerage contract is required.

| Field | Required | Why it is asked | Demo value | If it is missing |
|---|---|---|---|---|
| Client name Arabic | **Yes** | Arabic script required. | `شركة النور للاستثمار العقاري — بيانات تجريبية` | Refused: *اكتب هذا الحقل بالعربية* |
| Client name Latin | **Yes** | Latin script required. | `Al-Nour Real Estate Investment (DEMO)` | Refused: *اكتب هذا الحقل بالحروف اللاتينية* |
| Client nationality | **Yes** | — | `مصري` | Refused |
| Authenticating body | **Yes** | One of: الشهر العقاري · سفارة · قنصلية | **الشهر العقاري** (`REAL_ESTATE_PUBLICITY`) | Refused |
| **Authentication number** | **Yes** | **Digits and separators only.** | `2026/1234` | Refused: *هذا الحقل يقبل الأرقام وعلامات الفصل فقط* |
| Valid from → to | **Yes** | "To" must be after "from". | `2026-01-01` → `2026-12-31` | Refused: *تاريخ الانتهاء لا بد أن يكون بعد تاريخ البدء* |
| Capacity acted in | **Yes** | Which of the four types this contract was performed under. | **سمسار بيع** (`SELL`) | Refused: *هذا الحقل مطلوب* |
| Contract value | Optional | Compared against the category's ceiling. | `1500000` | Left blank |
| Subject description | **Yes** | — | `بيانات تجريبية — وساطة في بيع وحدة سكنية بمساحة ١٢٠ م٢` | Refused |
| Subject address | **Yes** | — | `١٢ شارع التجربة، المعادي، القاهرة` | Refused |
| Governorate | Optional | — | **القاهرة** | Left blank |

---

## 6. Step 5 — Documents · المستندات

All PDF. All in `docs/demo-documents/`. Accepted types and size ceilings come
from the `DOC_CHECKLIST` rule set and are shown on each card.

### Required of a sole trader — 7 items

| # | On screen | File | Accepted | Max | Why |
|---|---|---|---|---|---|
| 1 | وثيقة إثبات الهوية لمقدم الطلب | `DEMO-IDENTITY_DOC_APPLICANT.pdf` | PDF · JPG · PNG · HEIC | 10 MB | The registration is issued to a named person. |
| 2 | مستخرج السجل التجاري ساري | `DEMO-COMMERCIAL_REGISTER_EXTRACT.pdf` | PDF · JPG · PNG · HEIC | 10 MB | Proves the firm exists and its activity permits brokerage. |
| 3 | البطاقة الضريبية | `DEMO-TAX_REGISTRATION_CARD.pdf` | PDF · JPG · PNG · HEIC | 10 MB | The number *and* the office. |
| 4 | ما يثبت رأس المال المدفوع | `DEMO-PROOF_OF_PAID_UP_CAPITAL.pdf` | PDF · JPG · PNG | 10 MB | Checked against the category floor. |
| 5 | ما يثبت مقر مزاولة النشاط | `DEMO-PREMISES_PROOF.pdf` | PDF · JPG · PNG | 10 MB | Inspections and correspondence go to this address. |
| 6 | صحيفة الحالة الجنائية | `DEMO-CRIMINAL_RECORD_EXTRACT.pdf` | PDF · JPG · PNG | 10 MB | Evidences declaration DECL-03. |
| 7 | وثيقة هوية صاحب المنشأة الفردية | `DEMO-OWNER_IDENTITY_DOC.pdf` | PDF · JPG · PNG | 10 MB | In a sole establishment the owner's identity *is* the firm's. |

**Missing any of these:** the application cannot be submitted. The review step
lists what is outstanding and links straight to it.

### Required of a legal person instead — 5 more, 1 fewer

| On screen | File | Accepted | Max |
|---|---|---|---|
| عقد التأسيس والنظام الأساسي | `DEMO-ARTICLES_OF_ASSOCIATION.pdf` | PDF | 25 MB |
| ما يفيد تفويض من يمثل الشركة | `DEMO-REPRESENTATION_AUTHORISATION.pdf` | PDF · JPG · PNG | 10 MB |
| وثائق هوية المستفيدين الحقيقيين | `DEMO-BENEFICIAL_OWNER_IDENTITY_DOCS.pdf` | PDF · JPG · PNG | 25 MB |
| نماذج التوقيعات المعتمدة | `DEMO-SIGNATURE_SPECIMENS.pdf` | PDF · JPG · PNG | 10 MB |
| *(item 7 above is not asked of a legal person)* | | | |

### Conditional — asked only when the condition holds

| On screen | File | When | If not |
|---|---|---|---|
| التوكيل الرسمي | `DEMO-POWER_OF_ATTORNEY.pdf` | Capacity is **وكيل بتوكيل** (`AGENT_UNDER_POA`) | Shown as *غير مطلوب في حالتك* |
| العقد الابتدائي للشركة تحت التأسيس | `DEMO-PRELIMINARY_CONTRACT_UNDER_FORMATION.pdf` | The company is still under formation | Optional; leave it |

### What is inside each PDF

Consistent with the form values above, on purpose — a demonstration in which the
tax number on the card differs from the tax number typed into the form teaches
the audience that the system checks nothing.

| File | Contains |
|---|---|
| `DEMO-IDENTITY_DOC_APPLICANT` | محمود عبد الرحمن حسن · 28001011201234 · born 01/01/1980 · expires 31/12/2030 |
| `DEMO-COMMERCIAL_REGISTER_EXTRACT` | CR `123456` · office القاهرة · registered 15/03/2022 · renewed to 15/03/2027 |
| `DEMO-TAX_REGISTRATION_CARD` | Tax `555-123-456` · مأمورية ضرائب المعادي |
| `DEMO-PROOF_OF_PAID_UP_CAPITAL` | 250,000 EGP — the figure the category check uses |
| `DEMO-PREMISES_PROOF` | Lease of ١٢ شارع التجربة، المعادي · 01/01/2026 → 31/12/2028 |
| `DEMO-CRIMINAL_RECORD_EXTRACT` | Clear · issued 01/08/2026 · cites DECL-03 |
| `DEMO-OWNER_IDENTITY_DOC` | The same person as item 1, in the owner capacity |
| `DEMO-POWER_OF_ATTORNEY` | POA `4321` of `2026`, مكتب توثيق المعادي |
| `DEMO-ARTICLES_OF_ASSOCIATION` | ش.م.م · capital 250,000 · incorporated 15/03/2022 |
| `DEMO-REPRESENTATION_AUTHORISATION` | Board resolution authorising the applicant |
| `DEMO-BENEFICIAL_OWNER_IDENTITY_DOCS` | Two owners at 60% / 40% — the ≥25% test |
| `DEMO-SIGNATURE_SPECIMENS` | Two authorised signatories; no actual signatures |
| `DEMO-PRELIMINARY_CONTRACT_UNDER_FORMATION` | Founders and shares, plus the founders' agent |

---

## 7. Step 6 — Declarations · الإقرارات

**Fifteen**, `DECL-01` … `DECL-15`, all required. Each is recorded separately
with its own timestamp and IP, and the wording is copied onto the record as it
was asserted.

For the demonstration, affirm all fifteen. A negative answer on a declaration
that requires it opens a qualification box; the application is not blocked, but
the examiner sees it.

**If any is not affirmed:** submission is refused and the review step says which.

---

## 8. Step 7 — Review and submit

No fields. The completeness evaluation runs again server-side against a fresh
read, and refuses with the list of what is outstanding.

**After submission:** status `SUBMITTED`. No reference number yet — the clerk
allocates it at intake. The broker finds the application again under **طلباتي**.

---

## 9. Government-side values

| Step | Role | Field | Demo value |
|---|---|---|---|
| Intake | `REGISTRY_CLERK` | Page count | `24` |
| Intake | `REGISTRY_CLERK` | Assign to | أحمد عبد الرحمن سيد (`examiner@osool.test`) |
| Completion | `EXAMINER` | Checklist item | `PREMISES_PROOF` |
| Completion | `EXAMINER` | Description (Arabic) | `صورة عقد الإيجار غير واضحة — يرجى إعادة رفعها بجودة أعلى.` |
| Examination | `EXAMINER` | Originals / copies | `1` / `2` |
| Examination | `EXAMINER` | Nature | بيع · إيجار |
| Examination | `EXAMINER` | Proposed validity | `2026-09-01` → `2029-08-31` |
| Examination | `EXAMINER` | Recommendation | التوصية بالموافقة |
| Review | `REVIEWER` | Decision | موافقة |
| Review | `REVIEWER` | Note | `بيانات تجريبية — الطلب مستوفٍ للشروط.` |
| Fees | `CARD_ISSUER` | Method | نقداً (`CASH`) |
| Fees | `CARD_ISSUER` | Receipt number | `2026/00042` — digits and separators only |
| Fees | `CARD_ISSUER` | Amounts | `100`, `200`, `50`, `25`, `10` against the mandatory headings |
| Delivery | `CARD_ISSUER` | Recipient | `محمود عبد الرحمن حسن` |
| Delivery | `CARD_ISSUER` | Acknowledgements | Both ticked — required |

> The fee amounts are invented. The legal reference states **no tariff** for any
> of the eight headings, and the screen says so. Do not present these as the real
> fees.

---

## 10. Values that are deliberately wrong

Useful for showing a control actually working.

| Field | Wrong value | What the system says |
|---|---|---|
| Trade name Arabic | `Osool Brokerage` | *اكتب هذا الحقل بالعربية* |
| Client name Latin | `شركة النور` | *اكتب هذا الحقل بالحروف اللاتينية* |
| Commercial register number | `CR-123456` | *هذا الحقل يقبل الأرقام وعلامات الفصل فقط* |
| Authentication number | `DEMO-RP-2026-0001` | same |
| Category | **أ** with capital `250000` | Four-part refusal naming قرار وزاري ٥٧٨ لسنة ٢٠٢٥، المادة ٢ |
| Contract valid to | before "valid from" | *تاريخ الانتهاء لا بد أن يكون بعد تاريخ البدء* |
| National ID | `123` | *الرقم القومي يتكوّن من ١٤ رقماً* |
| Telephone | `abc` | *أدخل رقم تليفون صحيحاً* |
| Submit with a document missing | — | Refused, with the outstanding items listed and linked |

In every case the summary at the top of the form names the field, links to it,
and **what you already typed is still there.**
