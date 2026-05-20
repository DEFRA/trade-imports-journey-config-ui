---
name: valuable-unit-tests
description: Select and write high-value unit tests for this Node/Hapi codebase using a QA-first selection process. Single source of truth for test selection rules.
---

## Project conventions

- Test runner: **Vitest**. Tests are colocated alongside source as `<name>.test.js`.
- Run a single test file: `TZ=UTC npx vitest run <path/to/file.test.js>`
- Run the full suite: `npm test`
- Linter: `neostandard` (via `eslint.config.js`).

## Workflow

When asked to write or improve unit tests, do this in order:

1. Inspect the module and **read the nearest existing test** to match its style
   (describe/test blocks, setup patterns, mocking approach).
2. State the public behavior and the main risks in 5 lines or fewer.
3. Select only the cases that are highest value (see rules below).
4. Reject low-value cases explicitly and say why.
5. Write the tests.
6. Run `TZ=UTC npx vitest run <path>` — confirm they pass (and, for bug
   fixes, that they failed against the un-fixed code first).
7. Report: what behavior is now protected, what risks remain, any seams the
   code lacks.

## Selection rules

**Prioritise**: input validation, branching, transformations, error handling,
boundary conditions, regression cases for fixed bugs.

**Prefer** table-driven tests (`test.each`) for input/output rules so each row
is one scenario.

**Avoid**: tests coupled to internal implementation; excessive mocks; snapshot
tests unless the output is large, stable, and meaningfully reviewed.

**If the code lacks a clean seam**, suggest a minimal refactor before adding
brittle tests — don't mock your way around a design problem.

## Pre-test checklist

Produce this checklist before writing any test.

### Behavior & intent
- **Domain goal**: what is the user/system trying to achieve?
- **Observable outcome**: what change is visible to the caller?

### High-value cases (the "shoulds")
List 2–5 cases. Each must cite a real risk, not coverage.

### Explicitly excluded (the "should-nots")
List 2–3 low-value cases and say why you're rejecting each.

## Worked example — `src/config/nunjucks/filters/format-date.js`

**Domain goal**: format an ISO string or `Date` into a human-readable date in
the Nunjucks template layer.

**Observable outcome**: the returned string matches the requested format.

**High-value cases**:
- ISO string input with the default format → `'Wed 1st February 2023'` (happy path).
- `Date` object input → same result (proves the `isDate` branch).
- Custom format string → output honours it (proves the pass-through).

**Explicitly excluded**:
- Calling `parseISO` directly — that's `date-fns`' contract, not ours.
- A snapshot of every locale — unstable, review theater.
- Testing that `format` is called — implementation detail, breaks on refactor.

The real test at `src/config/nunjucks/filters/format-date.test.js` covers
exactly these three cases. That's the target shape.

## When code is hard to test

Prefer functions that operate on data over mocking. Mocking is easy to abuse.
If you need more than 1–2 mocks to exercise a pure-logic function, the
module has the wrong shape. Suggest extracting the pure core and testing
that directly; leave the thin adapter uncovered or covered by one
integration test.
