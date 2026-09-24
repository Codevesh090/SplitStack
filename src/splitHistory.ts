/**
 * splitHistory.ts — Persistence layer for completed bill splits.
 *
 * This module is the only place in the codebase that talks to Supabase.
 * It accepts the existing BillInput / BillResult types from the calculation
 * engine and maps them onto database rows. It never calls splitBill() and
 * has no calculation logic of its own.
 */

import type { BillInput, BillResult } from "./splitBill.types.js";
import type { Tables } from "./database.types.js";
import { supabase } from "./supabaseClient.js";

// ---------------------------------------------------------------------------
// Domain type: a persisted split record as returned from the database
// ---------------------------------------------------------------------------

/** A completed split record exactly as stored in split_history. */
export type SplitRecord = Tables<"split_history">;

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Persists a completed split to the database.
 *
 * @param input   The original BillInput passed to splitBill().
 * @param result  The BillResult returned by splitBill().
 * @returns       The newly inserted row, including its generated id and created_at.
 * @throws        If the insert fails (network error, constraint violation, etc.)
 */
export async function saveSplit(
  input: BillInput,
  result: BillResult,
): Promise<SplitRecord> {
  const { data, error } = await supabase
    .from("split_history")
    .insert({
      subtotal: input.subtotal,
      tax: input.tax,
      tip: input.tip,
      total: result.total,
      participants: input.participants,
      shares: result.sharePerParticipant,
    })
    .select()
    .single();

  if (error !== null) {
    throw new Error(`saveSplit failed: ${error.message}`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Read — all records
// ---------------------------------------------------------------------------

/**
 * Retrieves all split records, ordered newest first.
 *
 * @returns  An array of SplitRecord (empty array if no records exist).
 * @throws   If the query fails.
 */
export async function getSplitHistory(): Promise<SplitRecord[]> {
  const { data, error } = await supabase
    .from("split_history")
    .select("*")
    .order("created_at", { ascending: false });

  if (error !== null) {
    throw new Error(`getSplitHistory failed: ${error.message}`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Read — single record by ID
// ---------------------------------------------------------------------------

/**
 * Retrieves one split record by its UUID.
 *
 * @param id  The UUID of the split record.
 * @returns   The matching SplitRecord, or null if not found.
 * @throws    If the query fails for any reason other than "not found".
 */
export async function getSplitById(id: string): Promise<SplitRecord | null> {
  const { data, error } = await supabase
    .from("split_history")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`getSplitById failed: ${error.message}`);
  }

  return data;
}
