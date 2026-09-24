/** All monetary fields are in dollars (e.g. 10.50 = $10.50). */
export interface BillInput {
  subtotal: number;
  tax: number;
  tip: number;
  /** Must be a positive integer (≥ 1). */
  participants: number;
}

export interface BillResult {
  /** Final bill total (subtotal + tax + tip), rounded to 2 decimal places. */
  total: number;
  /**
   * Each participant's share in dollars, rounded to 2 decimal places.
   * Length equals `BillInput.participants`.
   * The sum of all entries equals `total` exactly.
   */
  sharePerParticipant: number[];
}

export type BillInputField = "subtotal" | "tax" | "tip" | "participants";

export class BillInputError extends Error {
  constructor(
    public readonly field: BillInputField,
    message: string,
  ) {
    super(message);
    this.name = "BillInputError";
  }
}
