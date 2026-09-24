---
name: safe-money
description: >
  Implement safe monetary arithmetic and bill-splitting in TypeScript.
  Use integer-cent arithmetic to avoid floating-point drift, validate
  all inputs before calculation, guarantee the exact-sum invariant,
  keep the calculation pure, and verify every financial rule with
  property-based tests.
---

# Safe Money — Monetary Arithmetic and Bill Splitting in TypeScript

## Why floating-point arithmetic is unsafe for money

JavaScript's `number` type uses IEEE-754 double-precision floating point.
This causes silent precision errors in monetary arithmetic:

```typescript
0.1 + 0.2 === 0.30000000000000004  // NOT 0.30
10.00 / 3  === 3.3333333333333335  // NOT 3.33 or 3.34
```

These errors accumulate across additions and divisions. In a bill-splitting
context, you can end up with shares that sum to $9.9999999... instead of
$10.00 — a violation of the exact-sum guarantee.

**The fix: move all arithmetic into integer cents.**

---

## Rule 1 — Convert to integer cents before any arithmetic

Convert every currency input to integer cents using `Math.round` before
performing any arithmetic:

```typescript
const subtotalCents = Math.round(subtotal * 100);
const taxCents      = Math.round(tax      * 100);
const tipCents      = Math.round(tip      * 100);
```

`Math.round` snaps the value to the nearest cent before multiplication
can introduce further error. Use `Math.round`, not `Math.floor` or
`Math.ceil`, unless you have a specific rounding requirement.

**Never add, subtract, divide, or multiply raw dollar values.**
Only convert back to dollars at the output boundary:

```typescript
return { total: totalCents / 100 };
```

Dividing an integer by 100 always produces a value with at most
2 decimal places — no further rounding is needed.

---

## Rule 2 — Validate all inputs before calculation

Reject invalid inputs with a descriptive error that names the offending
field. Do not let invalid values reach the calculation layer.

```typescript
type MoneyField = "subtotal" | "tax" | "tip" | "participants";

class MoneyInputError extends Error {
  constructor(public readonly field: MoneyField, message: string) {
    super(message);
    this.name = "MoneyInputError";
  }
}

function validateAmount(value: number, field: MoneyField): void {
  if (!Number.isFinite(value)) {
    throw new MoneyInputError(field, `${field} must be a finite number`);
  }
  if (value < 0) {
    throw new MoneyInputError(field, `${field} must be >= 0, got ${value}`);
  }
}

function validateParticipants(value: number): void {
  if (!Number.isFinite(value)) {
    throw new MoneyInputError("participants", "participants must be a finite number");
  }
  if (!Number.isInteger(value)) {
    throw new MoneyInputError("participants", `participants must be an integer, got ${value}`);
  }
  if (value < 1) {
    throw new MoneyInputError("participants", `participants must be >= 1, got ${value}`);
  }
}
```

Validate in a consistent order: money fields first, then participant count.
Throw on the **first** violation — do not accumulate errors unless your
API contract requires it.

---

## Rule 3 — Split using floor division plus remainder distribution

Given `totalCents` and `participants`, compute the equal split using
integer floor-division:

```typescript
const baseCents      = Math.floor(totalCents / participants);
const remainderCents = totalCents % participants;
```

`baseCents` is the largest whole-cent amount every participant can receive.
`remainderCents` is the number of participants who must receive one extra
penny to account for the indivisible remainder.

Distribute the extra pennies to the **first** `remainderCents` participants:

```typescript
const shares: number[] = [];
for (let i = 0; i < participants; i++) {
  const cents = i < remainderCents ? baseCents + 1 : baseCents;
  shares.push(cents / 100);
}
```

This is a deliberate, auditable distribution policy. The first participant
pays the rounding difference, not the last.

---

## Rule 4 — The exact-sum invariant must hold by construction

The sum of all shares must equal the total exactly. This is guaranteed
algebraically — not by a post-hoc check:

```
sum = remainderCents × (baseCents + 1)
    + (participants − remainderCents) × baseCents
    = participants × baseCents + remainderCents
    = totalCents  ✓
```

**Never adjust the last share to fix a rounding discrepancy.** If your
algorithm requires that correction, the upstream arithmetic is wrong.
Fix the algorithm, not the output.

---

## Rule 5 — Never produce a negative share

`baseCents = Math.floor(non-negative / positive)` is always ≥ 0.
Adding at most 1 to `baseCents` keeps it ≥ 0.
A share of `0.00` is legitimate when `totalCents < participants`
(e.g. $0.02 split among 5 people: two get $0.01, three get $0.00).

This is not an error. Do not reject it.

---

## Rule 6 — Keep the calculation function pure

A monetary calculation function must be:

- **Deterministic**: same inputs → same output, always
- **Side-effect free**: no console output, no file I/O, no network calls,
  no database access, no global mutable state
- **Synchronous**: no `async`/`await`, no `Promise` returns

```typescript
// ✅ Pure
function splitBill(input: BillInput): BillResult {
  validateInput(input);
  const totalCents = Math.round(input.subtotal * 100)
                   + Math.round(input.tax      * 100)
                   + Math.round(input.tip      * 100);
  const baseCents      = Math.floor(totalCents / input.participants);
  const remainderCents = totalCents % input.participants;
  const shares = Array.from({ length: input.participants }, (_, i) =>
    (i < remainderCents ? baseCents + 1 : baseCents) / 100
  );
  return { total: totalCents / 100, sharePerParticipant: shares };
}

// ❌ Not pure — mixing calculation with persistence
async function splitAndSave(input: BillInput): Promise<BillResult> {
  const result = splitBill(input);
  await db.insert(result);   // side effect inside the calculation
  return result;
}
```

The calculation function should have no knowledge of how its result is
stored or displayed. Compose pure calculation with persistence at the
call site, not inside the function.

---

## Rule 7 — Property-based tests for financial invariants

Use a property-based testing library (fast-check, hypothesis, etc.) to
verify invariants across hundreds of generated inputs.

### Essential properties to test

**Exact sum** — the core invariant:
```typescript
fc.assert(fc.property(validBillInput, (input) => {
  const result = splitBill(input);
  const sumCents = result.sharePerParticipant
    .reduce((acc, s) => acc + Math.round(s * 100), 0);
  expect(sumCents).toBe(Math.round(result.total * 100));
}));
```

**Non-negative shares:**
```typescript
fc.assert(fc.property(validBillInput, (input) => {
  const { sharePerParticipant } = splitBill(input);
  sharePerParticipant.forEach(s => expect(s).toBeGreaterThanOrEqual(0));
}));
```

**Participant count:**
```typescript
fc.assert(fc.property(validBillInput, (input) => {
  const { sharePerParticipant } = splitBill(input);
  expect(sharePerParticipant).toHaveLength(input.participants);
}));
```

**Single participant identity:**
```typescript
fc.assert(fc.property(singleParticipantInput, (input) => {
  const { total, sharePerParticipant } = splitBill(input);
  expect(sharePerParticipant[0]).toBe(total);
}));
```

**Determinism:**
```typescript
fc.assert(fc.property(validBillInput, (input) => {
  expect(splitBill(input)).toEqual(splitBill(input));
}));
```

**Zero total:**
```typescript
fc.assert(fc.property(fc.integer({ min: 1, max: 200 }), (participants) => {
  const { total, sharePerParticipant } = splitBill(
    { subtotal: 0, tax: 0, tip: 0, participants }
  );
  expect(total).toBe(0);
  sharePerParticipant.forEach(s => expect(s).toBe(0));
}));
```

### Generating valid dollar amounts

Do not use `fc.float()` for money — it generates 32-bit floats that may
not round-trip cleanly. Instead, generate integer cents and divide:

```typescript
// ✅ Clean: integer multiples of $0.01
const dollarAmount = fc.integer({ min: 0, max: 1_000_000 })
  .map(cents => cents / 100);

// ✅ Tiny amounts: exercises totalCents < participants
const tinyAmount = fc.integer({ min: 0, max: 10 })
  .map(cents => cents / 100);

// ✅ High precision: tests Math.round snapping
const highPrecisionAmount = fc.integer({ min: 0, max: 10_000_000 })
  .map(n => n / 10_000);  // up to 4 decimal places

// ❌ Avoid: fc.float() requires 32-bit float bounds and
//    generates values that are already anomalous
```

---

## Rule 8 — Regression tests for known-tricky values

Property tests explore the space broadly. Regression tests pin specific
values that have historically caused problems or are likely to be
generated by real users.

```typescript
// $10.00 / 3 — the canonical uneven split
// Expected: [3.34, 3.33, 3.33], sum = 10.00
it("$10.00 split 3 ways", () => {
  const { total, sharePerParticipant } = splitBill(
    { subtotal: 10, tax: 0, tip: 0, participants: 3 }
  );
  expect(total).toBe(10.00);
  expect(sharePerParticipant).toEqual([3.34, 3.33, 3.33]);
});

// $0.01 / 3 — one penny, three people
// Expected: [0.01, 0.00, 0.00], sum = 0.01
it("$0.01 split 3 ways", () => {
  const { total, sharePerParticipant } = splitBill(
    { subtotal: 0.01, tax: 0, tip: 0, participants: 3 }
  );
  expect(total).toBe(0.01);
  expect(sharePerParticipant).toEqual([0.01, 0.00, 0.00]);
});

// $0.02 / 5 — totalCents < participants
// Expected: [0.01, 0.01, 0.00, 0.00, 0.00], sum = 0.02
it("$0.02 split 5 ways", () => {
  const { total, sharePerParticipant } = splitBill(
    { subtotal: 0.02, tax: 0, tip: 0, participants: 5 }
  );
  expect(total).toBe(0.02);
  expect(sharePerParticipant).toEqual([0.01, 0.01, 0.00, 0.00, 0.00]);
});

// 0.1 + 0.2 — the canonical floating-point trap
// In IEEE-754: 0.1 + 0.2 = 0.30000000000000004
// Integer-cent arithmetic must snap this to $0.30
it("0.1 + 0.2 does not drift", () => {
  const { total } = splitBill(
    { subtotal: 0.1, tax: 0.2, tip: 0, participants: 1 }
  );
  expect(total).toBe(0.30);  // not 0.30000000000000004
});

// $1.005 — IEEE-754 rounding boundary
// 1.005 * 100 = 100.49999... in IEEE-754, so rounds to $1.00, not $1.01
it("$1.005 rounds to $1.00 (IEEE-754 boundary)", () => {
  const { total } = splitBill(
    { subtotal: 1.005, tax: 0, tip: 0, participants: 1 }
  );
  expect(total).toBe(1.00);  // not 1.01
});
```

The `$1.005` case is worth documenting explicitly: users often assume
"round half up" means $1.005 → $1.01, but IEEE-754 represents `1.005`
as approximately `1.00499999...`, so `Math.round(1.005 * 100)` is `100`,
not `101`. This is correct behaviour, not a bug.

---

## TypeScript types

Define explicit, named types for all inputs and outputs. Avoid `any`.

```typescript
interface BillInput {
  subtotal:     number;  // dollars, >= 0
  tax:          number;  // dollars, >= 0
  tip:          number;  // dollars, >= 0
  participants: number;  // positive integer
}

interface BillResult {
  total:               number;    // dollars, 2 d.p.
  sharePerParticipant: number[];  // dollars, 2 d.p., length === participants
}
```

Use a union type for field names to keep error reporting type-safe:

```typescript
type BillInputField = "subtotal" | "tax" | "tip" | "participants";
```

---

## Quick reference checklist

Before shipping any monetary calculation function, verify:

- [ ] All inputs converted to integer cents with `Math.round(value * 100)`
- [ ] All arithmetic performed on integer cent values
- [ ] Back-conversion to dollars happens only at output boundary
- [ ] Inputs validated before any arithmetic runs
- [ ] Validation throws with the offending field name
- [ ] `sharePerParticipant.length === participants`
- [ ] `sum(shares) === total` — verified by a property-based test
- [ ] No share is negative
- [ ] Function is synchronous and has no side effects
- [ ] No `import` from I/O, network, or database modules
- [ ] Regression tests cover: `$10/3`, `$0.01/3`, `$0.02/5`, `0.1 + 0.2`
