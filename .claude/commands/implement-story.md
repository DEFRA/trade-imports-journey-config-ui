# Implement Story

You are implementing a story. Follow these steps in order.

## Step 0: Clean tree and feature branch

```bash
git status
```

If there are uncommitted changes, show them to the user and ask how to
proceed (commit, stash, or discard). Do NOT continue until the tree is
clean.

Once clean, create and checkout a feature branch:

```bash
git checkout -b feature/<kebab-case-story-name>
```

## Step 1: Read and classify

1. Read the story file the user specified.
2. Read all documentation referenced in the story.
3. Classify the story:

**PRESCRIPTIVE** — the story provides exact SQL, config, commands, or
step-by-step instructions. Few design decisions needed.
→ Follow `.claude/skills/workflow-spec-driven.md`

**EXPLORATORY** — the story describes behaviour, business rules, or
features. Design decisions are needed.
→ Follow `.claude/skills/workflow-test-first.md`

**MIXED** — split into phases. Run spec-driven for the infrastructure
parts first, then test-first for the logic parts.

If uncertain, show reasoning for both and ask the user.

## Step 2: Execute the workflow

Read and follow the chosen workflow skill file. The workflow files
contain the full process including agent invocations.

Key rules that apply regardless of workflow:

- Read `.claude/skills/valuable-unit-tests.md` before writing any test.
- All commits go on the feature branch. Do NOT merge or push.
- If you discover a bug mid-implementation, use the `/bug-fix` command.

## Step 3: Report

When complete, summarise: what was implemented, what is tested, which
acceptance criteria are met, and what risks remain.
