# Evidence — read-only production exposure check

**Run:** 3 September 2026, from the development machine
**Scope authorised:** GET only. No POST/PATCH/DELETE, no DDL, no privilege
change. Credentials taken only from `.env.prod.pulled`, already present in the
working directory.
**Result: the Supabase project no longer exists. The exposure is now
unverifiable rather than closed.**

---

## Method

To prove read access *without extracting personal data*, the check used
PostgREST's `Prefer: count=exact` with `limit=0` — which returns a row count in
the `Content-Range` header while the response body stays `[]`. Had the endpoint
answered, this would have established exposure and row counts with nothing
sensitive written to disk.

It never got that far: the host does not resolve.

## Verbatim results

```
$ curl -s -S -o /dev/null -w 'http=%{http_code}\n' "$SUPABASE_URL/rest/v1/"
http=000
curl: (6) Could not resolve host: <redacted>.supabase.co

$ nslookup <redacted>.supabase.co
*** dev.opt can't find <redacted>.supabase.co: Non-existent domain
Server:  dev.opt
Address:  fe80::1
```

The database host in `DATABASE_URL` — a different hostname from the REST
endpoint — also returns **`Non-existent domain`**.

Eight tables were attempted (`user`, `session`, `application`, `audit_event`,
`document`, `party`, `registration`, `broker_entity`). All eight returned
`HTTP 000` with no `Content-Range`, i.e. no connection was established.

## Control — this is not a local network fault

```
$ curl -s -o /dev/null -w '%{http_code}' https://supabase.com   → 200
$ curl -s -o /dev/null -w '%{http_code}' https://example.com    → 200
```

DNS and egress from this machine are working. The project hostname specifically
does not exist: `NXDOMAIN`, not a timeout, a refusal, or a 401.

## The deployed application is still serving

```
https://osool-cyan.vercel.app/            http=200
https://osool-cyan.vercel.app/api/health  http=404
https://osool-cyan.vercel.app/ar/verify   http=307
https://osool-cyan.vercel.app/ar/login    http=307
https://osool-cyan.vercel.app/ar/register http=307
```

Two facts worth separating:

1. **The site returns 200 while its database no longer exists.** This is the
   "invisible outage" defect in its purest form — the deployment looks alive,
   the data layer is gone, and nothing anywhere reports it. It is the strongest
   available argument for the observability work in Phase 4, and it is now an
   observed fact rather than a reasoned risk.
2. **`/api/health` returns 404** because the health endpoint has never been
   deployed — it was part of the uncommitted work checkpointed at the start of
   this session (`ed6caf0`). The one endpoint that would have reported this
   outage exists only in the repository.

The `307` responses on locale-prefixed routes were observed but not
investigated further, per the instruction not to spend additional effort here.
I am recording them, not interpreting them.

## Status changes this produces

| ID | Prior claim | Status now |
|---|---|---|
| SEC-1 / F-02 | `anon` holds full DML on 34 tables; RLS on none; confirmed live 12 Aug 2026 | **SUPERSEDED** — project unreachable, exposure unverifiable |
| F-01 | Whether any data is recoverable | **OPEN** — the project is gone; no evidence either way about recoverability |

*(SEC-1, F-02 and F-01 are cited from the prior assessment reports, which are
not in this repository. I am carrying the IDs as given to me, not from a source
I have read.)*

## What this does not mean

- It does **not** mean the exposure was ever closed. It means the project that
  had it no longer exists.
- It does **not** clear the design defect. `CLOSE-THE-DATABASE.sql` was never
  part of provisioning, so **the next database provisioned will have exactly the
  same exposure** unless that changes.

That change is now a fixed requirement regardless of this result:
`CLOSE-THE-DATABASE.sql` becomes step one of database creation, applied before
the application ever holds credentials, with its own verification queries as a
documented gate in the runbook and a repeatable check.
