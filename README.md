# SplitStack — Smart Bill Splitter

Split a bill fairly between multiple participants while preserving exact monetary totals using integer-cent arithmetic.

---

## Features

- **Subtotal + tax + tip calculation** — computes the final bill total from three components
- **Equal bill splitting** — divides the total among any number of participants
- **Exact-sum guarantee** — the sum of all shares always equals the total, with no rounding error
- **Currency-safe integer-cent arithmetic** — all intermediate arithmetic runs on integer cents to prevent floating-point drift
- **Input validation** — rejects negative amounts, zero participants, and fractional participant counts with descriptive errors
- **Property-based testing** — fast-check generates hundreds of inputs per run to verify invariants across the full input space
- **Split history persistence** — completed splits are saved to a Supabase `split_history` table
- **Exchange-rate information** — the Frankfurter MCP server is configured as a workspace tool for live currency rate lookups
- **Kiro custom calculation-reviewer agent** — a read-only agent scoped to the calculation engine that verifies financial invariants on request

---

## Architecture

SplitStack is structured around a strict separation of concerns. The calculation engine knows nothing about persistence or external services, and the persistence layer never calls the engine.

```
┌─────────────────────────────────────────────────────────────┐
│  Pure Calculation Engine                                    │
│  src/splitBill.ts          — splitBill(input) → BillResult  │
│  src/splitBill.types.ts    — BillInput, BillResult,         │
│                              BillInputError                 │
│                                                             │
│  No I/O. No network. No database. Deterministic.           │
└───────────────────────────┬─────────────────────────────────┘
                            │  caller composes independently
          ┌─────────────────┼─────────────────┐
          ▼                                   ▼
┌─────────────────────┐           ┌───────────────────────────┐
│  Tests              │           │  Persistence Layer        │
│  src/splitBill.     │           │  src/splitHistory.ts      │
│  test.ts            │           │  src/supabaseClient.ts    │
│                     │           │  src/database.types.ts    │
│  Vitest +           │           │                           │
│  fast-check         │           │  Supabase split_history   │
└─────────────────────┘           └───────────────────────────┘

                        (separate, agent-only)
                ┌───────────────────────────────────┐
                │  MCP Exchange-Rate Capability      │
                │  .kiro/settings/mcp.json          │
                │  → https://mcp.frankfurter.dev/   │
                │  → api.frankfurter.dev/v2          │
                │  → 98 central banks & sources      │
                └───────────────────────────────────┘
```

---

## Core Invariant

> **The sum of all participant shares must equal the final bill total exactly.**

This is guaranteed by construction, not by post-hoc adjustment. The algorithm works in integer cents throughout:

1. Convert each input to cents: `Math.round(value * 100)`
2. Sum to get `totalCents`
3. Compute `baseCents = Math.floor(totalCents / participants)` and `remainderCents = totalCents % participants`
4. Assign `baseCents + 1` to the first `remainderCents` participants; `baseCents` to the rest

The algebraic identity `participants × baseCents + remainderCents = totalCents` holds exactly, so the sum is correct without any rounding step. No share is ever negative.

---

## Project Structure

```
SplitStack/
├── src/
│   ├── splitBill.ts            Pure calculation engine
│   ├── splitBill.types.ts      BillInput, BillResult, BillInputError
│   ├── splitBill.test.ts       Property-based + regression test suite
│   ├── splitHistory.ts         Supabase persistence layer
│   ├── supabaseClient.ts       Typed Supabase client (reads env vars)
│   └── database.types.ts       Auto-generated from live Supabase schema
│
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 20260924000000_create_split_history.sql
│       └── 20260924000001_enable_rls_split_history.sql
│
├── .kiro/
│   ├── agents/
│   │   └── splitstack-calculation-reviewer.md   Custom reviewer agent
│   ├── hooks/
│   │   └── run-tests-on-save.json               Runs npm test on .ts save
│   ├── settings/
│   │   └── mcp.json                             Frankfurter MCP server
│   ├── specs/
│   │   └── bill-splitting-engine/
│   │       ├── requirements.md
│   │       ├── design.md
│   │       └── tasks.md
│   └── steering/
│       └── conventions.md                       Coding conventions
│
├── package.json
├── tsconfig.json
└── .env.local                                   (gitignored — secrets only)
```

---

## Installation and Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root with your Supabase project credentials:

```
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
```

Both values are available in your [Supabase project dashboard](https://supabase.com/dashboard) under **Project Settings → API**.

> `.env.local` is gitignored and must never be committed. Do not use the `service_role` key here.

### 3. Apply database migrations

```bash
supabase link --project-ref <your-project-ref>
supabase db push --yes
```

### 4. Run the test suite

```bash
npm test
```

---

## Testing

The test suite is in `src/splitBill.test.ts` and runs with [Vitest](https://vitest.dev/) in single-run mode (`vitest run`).

Tests use [fast-check](https://fast-check.dev/) for property-based testing. Rather than checking a handful of fixed examples, fast-check generates hundreds of randomised inputs per property and shrinks any failing case to its minimal counterexample.

**Properties verified on every run:**

| Property | Requirement |
|---|---|
| Exact sum | `sum(shares) === total` for all valid inputs |
| Non-negative shares | Every share `>= 0`, including when `total < participants` |
| Participant count | `shares.length === participants` |
| Single participant | Share equals total when `participants = 1` |
| Determinism | Same input always returns identical output |
| Zero total | All shares are `0.00` when all inputs are zero |
| Total calculation | `total === subtotal + tax + tip` (rounded to cents) |
| Currency precision | Every share has at most 2 decimal places |
| Input validation | Negative amounts and invalid participants throw `BillInputError` with the correct `field` |

Targeted regression tests cover known-tricky values: `$10.00 / 3`, `$0.01 / 3`, `$0.02 / 5`, the `0.1 + 0.2` IEEE-754 case, and rounding boundaries.

---

## Supabase Persistence

Completed splits are stored in a `split_history` table in Supabase Postgres.

**Schema:**

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` | Primary key, auto-generated |
| `created_at` | `timestamptz` | Insert timestamp, defaults to `now()` |
| `subtotal` | `numeric(10,2)` | Bill subtotal in dollars |
| `tax` | `numeric(10,2)` | Tax amount in dollars |
| `tip` | `numeric(10,2)` | Tip amount in dollars |
| `total` | `numeric(10,2)` | Final total (subtotal + tax + tip) |
| `participants` | `integer` | Number of participants |
| `shares` | `numeric(10,2)[]` | Per-participant shares, length equals `participants` |

Row Level Security is enabled. Anonymous `INSERT` and `SELECT` are permitted. Records are immutable — there are no update or delete operations.

The persistence layer (`src/splitHistory.ts`) exposes three functions:

- `saveSplit(input, result)` — inserts a new record and returns the saved row
- `getSplitHistory()` — returns all records ordered newest first
- `getSplitById(id)` — returns one record by UUID, or `null` if not found

TypeScript types are auto-generated from the live schema via `supabase gen types --linked > src/database.types.ts`.

---

## MCP — Frankfurter Exchange Rates

The [Frankfurter](https://frankfurter.dev/) exchange-rate API is connected as a workspace-level Kiro MCP server.

**Configuration:** `.kiro/settings/mcp.json`

```json
{
  "mcpServers": {
    "frankfurter": {
      "url": "https://mcp.frankfurter.dev/",
      "disabled": false
    }
  }
}
```

This makes four MCP tools available to Kiro during development:

| Tool | Purpose |
|---|---|
| `convert` | Convert an amount between two currencies |
| `get_rates` | Blended reference rates for a base currency |
| `list_currencies` | All supported ISO 4217 codes and names |
| `list_providers` | Contributing institutions and their coverage |

Frankfurter sources rates from 98 central banks and official institutions. No API key is required. This is a Kiro agent capability — it is not a runtime dependency of the TypeScript application.

---

## Custom Agent — SplitStack Calculation Reviewer

**Configuration:** `.kiro/agents/splitstack-calculation-reviewer.md`

A read-only Kiro agent scoped exclusively to the calculation engine. Its purpose is to review changes and verify that all financial invariants and project conventions remain intact.

**Capabilities:**
- `read` — can read any file
- `shell` — restricted to `npm test` only; all other commands are denied
- `todo_list` — task tracking during review

**Write access:** none. `fs_write` is denied on all paths. The agent can suggest fixes as code blocks but cannot apply them.

**Pre-loaded context:**
- `src/splitBill.ts`
- `src/splitBill.types.ts`
- `src/splitBill.test.ts`
- `.kiro/steering/conventions.md`
- `.kiro/specs/bill-splitting-engine/requirements.md`
- `.kiro/specs/bill-splitting-engine/design.md`

**Review checklist:** monetary precision, validation order, non-negative shares, participant count, exact-sum invariant, penny-correction logic, purity, test coverage, and convention compliance.

The agent will never touch `src/splitHistory.ts`, `src/supabaseClient.ts`, `src/database.types.ts`, Supabase migrations, or `.kiro/settings/mcp.json`.

---

## Kiro Learning Challenge Features

This project was built as part of a structured Kiro learning challenge. Each lesson introduced a Kiro feature applied directly to SplitStack.

| Lesson | Feature | Implementation |
|---|---|---|
| 1 | **Spec-driven development** | `.kiro/specs/bill-splitting-engine/` — requirements, design, and implementation tasks written before any code |
| 2 | **Steering documents** | `.kiro/steering/conventions.md` — coding and architectural conventions automatically included in every session |
| 3 | **Hooks** | `.kiro/hooks/run-tests-on-save.json` — runs `npm test` automatically whenever a `.ts` file is saved |
| 4 | **Property-based testing** | `src/splitBill.test.ts` — fast-check arbitraries verify invariants across hundreds of generated inputs |
| 5 | **Powers** | Supabase Power used to apply migrations, inspect schema, generate types, and run database advisors |
| 6 | **MCP** | `.kiro/settings/mcp.json` — Frankfurter MCP server provides live exchange-rate tools to Kiro |
| 7 | **Custom agents** | `.kiro/agents/splitstack-calculation-reviewer.md` — specialist agent for reviewing calculation-engine changes |

---

## License

MIT
