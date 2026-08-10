# 01 — Egyptian Legal Reference (المرجع القانوني)

> **Purpose.** This file consolidates every legal instrument the platform implements, so that no
> engineer, designer, or agent ever has to work from scattered images or PDFs again.
>
> **Status of this document.** It is a working technical reference compiled from the primary
> instruments and from official publications. **It is not legal advice.** Every rule marked
> `[NEEDS COUNSEL]` must be confirmed against the gazette text by a qualified Egyptian lawyer
> before it is allowed to block or permit anything in production. A validation error here is not
> a bug — it is a void transaction and potential criminal exposure.
>
> **Rule of construction for this project:** every requirement below carries an ID. Every
> enforcement point in the codebase must reference its ID. If code enforces something with no
> ID here, that code is wrong.

---

## Index of instruments

| Ref | Instrument | Arabic | Governs |
|---|---|---|---|
| **L120** | Law 120 of 1982, as amended by Law 21 of 2022 | قانون تنظيم أعمال الوكالة التجارية وبعض أعمال الوساطة التجارية أو السمسرة العقارية | The Brokers Register itself |
| **R342** | Executive Regulation, Decree 342 of 1982 | اللائحة التنفيذية | Implementation of L120 |
| **D578** | Ministerial Decree 578 of 2025 | قرار وزير الاستثمار والتجارة الخارجية رقم ٥٧٨ لسنة ٢٠٢٥ | Broker types & capital categories |
| **L80** | Law 80 of 2002 and amendments | قانون مكافحة غسل الأموال | AML framework; DNFBP status |
| **R951** | Executive Regulation, PM Decree 951 of 2003 and amendments | اللائحة التنفيذية لقانون مكافحة غسل الأموال | Implementation of L80 |
| **CDD** | EMLCU CDD Procedures for DNFBPs, Feb 2020 issue | إجراءات العناية الواجبة بعملاء أصحاب المهن والأعمال غير المالية | Customer due diligence |
| **RC** | Regulatory Controls for Real Estate Brokers (revised) | الضوابط الرقابية لسماسرة العقارات بشأن مكافحة غسل الأموال وتمويل الإرهاب | Sector-specific AML duties |
| **L230** | Law 230 of 1996 | قانون تنظيم تملك غير المصريين للعقارات المبنية والأراضي الفضاء | Foreign ownership of property |
| **PM2021** | PM Decree 2021 of 2026 | قرار رئيس مجلس الوزراء رقم ٢٠٢١ لسنة ٢٠٢٦ | Delegation of L230 powers |
| **L8** | Law 8 of 2015 and amendments | قانون تنظيم قوائم الكيانات الإرهابية والإرهابيين | Domestic terrorist lists |
| **L151** | Law 151 of 2020 + Executive Regulation | قانون حماية البيانات الشخصية | Personal data protection |

---

## Part A — The Brokers Register

### A.1 — Registration is mandatory `[L120]`

**REQ-REG-001** — No natural or legal person may practise real-estate brokerage without being
entered in the Real Estate Brokers Register (سجل الوسطاء العقاريين) maintained by GOEIC.

*System behaviour:* the platform is the register. An entity without an active registration record
cannot have brokerage contracts recorded against it, and appears as unverified in public lookup.

**REQ-REG-002** `[NEEDS COUNSEL]` — Practising without registration carries imprisonment and a
fine, plus prohibition of the activity and closure of premises. Secondary sources report a range
of up to two years and EGP 50,000–1,000,000; **confirm the exact figures and article**.

*System behaviour:* used only in explanatory copy, never in an automated decision.

### A.2 — Broker types `[D578, Article 1]`

**REQ-REG-010** — A broker is registered under one or more of exactly four types. Registration
in more than one type is permitted.

| Code | Arabic | Definition |
|---|---|---|
| `SELL` | سمسار بيع | Brokerage, solicitation, or mediation to conclude contracts for the **sale** of built property or vacant land, **for the seller's benefit** |
| `BUY` | سمسار شراء | The same, for the **purchase** of built property or vacant land, **for the buyer's benefit** |
| `DUAL` | سمسار مزدوج | Sale **and** purchase, for the benefit of **both** seller and buyer, under a dual brokerage contract |
| `RENTAL` | سمسار إيجار | Contracts for the **lease** of built property or vacant land, for the lessor's or lessee's benefit |

*System behaviour:* stored as a set, not a single value. A brokerage contract records the capacity
acted in, and that capacity must be one the broker holds. A contract recorded under a type the
broker is not registered for is blocked.

### A.3 — Categories and capital `[D578, Article 2]`

**REQ-REG-020** — Four categories, each tying the permitted contract value to a minimum paid-up
capital. Foreign-currency equivalents are computed at the Central Bank of Egypt's announced rate
**on the date of the registration application**.

| Category | Arabic | Contract value | Minimum paid-up capital |
|---|---|---|---|
| `A` | فئة أ | Exceeding EGP 100,000,000 | ≥ EGP 1,000,000 |
| `B` | فئة ب | Exceeding EGP 50,000,000 | ≥ EGP 500,000 |
| `C` | فئة ج | Exceeding EGP 10,000,000 | ≥ EGP 50,000 |
| `D` | فئة د | Not exceeding EGP 10,000,000 | ≥ EGP 20,000 |

**REQ-REG-021** — An application for a category whose capital floor is not met must be refused.

**REQ-REG-022** — A brokerage contract whose value exceeds the ceiling of the broker's registered
category is a violation and must be flagged. `[NEEDS COUNSEL: confirm whether this is a hard bar
on recording the contract or a supervisory flag. Default: record it, flag it, notify supervision.]`

**Effective dates:** issued 16/12/2025; published in الوقائع المصرية issue 13 on 17 January 2026;
in force from the day following publication.

*System behaviour:* these four rows live in a **versioned configuration table**, never in code.
A future decree amending the thresholds is a configuration change with a new effective date, and
historic decisions continue to be evaluated against the version in force at the time.

### A.4 — Application content `[GOEIC form CR-CA-QR7--01, issue 4, 1/6/2020]`

**REQ-REG-030** — A new-registration application captures, at minimum:

*Applicant capacity:* sole trader (تاجر فرد) · chairman (رئيس مجلس إدارة) · responsible manager
(مدير مسئول) · general partner (شريك متضامن) · agent under power of attorney (وكيل).

*If acting under a power of attorney:* POA type (general/special), number, year, and the
notarisation office (مكتب توثيق).

*Entity data:* trade name (الاسم التجاري) · trade style (السمة التجارية) · head office or main
premises address · PO box, telephone · commercial register number, issuing office, date, and
renewal date · capital · tax registration number and tax office.

*Brokerage contract data (client data):* client name in English · client name in Arabic ·
nationality · authentication number from الشهر العقاري / embassy / consulate · contract validity
from–to · description and address of the project, unit, or products that are the subject of the
brokerage.

*Fees recorded:* deposit (تأمين) · first-time registration · publication · commercial syndicate ·
copies · martyrs' honouring fund · surplus capacity · urgent booking service.

### A.5 — Declarations `[GOEIC forms CR-CA-QR-07-31 (sole trader) and cr-ca-QR 07-030 (companies)]`

**REQ-REG-040** — The applicant signs a set of binding declarations. Each must be captured as a
**discrete, individually recorded assertion** — not a single "I agree" checkbox — because each is
independently falsifiable and independently cross-checkable.

1. Not a member of the House of Representatives, the Senate, or any local council; not engaged
   full-time in political work; undertakes to notify the Authority upon becoming so.
2. Holds no position in any government body or public-sector entity; undertakes to notify upon
   taking one. Has not left government service by resignation or for disciplinary reasons within
   the preceding two years. *(Public-sector companies are exempt from this condition in the
   company form.)*
3. Not listed on terrorism lists; has never been adjudicated bankrupt (nor has the company); is
   of good repute; has no criminal conviction or custodial sentence for a crime involving honour
   or trust, or under Law 120/1982, or the import/export, currency, customs, tax, supply,
   companies, or trade laws — unless rehabilitated.
4. Has no first-degree relative among holders of political office, members of national or local
   representative councils, or officials at director-general level or above serving on award,
   procurement, or sale committees; undertakes to notify if that changes.
5. Undertakes to notify the Authority of any change to entity data or to any registered brokerage
   contract **within thirty days**.
6. Undertakes to register any new contract **before** practising any work under it, and to notify
   the Authority within thirty days of ceasing activity wholly or partially in respect of a
   contract.
7. Undertakes to state the registration number on all papers and correspondence.
8. Undertakes not to practise any brokerage work after any registration condition ceases to be met.
9. Undertakes that the entity keeps regular books containing accurate data, recording commissions
   due and the banks holding them.
10. Declares the agent submitting the application is not a government or public-sector employee,
    or identifies the employer and consents to that employer being notified.
11. Undertakes to notify the Tax Authority of all sums paid for any brokerage work **within thirty
    days** of payment.
12. Declares sufficient knowledge of Law 120/1982 and Decree 342/1982 and their amendments.
13. Declares the accuracy of translations of foreign contracts submitted or to be submitted.
14. Confirms receipt of an additional copy of the undertakings.
15. Declares all data and documents submitted are sound and correct, under full responsibility.

**REQ-REG-041** — A power of attorney requires a separate declaration `[form CR-CA-QR7-17]` that
the POA (number, year, notarisation office, date) **remains in force and the principal remains
alive as at the date of the declaration**.

*System behaviour:* POA number + year + office is a composite key. Reuse of the same POA across
unrelated applicants is an integrity signal. A POA declaration older than a configured age
triggers a re-declaration requirement.

### A.6 — Internal review workflow `[GOEIC form CR-CA-QR-31 and the workflow boxes on CR-CA-QR7--01]`

**REQ-REG-050** — The Authority's own process, as printed on the forms, and which the platform
digitises **without altering**:

| # | Step | Arabic role | What happens |
|---|---|---|---|
| 1 | Intake | كاتب القيد | Entered in the incoming register under a **temporary number**; page count recorded; passed for review |
| 2 | Examination | الفاحص | Documents reviewed; data extracted onto the internal review form; **completions requested** (الاستيفاءات) if anything is missing; signs and dates |
| 3 | Review | المراجع | Second check; signs and dates |
| 4 | Fees | أمين الخزينة | Payment recorded — cash or certified/bank cheque, with issuing bank and branch |
| 5 | Card issuance | — | Registration card (البطاقة الدالة على القيد) issued under a permanent registration number; recipient acknowledges the renewal date and the obligation to print the number on all output |
| 6 | Delivery | كاتب التسليم | Card delivered, recorded in the delivery ledger under a serial number; file passed to data |
| 7 | Data | مدير إدارة البيانات | Data extracted and recorded; file passed to archive |
| 8 | Archive | رئيس قسم الملفات | File received with page count, entered in serial and alphabetical registers, indexed, filed |

**REQ-REG-051** — The internal review form records: registration number · validity from–to · trade
name · trade style · establishment type · capital · activity address · governorate · activity ·
commercial register number and office · tax registration and office · telephone · original/copy
count · full client data · brokerage nature (**sale / purchase / lease**) · examiner signature ·
up to four numbered requested completions · reviewer signature · application number.

**REQ-REG-052 — Segregation of duties.** `[Not stated on the form — an integrity control this
platform adds.]` The examiner and the reviewer of the same application must be different natural
persons. Enforced in code, not policy.

### A.7 — Validity, renewal, and continuing obligations `[L120, R342, declarations]`

**REQ-REG-060** — Registration has a validity period. **Renewal falls due 90 days before the
expiry of the current registration**, and the applicant acknowledges this on receipt of the card.

**REQ-REG-061** — The registration number must be stated on **all printed matter, correspondence,
and advertisements** issued by or on behalf of the registrant, from the date of registration.

*System behaviour:* every document the platform generates for a broker carries the number
automatically. Public lookup exists so third parties can verify a number they are shown.

**REQ-REG-062** — Any change to entity data or to any registered brokerage contract must be
notified within **thirty days**.

**REQ-REG-063** — Every new brokerage contract must be registered **before** any work is performed
under it.

**REQ-REG-064** — Cessation of activity, wholly or partially, in respect of any contract must be
notified within **thirty days**.

**REQ-REG-065** — Practising after any registration condition ceases to be met is prohibited.

**REQ-REG-066** — Foreign ownership of real-estate brokerage companies is restricted.
`[NEEDS COUNSEL: confirm the current instrument and the exact restriction.]`

---

## Part B — AML/CFT duties on brokers

### B.1 — Brokers are DNFBPs `[L80 Article 1(ز); CDD §1]`

**REQ-AML-001** — Real-estate brokers are subject to the AML Law when executing operations for
their clients involving the purchase or sale of real estate — *"سماسرة العقارات عند تنفيذهم عمليات
لصالح عملائهم بشراء أو بيع عقارات"*.

**REQ-AML-002** — The **competent supervisory authority** for real-estate brokers is the ministry
responsible for trade — historically وزارة التجارة والصناعة in the published Controls, now
**وزارة الاستثمار والتجارة الخارجية**, acting through GOEIC. The **Unit** (الوحدة) is the EMLCU,
established at the Central Bank.

*System behaviour:* the platform is operated by the supervisory authority. It does not act for
the EMLCU and does not transmit reports to it.

### B.2 — The compliance manager `[RC §ثالثاً]`

**REQ-AML-010** — Every broker must designate a **compliance manager** (المدير المسئول عن مكافحة
غسل الأموال وتمويل الإرهاب) **and a deputy** to act in their absence, and must notify **both** the
Unit and the competent supervisory authority of their contact details, and of any change.

**REQ-AML-011 — Selection criteria:** senior functional level; appropriate academic qualifications
and sufficient practical experience.

**REQ-AML-012 — Guarantees and powers:** independence in performing the role; no duties assigned
that conflict with it; the right to obtain all information and inspect all records and documents
needed — particularly reports of unusual operations and suspicion reports received; the right to
report to senior management; complete confidentiality over the receipt, examination, and
notification of suspicion.

**REQ-AML-013 — Duties:** examine unusual operations surfaced by internal systems and suspicion
reports received internally with their stated grounds; notify the Unit of all operations suspected
of constituting proceeds, money laundering, or terrorist financing, **or attempts at such
operations, whatever their value**; decide, with written reasons, to shelve operations found not
to be suspicious; propose development of policies, systems, and procedures; supervise offices and
branches for compliance, in-office and in the field; coordinate on staff training; supply the Unit
with information, data, and statistics and facilitate its access to records; produce an **annual
report** to senior management, then send it to the Unit with senior management's observations and
decisions.

**REQ-AML-014 — Minimum content of the annual report:** efforts during the period regarding
unusual and suspicious operations and what was done about them; the outcome of periodic review of
AML/CFT systems, weaknesses found, and proposals to remedy them, including internal-system reports
of unusual operations; amendments made to policies, internal systems, or procedures; the extent of
compliance with the supervision plan (in-office and field) during the period; the supervision plan
for the following period; a detailed statement of training programmes held.

*System behaviour:* the platform maintains a live **register of compliance managers and deputies**
per broker, as a tenure with a start and end — never as an overwritable field. The two statutory
notification letters (to the Authority and to the Unit) are generated pre-filled and printable.
Cross-entity reuse of the same individual is an integrity signal.

### B.3 — Suspicious transaction reporting `[RC §رابعاً; L80 Article 11]`

**REQ-AML-020** — Reports are made to the Unit using the Unit's prescribed forms and instructions.

**REQ-AML-021 — Confidentiality (no tipping-off).** Complete confidentiality applies at **every
stage** — internal reporting, examination before reporting, and reporting to the Unit. No
disclosure to any person or body not legally authorised.

*System behaviour:* the platform does **not** hold STR narratives. It records only that a
supervised entity has an operating reporting capability. **Nothing in the platform may reveal to
any broker-side user, or to any unauthorised government role, that a specific report exists.**
This is the single hardest confidentiality constraint in the system.

**REQ-AML-022** — A report must contain a detailed description of the operation(s) and the reasons
and grounds relied upon in determining suspicion.

**REQ-AML-023 — Required attachments (minimum):** the request to commence the relationship, or the
service request, or the contract · the identity-verification document for the client (natural or
legal person) · the identity-verification document for the beneficial owner of the legal person to
whom the service is provided · the documents supporting the suspicious operation.

### B.4 — Record retention `[RC §خامساً]`

**REQ-AML-030** — Records to be retained, with their distinct retention start-points:

| # | Record type | Minimum period | Clock starts |
|---|---|---|---|
| أ | Records and documents obtained through customer due diligence — including requests to commence the relationship (contract or agreement) and copies of identity-verification documents for natural and legal persons, and copies of correspondence with them | 5 years | Date of ending the contract or agreement, or date of ending the business relationship |
| ب | Records and documents relating to operations conducted for clients, containing data sufficient to identify the details of each operation individually | 5 years | Date of ending the contract or agreement; or, for operations executed for clients with whom no contract was signed, date of ending the operation |
| ج | Reports of unusual operations, evidence of their review, and the results of any analysis performed | 5 years | Date the report was issued |
| د | Records of suspicious operations, including copies of the notifications sent to the Unit and their related data and documents | 5 years **or until a final decision or judgment is issued in respect of the operation — whichever is longer** (where the competent authorities so request) | Date of sending |
| ه | Records and documents of reports the compliance manager decided to shelve | 5 years | Date of the shelving decision |
| و | Records of training programmes — including all programmes staff received in AML/CFT, their names, the sections or departments they work in, the programme content, its duration, and the training provider, whether local or foreign | 5 years | Date the training programme ended |

**REQ-AML-031 — Conditions of retention:** all records, documents, and reports kept **securely**,
with **backup copies** in another location meeting all security conditions and technical
requirements; a retention method allowing **easy and rapid retrieval**, such that any requested
data or information is provided clearly and without delay; operation records **sufficient to permit
reconstruction of individual operations** so as to provide, where necessary, evidence for
prosecution of criminal activity.

*System behaviour for the platform's own data:* **no destructive delete exists anywhere in the
product.** Archive, retention lock, and legal hold only. Retention start-points are computed per
record type from the table above. `[NEEDS COUNSEL: confirm §خامساً wording against the gazette.]`

### B.5 — Internal control systems `[RC §سادساً]`

**REQ-AML-040** — Brokers must maintain appropriate internal systems, comprising: a **clear
written AML/CFT policy approved by senior management**, kept continuously updated; **detailed
written procedures** precisely allocating duties and responsibilities consistent with that policy;
internal systems capable of **detecting unusual operations** or operations with suspected clients
and placing them before the compliance manager; an appropriate **function to verify compliance**
with the internal systems; and systems ensuring the **internal audit function (where it exists)**,
coordinating with the compliance manager, examines the systems for adequacy and effectiveness and
proposes what is needed to complete deficiencies or update them.

*System behaviour:* these become items on the supervisory **inspection checklist**, evidenced by
documents the broker uploads.

### B.6 — Training `[RC §سابعاً]`

**REQ-AML-050** — Brokers must set continuous programmes — **at least annually** — to train staff,
raise their competence in strict compliance, ensure awareness of new developments in ML/TF methods
and trends and counter-systems, and of local, regional, and international developments. Programmes
are set and executed **in coordination with the Unit**, and must: cover all departments, sections,
and all their staff; use specialised institutes, local or foreign, whose purposes include AML/CFT
training, drawing on local and international expertise, within the Unit's general qualification and
training policy; coordinate with the compliance manager on selecting nominees; and **notify the
Unit of all data on those programmes** as set out in §خامساً-1(و).

### B.7 — Red-flag indicators `[RC §ثامناً]`

**REQ-AML-060** — The Controls publish indicative indicators. Recognition depends on adequate
knowledge of the Law, its Executive Regulation, and these Controls, together with practical
experience and information gained from training.

**Money-laundering related** — a client wishing to invest in the property market despite evident
ignorance of fair prices, wanting to complete deals at prices out of proportion to the property's
value and condition · purchase of property in another person's name with no clear connection or
justified relationship to the client · ownership of a number of apartments across a number of
towers · a buyer's income disproportionate to the price of the property being purchased · a client
selling property registered in their personal name to a company they themselves own · a buyer
uninterested in inspecting the property before completing the deal · repeated sale of assets or
property without achieving any profit margin and without reasonable explanation · a client showing
unusually comprehensive knowledge of money-laundering and terrorist-financing matters and the AML
Law · use of another person as a front to complete a sale or purchase with no legitimate financial,
legal, or commercial pretext · seeking to execute transactions without disclosing identity ·
refusal to provide original documents, particularly identity documents · deliberate concealment of
important information such as actual place of residence or telephone number, or giving a
non-existent or disconnected number · use of shell companies to purchase property · early
settlement of a property-finance loan before its term · urgency on the part of the person
completing the purchase or sale.

**Terrorist-financing related** — the client having non-resident partners holding nationalities of
high-risk countries · the client's name appearing on domestic terrorism lists or on lists issued by
the Security Council and the United Nations relating to terrorism and its financing · a client
known to be affiliated with or sympathetic to a terrorist entity or entities listed domestically or
by the United Nations · relationships showing the client's connection to parties linked to conflict
zones, terrorist operations, or crimes.

*System behaviour:* these are **reference data**, seeded bilingually and versioned, used in
supervisory guidance and inspection. The platform does not tag individual private transactions with
them; the broker's own system does.

---

## Part C — Customer due diligence standards `[CDD]`

Held as the supervisory benchmark against which the platform inspects, and as the source of the
identity fields the platform itself collects about applicants.

### C.1 — Beneficial owner `[CDD §1 definition; §5.2]`

**REQ-CDD-001 — Definition.** The natural person who ultimately owns or controls the client, or
the natural person on whose behalf an operation is executed, including persons exercising effective
control over the client, whether the client is a legal person or a legal arrangement.

**REQ-CDD-002 — The three-step cascade for legal persons:**

1. Names, addresses, and nationalities of the **natural persons holding controlling stakes
   representing 25% or more of the company's capital** (if any).
2. Failing that — names, addresses, and nationalities of the **natural persons controlling the
   company by any other means** (where no natural person holds the ownership stake in step 1).
3. Failing both — the name, address, and nationality of the **chairman of the board or the holder
   of the equivalent position**.

**REQ-CDD-003** — Verification uses information, data, or documents from other reliable and
independent sources, sufficient for the entity to be satisfied it has identified the beneficial
owner. Ownership and control structure must be understood, not merely recorded.

*System behaviour:* the platform models ownership as a **graph with percentages**, computes
effective ownership through intermediate entities, applies the cascade, and records which step of
the cascade produced each identified beneficial owner. A flat text field is not an acceptable
implementation of this requirement — that was the predecessor system's defining failure.

### C.2 — Identification of natural persons `[CDD §5.1]`

**Required information:** full name per the identity document · nationality (and other
nationalities) · date and place of birth · sex · current permanent place of residence · place of
residence abroad (if any) · telephone numbers (and mobile, if any) · e-mail (if any) · profession
or occupation · employer and work address · number and type of the official identity document ·
purpose of the dealing · client's signature.

**Required documents:** the official identity-verification document — **national ID card, passport,
refugee travel documents, or armed-forces military card** · documents authorising persons the
client permits to deal on their behalf (if any), particularly an **official power of attorney**.

**Verification:** originals must be inspected and clear photocopies taken and signed by the
competent employee as true copies; the identity document must be **valid** and free of any
indication of tampering.

### C.3 — Identification of legal persons `[CDD §5.2]`

**Required information:** name (trade style) · legal form · nature of activity · head-office
address · telephone numbers · e-mail · number, date, and office of entry in the Commercial Register
(or registration number, date, and the competent administrative registering body) · name, address,
and nationality of the establishment's owner (for sole establishments) · names of persons occupying
senior management positions · the beneficial-owner information per the cascade above · purpose of
the operation or service.

**Required documents:** a **valid extract from the Commercial Register** (or a document proving
registration with the competent administrative body) · the memorandum and articles of association,
or the official gazette in which they were published, and any published amendments · the
preliminary contract (where the company is under formation) signed by the founders showing each
one's share, together with the founders' agent's power of attorney · documents evidencing
authorisation by the establishment or company to the natural person(s) representing it · the
identity document of the establishment's owner (for sole establishments) · identity documents of
the natural persons holding controlling stakes of 25% or more · identity documents of natural
persons controlling by other means · the identity document of the chairman or equivalent where no
person is identified under the preceding two paragraphs · **signature specimens** for persons
authorised to deal.

### C.4 — Risk and enhanced due diligence `[CDD §§8–9]`

**REQ-CDD-010** — Risk assessment must cover client risks and geographic risks, be documented,
kept updated, and made available to the supervisory authority and the Unit.

**REQ-CDD-011** — Clients are classified into **at least three tiers — high, medium, low** — with
procedures proportionate to each, reviewed periodically or on trigger events. Trigger events
expressly include the client's name recurring in internal reports of unusual operations, or a
suspicion report being filed to the Unit concerning the client.

**REQ-CDD-012 — Example high-risk factors:** non-resident clients without permanent residence or
address in Egypt · activities characterised by cash intensity · corporate ownership structures that
appear unusual or complex relative to the nature of the business · not-for-profit entities.

**REQ-CDD-013 — Example high-risk geographies:** countries lacking sound AML/CFT systems as
identified by reliable sources · countries subject to sanctions, embargo, or similar measures ·
countries identified by reliable sources as having high levels of corruption · countries or areas
identified as having high levels of criminal activity · countries or areas identified as providing
funding or support for terrorist activity or in which terrorist organisations operate.

**REQ-CDD-014 — PEPs** (الأشخاص ذوو المخاطر بحكم مناصبهم العامة) — persons entrusted with prominent
public functions domestically or in a foreign state, or who previously were: heads of state or
government, senior politicians, senior government officials, military officials, officials in
judicial bodies, senior executives of state-owned companies, prominent political-party officials.
Also persons entrusted with senior positions by an international organisation, or who previously
were — meaning senior management such as directors, deputy directors, and board members or
equivalent positions. **The definition does not apply to persons holding middle-ranking or more
junior positions.** Obligations extend to legal persons and legal arrangements in which such
persons hold a controlling stake, to their **family members**, to those dealing on their behalf,
and to **parties having close relationships with them**.

**REQ-CDD-015 — EDD measures:** additional information about the client (such as the size of assets
or property, information available through public databases, the internet, etc.) · information on
the source of funds or source of the client's wealth · **senior management approval** to commence
or continue the business relationship · enhanced ongoing monitoring through periodic reports.

**REQ-CDD-016 — Negative lists** (القوائم السلبية) — comprise the lists of terrorist entities and
terrorists organised under **Law 8 of 2015** and its amendments, the lists issued by the **United
Nations Security Council** relating to terrorism, its financing, and the financing of proliferation
of weapons of mass destruction, and **any other lists** the entity prepares or considers it
necessary to refer to.

**REQ-CDD-017** — Screening of the client and/or beneficial owner against the negative lists must
occur **before dealing**, and must be **repeated whenever those lists are updated**.

### C.5 — Circumstances requiring refusal `[CDD §§4.1, 4.3, 4.16]`

**REQ-CDD-020** — No dealing with, or acceptance of funds under, anonymous, apparently fictitious,
or fabricated names.

**REQ-CDD-021** — Where reasonable indicators suggest that applying due diligence would tip the
client off to the suspicion, due diligence is **not** applied, and a suspicion report is sent to the
Unit instead.

**REQ-CDD-022** — Where due diligence cannot be completed, the entity must not begin or continue
any business relationship with the client or execute any operations for them, and must consider
sending a suspicion report stating the reasons for non-completion.

---

## Part D — Foreign ownership of property `[L230, PM2021]`

Relevant because a brokered transaction may involve a non-Egyptian purchaser, and because a broker
who facilitates a void transfer is exposed.

**REQ-FGN-001 — Scope.** Without prejudice to the Investment Law, non-Egyptians — whether natural
or legal persons — may own built property and vacant land in Egypt **whatever the cause of
acquisition of ownership, except inheritance**, in accordance with this Law. "Ownership" here means
full ownership, ownership of the *raqaba*, and usufruct rights.

**REQ-FGN-002 — Corporate nationality test.** In applying this Law, **any company not owned as to
the majority of its capital by Egyptians is treated as a non-Egyptian company — whatever its legal
form, and even if incorporated in Egypt under Egyptian law.**

**REQ-FGN-003 — Conditions `[Article 2]`:**
1. Ownership of **no more than two properties across the entire Republic**, intended for private
   residence of the buyer and their family — "family" meaning spouses and minor children — without
   prejudice to the right to own the properties necessary to carry on the private activity licensed
   by the competent Egyptian authorities.
2. The area of each property must **not exceed four thousand square metres**.
3. The property must not be among those considered antiquities under the Antiquities Protection Law.

The Prime Minister may grant exemption from conditions 1 and 2 in cases he assesses. The Cabinet
may lay down special conditions and rules for ownership in tourist areas and urban communities it
designates.

**REQ-FGN-004 — Exemptions `[Article 3]`.** The conditions do not apply where ownership is by a
foreign government for premises of its diplomatic or consular mission or their annexes, or for the
residence of the head or members of the mission — subject to reciprocity — or where ownership is by
an international or regional organisation.

**REQ-FGN-005 — Vacant land `[Article 4]`.** A non-Egyptian who acquires vacant land must **begin
construction within a period not exceeding five years following the date of registration of the
disposition**. If that period lapses without work having begun, the prohibition period in the
following Article is extended by a period equal to the delay.

**REQ-FGN-006 — Disposal lock `[Article 5]`.** A non-Egyptian who has acquired property under this
Law **may not dispose of it by any of the dispositions transferring ownership before five years
have passed from the date of acquisition**. The Prime Minister may nonetheless permit disposal
before that period in cases he assesses.

**REQ-FGN-007 — Nullity `[Article 6]`.** Any disposition made in contravention of this Law is
**void, and may not be registered**. Every interested party and the Public Prosecution may seek a
declaration of nullity, and the court shall rule it **of its own motion**.

**REQ-FGN-008 — Registration `[Article 7]`.** The Real Estate Publicity and Documentation Authority
(مصلحة الشهر العقاري والتوثيق) implements this Law. Special offices are established, competent for
all publicity and documentation matters concerning non-Egyptians' applications, and these offices
must **complete registration procedures within ten days at most** from the date the required papers
are complete.

**REQ-FGN-009 — Delegation `[PM2021]`.** By Prime Ministerial Decree 2021 of 2026 (الجريدة الرسمية,
issue 26 (تابع), 25 June 2026), the Minister of Justice is delegated to exercise the Prime
Minister's competences under **Articles 2 and 5** of Law 230/1996. PM Decree 2725 of 2024 is
repealed. **The exemption route therefore runs to the Ministry of Justice, not the Cabinet.**

*System behaviour:* an **advisory eligibility check** on a brokerage contract involving a
non-Egyptian purchaser, producing guidance and a supervisory flag — never an automatic bar, since
exemptions exist and are granted case by case. `[NEEDS COUNSEL: confirm current position on tourist
areas, Sinai and border zones, and agricultural land before this check goes live.]`

---

## Part E — Data protection `[L151 + Executive Regulation]`

This platform holds national ID numbers, dates of birth, addresses, employment, declarations about
political and family connections, and supervisory findings. It is squarely within scope.

**REQ-DPA-001** — Lawful basis, purpose limitation, and data minimisation. Collect only what an
instrument in Parts A–D requires.

**REQ-DPA-002** — Security: encryption at rest for identifying data, access control, and **logging
of read access, not only writes**. Who *viewed* a file is as sensitive as who changed it.

**REQ-DPA-003** — Data-subject rights, and the standing conflict with retention: an erasure request
cannot override a statutory retention duty under `REQ-AML-030`. The system must present this
conflict to the officer explicitly rather than silently choosing.

**REQ-DPA-004** — Breach notification within the statutory window; controls on cross-border
transfer; assessment of whether a data protection officer is required.

`[NEEDS COUNSEL: confirm the current compliance deadline and the registration/licensing position
with the Data Protection Centre.]`

---

## Part F — Requirement traceability rules for this codebase

1. Every enforcement point in code references a `REQ-*` ID in a comment.
2. Every `REQ-*` that produces a threshold, list, or checklist is implemented as **versioned
   configuration**, with an effective date, never a literal in code.
3. A decision made in the past is re-evaluated against the configuration version **in force at the
   time of the decision**, never the current one.
4. Any requirement marked `[NEEDS COUNSEL]` must not gate a user action in production until
   cleared. It may inform, warn, and flag for human review.
5. When counsel clears or corrects a requirement, this file is updated first, then the code.
