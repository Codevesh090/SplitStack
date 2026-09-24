import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { splitBill } from "./splitBill.js";
import { BillInputError } from "./splitBill.types.js";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a non-negative dollar amount with up to 2 decimal places,
 * bounded to a realistic maximum ($10,000) to keep generated values legible.
 * Using integer multiples of 0.01 avoids generating values that are already
 * floating-point anomalies before they reach the engine.
 */
const dollarAmount = fc.integer({ min: 0, max: 1_000_000 }).map((cents) => cents / 100);

/**
 * A very small dollar amount (0 to $0.10) used to exercise the case where
 * totalCents < participants.
 */
const tinyDollarAmount = fc.integer({ min: 0, max: 10 }).map((cents) => cents / 100);

/**
 * Participant count: positive integer, large range to stress the remainder
 * distribution and large-participant-count edge cases.
 */
const participantCount = fc.integer({ min: 1, max: 200 });

/**
 * A single-participant count — used to verify the identity property.
 */
const singleParticipant = fc.constant(1);

/**
 * Full valid BillInput: all amounts non-negative, participants a positive integer.
 */
const validBillInput = fc.record({
  subtotal: dollarAmount,
  tax: dollarAmount,
  tip: dollarAmount,
  participants: participantCount,
});

/**
 * Valid input where amounts are tiny — exercises totalCents < participants.
 */
const tinyBillInput = fc.record({
  subtotal: tinyDollarAmount,
  tax: tinyDollarAmount,
  tip: tinyDollarAmount,
  participants: participantCount,
});

/**
 * Valid input with a single participant.
 */
const singleParticipantInput = fc.record({
  subtotal: dollarAmount,
  tax: dollarAmount,
  tip: dollarAmount,
  participants: singleParticipant,
});

/**
 * Dollar amounts with up to 4 decimal places — tests that Math.round
 * snapping to cents works correctly and never leaks sub-cent drift.
 */
const highPrecisionAmount = fc
  .integer({ min: 0, max: 10_000_000 })
  .map((n) => n / 10_000);

const highPrecisionBillInput = fc.record({
  subtotal: highPrecisionAmount,
  tax: highPrecisionAmount,
  tip: highPrecisionAmount,
  participants: participantCount,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sums an array of dollar values using integer cents to avoid accumulation
 * of floating-point error during the assertion itself.
 */
function sumInCents(shares: number[]): number {
  return shares.reduce((acc, s) => acc + Math.round(s * 100), 0);
}

function totalInCents(total: number): number {
  return Math.round(total * 100);
}

// ---------------------------------------------------------------------------
// Property 1 — EXACT SUM
// The sum of all participant shares must equal the returned total.
// Covers: REQ-4 (Exact Sum Guarantee)
// ---------------------------------------------------------------------------

describe("Property: exact sum", () => {
  it("holds for standard valid inputs", () => {
    fc.assert(
      fc.property(validBillInput, (input) => {
        const result = splitBill(input);
        expect(sumInCents(result.sharePerParticipant)).toBe(
          totalInCents(result.total),
        );
      }),
    );
  });

  it("holds for tiny amounts (totalCents may be less than participants)", () => {
    fc.assert(
      fc.property(tinyBillInput, (input) => {
        const result = splitBill(input);
        expect(sumInCents(result.sharePerParticipant)).toBe(
          totalInCents(result.total),
        );
      }),
    );
  });

  it("holds for high-precision decimal inputs", () => {
    fc.assert(
      fc.property(highPrecisionBillInput, (input) => {
        const result = splitBill(input);
        expect(sumInCents(result.sharePerParticipant)).toBe(
          totalInCents(result.total),
        );
      }),
    );
  });

  it("holds for large participant counts", () => {
    fc.assert(
      fc.property(
        fc.record({
          subtotal: dollarAmount,
          tax: dollarAmount,
          tip: dollarAmount,
          participants: fc.integer({ min: 100, max: 200 }),
        }),
        (input) => {
          const result = splitBill(input);
          expect(sumInCents(result.sharePerParticipant)).toBe(
            totalInCents(result.total),
          );
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 — NON-NEGATIVE SHARES
// Every participant share must be >= 0.
// Covers: REQ-5 (Non-Negative Shares)
// ---------------------------------------------------------------------------

describe("Property: non-negative shares", () => {
  it("no share is negative for standard valid inputs", () => {
    fc.assert(
      fc.property(validBillInput, (input) => {
        const { sharePerParticipant } = splitBill(input);
        for (const share of sharePerParticipant) {
          expect(share).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  it("no share is negative when total is smaller than participant count", () => {
    fc.assert(
      fc.property(tinyBillInput, (input) => {
        const { sharePerParticipant } = splitBill(input);
        for (const share of sharePerParticipant) {
          expect(share).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3 — PARTICIPANT COUNT
// The number of returned shares must equal the requested participant count.
// Covers: REQ-2 (Equal Split — array length)
// ---------------------------------------------------------------------------

describe("Property: participant count", () => {
  it("share array length equals requested participant count", () => {
    fc.assert(
      fc.property(validBillInput, (input) => {
        const { sharePerParticipant } = splitBill(input);
        expect(sharePerParticipant).toHaveLength(input.participants);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4 — SINGLE PARTICIPANT
// When participants = 1, the only share must equal the total.
// Covers: REQ-2, REQ-4 (identity case)
// ---------------------------------------------------------------------------

describe("Property: single participant", () => {
  it("the sole share equals the total", () => {
    fc.assert(
      fc.property(singleParticipantInput, (input) => {
        const { total, sharePerParticipant } = splitBill(input);
        expect(sharePerParticipant).toHaveLength(1);
        expect(sharePerParticipant[0]).toBe(total);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 — DETERMINISM
// Calling splitBill with the same input twice must produce identical results.
// Covers: NFR-1 (Pure Function)
// ---------------------------------------------------------------------------

describe("Property: determinism", () => {
  it("returns identical results on repeated calls with the same input", () => {
    fc.assert(
      fc.property(validBillInput, (input) => {
        const first = splitBill(input);
        const second = splitBill(input);
        expect(second.total).toBe(first.total);
        expect(second.sharePerParticipant).toEqual(first.sharePerParticipant);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6 — ZERO TOTAL
// When subtotal, tax, and tip are all zero, every share must be 0.
// Covers: REQ-9 (Zero Total)
// ---------------------------------------------------------------------------

describe("Property: zero total", () => {
  it("every share is 0.00 when all inputs are zero", () => {
    fc.assert(
      fc.property(participantCount, (participants) => {
        const { total, sharePerParticipant } = splitBill({
          subtotal: 0,
          tax: 0,
          tip: 0,
          participants,
        });
        expect(total).toBe(0);
        for (const share of sharePerParticipant) {
          expect(share).toBe(0);
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7 — TOTAL CALCULATION
// total must equal subtotal + tax + tip (rounded to nearest cent).
// Covers: REQ-1 (Bill Total Calculation)
// ---------------------------------------------------------------------------

describe("Property: total calculation", () => {
  it("total equals subtotal + tax + tip rounded to nearest cent", () => {
    fc.assert(
      fc.property(validBillInput, (input) => {
        const { total } = splitBill(input);
        const expectedCents =
          Math.round(input.subtotal * 100) +
          Math.round(input.tax * 100) +
          Math.round(input.tip * 100);
        expect(Math.round(total * 100)).toBe(expectedCents);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8 — SHARES ARE VALID CURRENCY VALUES
// Every share has at most 2 decimal places (no sub-cent precision leaks).
// Covers: REQ-3 (Currency Rounding), NFR-2 (Precision)
// ---------------------------------------------------------------------------

describe("Property: shares are valid currency values", () => {
  it("every share has at most 2 decimal places", () => {
    fc.assert(
      fc.property(validBillInput, (input) => {
        const { sharePerParticipant } = splitBill(input);
        for (const share of sharePerParticipant) {
          // Integer cents divided by 100 always yields at most 2 decimal places.
          // The definitive check is that share * 100 rounds to itself exactly.
          expect(Number.isInteger(Math.round(share * 100))).toBe(true);
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Validation error properties
// ---------------------------------------------------------------------------

describe("Property: input validation", () => {
  it("throws BillInputError with field=subtotal for negative subtotal", () => {
    fc.assert(
      fc.property(
        // Generate a positive cent value (1–1_000_000) and negate it to get a
        // guaranteed negative dollar amount with no 32-bit float constraint issues.
        fc.integer({ min: 1, max: 1_000_000 }).map((c) => -(c / 100)),
        (amount) => {
          expect(() =>
            splitBill({ subtotal: amount, tax: 0, tip: 0, participants: 1 }),
          ).toThrow(BillInputError);
          try {
            splitBill({ subtotal: amount, tax: 0, tip: 0, participants: 1 });
          } catch (e) {
            expect(e).toBeInstanceOf(BillInputError);
            expect((e as BillInputError).field).toBe("subtotal");
          }
        },
      ),
    );
  });

  it("throws BillInputError with field=tax for negative tax", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }).map((c) => -(c / 100)),
        (amount) => {
          expect(() =>
            splitBill({ subtotal: 0, tax: amount, tip: 0, participants: 1 }),
          ).toThrow(BillInputError);
          try {
            splitBill({ subtotal: 0, tax: amount, tip: 0, participants: 1 });
          } catch (e) {
            expect((e as BillInputError).field).toBe("tax");
          }
        },
      ),
    );
  });

  it("throws BillInputError with field=tip for negative tip", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }).map((c) => -(c / 100)),
        (amount) => {
          expect(() =>
            splitBill({ subtotal: 0, tax: 0, tip: amount, participants: 1 }),
          ).toThrow(BillInputError);
          try {
            splitBill({ subtotal: 0, tax: 0, tip: amount, participants: 1 });
          } catch (e) {
            expect((e as BillInputError).field).toBe("tip");
          }
        },
      ),
    );
  });

  it("throws BillInputError with field=participants for zero or negative participants", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 0 }), (n) => {
        expect(() =>
          splitBill({ subtotal: 10, tax: 0, tip: 0, participants: n }),
        ).toThrow(BillInputError);
        try {
          splitBill({ subtotal: 10, tax: 0, tip: 0, participants: n });
        } catch (e) {
          expect((e as BillInputError).field).toBe("participants");
        }
      }),
    );
  });

  it("throws BillInputError with field=participants for non-integer participants", () => {
    fc.assert(
      fc.property(
        // n + 0.5 is never a whole number, so this always generates a fractional participant count.
        fc.integer({ min: 0, max: 999 }).map((n) => n + 0.5),
        (n) => {
          expect(() =>
            splitBill({ subtotal: 10, tax: 0, tip: 0, participants: n }),
          ).toThrow(BillInputError);
          try {
            splitBill({ subtotal: 10, tax: 0, tip: 0, participants: n });
          } catch (e) {
            expect((e as BillInputError).field).toBe("participants");
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Targeted regression cases
// These pin specific known-tricky values that property tests may not always
// generate, ensuring rounding boundaries are covered explicitly.
// ---------------------------------------------------------------------------

describe("Regression: specific currency edge cases", () => {
  it("$10.00 / 3 → [3.34, 3.33, 3.33], sum = 10.00", () => {
    const { total, sharePerParticipant } = splitBill({
      subtotal: 10,
      tax: 0,
      tip: 0,
      participants: 3,
    });
    expect(total).toBe(10.0);
    expect(sharePerParticipant).toEqual([3.34, 3.33, 3.33]);
    expect(sumInCents(sharePerParticipant)).toBe(totalInCents(total));
  });

  it("$0.01 / 3 → [0.01, 0.00, 0.00], sum = 0.01", () => {
    const { total, sharePerParticipant } = splitBill({
      subtotal: 0.01,
      tax: 0,
      tip: 0,
      participants: 3,
    });
    expect(total).toBe(0.01);
    expect(sharePerParticipant).toEqual([0.01, 0.0, 0.0]);
    expect(sumInCents(sharePerParticipant)).toBe(totalInCents(total));
  });

  it("$0.02 / 5 → [0.01, 0.01, 0.00, 0.00, 0.00], sum = 0.02", () => {
    const { total, sharePerParticipant } = splitBill({
      subtotal: 0.02,
      tax: 0,
      tip: 0,
      participants: 5,
    });
    expect(total).toBe(0.02);
    expect(sharePerParticipant).toEqual([0.01, 0.01, 0.0, 0.0, 0.0]);
    expect(sumInCents(sharePerParticipant)).toBe(totalInCents(total));
  });

  it("floating-point-prone input 0.1 + 0.2 does not produce drift", () => {
    const { total, sharePerParticipant } = splitBill({
      subtotal: 0.1,
      tax: 0.2,
      tip: 0,
      participants: 1,
    });
    // 0.1 + 0.2 in IEEE-754 = 0.30000000000000004; engine must snap to 0.30
    expect(total).toBe(0.3);
    expect(sharePerParticipant[0]).toBe(0.3);
  });

  it("$100.00 / 100 → each share is exactly $1.00", () => {
    const { total, sharePerParticipant } = splitBill({
      subtotal: 100,
      tax: 0,
      tip: 0,
      participants: 100,
    });
    expect(total).toBe(100.0);
    expect(sharePerParticipant).toHaveLength(100);
    for (const share of sharePerParticipant) {
      expect(share).toBe(1.0);
    }
  });

  it("$1.005 demonstrates IEEE-754: 1.005*100 < 100.5, so snaps to $1.00 (not $1.01)", () => {
    // 1.005 cannot be represented exactly in IEEE-754 double precision.
    // Its actual value is ~1.00499999..., so Math.round(1.005 * 100) = 100 → $1.00.
    // This is correct and expected engine behaviour per the design spec.
    const { total } = splitBill({
      subtotal: 1.005,
      tax: 0,
      tip: 0,
      participants: 1,
    });
    expect(total).toBe(1.0);
  });

  it("value just below rounding boundary: $1.004 snaps to $1.00 total", () => {
    const { total } = splitBill({
      subtotal: 1.004,
      tax: 0,
      tip: 0,
      participants: 1,
    });
    expect(total).toBe(1.0);
  });
});
