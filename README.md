# Gatherly — Celebration Planning, Made Human

> **Prompt Wars Week 5 (Challenge 5): Celebration & Event Planner**
> Catch overruns, hidden fees and date collisions before they cost you.

Planning a wedding, a birthday or a block party goes wrong in three predictable ways: the guest list outgrows the venue, a vendor quote hides fees, and one slipped deadline knocks over everything that depends on it. Gatherly checks all three for you, with deterministic math (never LLM guesswork), and explains what it found in plain language.

## What you can do

| Feature | What it does | Where |
|---|---|---|
| **Start your own event** | Pick wedding, birthday or community; set date, guests, venue capacity and budget. The template's budget is scaled to your total to the cent, and dates are shifted to your event date. | "Create your event" / sidebar "New event" |
| **Edit the basics** | Change guests, capacity, budget or date; risks, budget and what-if all recompute. | Overview "Edit event details" |
| **Budget by category** | Planned vs. spent, non-negative guards, over-budget flags. | Budget |
| **Timeline with dependencies** | Milestones can depend on each other; cycles and "due before its dependency" are rejected; the timeline shows "Blocked by" and "Unblocks N", and its headline warns when a milestone is due before a prerequisite. | Timeline |
| **Reschedule with collision preview** | Move a milestone and see which dependents collide before saving. | Timeline |
| **Event Risk Radar** | Capacity breaches, overdue critical-path tasks, dependency collisions, category overruns, undisclosed vendor terms. | bell in the top bar |
| **What-if sandbox** | "+25 guests", "catering 15% higher": budget, capacity and affected milestones update live. | Budget |
| **Vendor quote audit** | Paste a raw quote. Gatherly pulls out the price, deposit and hidden fees (gratuity %, overtime per hour, cleanup) with dollar amounts, and says plainly when it could not find a price. Parsing is rule-based (regular expressions), not AI. | Vendors |
| **Compare your own vendors** | Saved quotes are stored on the vendor; pick two or more to compare price, deposit, inclusions and undisclosed terms side by side. Extracted fee amounts show when you paste a quote, not in the comparison table. Example data appears only until you have two comparable quotes, and is labelled as an example. | Vendors → Compare |
| **Mara copilot** | Structured suggestions with "Approve & Apply". Uses Gemini when `GEMINI_API_KEY` is set. Without it (or if Gemini fails) the server's deterministic planner answers, and if the API is unreachable the browser's own planner does. Both fallbacks use only your event's numbers; the browser one also says when it has nothing to propose, while the server one is simpler (see Known issues). The drawer shows which one answered. | "Ask Mara" |

### 60-second demo

1. Open the app: the seeded wedding already shows **150 guests vs. 140 seats** on the Overview.
2. Open the Risk Radar (bell) to see the capacity breach and what it affects.
3. Budget → drag the **What-if** sliders and watch the ripple.
4. Vendors → paste a quote and read the hidden-fee audit; save it and compare vendors.
5. Ask Mara for savings and **Approve & Apply** a proposal.
6. Timeline → reschedule a milestone and read the collision preview.
7. **Create your event** with a real guest count and budget.

## How it is built

```text
frontend/   vanilla ES modules, no build step; localStorage-first store
  src/js/domain/      pure logic: budget, risks, timeline, vendors, event factory
  src/js/store/       transactional actions (Approve & Apply, new event, ...)
  src/js/views|components/   accessible UI (dialogs, tabs, live regions)
backend/    FastAPI + SQLAlchemy
  app/domain/         the same logic in Python
  app/api, app/auth   REST API, JWT auth, RBAC, rate limits, quotas
  app/services/       Mara copilot (Gemini + deterministic fallback)
shared/parity/        JSON fixtures asserted by BOTH pytest and node:test
scripts/    load test, complexity gate, line-limit gate
tests/e2e/  Playwright user journeys
```

**Python and JavaScript parity.** The domain logic exists twice (Python for the API, JavaScript for the offline-first UI). `shared/parity/*.json` holds 296 cases across 11 areas (budget, expenses, simulation, risks, progress, tasks, cycles, reschedule, event schedule, dates, quote parsing). Both `backend/tests/test_parity_*.py` and `frontend/tests/parity-*.test.js` assert the same expected values, which found and fixed about 20 real disagreements between the two implementations.

**Scope, plainly.** The UI keeps your events in the browser (localStorage) and works offline: when the API is unreachable it falls back to the same logic locally. The backend serves the stateless endpoints (`/api/simulate`, `/api/risks`, `/api/vendors/*`, `/api/mara`) and a multi-tenant events API (`/api/events`, with audit log) that the UI does not call yet. RBAC roles are enforced by the API; the UI's role badge only switches the demo token used for API calls.

## Run it

```bash
pip install -r requirements.txt
npm install                 # lint + UI tests only; the app itself has no build step
npm start                   # http://localhost:8080
```

Docker (PostgreSQL + app): set `POSTGRES_PASSWORD` and `JWT_SECRET`, then `docker compose up -d --build`.
Vercel: import the repo, set `JWT_SECRET` (and optionally `GEMINI_API_KEY`). SQLite lives in `/tmp` on Vercel and resets; use `DATABASE_URL` for persistence. Rate-limit and Mara caches are per instance, so they are approximate on serverless.

| Variable | Default | Purpose |
|---|---|---|
| `ENVIRONMENT` | `development` (`production` on Vercel) | Only `development` and `test` allow guests, wildcard CORS and seeded legacy credentials. **Any other value (including typos) behaves like production**: strong secret required, HSTS, `/docs` hidden |
| `JWT_SECRET` | random per process in dev | **Required in production** (32+ chars). Production refuses to start without it; on Vercel a random per-instance secret is used with a warning |
| `JWT_EXPIRATION_MINUTES` | `60` | Token lifetime |
| `DATABASE_URL` | `sqlite:///./gatherly.db` | SQLite or PostgreSQL |
| `CORS_ORIGINS` | none (same-origin) | Comma-separated allowed origins |
| `DEMO_MODE` | `true` | Enables `/api/auth/demo-token` (sandbox tenant, **read-only for events**) |
| `SEED_ADMIN_PASSWORD` | unset | In production, seeds `planner@gatherly.app` with this password; unset means no seeded login |
| `RATE_LIMIT_ENABLED` / `TRUST_PROXY` | `true` / `false` | Per-IP limits; honour `X-Forwarded-For` behind a proxy that overwrites it |
| `MARA_GLOBAL_PER_MINUTE` | `120` | Cap on Mara calls across all users |
| `MAX_EVENTS_PER_TENANT` / `MAX_STATE_JSON_BYTES` | `100` / `131072` | Per-tenant quotas |
| `PBKDF2_ITERATIONS` | `600000` | Password hashing cost (lower only in tests) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | unset, `gemini-3.5-flash` | Optional live Mara. Checked against the real Gemini API (all four operations answered in 2–4 s). Google retires models without notice (`gemini-2.5-flash` now returns 404 for new keys), so if the configured model returns 404 the app retries once with the default and falls back to the offline planner if that fails too |
| `HOST`, `PORT`, `WEB_CONCURRENCY` | `127.0.0.1`, `8080`, `1` | Server binding |
| `LOG_FORMAT`, `OTEL_ENABLED` | `json`, `true` | Structured logs; optional OpenTelemetry spans |

## Quality gates (all run in CI)

| Gate | Command | Result when last run |
|---|---|---|
| Backend tests + line and branch coverage (>= 95%) | `pytest backend/tests --cov=backend/app --cov-branch` | 1,228 pass; 100% line, 99% branch |
| Frontend tests + coverage (lines 90 / branches 80 / functions 85) | `npm run test:coverage` | 621 pass; 94.7% lines, 87.8% branches, 90.0% functions |
| No silently skipped DOM tests | CI fails if the TAP report shows any skipped test | 0 skipped with `npm install` (31 DOM/axe tests skip without jsdom) |
| Browser journeys | `npm run test:e2e` | 8 Playwright journeys (run in CI) |
| Complexity < 10 per function (Python) | `ruff --select C901` + `scripts/check_complexity.py` | max 9 |
| Complexity < 10 per function (JS) | `npm run lint:js` (ESLint `complexity: 9`) | zero violations |
| File length < 200 lines | `python scripts/check_line_limits.py` | all `.py`/`.js` files comply (CSS and HTML are exempt) |
| Lint / format | `ruff check`, `ruff format --check` | clean |
| Security scan | `bandit -r backend -ll`, `pip-audit` (advisory) | no medium/high findings |
| Load smoke test | `npm run test:load` | in-process ASGI, 200 requests: roughly 1,400–1,800 req/s depending on the machine, p95 about 20 ms, 0 errors |

The load test runs in-process (no network), so it checks handler overhead rather than production capacity. Mutation testing (40 injected bugs in a copy of the code) was caught 35 times by the suites; the survivors were boundary cases that now have tests.

## Security

- **Authentication:** JWT (HS256 only; `exp`, `iat`, `sub`, issuer and role required). Requests without a valid token get 401 in production; the anonymous fallback exists only in development/test.
- **Demo tokens:** the zero-setup demo gets a token for a shared sandbox tenant. It is read-only for `/api/events` (writes return 403), so visitors cannot edit or delete the shared demo data. `DEMO_MODE=false` turns the endpoint off.
- **Passwords:** PBKDF2-SHA256, 600,000 iterations, per-user salt, constant-time compare, and a dummy hash for unknown emails so login timing and messages do not reveal accounts. Older hashes still verify.
- **Authorization:** roles `owner`, `planner`, `collaborator`, `vendor`; every event query is filtered by the token's tenant (cross-tenant access returns a generic 404). Event ids are generated by the server, so ids cannot be probed or squatted across tenants.
- **Abuse limits:** field length/range limits, 1 MB request cap (413), 100 events and 128 KB per event per tenant, per-IP rate limits plus a global Mara cap (429 with `Retry-After`), bounded rate-limiter memory, validation errors never echo submitted values.
- **Parser safety:** the quote parser's number patterns are bounded and anchored; a 20,000-digit input is processed in under 10 ms (it previously blocked the server for about 10 s).
- **Browser:** strict CSP (no inline scripts), `nosniff`, frame denial, referrer and permissions policies, HSTS in production, escaped output everywhere.
- **LLM output:** Mara's model output is whitelisted and range-checked server-side before it can become an "Approve & Apply" proposal; the API key is sent in a header, never a URL or log; failed upstream calls are cached for 45 s and concurrent upstream calls are capped.
- **Known limits:** tokens cannot be revoked before they expire and are kept in `localStorage`; the rate limiter is per process, so it is approximate across serverless instances (and `TRUST_PROXY=true` is only safe behind a proxy that overwrites `X-Forwarded-For`); an already-seeded database keeps its old seeded login until you delete it; dependencies are range-pinned, not locked; the container image was not built in the verification environment (CI builds it).

## Accessibility

Targets WCAG 2.2 AA: skip link, labelled landmarks, focus-trapped dialogs that restore focus, visible focus rings, roving-tabindex tabs, live regions for Mara and the what-if results, `prefers-reduced-motion`, forced-colors support, 24px minimum targets, and no colour-only status. A one-off run of axe-core in real Chromium with colour contrast enabled found 0 violations on all five views and every dialog and overlay at 1280px and 320px. That browser run is not part of CI; CI runs axe in jsdom (without colour contrast) plus ARIA and focus assertions. Screen-reader announcement behaviour has not been tested with real assistive technology.

## Observability

Every request gets an `X-Correlation-ID` (client values are sanitised), structured JSON access logs carry it with `trace_id`/`span_id`, and unhandled errors return a JSON 500 with the same ID. OpenTelemetry spans are optional (`OTEL_ENABLED`); there is no OTLP exporter configured out of the box.

## Known issues

- **Risk Radar "Undisclosed Terms" can disagree with the quote parser.** The radar's vendor check is a keyword audit of the vendor's own notes and inclusions. It does not read the structured fees extracted from a pasted quote, so it can flag terms (for example gratuity or overtime) that a saved quote does state. The undisclosed list in the compare view is the more accurate one.
- **The compare table has no fee amounts.** It shows price, deposit, inclusions and undisclosed terms; fee amounts are shown in the paste-and-extract view.
- **The server's offline Mara can suggest a reallocation when nothing is over plan.** Its reallocation proposal always moves headroom toward the category furthest over its plan, even if no category is actually over, so a brand-new event with no spending can get a generic "shift budget" suggestion. The in-browser planner does not do this.

## License

MIT © 2026 Gatherly Team
