---
name: review-stories
description: Run the full story review cycle — engineering lens (sizing, sequencing, codebase fit) followed by QA lens (test strategy, risk, acceptance criteria). Use after stories have been drafted from a design conversation, before implementation begins.
disable-model-invocation: true
---

# Review Stories

Run two reviews in sequence and combine their output into a single revised story set.

The two underlying skills (`dev-story-review` and `qa-story-review`) are explicit-only and can be invoked individually for iteration. This skill chains them in the order their content assumes — the QA skill expects to read the engineering review.

## Step 1: Engineering review

Invoke the `dev-story-review` skill against the story files (or directory) under review. Capture its output verbatim.

The engineering review covers:

- Right-sizing each story
- Logical independence and ordering
- Codebase evidence (existing patterns, reusable code, conflicting work)
- Risky assumptions
- Splits, merges, deletions
- Missing discovery work

## Step 2: QA review

Invoke the `qa-story-review` skill against the same story files **and** the engineering review from Step 1. The QA skill's own process explicitly says: *"Read the stories and any principal engineer review."* It builds on the engineering output rather than re-deriving it.

The QA review covers:

- Behaviour under test for each story
- Risk profile and regression areas
- Smallest useful test set (unit / integration / contract / manual)
- Tests not worth adding
- Acceptance criteria gaps
- How to run tests locally and in CI

## Step 3: Combined output

Return, in this order:

1. **Engineering review** — output from Step 1, unmodified.
2. **QA review** — output from Step 2, unmodified.
3. **Recommended revised story set** — synthesise both reviews into a single revised list. Note where the two lenses agreed and where they pointed in different directions.
4. **Unresolved questions** — material questions from either review that require the user.
5. **Discovery tasks** — work that must happen before implementation.

## Do not

- Do not rewrite the story files yet. The user reads the combined output and chooses which revisions to apply.
- Do not skip Step 1 to go straight to QA — the QA lens depends on engineering context.
- Do not collapse the two reviews into a single summary. Both reviewers' raw outputs must be present so the user can see what each lens found.