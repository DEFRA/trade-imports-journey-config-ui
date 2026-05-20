---
name: bug-fix
description: Test-first bug-fix workflow — write a failing regression test before any code change, fix minimally, then verify. Use when fixing a defect in this codebase.
---

# Bug Fix Workflow

You are about to fix a bug. Follow these steps IN ORDER. DO NOT skip steps.

## Step 1: Understand the Bug

- What is the expected behavior?
- What is the actual behavior?
- What is the root cause?

## Step 2: Write a Failing Test (MANDATORY)

**STOP**: Before writing ANY code to fix the bug, you MUST:

1. **Read the valuable unit test skill**:

   - Read `.claude/skills/valuable-unit-tests.md`
   - Apply the principles to determine what test is needed

2. **Create a TodoWrite entry**:

   - Add: "Write regression test for [bug description]"
   - Mark status: `in_progress`

3. **Write a test that FAILS**:

   - The test should fail with the current buggy code
   - The test should be minimal and focused on the bug
   - Follow the principles from valuable-unit-tests.md

4. **Run the test to confirm it FAILS**:

   - Use `TZ=UTC npx vitest run path/to/test.test.js`
   - Verify the test fails for the right reason
   - Do NOT proceed if the test passes (it's not testing the bug)

5. **Mark the todo as completed**

## Step 3: Fix the Bug

1. **Create a TodoWrite entry**:

   - Add: "Fix [bug description]"
   - Mark status: `in_progress`

2. **Make the minimal change**:

   - Fix ONLY what's needed to make the test pass
   - Avoid refactoring or "improvements" during the fix

3. **Mark the todo as completed** after the next step

## Step 4: Verify the Fix

1. **Run the regression test**:

   - The test should now PASS
   - If it still fails, the bug isn't fixed - return to Step 3

2. **Run the full test suite**:

   - Use `npm test` to ensure no regressions
   - If other tests fail, you may have introduced a new bug

3. **Document the fix** (optional):
   - Update comments if the fix is non-obvious
   - Reference the test in commit messages

## Workflow Enforcement

**NO BUG IS FIXED WITHOUT A TEST.**

If you find yourself wanting to skip the test:

- Ask yourself: "Why am I skipping the test?"
- The answer is probably: "I forgot" or "It seems too simple"
- Write the test anyway. It takes 2 minutes and prevents regressions.

## Example TodoWrite Sequence

When you start a bug fix, your todos should look like:

```
1. Write regression test for [bug] (in_progress)
2. Fix [bug] (pending)
```

Then:

```
1. Write regression test for [bug] (completed)
2. Fix [bug] (in_progress)
```

Then:

```
1. Write regression test for [bug] (completed)
2. Fix [bug] (completed)
```
