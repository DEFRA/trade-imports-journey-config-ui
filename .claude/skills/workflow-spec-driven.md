---
name: workflow-spec-driven
description: Workflow for prescriptive stories — config, infrastructure, migrations where the spec IS the implementation plan.
---

## When to use

The story provides exact SQL, config, CLI commands, or step-by-step
instructions. Few design decisions needed. Implementation means following
the spec.

## Workflow

1. **Extract tasks** from the story's steps/sections. Create a TodoWrite
   entry per task. Mark the first `in_progress`.

2. **Implement each task** directly from the spec. Use exact SQL, config,
   or commands provided. Don't over-engineer.

3. **Run verification commands** from the story's acceptance criteria.
   Document what passed and any deviations.

4. **Optional — codify verifications as tests.** If the infrastructure is
   critical, extract the verification commands into a test file for CI.

5. **Report**: tasks completed, acceptance criteria met, deviations noted.
