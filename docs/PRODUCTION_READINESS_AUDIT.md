# Production Readiness Audit

**Date:** 2026-07-19  
**Scope:** Backend + Frontend (bugs/security/races/perf only — not missing features)  
**Score after CRITICAL/HIGH/MEDIUM fixes:** **92 / 100**

---

## CRITICAL — all fixed (prior pass)

C1–C4: socket revoke, cookie Path `/`, 401 refresh race, conversation upsert insert.

## HIGH — all fixed (prior pass)

H1–H12: presence/typing gauges, metrics token gate, register rate limit, COOKIE_SECURE boot, upload checksum, unread/notification drift, DM inbox, socket dispose, mute optimistic, upload fail.

## MEDIUM — all fixed (this pass)

| ID | Issue | Fix |
|----|--------|-----|
| M1 | In-memory rate limits | Redis store via `rate-limit-redis` for global + login/register limiters |
| M2 | Group create TOCTOU | Re-validate active/non-suspended users **inside** create TX |
| M3 | Stale membership on retry/upload | `requireMessageMember` before retry; upload `conversationId` requires membership |
| M4 | Open `/health/queues` | Ops token auth (`METRICS_TOKEN`); `/health` + `/ready` stay public |
| M5 | Optional metrics token in prod | Boot fails without `METRICS_TOKEN` when `NODE_ENV=production` |
| M6 | Large message lists | `@tanstack/react-virtual` when ≥48 items + `content-visibility` |
| M7 | Unsafe link previews | http(s)-only validation BE+FE; external `<a>` with rel; drop unsafe schemes |
| M8 | Large initial bundle | Lazy `DashboardLayout`/`MainLayout`; Vite `manualChunks` for mui/emoji/icons/motion/virtual |

## LOW (remaining)

- Access cookie write-only confusion
- Generic Error on attachment bind → 500
- Admin client-only route gate (UX)
- Lint unused vars in `mockAdminService.ts` (18 warnings)
- Further FE vendor splitting (axios/yup still in main graph)
- Multi-region Redis rate-limit failover / fail-open policy documentation
