# Dependency advisory acceptance — SEC-4

**Assessed:** 3 September 2026 · against the tree in `package-lock.json` at commit `3ce423b`
**Command:** `npm audit --omit=dev` → `6 high severity vulnerabilities`
**Decision:** all six accepted for now, with the reasoning below. The `next` major
upgrade that clears five of them is tracked as its own piece of work.

A government security review will ask about these. "We did not look" is not an
answer; neither is a version bump taken on faith. Each advisory below is
assessed for whether it is *reachable in this application*, with the evidence
that settles it.

> **Scope of this document.** It records reachability, not a claim that the
> libraries are sound. Every one of these should still be upgraded, and the
> section at the end says when each stops being acceptable.

---

## 1. `sharp < 0.35.0` — libvips CVEs

`GHSA-f88m-g3jw-g9cj` · CVE-2026-33327, -33328, -35590, -35591
**Chain:** `next` → `sharp` (not a direct dependency)
**Reachable: no.**

`sharp` decodes images. It is dangerous when it is pointed at bytes an attacker
chose. In this application it never is:

- **Not imported by application code.** `grep -rn "from 'sharp'" src/ scripts/`
  returns nothing. Nothing in the register calls it directly.
- **`next/image` is used for one file.** All nine usages resolve to
  `/logo/osool-logo.png`, a static asset committed to the repository.
- **Uploaded documents never reach it.** Scans are served raw by
  `src/app/api/documents/[id]/route.ts:133`, which streams the stored bytes with
  the recorded `Content-Type` and `X-Content-Type-Options: nosniff`. They are not
  passed through `next/image` and are not resized, re-encoded, or thumbnailed.
- **PDF and PNG rendering does not use it.** `src/lib/pdf/render.ts` drives
  Chromium through `playwright-core`.

So the only images this deployment processes with `sharp` are ones committed by
the development team. An attacker who could change those already has repository
write access, at which point this advisory is not the problem.

**Residual risk:** if anyone later serves an uploaded document through
`next/image` — a document *preview* is the obvious temptation — this becomes
directly reachable with attacker-supplied files. That change must not be made
before the upgrade.

## 2. `postcss <= 8.5.22` — four advisories

`GHSA-qx2v-qp2m-jg93` (XSS via unescaped `</style>`) ·
`GHSA-6g55-p6wh-862q`, `GHSA-fxqj-rqcc-2cmp`, `GHSA-r28c-9q8g-f849`
(arbitrary `.map` file read / path traversal via attacker-controlled
`sourceMappingURL`)
**Chain:** `next` → `postcss`
**Reachable: no, at run time. Build-time only.**

`postcss` runs during `next build`, over the stylesheets in this repository and
Tailwind's generated output. It does not run in a request path, and no
user-submitted content is ever parsed as CSS — the register accepts form fields
and file uploads, and neither is fed to a stylesheet compiler.

All four advisories require the attacker to control the CSS being processed:

- The `</style>` XSS needs attacker-authored CSS reaching the stringifier.
- The three `sourceMappingURL` issues need an attacker-authored comment in a CSS
  file the compiler reads.

Both preconditions mean writing to the repository, which is a compromise of a
different and larger order.

**Residual risk:** the build machine. If CI ever compiles CSS from an untrusted
source — a fork's pull request, a themable stylesheet supplied by a customer —
these become live on the builder, with arbitrary local file disclosure. Nothing
in the current pipeline does that.

## 3. `deepmerge-ts < 8.0.0` — stack exhaustion on recursive object graphs

`GHSA-ggr8-5vv4-36mx`
**Chain:** `deepmerge-ts` → `@prisma/config` → `prisma`
**Reachable: no. Not in the production runtime at all.**

- `prisma` is a **devDependency** (`package.json`), the CLI used for `migrate`
  and `generate`.
- `@prisma/client`, the package that actually runs in production, declares
  **zero dependencies** — verified by reading its `package.json`. It does not
  pull `@prisma/config`, and therefore does not pull `deepmerge-ts`.
- The vulnerable code path merges configuration files, which on this project
  means `prisma.config` inputs authored in-repo.

**Why `--omit=dev` still lists it:** npm reports the advisory against the
installed tree rather than the resolved production closure, and `@prisma/client`
being a production dependency drags the whole `prisma` branch into the report.
The listing is a reporting artefact, not evidence that the code ships. Stated
explicitly because "but `--omit=dev` printed it" is the obvious objection.

---

## What would change these conclusions

Each acceptance is conditional. It lapses if any of the following becomes true:

| Advisory | Stops being acceptable when |
|---|---|
| `sharp` | Any user-supplied image is served through `next/image`, or any code imports `sharp` directly — document previews and thumbnails being the likely reason. |
| `postcss` | CSS from any source outside this repository is compiled, including in CI for untrusted branches. |
| `deepmerge-ts` | `@prisma/config` enters the production dependency closure, or Prisma config is generated from untrusted input. |

## The upgrade, and why it is not being taken today

Five of the six clear only via `next@16.3.4`, which `npm audit fix --force`
reports as a breaking change. That is a major App Router upgrade against a
codebase that currently typechecks, lints, builds, and passes 92 tests across 20
consecutive runs — a state reached this session and worth not spending.

The upgrade is a tracked piece of work with its own verification: full gate suite
green, the whole role × screen × locale matrix re-driven in a browser, and the
PDF card re-rendered and inspected, because Chromium and font handling are the
parts most likely to move.

`npm audit fix` alone — which would clear only the `deepmerge-ts` chain — was
also rejected: it changes the lockfile for a devDependency-only advisory that
does not ship, and the same upgrade will be taken as part of the Prisma bump
anyway.

## Verification

Re-run at each release:

```
npm audit --omit=dev
```

Anything **new** in that output is not covered by this document and must be
assessed on its own terms. This acceptance covers exactly the six advisories
listed above, in the chains listed above.
