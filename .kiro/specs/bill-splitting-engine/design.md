# Technical Design: Core Bill-Splitting Calculation Engine

## 1. Scope

A single, self-contained module — `splitBill` — that accepts a structured input object, validates it, performs the calculation, and returns a structured result. No framework, no I/O, no state.

---

## 2. Public API

### Input type: `BillInput`

| Field          | Type     | Constraints                          |
|----------------|----------|--------------------------------------|
| `subtotal`     | `number` | ≥ 0                                  |
| `tax`          | `number` | ≥ 0                                  |
| `tip`          | `number` | ≥ 0                                  |
| `participants` | `number` | Positive integer (≥ 1, no fractions) |

### Output type: `BillResult`

| Field          | Type       | Description                                      |
|----------------|------------|--------------------------------------------------|
| `total`        | `number`   | Final bill total rounded to 2 decimal places     |
| `sharePerParticipant` | `number[]` | Array of length `participants`; each entry is a share in dollars rounded to 2 decimal places |

### Error type: `BillInputError`

Thrown (or returned, depending on language conventions) when validation fails. Contains:
- `field`: which field caused the error (`"subtotal"`, `"tax"`, `"tip"`, `"participants"`)
- `message`: human-readable description of the violation

---

## 3. Algorithm

### Step 1 — Validate inputs
Check each field against its constraints. On the first violation, throw/return a `BillInputError`. Order of checks: `subtotal` → `tax` → `tip` → `participants`.

### Step 2 — Convert to integer cents
```
subtotalCents     = round(subtotal     * 100)
taxCents          = round(tax          * 100)
tipCents          = round(tip          * 100)
totalCents        = subtotalCents + taxCents + tipCents
```
Working in integer cents eliminates floating-point drift for all subsequent arithmetic.

### Step 3 — Compute base share
```
baseCents     = floor(totalCents / participants)
remainderCents = totalCents % participants
```

### Step 4 — Distribute remainder (penny correction)
Build an array of `participants` shares. The first `remainderCents` participants each receive `(baseCents + 1)` cents; the rest receive `baseCents` cents.

```
shares = []
for i in 0..participants-1:
    if i < remainderCents:
        shares[i] = baseCents + 1
    else:
        shares[i] = baseCents
```

This guarantees `sum(shares) == totalCents` by construction.

### Step 5 — Convert back to currency
```
total  = totalCents / 100          // rounded to 2 decimal places
shares = shares.map(c => c / 100)  // each rounded to 2 decimal places
```

---

## 4. Correctness Properties (invariants)

| Property | How it is guaranteed |
|---|---|
| `sum(shares) == total` | Integer remainder distribution (Step 4) ensures exact sum before conversion; dividing equal-integer values by 100 preserves the sum. |
| All shares ≥ 0 | `baseCents = floor(non-negative / positive)` ≥ 0; remainder adds at most +1. Some shares may be 0.00 when `totalCents < participants`. |
| No share < 0 | Inputs are validated non-negative before Step 2; `floor` of a non-negative value is always ≥ 0. |
| 2 decimal places | Integer cents divided by 100 always yields at most 2 decimal places. |

---

## 5. File / Module Layout

```
src/
  splitBill.ts         # Core engine: validation + calculation
  splitBill.types.ts   # BillInput, BillResult, BillInputError types
```

The types file may be merged into the main file if the language supports it concisely (e.g., TypeScript interfaces in the same file).

---

## 6. Language & Dependencies

- **Language**: TypeScript (no runtime dependencies beyond the standard library).
- The module exports a single named function `splitBill(input: BillInput): BillResult` and the `BillInputError` class.
- No framework assumptions — the engine can be consumed by a CLI, a REST API, or a UI layer without modification.

---

## 7. Edge Cases Considered

| Case | Behaviour |
|---|---|
| Total is exactly divisible | `remainderCents == 0`; all shares are equal. |
| Total is 0.00 | `totalCents == 0`; all shares are 0.00. |
| 1 participant | Share equals total. |
| `totalCents < participants` (e.g. $0.02 split 5 ways) | `baseCents == 0`; first `totalCents` participants get 0.01, the rest get 0.00. Sum is still correct. |
| Inputs with many decimal places (e.g., 1.999) | `round(input * 100)` snaps to nearest cent before splitting. |
