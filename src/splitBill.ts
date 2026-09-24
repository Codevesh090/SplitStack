import {
  BillInput,
  BillInputError,
  BillInputField,
  BillResult,
} from "./splitBill.types.js";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function assertNonNegativeAmount(value: number, field: BillInputField): void {
  if (!Number.isFinite(value)) {
    throw new BillInputError(field, `${field} must be a finite number`);
  }
  if (value < 0) {
    throw new BillInputError(field, `${field} must be >= 0, got ${value}`);
  }
}

function validateInput(input: BillInput): void {
  assertNonNegativeAmount(input.subtotal, "subtotal");
  assertNonNegativeAmount(input.tax, "tax");
  assertNonNegativeAmount(input.tip, "tip");

  const p = input.participants;
  if (!Number.isFinite(p)) {
    throw new BillInputError("participants", "participants must be a finite number");
  }
  if (!Number.isInteger(p)) {
    throw new BillInputError(
      "participants",
      `participants must be an integer, got ${p}`,
    );
  }
  if (p < 1) {
    throw new BillInputError(
      "participants",
      `participants must be >= 1, got ${p}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

/**
 * Splits a bill equally among participants.
 *
 * All monetary arithmetic is performed in integer cents to avoid
 * floating-point drift. The penny-correction algorithm guarantees
 * that the sum of all shares equals the total exactly.
 *
 * @throws {BillInputError} when any input fails validation
 */
export function splitBill(input: BillInput): BillResult {
  validateInput(input);

  // Step 1 — convert to integer cents (Math.round avoids sub-cent drift)
  const subtotalCents = Math.round(input.subtotal * 100);
  const taxCents = Math.round(input.tax * 100);
  const tipCents = Math.round(input.tip * 100);
  const totalCents = subtotalCents + taxCents + tipCents;

  // Step 2 — floor-divide to get base share; remainder = pennies to distribute
  const baseCents = Math.floor(totalCents / input.participants);
  const remainderCents = totalCents % input.participants;

  // Step 3 — build shares; first `remainderCents` participants get one extra penny
  const sharePerParticipant: number[] = [];
  for (let i = 0; i < input.participants; i++) {
    const cents = i < remainderCents ? baseCents + 1 : baseCents;
    sharePerParticipant.push(cents / 100);
  }

  return {
    total: totalCents / 100,
    sharePerParticipant,
  };
}
