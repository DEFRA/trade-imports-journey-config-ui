# CLAUDE.md

## Project Overview

Node.js frontend (Hapi.js / Nunjucks / GOV.UK Frontend) for visualising
and exploring IPAFFS journey configurations. Built on the CDP platform at
Defra. This file covers project-specific principles only.

## Development Principles

These apply to all work in this repo, including agent-driven workflows.

1. **Functional idioms.** Side effects at the edges, pure logic in the
   core. Prefer `const`, arrow functions, destructuring, `map`/`filter`/
   `reduce` over imperative loops.
2. **Pure functions.** Idempotent, no mutation of arguments or module
   state. If a function is hard to test, the function has the wrong shape.
3. **Mocking is a smell.** Mock only true external boundaries (HTTP, DB,
   filesystem, time). If you need more than 1–2 mocks, extract the pure
   core and test that directly.
4. **Real data over mocks.** Loading real JSON fixtures is cheap and
   catches bugs that mocks hide. Prefer integration-style tests that
   exercise real data paths.
5. **Unit tests aid decomposition.** They prove the contract and protect
   against regressions. They should not test implementation details.
6. **Integration tests find bugs.** Unit tests prove design; integration
   tests prove correctness. Both matter.
7. **Loose coupling over DRY.** Three similar lines are often better than
   a premature abstraction. Coupling two modules to share a helper is
   worse than a little repetition.

## Essential Commands

```bash
npm run dev          # Start with hot-reload
npm test             # Vitest with coverage
TZ=UTC npx vitest run path/to/file.test.js   # Single test file
npm run lint         # ESLint (neostandard) + Stylelint
npm run format       # Prettier
```

## Testing Conventions

- Vitest. Tests colocated as `<name>.test.js`.
- Behaviour over implementation — test observable outcomes.
- Table-driven (`test.each`) for input/output rules.
- Regression test for every bug fix (see `/bug-fix` command).

## Agent Team

Three peer agents run at defined points in the development workflow:

| Agent                  | Owns                      | Does NOT own       |
| ---------------------- | ------------------------- | ------------------ |
| `code-reviewer`        | Correctness, security     | Tests, structure   |
| `qa-test-planner`      | Test planning, test code  | Fixes, refactoring |
| `refactoring-enforcer` | Decomposition, naming, FP | Correctness, tests |

They are invoked by the `/implement-story` command at explicit gate
points. Do not skip them.
