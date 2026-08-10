# PRODUCT.md

*Read by every Impeccable command before it designs. Keep it short and true.*

---

## Product

**Osool (أصول)** — the digital Real Estate Brokers Register for the Government of Egypt, operated
by GOEIC under the Ministry of Investment and Foreign Trade. It registers and supervises real-estate
brokers, digitises the Authority's existing application-review workflow, and surfaces automated
process-integrity signals.

It is a government register. It is not a marketplace, not a SaaS product, and not a consumer app.

## Users

**Government officials** — registry clerks, examiners, reviewers, card issuers, AML supervisors,
inspectors, analysts, auditors. They process queues of applications all day, know the legal process
better than the software does, and work in Arabic. They need speed, density, and keyboard control.

**Brokers and their agents** — the supervised population. They use the system rarely, often on a
mid-range Android phone, sometimes with low confidence in technology. They need one thing per
screen, plain language, and no way to get something irreversibly wrong.

**Citizens** — using public verification to check whether a broker is genuinely registered. One
screen, one answer, immediate trust.

## Mode

**Operate.** Design serves the task. The exception is the public landing and verification pages,
which are **persuade** and **read**.

## Brand voice

Plain, direct, institutional, respectful. The register of a serious civil authority. Never
marketing, never clever, never warm-and-fuzzy. It speaks the way an official form speaks when the
form has been written well.

Every refusal explains: what is blocked, why with the rule named in plain language, the exact next
step, and who to ask.

## Language

**Arabic-RTL is primary.** English-LTR is a full mirror. Numerals, dates, phone numbers, email
addresses, and registration numbers stay LTR inside RTL text. Mixed Arabic-and-Latin content in a
single row is normal here and must be handled deliberately, not accidentally.

## Visual reference points

Egyptian official gazette typography · government forms with numbered boxes and signature blocks ·
the visual language of registers, seals, and records. A serious civil register made fast and
legible.

The project logo is at `public/logo/`. Derive the palette and geometry from it.

## Anti-references — never produce these

Purple gradients · glassmorphism · AI beige (cream-and-sand warmth) · italic serif display headings ·
eyebrow chips above headings · cards nested inside cards · generic drop shadows on everything ·
rows of three equal icon tiles · numbered section labels (01 / 02 / 03) · pulsing "AI is thinking"
dots · over-rounded corners · 3D illustrations · stock photography · emoji in the interface ·
generic CTAs ("Get started", "Continue") · "boost your productivity" copy.

## Constraints

- WCAG AA contrast minimum; meaning never carried by colour alone; every status has an icon and a
  text label, because these decisions have legal consequences.
- Full keyboard operation in the back office.
- 44px minimum touch targets in the broker portal.
- Density over whitespace in the back office; clarity over density in the portal.
- The signals screens concern possible irregularity by named officials. Wording is neutral and
  evidential, never accusatory.
