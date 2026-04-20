---
name: workflow-test-first
description: Workflow for exploratory stories — business logic, algorithms, features that need design decisions and test-first development.
---

## When to use

The story describes behaviour without exact implementation. Multiple
approaches are possible. Contains business rules, complex logic, or
user-facing features.

## Setup

1. Read the story file and all referenced documentation.
2. Launch an **Explore agent** to find reusable code and understand
   the codebase context around the story.
3. Launch a **Plan agent** to break the work into modules. Review the
   plan with the user before proceeding.
4. Create TodoWrite entries following the loop below — one cycle per
   module, then a final refactor-and-verify phase.

## The loop — for EACH module

### 1. Plan tests

STOP. Launch the qa-test-planner agent before writing any test code:

```
Agent({ subagent_type: "qa-test-planner", prompt: "Plan tests for
  [module]. Here is its intended behaviour: [behaviour]. Read
  .claude/skills/valuable-unit-tests.md for selection rules." })
```

### 2. Write failing tests

Write the tests from the plan. Run them — they must FAIL:

```bash
TZ=UTC npx vitest run path/to/module.test.js
```

If they pass, you are not testing the right thing. Fix before continuing.

### 3. Implement

Write the minimal code to make the tests green. Prefer functional style:
pure functions, immutability, composition.

### 4. Review

STOP. Launch the code-reviewer agent on the new module:

```
Agent({ subagent_type: "code-reviewer", prompt: "Review [file] for
  correctness, security, error handling, and FP principle adherence." })
```

Address critical findings before moving to the next module. If a bug is
found, use the `/bug-fix` command.

---

## After ALL modules

### 5. Refactor

STOP. Launch the refactoring-enforcer agent on all files from this story:

```
Agent({ subagent_type: "refactoring-enforcer", prompt: "Review [files]
  for decomposition, naming, and structural quality." })
```

### 6. Verify

Run the full test suite:

```bash
npm test
```

Check every acceptance criterion from the story. Report what was
implemented, what is tested, and what risks remain.
