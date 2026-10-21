# Gatherly — Celebration Planning, Made Human

> **Prompt Wars Week 5 (Challenge 5): Celebration & Event Planner**  
> *An intelligent, editorial celebration planner powered by deterministic financial safety, DAG timeline orchestration, and MiroFish-inspired multi-factor ripple simulations.*

---

## 🌟 Overview

Planning major life milestones—from 150-guest weddings to community block parties—is emotionally charged, fragmented, and vulnerable to surprise surcharges, capacity breaches, and domino-effect schedule collisions.

**Gatherly** bridges warm editorial design with rigorous systems engineering:
- **No Hallucinated Math:** Financial allocations, remaining buffers, and capacity limits are computed deterministically in code—never left to LLM guesswork.
- **MiroFish Ripple Simulation Sandbox:** Sliders allow planners to ask *"What if guest attendance grows by 25?"* or *"What if catering runs 15% higher?"*, visualizing immediate impacts on budget, venue fire-code capacity, and downstream milestone dates.
- **Intelligent Vendor Quote Audit & Raw Seed Ingestion:** Paste raw, unstructured quotes or email proposals from photographers or caterers. Gatherly extracts structured line items and flags undisclosed hidden fees (cleanup/teardown, service staff gratuity, overtime rates).
- **Event Risk Radar:** A grounded, proactive warning system that watches for capacity limits, overdue critical-path milestones, and category overruns.
- **Transactional Mara Copilot:** An AI advisor that produces structured recommendations with actionable "Approve & Apply" state mutations.

---

## 🏗️ Architecture

Gatherly follows strict separation of concerns benchmarked against **[MiroFish](https://github.com/666ghj/MiroFish)**:

```
prompt-war-week5/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes.py      # FastAPI REST endpoints (/mara, /simulate, /vendors, /risks)
│   │   │   └── schemas.py     # Pydantic v2 validation contracts
│   │   ├── domain/
│   │   │   ├── budget.py      # Financial totals, variances, non-negative guards
│   │   │   ├── timeline.py    # Directed Acyclic Graph (DAG) task scheduling & cycle checks
│   │   │   ├── simulation.py  # Multi-factor ripple simulation engine
│   │   │   ├── vendors.py     # Quote normalization, omission audit, seed parsing
│   │   │   └── risks.py       # Deterministic Event Risk Radar
│   │   ├── services/
│   │   │   └── mara_service.py# Copilot service (Live Gemini + schema-grounded fallback)
│   │   ├── config.py          # Environment settings
│   │   └── main.py            # FastAPI application & static asset mount
│   ├── tests/                 # 20 unit & integration test suites
│   ├── pyproject.toml         # Ruff linter & Pytest configurations
│   └── run.py                 # Server entry point (port 8080)
│
├── frontend/
│   ├── index.html             # Semantic, responsive layout with editorial typography
│   └── src/
│       ├── css/
│       │   ├── main.css       # Design tokens (Fraunces serif, DM Sans, terracotta palette)
│       │   └── components.css # Modals, copilot drawer, risk tray, what-if sandbox
│       └── js/
│           ├── ai/            # Mara client bridge
│           ├── components/    # Drawer, Risk Tray, Quote Modal, What-If Panel, Forms
│           ├── domain/        # Client-side algorithmic mirrors (budget, DAG, vendors, risks)
│           ├── api.js         # Unified HTTP API client
│           ├── app.js         # View controller & reactive store wiring
│           ├── store.js       # Transactional EventStore with localStorage persistence
│           └── templates.js   # Archetype seeds (Weddings, Birthdays, Community events)
│
└── package.json               # Developer scripts
```

---

## 🚀 Quickstart

### Prerequisites
- Python 3.10+ (FastAPI, Pydantic, Uvicorn)
- Node.js (for syntax verification or script runners)

### 1. Launch the Server
```bash
npm start
# or directly:
python backend/run.py
```
Open **[http://localhost:8080](http://localhost:8080)** in your browser.

---

## 🧪 Verification & Code Quality

Gatherly enforces strict linting with `ruff` and 100% test coverage across critical algorithmic domains:

### Run Python Tests
```bash
npm test
# or directly:
python -m pytest backend/tests -v
```
*Executes 20 test suites covering financial math, DAG cycle detection, reschedule collision previews, vendor omission audits, and API contracts.*

### Run Python Linter
```bash
npm run lint
# or directly:
ruff check backend && ruff format --check backend
```

---

## 🎯 Key Hackathon Capabilities

| Capability | MiroFish Principle | Implementation |
|---|---|---|
| **What-If Ripple Simulation** | Multi-factor sandbox modeling | Sliders adjust guest counts & catering variances, calculating financial deltas, capacity breaches, and downstream milestone shifts. |
| **Raw Quote Seed Ingestion** | Entity extraction & audit | Ingests unformatted vendor text/emails, extracts deposit & pricing, and detects missing clauses (overtime, cleanup, staff). |
| **Deterministic Financial Safety** | Absolute truth in code | `actual_amount + committed_amount` non-negative invariants; zero hallucinated math. |
| **Event Risk Radar** | Grounded proactive telemetry | Audits active state rules (fire capacity, budget overruns, overdue milestones) without fuzzy prompts. |
| **Transactional Copilot** | Safe proposal approval loop | Mara generates structured proposals with causal explanations; users approve changes with atomic state updates. |

---

## 📄 License
MIT © 2026 Gatherly Team
