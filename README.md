# Gatherly — Celebration Planning, Made Human

> **Prompt Wars Week 5 (Challenge 5): Celebration & Event Planner**
> Catch overruns, hidden fees and date collisions before they cost you.

Planning a wedding, a birthday or a block party goes wrong in three predictable ways: the guest list outgrows the venue, a vendor quote hides fees, and one slipped deadline knocks over everything that depends on it. Gatherly checks all three for you, with deterministic math (never LLM guesswork), and explains what it found in plain language.

## What you can do

| Feature | What it does | Where |
|---|---|---|
| **Start your own event** | Pick wedding, birthday or community; set date, guests, venue capacity and budget. The template's budget is scaled to your total to the cent, and dates are shifted to your event date. | sidebar "New event" |
| **Edit the basics** | Change guests, capacity, budget or date; risks, budget and what-if all recompute. | Overview "Edit event details" |
| **Budget by category** | Planned vs. spent, non-negative guards, over-budget flags. | Budget |
| **Timeline with dependencies** | Milestones can depend on each other; cycles and "due before its dependency" are rejected; the timeline shows "Blocked by" and "Unblocks N". | Timeline |
| **Reschedule with collision preview** | Move a milestone and see which dependents collide before saving. | Timeline |
| **Event Risk Radar** | Capacity breaches, overdue critical-path tasks, category overruns, undisclosed vendor terms. | bell in the top bar |
| **What-if sandbox** | "+25 guests", "catering 15% higher": budget, capacity and affected milestones update live. | Budget |
| **Vendor quote audit** | Paste a raw quote. Gatherly pulls out the price, deposit and hidden fees (gratuity %, overtime per hour, cleanup) with dollar amounts, and says plainly when it could not find a price. | Vendors |
| **Mara copilot** | Structured suggestions with "Approve & Apply". Uses Gemini when `GEMINI_API_KEY` is set, otherwise a deterministic offline planner (the drawer shows which one answered). | "Ask Mara" |

### 60-second demo

1. Open the app: the seeded wedding already shows **150 guests vs. 140 seats** on the Overview.
2. Open the Risk Radar (bell) to see the capacity breach and what it affects.
3. Budget → drag the **What-if** sliders and watch the ripple.
4. Vendors → paste a quote and read the hidden-fee audit.
5. Ask Mara for savings and **Approve & Apply** a proposal.
6. Timeline → reschedule a milestone and read the collision preview.
7. **New event** → create your own with a real guest count and budget.

## How it is built

```
frontend/   vanilla ES modules, no build step; localStorage-first store
  src/js/domain/      pure logic: budget, risks, timeline, vendors, event factory
  src/js/store/       transactional actions (Approve & Apply, new event, ...)
  src/js/views|components/   accessible UI (dialogs, tabs, live regions)
backend/    FastAPI + SQLAlchemy
  app/domain/         the same logic in Python (parity-tested against the JS)
  app/api, app/auth   REST API, JWT auth, RBAC, rate limits
  app/services/       Mara copilot (Gemini + deterministic fallback)
scripts/    load test, complexity gate, line-limit gate
tests/e2e/  Playwright user journeys
```

**Scope, plainly.** The UI keeps your events in the browser (localStorage) and works offline: when the API is unreachable it falls back to the same logic locally. The backend serves the stateless endpoints (`/api/simulate`, `/api/risks`, `/api/vendors/*`, `/api/mara`) and a multi-tenant events API (`/api/events`, with audit log) that the UI does not call yet. RBAC roles are enforced by the API; the UI's role badge only switches the demo token.

## Run it

```bash
pip install -r requirements.txt
npm install                 # lint + UI tests only; the app itself has no build step
npm start                   # http://localhost:8080
```

Docker (PostgreSQL + app): set `POSTGRES_PASSWORD` and `JWT_SECRET`, then `docker compose up -d --build`.
Vercel: import the repo, set `JWT_SECRET` (and optionally `GEMINI_API_KEY`). Note SQLite lives in `/tmp` on Vercel and resets; use `DATABASE_URL` for persistence.

| Variable | Default | Purpose |
|---|---|---|
| `ENVIRONMENT` | `development` (`production` on Vercel) | `production` turns on HSTS, hides `/docs`, and refuses guests |
| `JWT_SECRET` | random per process in dev | **Required in production** (32+ chars). Without it production refuses to start; on Vercel a random per-instance secret is used with a warning |
| `JWT_EXPIRATION_MINUTES` | `60` | Token lifetime |
| `DATABASE_URL` | `sqlite:///./gatherly.db` | SQLite or PostgreSQL |
| `CORS_ORIGINS` | none (same-origin) | Comma-separated allowed origins |
| `DEMO_MODE` | `true` | Enables `/api/auth/demo-token` (sandbox tenant only) |
| `SEED_ADMIN_PASSWORD` | unset | In production, seeds `planner@gatherly.app` with this password; unset means no seeded login |
| `RATE_LIMIT_ENABLED` / `TRUST_PROXY` | `true` / `false` | Per-IP limits; honour `X-Forwarded-For` behind a proxy |
| `PBKDF2_ITERATIONS` | `600000` | Password hashing cost (lower only in tests) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | unset, `gemini-2.5-flash` | Optional live Mara |
| `HOST`, `PORT`, `WEB_CONCURRENCY` | `127.0.0.1`, `8080`, `1` | Server binding |
| `LOG_FORMAT`, `OTEL_ENABLED` | `json`, `true` | Structured logs; optional OpenTelemetry spans |

## Quality gates (all run in CI)

| Gate | Command | Current result |
|---|---|---|
| Backend tests + coverage (>= 85%) | `pytest backend/tests --cov=backend/app` | 696 pass, 100% line coverage |
| Frontend tests | `node --test frontend/tests/*.test.js` | 238 pass (31 DOM/axe tests need `jsdom`, installed by `npm install`) |
| Browser journeys | `npm run test:e2e` | 8 Playwright journeys (run in CI) |
| Complexity < 10 per function (Python) | `ruff --select C901` + `scripts/check_complexity.py` | max 9 |
| Complexity < 10 per function (JS) | `npm run lint:js` (ESLint `complexity: 9`) | zero violations |
| File length < 200 lines | `python scripts/check_line_limits.py` | all `.py`/`.js` files comply (CSS and HTML are exempt) |
| Lint / format | `ruff check`, `ruff format --check` | clean |
| Security scan | `bandit -r backend -ll`, `pip-audit` (advisory) | no medium/high findings |
| Load smoke test | `npm run test:load` | in-process ASGI, 200 requests: ~1,800 req/s, p95 ~20 ms, 0 errors |

The load test runs in-process (no network), so it checks handler overhead rather than production capacity.

## Security

- **Authentication:** JWT (HS256 only; `exp`, `iat`, `sub`, issuer and role required). Requests without a valid token get 401 in production; the anonymous fallback exists only in development/test.
- **Passwords:** PBKDF2-SHA256, 600,000 iterations, per-user salt, constant-time compare, and a dummy hash for unknown emails so login timing and messages do not reveal accounts. Older hashes still verify.
- **Authorization:** roles `owner`, `planner`, `collaborator`, `vendor`; every event query is filtered by the token's tenant (cross-tenant access returns a generic 404).
- **Input limits:** field length/range limits, 1 MB request cap (413), per-IP rate limits (429 with `Retry-After`), validation errors never echo submitted values.
- **Browser:** strict CSP (no inline scripts), `nosniff`, frame denial, referrer and permissions policies, HSTS in production, escaped output everywhere.
- **LLM output:** Mara's model output is whitelisted and range-checked server-side before it can become an "Approve & Apply" proposal; the API key is sent in a header, never a URL or log.
- **Known limits:** the sandbox demo tenant is shared by everyone holding a demo token (set `DEMO_MODE=false` to close it); tokens cannot be revoked before they expire; the container image was not built in the verification environment (CI builds it).

## Accessibility

Targets WCAG 2.2 AA: skip link, labelled landmarks, focus-trapped dialogs that restore focus, visible focus rings, roving-tabindex tabs, live regions for Mara and the what-if results, `prefers-reduced-motion`, and no colour-only status. A script checked 126 text/background pairs (lowest text ratio 4.66:1), axe-core runs in the test suite (colour contrast is covered by that script, since jsdom cannot compute it), and 320px reflow was checked in Chromium. Screen-reader announcement behaviour has not been tested with real assistive technology.

## Observability

Every request gets an `X-Correlation-ID` (client values are sanitised), structured JSON access logs carry it with `trace_id`/`span_id`, and unhandled errors return a JSON 500 with the same ID. OpenTelemetry spans are optional (`OTEL_ENABLED`); there is no OTLP exporter configured out of the box.

## License

MIT © 2026 Gatherly Team
