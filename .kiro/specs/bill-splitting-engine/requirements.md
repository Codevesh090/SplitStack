# Requirements: Core Bill-Splitting Calculation Engine

## Overview

The core bill-splitting engine accepts a bill's financial components and a participant count, then computes how much each person owes. It is a pure calculation module with no UI or persistence concerns.

---

## Functional Requirements

### REQ-1: Bill Total Calculation
**WHEN** the engine receives a subtotal, a tax amount, and a tip amount,  
**IT SHALL** calculate the final bill total as `subtotal + tax + tip`.

### REQ-2: Equal Split
**WHEN** the final bill total and a participant count are known,  
**IT SHALL** divide the total equally among all participants.

### REQ-3: Currency Rounding
**WHEN** computing each participant's share,  
**IT SHALL** round each share to exactly 2 decimal places using standard rounding (round half up).

### REQ-4: Exact Sum Guarantee (Penny Correction)
**WHEN** the sum of all rounded participant shares does not equal the rounded final total,  
**IT SHALL** distribute the rounding difference (at most ±1 cent per participant) across the first N participants so that the sum of all shares equals the final total exactly.

### REQ-5: Non-Negative Shares
**WHEN** all inputs are valid and non-negative,  
**THE SYSTEM SHALL** never produce a negative participant share.

**WHEN** the total is greater than zero,  
**THE SYSTEM MAY** assign 0.00 to some participants when the total is smaller than the number of participants, while ensuring that the sum of all shares equals the total.

### REQ-6: Input Rejection — Negative Amounts
**WHEN** any of subtotal, tax, or tip is a negative number,  
**IT SHALL** reject the input and return a descriptive error.

### REQ-7: Input Rejection — Zero or Negative Participants
**WHEN** the number of participants is less than 1,  
**IT SHALL** reject the input and return a descriptive error.

### REQ-8: Input Rejection — Non-Integer Participants
**WHEN** the number of participants is not a positive integer,  
**IT SHALL** reject the input and return a descriptive error.

### REQ-9: Zero Total
**WHEN** the final bill total is 0.00 (all inputs are zero),  
**IT SHALL** return a share of 0.00 for every participant without error.

---

## Non-Functional Requirements

### NFR-1: Pure Function
The calculation engine shall have no side effects, no I/O, and no external dependencies. It shall be a deterministic function of its inputs.

### NFR-2: Precision
All intermediate arithmetic shall avoid floating-point drift by operating in integer cents (multiply inputs by 100, compute in integers, divide back to currency at output).

### NFR-3: Testability
Every requirement above shall be directly exercisable by a unit test with no setup beyond constructing the inputs.
