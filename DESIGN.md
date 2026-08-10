---
name: Osool
description: The digital Real Estate Brokers Register of the Government of Egypt — a civil register made fast and legible.
colors:
  navy-institutional: "#0F2D53"
  navy-deep: "#0C2444"
  navy-wash: "#EEF2F8"
  brass-seal: "#A7844E"
  brass-light: "#CFAF76"
  brass-legible: "#6E5630"
  ink: "#16181D"
  ink-muted: "#4A5261"
  ink-faint: "#6B7383"
  paper: "#FFFFFF"
  paper-sunk: "#F4F5F7"
  rule: "#DDE1E8"
  rule-strong: "#C3CAD6"
  confirmed: "#1A6B46"
  caution: "#8A5A12"
  blocking: "#A32626"
  informational: "#24466F"
typography:
  display:
    fontFamily: "'Plex Arabic', 'Plex Latin', 'Segoe UI', Tahoma, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  headline:
    fontFamily: "'Plex Arabic', 'Plex Latin', 'Segoe UI', Tahoma, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "'Plex Arabic', 'Plex Latin', 'Segoe UI', Tahoma, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "'Plex Arabic', 'Plex Latin', 'Segoe UI', Tahoma, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  data:
    fontFamily: "'Plex Arabic', 'Plex Latin', 'Segoe UI', Tahoma, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Plex Arabic', 'Plex Latin', 'Segoe UI', Tahoma, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.05em"
  mono:
    fontFamily: "'IBM Plex Mono', 'Cascadia Mono', Consolas, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    letterSpacing: "-0.01em"
rounded:
  sharp: "0px"
  xs: "2px"
  sm: "3px"
  md: "4px"
spacing:
  tight: "0.375rem"
  field: "0.625rem"
  block: "1rem"
  section: "1.5rem"
  page: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.navy-institutional}"
    textColor: "{colors.paper}"
    rounded: "{rounded.xs}"
    padding: "0 0.875rem"
    height: "2.25rem"
  button-primary-hover:
    backgroundColor: "#0C2444"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xs}"
    padding: "0 0.875rem"
    height: "2.25rem"
  button-touch:
    backgroundColor: "{colors.navy-institutional}"
    textColor: "{colors.paper}"
    rounded: "{rounded.xs}"
    padding: "0 1.25rem"
    height: "2.75rem"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xs}"
    padding: "0.5rem 0.75rem"
    height: "2.75rem"
  panel:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.sharp}"
    padding: "1rem"
  status-confirmed:
    backgroundColor: "#E6F2EB"
    textColor: "{colors.confirmed}"
    rounded: "{rounded.xs}"
    padding: "0.125rem 0.5rem"
  status-blocking:
    backgroundColor: "#FBEAEA"
    textColor: "{colors.blocking}"
    rounded: "{rounded.xs}"
    padding: "0.125rem 0.5rem"
  nav-item-active:
    backgroundColor: "#24466F"
    textColor: "{colors.paper}"
    rounded: "{rounded.xs}"
    padding: "0.375rem 0.75rem"
---

# Design System: Osool

## Overview

**Creative North Star: "The Register Room"**

The room where the official ledger is kept. Ruled lines, numbered boxes, a stamp, a column capital
over the door. Everything in it is there because a record has to be found, read, and relied upon
years later by someone who was not present when it was written.

The product is drawn as that room made fast. Structure does the work: rules, alignment, and a
visible grid carry the design where a consumer product would reach for shadows and gradients.
There is exactly one ornamental gesture in the entire system — a horizontal brass line, echoing
the abacus of the column capital in the logo — and it appears under page titles, under the sign-in
heading, and across the top of the printed registration card. Nothing else decorates.

The palette was sampled from the logo's pixels rather than chosen beside it, which is why the navy
is a specific #0F2D53 and not a SaaS blue. The register is Arabic-first and right-to-left; English
is a full mirror produced by logical properties, not a second stylesheet. Density is deliberate in
the back office and deliberately relaxed in the broker portal, because an examiner working a queue
all day and a broker photographing a commercial register on a phone are not the same person.

**Key Characteristics:**
- Structure over ornament: 1px rules and alignment instead of shadows
- Radius tops out at 4px; most surfaces are square
- Arabic leads; every positional value is logical, never left/right
- Meaning is never carried by colour alone — every status has a drawn icon and a word
- One level of surface, never two; a table sits directly in a panel
- Latin runs inside Arabic are direction-isolated so a registration number cannot reverse

## Colors

An institutional palette with authority rather than warmth: one deep navy that speaks for the
Authority, one brass that marks the register itself, and four semantic colours that mean something
and never decorate.

### Primary
- **Institutional Navy** (`#0F2D53`): The Authority's voice. The chrome — header and sidebar — the
  primary button, and every heading. Sampled from the logo's wordmark and column shaft.
- **Deep Navy** (`#0C2444`): The sidebar ground, one step darker than the header so the two
  surfaces are distinguishable without a border doing the work alone.

### Secondary
- **Brass Seal** (`#A7844E`): The register's own mark, sampled from the OSOOL lettering and the
  column's abacus. Used for the horizontal rule under page titles and the active navigation edge.
  Never used for large areas.
- **Brass Legible** (`#6E5630`): The only brass that carries words. Brass at its natural value is
  about 2.9:1 on white and fails AA, so text-bearing brass is this darker value.

### Neutral
- **Ink** (`#16181D`): Body text. Near-black rather than black, because pure black on white
  vibrates on the monitors these screens are actually read on.
- **Ink Muted** (`#4A5261`): Descriptions, secondary rows, table meta.
- **Ink Faint** (`#6B7383`): Column labels, hints, timestamps.
- **Paper** (`#FFFFFF`) / **Paper Sunk** (`#F4F5F7`): Panel surface and page ground. The page is
  the darker of the two, so a panel reads as a sheet laid on a desk.
- **Rule** (`#DDE1E8`) / **Rule Strong** (`#C3CAD6`): Row separators and container edges. These two
  values do most of the visual work in the product.

### Semantic
- **Confirmed** (`#1A6B46`), **Caution** (`#8A5A12`), **Blocking** (`#A32626`),
  **Informational** (`#24466F`): status only, each with a soft companion for the pill background.

### Named Rules

**The Meaning-Only Rule.** Semantic colour states a fact about a record — approved, blocked,
awaiting activation. It is never used to make a screen livelier, and no element is tinted because
it looked plain.

**The Redundant Signal Rule.** Every status renders three signals at once: a drawn icon, a colour,
and the word itself. Remove any two and it still reads. These decisions have legal consequences and
a colour-blind examiner must read them correctly.

**The One Gesture Rule.** The brass horizontal rule is the only ornament in the system. If a screen
needs decoration to look finished, its hierarchy is wrong.

## Typography

**Display / Body Font:** IBM Plex Sans Arabic (self-hosted, as "Plex Arabic")
**Latin Companion:** IBM Plex Sans (self-hosted, as "Plex Latin")

**Character:** One family in two scripts, drawn to the same rhythm and weight, so a mixed
Arabic-and-Latin line sits on one baseline instead of looking like a fallback. Arabic leads the
stack in both directions; a Latin string inside an Arabic sentence resolves to Plex Latin through
the Arabic face's `unicode-range`, so a single stack serves mixed script without a wrapper element.
Both faces are self-hosted: a government register must not depend on a third-party CDN to render
its own language.

### Hierarchy
- **Display** (600, 2rem, 1.3): The public landing title. One per site, not one per screen.
- **Headline** (600, 1.375rem, 1.3): Page titles in the back office, above the brass rule.
- **Title** (600, 1.125rem, 1.3): Panel headings.
- **Body** (400, 0.9375rem, 1.55): The interface default — labels, prose, form values. 15px rather
  than the 14px a Latin-only product would use, because Plex Arabic's x-height runs smaller at the
  same nominal size and 14px Arabic is a squint.
- **Data** (400, 0.8125rem, 1.5): Table body. Density is bought here, in one place, deliberately.
- **Label** (600, 0.6875rem, uppercase, 0.05em): Column headings and the four-part notice terms.
- **Mono** (400, 0.75rem, -0.01em): Hashes, fault references, and the plain-text link in a
  transactional email. Monospace only where the characters are meant to be compared or transcribed
  character by character — never as a costume for "technical".

Arabic gets a 1.75 line-height where Latin gets 1.55 — its ascenders and descenders need the room.
One rule, applied once, on `[lang='ar'], [dir='rtl']`.

### Named Rules

**The Isolated Run Rule.** Numerals, dates, phone numbers, email addresses, registration numbers,
and hashes are wrapped in a direction-isolated run. Without it the bidirectional algorithm treats
the slash in `2026/1183` as neutral and renders `1183/2026`, and an official reads out the wrong
number.

**The Reading Measure Rule.** Prose is held to 42rem. A one-line description stretched across a
1500px register screen is a line nobody finishes.

## Layout

A fixed chrome and a fluid page. The header is 56px and sticky; the sidebar is 240px, sticky
beneath it, and present from `lg` (1024px) upward — below that it becomes a panel entering from the
same inline-start edge it occupies on the desktop, so it slides in from the right in Arabic and the
left in English without a second implementation.

Content sits in a 1560px maximum with 16px gutters rising to 24px at `sm`. Two-column page layouts
declare their split explicitly — `[minmax(0,1fr) minmax(0,22rem)]` for a primary/secondary pair —
and collapse to one column rather than compressing, because a five-column register squeezed into
580px renders every official as a truncated prefix.

Density is a property of the surface, not the product: tables run at 13px with 8px vertical cell
padding; forms and prose run at 15px with 44px controls.

### Named Rules

**The Logical-Only Rule.** No `left`, no `right`, no `ml-`, no `pr-`. Padding is `ps-`/`pe-`,
margins are `ms-`/`me-`, borders are `border-s`/`border-e`. One stylesheet serves both directions,
and a mirroring bug becomes impossible rather than merely unlikely.

**The Declared Column Rule.** Data tables set `table-layout: fixed` and declare every column width.
Under the default algorithm one long unbreakable token widens its column for the entire table, and
an eight-column register ends up 300px wider than the screen with the last two columns permanently
off the edge.

## Elevation & Depth

This system is flat. Depth is tonal: the page ground is darker than the panel that sits on it, and
containers are separated by 1px rules rather than by shadow. There are exactly three shadows in the
product and each one reports a fact.

### Shadow Vocabulary
- **Dialog** (`0 8px 28px -6px rgb(9 27 51 / 0.28)`): something genuinely floating above the page.
- **Menu** (`0 4px 14px -3px rgb(9 27 51 / 0.18)`): an open dropdown.
- **Sticky** (`0 1px 0 0 #C3CAD6, 0 4px 6px -4px rgb(9 27 51 / 0.15)`): applied to a sticky table
  header to say that rows are hidden underneath it. This is the only non-floating shadow, and it is
  information rather than ornament.

### Named Rules

**The Flat-By-Default Rule.** A surface gets a border, not a shadow. If it needs elevation it must
be able to name what it is floating above.

## Shapes

Square, or nearly. Radius runs 0–4px and stops: buttons, inputs, and status pills take 2px; nothing
takes more. The logo is a classical column capital — flat horizontal rules, vertical fluting,
square corners — and the geometry of the system follows from it rather than fighting it.

Rules are 1px by default and 3px only for the brass gesture. Borders carry meaning: a 1px rule
separates, a 2px border marks an invalid field, and the brass edge on the active navigation item is
the column's fluting.

## Components

### Buttons
- **Shape:** Effectively square (2px radius)
- **Primary:** Institutional navy fill, white text, 36px tall in the back office
- **Touch:** The same button at 44px minimum, used throughout the broker portal
- **Secondary / Ghost / Chrome:** Bordered on paper; text-only; bordered on navy respectively
- **Hover / Focus:** Background steps one value darker; focus is a 2px navy outline at 2px offset,
  switching to brass inside the navy chrome where a navy ring would be invisible
- **Disabled:** A defined surface — sunk paper, faint ink, rule border — not half opacity. A
  disabled control is often the thing the user is trying to understand; 50% opacity turns navy into
  a muddy grey that fails contrast.
- **Busy:** A spinner appears beside the label and the label stays. A button whose text changes
  width makes the row reflow under the pointer.

### Inputs / Fields
- **Style:** 1px rule-strong border on paper, 2px radius, 44px tall
- **Focus:** Border shifts to navy plus a navy outline at zero offset
- **Invalid:** Border goes to 2px and to blocking — a weight change as well as a colour change
- **Autofill:** Overridden back to paper with an inset shadow, so the two most important fields in
  the product are not the only ones drawn in Chrome's colours
- **Description wiring:** `Field` clones its control and attaches `aria-describedby`,
  `aria-invalid`, and `aria-required`. A call site cannot forget.

### Status Pills
- **Style:** Soft semantic background, matching border at 30% alpha, drawn Lucide icon, text label
- **Variants:** confirmed · caution · blocking · informational · neutral
- **Print:** `data-status` forces colour retention when the browser would otherwise drop backgrounds

### Panels
- **Corner Style:** Square
- **Background:** Paper on a sunk page
- **Border:** 1px rule; header and footer separated by the same
- **Shadow:** None
- **Flush variant:** Removes body padding so a table fills the panel edge to edge, because a table
  already has internal padding and wrapping it in another 16px is the nested-card tell in costume

### Data Tables
- Sticky header with the sticky shadow, so an examiner scrolling a queue never loses the columns
- Zebra banding at `color-mix(paper-sunk 55%)` — enough to track a wide row, not enough to stripe
- Fixed layout with declared column widths; long free text clamped to two lines
- Horizontal scroll below the declared minimum rather than compression
- A visually-hidden `<caption>` gives the table its accessible name

### Navigation
- **Sidebar:** Grouped sections with uppercase labels in chrome-faint, items at 15px
- **Active state:** Three simultaneous marks — a lighter navy surface, semibold weight, and a 2px
  brass edge on the inline-start — because a background change alone is nearly invisible on the
  navy chrome on a bad monitor. `aria-current="page"` is set from the pathname.
- **Mobile:** A drawer from the inline-start edge; Escape closes it, body scroll locks

### The Four-Part Notice (signature component)

Every refusal in the product renders through one component whose four props are all required, so a
bare "an error occurred" cannot be shipped through it. It draws as an official notice rather than a
web alert: a tinted band across the top carrying the finding, a rule, then the reasoning set out
beneath as a description list — *why*, *what to do next*, *who to ask*. The obvious alternative, a
card with a four-pixel coloured stripe down one edge, is the most recognisable component on the
generic web and would make a legal refusal look like a dismissible toast.

## Do's and Don'ts

### Do:
- **Do** use logical properties for every positional value, without exception.
- **Do** wrap every numeral, date, reference number, and hash in a direction-isolated run.
- **Do** pair every status colour with a drawn icon and a text label.
- **Do** declare column widths on data tables and set `table-layout: fixed`.
- **Do** state row counts as "showing 100 of 4,312" — the difference between "there are a hundred"
  and "you are looking at the first hundred" is the difference between a complete answer and a
  wrong one.
- **Do** keep the busy spinner animating under `prefers-reduced-motion`. A frozen spinner says the
  request died.
- **Do** give a refusal all four parts, including the ones nobody planned for: crashes and 404s.

### Don't:
- **Don't** add a second level of surface. A table goes in a panel, not in a card in a panel.
- **Don't** use a coloured 4px edge stripe on an alert or a card.
- **Don't** carry meaning in colour alone, anywhere, for any reason.
- **Don't** use Unicode characters as icons. Icons are drawn, from Lucide, at one stroke weight.
- **Don't** round anything past 4px.
- **Don't** use a shadow on something that is not floating, except the sticky table header.
- **Don't** let `nameAr ?? name` decide which name leads — the reader's own language leads, in both
  directions.
- **Don't** hard-code a threshold, a deadline, or a category band into a component. Those live in
  the versioned `RuleSet` tables.
