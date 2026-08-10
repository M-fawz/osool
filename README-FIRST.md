# Osool — Documentation Set

Drop these into `C:\Users\Fawzy\Desktop\osool` so the structure looks like this:

```
osool/
├── CLAUDE.md                          <- root. Claude Code reads this every session.
├── PRODUCT.md                         <- root. Impeccable reads this before every command.
├── BUILD-PROMPT.md                    <- root (or anywhere). The prompts you paste, in order.
├── public/
│   └── logo/                          <- put your Osool logo here
└── docs/
    ├── 00-VISION-AND-SOLUTION.md      <- what we propose to the government, and why
    ├── 01-LEGAL-REFERENCE.md          <- every law, consolidated. The source of truth.
    ├── 02-SYSTEM-ARCHITECTURE.md      <- stack, roles, state machine, rules engine, audit
    ├── 03-DESIGN-DIRECTION.md         <- Impeccable, anti-slop, Arabic/RTL, tone
    └── 04-BUILD-PLAN.md               <- phases and proof points
```

## Order of use

1. Copy the files into place.
2. Put the logo in `public/logo/`.
3. Open Claude Code in the project folder.
4. Open `BUILD-PROMPT.md` and paste **Prompt 0**. Let it finish completely.
5. Then Prompt 1, then Prompt 2, and so on. One at a time.

## The one thing to keep true

`docs/01-LEGAL-REFERENCE.md` is the source of truth for every rule in the system. When a lawyer
confirms or corrects something, update that file **first**, then the code. Every enforcement point
in the codebase cites a `REQ-*` ID from it.
