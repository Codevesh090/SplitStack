# SplitStack — Coding & Architectural Conventions

## Language

Use **TypeScript** for all application code. Avoid plain JavaScript files in `src/`.

## Pure Calculation Core

The bill-splitting calculation engine must be a **pure, deterministic function**. It must have:

- No I/O (no file reads, no console output)
- No network requests
- No database access
- No global or shared mutable state
- No other side effects

Given the same inputs, it must always return the same output.

## Monetary Arithmetic

Perform all monetary calculations using **integer cents** internally.

- Convert currency inputs to integer cents before any arithmetic: `Math.round(value * 100)`
- Do all arithmetic (addition, division, remainder) on integer cent values
- Convert back to currency (divide by 100) only at the output boundary

This prevents floating-point drift and keeps intermediate values exact.

## Input Validation

**Validate all inputs before performing calculations.** Reject invalid inputs early with a descriptive error that identifies the offending field. Do not let invalid values reach the calculation layer.

## TypeScript Types

- Use **descriptive, explicit types** for all function signatures, parameters, and return values
- Avoid `any`; use `unknown` with type guards where the shape is genuinely uncertain
- Prefer named interfaces or type aliases over inline object literals in function signatures

## Separation of Concerns

Keep **business logic separate** from UI, persistence, and external services. The calculation engine should be importable and runnable in isolation, with no knowledge of how it is called or where results are displayed.

## Automated Tests

**Every business rule must be covered by an automated test.** This includes happy-path cases, edge cases, and all invalid-input scenarios. Tests are the executable specification of the business rules.

## Function Design

Keep functions **small and focused on a single responsibility**. If a function needs a comment to explain what it does, consider splitting it.

## Dependencies

**Do not introduce external dependencies unless they directly satisfy a stated project requirement.** Prefer the standard library and language built-ins. When a dependency is added, pin it to an exact version.

## Core Invariant

This invariant must hold for every valid output, without exception:

> **The sum of all participant shares must equal the final bill total exactly.**

No rounding strategy, optimisation, or refactor may break this invariant. Verify it in tests.
