# 03 — Design Direction

> The first prototype looked machine-made. This document exists so the next one does not.

---

## 1. The mode this product is in

Impeccable names four surface modes — **persuade**, **operate**, **read**, **experience**.

**This product is `operate`,** with one exception. A government employee processing the fortieth
application of the day, and a broker uploading a photograph of their commercial register on a
phone, are both trying to *complete a task*. Design serves the task. Nothing is here to impress.

The exception is the **public landing and verification pages**, which are `persuade` and `read` —
they must make an unfamiliar citizen trust the register and find what they need in one screen.

Naming the mode changes the decisions: in `operate`, density beats whitespace, a table beats a
card grid, a label beats an icon, and the fastest path beats the prettiest one.

---

## 2. Install Impeccable

```bash
# Node 22.12+ required
npx impeccable install
```

In Claude Code, add the marketplace, then `/plugin` → install Impeccable. First run:

```
/impeccable init
```

That writes `PRODUCT.md` (already drafted in this repo — point it there rather than letting it
invent one) and, after the first design pass, `DESIGN.md` in the Google Stitch format.

Commands worth knowing for this project:

| Command | Use it when |
|---|---|
| `/impeccable polish` | A screen works but looks machine-made. Final quality pass within the existing system. |
| `/impeccable audit` | Before considering a screen done. Production-quality check. |
| `/impeccable typeset` | Typography hierarchy — especially important with mixed Arabic and Latin. |
| `/impeccable distill` | A screen has too much on it. Strips to essence. |
| `/impeccable document` | Emit `DESIGN.md` so the visual system is portable across tools. |
| `/impeccable live` | Iterate visually against the running app at localhost. |

There is also a CI detector — `npx impeccable detect src/` — that can gate a pull request, and a
Chrome extension that runs the detector overlay on any running page.

**Important:** Impeccable respects an existing system rather than replacing it. Establish tokens and
components first, then run it. If you run it against nothing, it will invent something.

---

## 3. Why the first prototype read as AI-made

Name the tells, so they can be avoided deliberately:

| Tell | What to do instead |
|---|---|
| **AI beige** — warm cream-and-sand default | Choose a palette with a reason behind it. See §4. |
| **Italic serif in a display heading** | One display voice, used consistently. No decorative italic. |
| **Everything equal** — three cards, same size, same weight, no hierarchy | Decide what matters most on each screen and make it visibly bigger. |
| **Cards inside cards inside cards** | One level of surface. A table on a page, not a table in a card in a panel. |
| **Generic drop shadows on everything** | Elevation only where something genuinely floats: a dialog, a dropdown. |
| **Eyebrow chip above every heading** | Delete. If the section needs a label, the heading is the label. |
| **Icon tiles in a row of three** | Only if each icon carries meaning the words do not. |
| **Numbered section labels** — 01 Discover, 02 Design | Only for genuinely sequential steps. |
| **Pulsing dot / "AI is thinking"** | A real progress state with real information. |
| **Over-rounding** — everything at 16px+ radius | Pick a radius with intent. A government register is not a consumer app. |
| **Generic CTA** — "Continue", "Get started" | Say what happens: "Submit to the Authority", "Request completions". |

---

## 4. Visual direction for this product

This is where taste has to be exercised deliberately rather than defaulted into.

**The reference points are not SaaS dashboards.** They are: the Egyptian official gazette's
typography, government forms with their numbered boxes and signature blocks, and the visual
language of records and stamps. The product should feel like a **serious civil register that has
been made fast and legible** — not like a startup that happens to be about property.

Directional guidance, to be resolved into `DESIGN.md`:

- **A palette with authority, not warmth.** A deep, near-black ink for text; a single institutional
  accent that is not the generic SaaS blue; a restrained secondary. Semantic colours carry meaning
  and nothing else: caution, blocking, confirmed, informational. Never decorate with colour.
- **Typography: Arabic leads.** Choose a real Arabic face with excellent screen rendering — IBM
  Plex Sans Arabic, Cairo, Tajawal, or Noto Sans Arabic — and pair it deliberately with a Latin
  face that shares its weight and rhythm. Arabic must never look like a fallback. Numerals stay
  Latin (Western Arabic numerals) throughout, because registration numbers, dates, and currency
  values must be unambiguous.
- **Restrained radius.** Sharp or nearly sharp. This is a register.
- **Density over air.** An examiner works through a queue. Show them the queue.
- **Structure carries the design.** Rules, alignment, and a visible grid do the work that shadows
  and gradients would otherwise be asked to do.
- **The logo already exists** at the project root. Extract its palette and its geometry, and let
  the system follow from it rather than fighting it.

**Anti-references** — write these into `PRODUCT.md` so every command reads them: purple gradients ·
glassmorphism · beige-and-terracotta warmth · 3D illustrations · stock photography of handshakes ·
"boost your productivity" copy · emoji in the interface · card grids of equal cards.

---

## 5. Arabic and RTL — non-negotiable

- **Design Arabic-RTL first**, then mirror to English-LTR. Not the other way round.
- Mirror: sidebar side, directional icons, table column order, form label alignment, breadcrumbs,
  progress-step direction.
- **Do not mirror:** numerals, dates, phone numbers, email addresses, Latin-script names,
  registration numbers, or any code. These stay left-to-right inside right-to-left text, and they
  must not break the line.
- **Mixed script is the norm here**, not the exception — an Arabic company name beside a Latin
  transliteration beside a numeric registration ID, in the same table row. Solve this once in a
  component and reuse it everywhere.
- Use CSS logical properties (`margin-inline-start`, `inset-inline-end`, `padding-block`) so a
  single stylesheet serves both directions.
- Test the language switch on a filtered, paginated table — it must preserve state.

---

## 6. Content and tone

This is a government system speaking to citizens and officials. The voice is **plain, direct, and
respectful**. No marketing language anywhere.

**The standard shape of a blocked action** — four parts, always in this order:

1. **What is blocked**, plainly. "This application cannot be submitted."
2. **Why**, in one sentence a non-lawyer understands, with the rule named. "Paid-up capital of
   EGP 30,000 does not meet the minimum for Category C (EGP 50,000) — Decree 578/2025, Article 2."
3. **What to do next**, specifically and actionably. "Either raise the registered capital, or
   apply under Category D, which permits contracts up to EGP 10,000,000."
4. **Who to ask**, if the user cannot resolve it themselves.

Never a bare "not allowed", "invalid input", or "an error occurred".

**Every rule reference must be checkable.** If the interface cites an article, it cites the real
one from `01-LEGAL-REFERENCE.md`, by its `REQ-*` ID internally.

**Tone in the signals queue matters especially.** These screens concern possible irregularity by
named people. The wording must be neutral and evidential — "this application was approved while
two required documents were absent" — never accusatory, never "suspicious officer".

---

## 7. Accessibility

- WCAG AA contrast minimum throughout. Government systems are used on bad monitors in bright rooms.
- **Never encode meaning in colour alone.** Every status carries an icon and a text label. These
  decisions have legal consequences; a colour-blind examiner must read them correctly.
- Full keyboard operation for the back office. An examiner processing forty files will not reach
  for a mouse.
- Real focus states, never the browser default ring.
- Minimum 44px touch targets on the broker portal — it will be used one-handed on a phone.

---

## 8. The two audiences, designed differently

**The broker portal** is used rarely, by someone unfamiliar, often on a phone, possibly with low
confidence in technology. Design it like a form a post office would hand you: one thing per screen,
generous targets, plain language, obvious progress, nothing that can be got irreversibly wrong.

**The government back office** is used all day, by someone who knows the process better than the
software does. Design it like a professional tool: dense, keyboard-driven, information-rich, with
the queue always visible and the next action always obvious.

Same design system. Very different application of it. Do not make the back office friendly at the
cost of speed, and do not make the portal efficient at the cost of comprehensibility.
