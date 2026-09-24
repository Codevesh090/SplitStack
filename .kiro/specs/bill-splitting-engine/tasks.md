# Implementation Tasks: Core Bill-Splitting Calculation Engine

Tasks are ordered by dependency. Each task maps to one or more requirements from `requirements.md`.

---

## Task 1 — Project scaffold and type definitions

**Goal:** Set up the minimal project structure and define the shared types.

**Steps:**
1. Initialise the project (`package.json`, `tsconfig.json`) with TypeScript support.
2. Create `src/splitBill.types.ts` (or equivalent) and define:
   - `BillInput` interface (`subtotal`, `tax`, `tip`, `participants`).
   - `BillResult` interface (`total`, `sharePerParticipant`).
   - `BillInputError` class with `field` and `message` properties.
3. Export all three from the types file.

**Acceptance criteria:**
- The project compiles with no errors after this task.
- Types are importable from other files in `src/`.

**Covers:** NFR-1, NFR-3 (foundation)

---

## Task 2 — Input validation

**Goal:** Implement and export a `validateBillInput` function (or inline validation inside `splitBill`).

**Steps:**
1. Create `src/splitBill.ts` and import `BillInput` and `BillInputError`.
2. Implement validation in order: `subtotal` → `tax` → `tip` → `participants`.
3. For `subtotal`, `tax`, `tip`: throw `BillInputError` if the value is `< 0` or not a finite number.
4. For `participants`: throw `BillInputError` if the value is `< 1`, not an integer, or not a finite number.

**Acceptance criteria:**
- Passing `subtotal: -1` throws `BillInputError` with `field: "subtotal"`. *(REQ-6)*
- Passing `tax: -0.01` throws `BillInputError` with `field: "tax"`. *(REQ-6)*
- Passing `tip: -5` throws `BillInputError` with `field: "tip"`. *(REQ-6)*
- Passing `participants: 0` throws `BillInputError` with `field: "participants"`. *(REQ-7)*
- Passing `participants: -3` throws `BillInputError` with `field: "participants"`. *(REQ-7)*
- Passing `participants: 2.5` throws `BillInputError` with `field: "participants"`. *(REQ-8)*
- Valid inputs do not throw.

**Covers:** REQ-6, REQ-7, REQ-8

---

## Task 3 — Bill total calculation

**Goal:** Implement the total computation inside `splitBill`.

**Steps:**
1. After validation, convert `subtotal`, `tax`, and `tip` to integer cents using `Math.round(value * 100)`.
2. Sum the three cent values to get `totalCents`.
3. Derive `total` for the result as `totalCents / 100`.

**Acceptance criteria:**
- `splitBill({ subtotal: 50.00, tax: 5.00, tip: 10.00, participants: 1 }).total === 65.00`. *(REQ-1)*
- `splitBill({ subtotal: 10.005, tax: 0, tip: 0, participants: 1 }).total === 10.01` (nearest-cent rounding). *(REQ-3)*
- `splitBill({ subtotal: 0, tax: 0, tip: 0, participants: 1 }).total === 0.00`. *(REQ-9)*

**Covers:** REQ-1, REQ-3

---

## Task 4 — Equal split with penny correction

**Goal:** Implement the share distribution algorithm.

**Steps:**
1. Compute `baseCents = Math.floor(totalCents / participants)` and `remainderCents = totalCents % participants`.
2. Build `sharePerParticipant` array: first `remainderCents` entries get `(baseCents + 1) / 100`, the rest get `baseCents / 100`.
3. Return `{ total, sharePerParticipant }`.

**Acceptance criteria:**
- `splitBill({ subtotal: 10.00, tax: 0, tip: 0, participants: 3 })` returns shares `[3.34, 3.33, 3.33]` and their sum equals `10.00`. *(REQ-2, REQ-4)*
- `splitBill({ subtotal: 9.00, tax: 0, tip: 0, participants: 3 })` returns shares `[3.00, 3.00, 3.00]`. *(REQ-2)*
- `splitBill({ subtotal: 0.01, tax: 0, tip: 0, participants: 3 })` returns shares `[0.01, 0.00, 0.00]` and their sum equals `0.01`. *(REQ-4)*
- `splitBill({ subtotal: 0.02, tax: 0, tip: 0, participants: 5 })` returns shares `[0.01, 0.01, 0.00, 0.00, 0.00]` and their sum equals `0.02`. *(REQ-4, REQ-5)*
- No share is negative for any valid input; shares of 0.00 are permitted when `totalCents < participants`. *(REQ-5)*

**Covers:** REQ-2, REQ-3, REQ-4, REQ-5

---

## Task 5 — Zero-total edge case

**Goal:** Confirm zero-total inputs work correctly end to end (this should be covered by the algorithm but deserves an explicit verification pass).

**Steps:**
1. Trace through the algorithm manually with all-zero inputs.
2. Ensure no division-by-zero or unexpected behaviour when `totalCents == 0`.
3. Confirm the result array contains `participants` entries all equal to `0.00`.

**Acceptance criteria:**
- `splitBill({ subtotal: 0, tax: 0, tip: 0, participants: 5 })` returns `{ total: 0.00, sharePerParticipant: [0.00, 0.00, 0.00, 0.00, 0.00] }`. *(REQ-9)*

**Covers:** REQ-9

---

## Task 6 — Unit tests

**Goal:** Write a complete unit test suite that directly verifies every requirement.

**Steps:**
1. Choose a test runner (e.g., Vitest or Jest) and add it as a dev dependency.
2. Create `src/splitBill.test.ts`.
3. Write test cases covering all acceptance criteria from Tasks 2–5, plus:
   - One participant receives the full total.
   - Large participant counts (e.g., 100) still sum correctly.
   - Total smaller than participant count (e.g., $0.02 split 5 ways) produces no negative shares and correct sum.
   - Floating-point-prone inputs (e.g., `subtotal: 0.1 + 0.2`) do not produce drift.

**Acceptance criteria:**
- All tests pass with `npm test` (or equivalent single-run command).
- Test file covers at least one test per requirement (REQ-1 through REQ-9).

**Covers:** All requirements (verification layer)

---

## Dependency Order

```
Task 1 (scaffold)
  └── Task 2 (validation)
        └── Task 3 (total calculation)
              └── Task 4 (split + penny correction)
                    └── Task 5 (zero-total check)
                          └── Task 6 (unit tests)
```
