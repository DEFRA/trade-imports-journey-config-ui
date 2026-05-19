---
name: create-stories
description: Extract delivery stories from a design conversation or document. Strip the conversation of noise, Example Map each decision, sequence by dependency and walking skeleton, write feature README and story files using the project template.
---

## Purpose

Turn a conversation, design document, or analysis into a set of
implementable stories that match the project's existing story format
(see `features/multi-journey/story-01-journey-owned-resolvers.md` as
the canonical example).

The skill is an *extractor*, not a designer. If the source material
didn't produce a decision, there is no story.

The process follows the **Refine and Thought (RaT) pattern**
(Du et al., 2024): don't extract stories directly from messy raw input.
First produce a refined, classified version of the source; then
operate on that refined version, not the original. Each step's output
is the next step's clean input. The pattern reduces hallucination and
makes drift visible at gate points.

## When to use

- After a design conversation that produced decisions and trade-offs
- After analysis that identified concrete work to be done
- When the user says "turn this into stories", "what do we need to
  deliver this", or points at a design doc and asks for stories

## Inputs

One of:
- A conversation summary or transcript
- One or more design documents (e.g. the files in `features/<X>/`)
- A feature directory with context docs but no stories yet

## Workflow alignment

Stories produced by this skill are consumed by `/implement-story`, which
runs a single unified loop on every story that produces code:

```
Explore → Plan → (for each module: plan tests → write tests →
implement → review) → refactor all modules → retest → verify
```

There is **no story classification**. Every story that produces code
follows the loop. Spec-driven and test-first are not separate workflows;
they are different starting points within the same loop. The skill does
not tag stories with a workflow class.

Two skills feed the loop:
- `.claude/skills/valuable-unit-tests.md` — governs test selection
  per module. Stories should describe behaviour at a level the
  qa-test-planner can plan against, not pre-decompose modules.
- `.claude/skills/create-stories.md` (this skill) — produces the
  stories the loop consumes.

## Process

The process has six steps. Each gate (marked **STOP**) requires user
confirmation before proceeding. Do not skip gates; the cost of pausing
is small, the cost of writing wrong stories is large.

### Step 1: Filter — strip the conversation to actionable signal

This is the *refine* step in the RaT pattern. Conversations meander;
the output of this step replaces the raw input for everything that
follows. Subsequent steps must work from this refined classification,
not from the original transcript or doc set.

Before extracting anything, classify every substantive point into one
of five categories:

| Category | What it is | Where it lands |
|---|---|---|
| **Decision** | A design choice made and agreed | One story (or one slice of a story) |
| **Constraint / Invariant** | A cross-cutting rule that applies across all work (e.g. "every PR ships green and functional") | Feature README's *Invariants* section; referenced from stories, not duplicated |
| **Rejected alternative** | An option explored and discarded | Feature README's *Rejected alternatives* (prevents future revisiting) |
| **Open question** | Unresolved unknown | Red card on the relevant decision (Step 3), or feature-level *Open questions* if cross-cutting |
| **Background** | Context that informs but isn't actionable | Linked from Context sections; never inlined |

**STOP.** Present the filtered list:

```
Decisions:
  D1. <one line>
  D2. <one line>
  ...

Constraints / Invariants:
  I1. <one line>
  ...

Rejected alternatives:
  R1. <one line> — rejected because <reason>
  ...

Open questions:
  Q1. <one line> — blocks: <decision id or 'none/cross-cutting'>
  ...

Background:
  B1. <one line> — reference: <doc>
  ...
```

Ask: *Does this look right? Anything missing or miscategorised?* Wait
for confirmation.

### Step 2: Identify feature and numbering

Determine where stories will live and how they'll be numbered. Apply
these defaults, then confirm:

- **Feature directory.** If source docs are under `features/<X>/`,
  default to that feature. If not, propose a kebab-case feature name
  derived from the work's headline and ask for confirmation.
- **Story numbering.** Read `features/<feature>/` for existing
  `story-NN-*.md` files; take the next free integer, zero-padded to two
  digits.
- **Feature README.** Note whether `features/<feature>/README.md`
  exists. If not, Step 5 will generate it.

**STOP.** Present:

```
Feature directory: features/<feature>/
Next story numbers: NN onwards
Feature README: <exists | will be created>
```

Wait for confirmation.

### Step 3: Example Map each decision

For each Decision from Step 1, surface the four cards (Matt Wynne's
Example Mapping):

- **Story (yellow)** — one-sentence goal. There is one yellow per
  story; if the decision needs more than one yellow, it's two stories.
- **Rules (blue)** — invariants and constraints this story must
  preserve. Drawn from the source material, plus any feature-level
  Invariants from Step 1 that apply specifically here.
- **Examples (green)** — concrete scenarios discussed that illustrate
  each rule. These become acceptance criteria.
- **Questions (red)** — unresolved unknowns for this specific story.

Apply the diagnostic signals immediately. They tell you whether the
story is well-shaped:

| Signal | Meaning | Action |
|---|---|---|
| **≥ 3 red cards** | Story isn't ready — too many unknowns | Park it; record in feature *Open questions* |
| **≥ 6 blue cards** | Story is too big | Slice along rule boundaries — each cluster of related blue cards becomes its own story |
| **One blue card with many greens, no other blues** | Multiple rules are tangled | Tease them apart into separate blue cards |
| **A blue card with zero greens** | Rule is unclear | Ask for an example or park as a red card |
| **A green card that doesn't illustrate any blue** | Drift / orphan example | Drop it or surface a missing rule |

### Step 4: Sequence — dependency order and walking skeleton

Order stories by dependency. Two cases:

**Case A — the source material is already sequenced.** If the design
explicitly orders work (e.g. "Stage 0 preflight, then Stage 1, then
Stage 2…"), use that order. Then *validate* it:

- Do later stories depend only on earlier ones?
- Does any single story, delivered alone, prove the eventual
  architecture works end-to-end? (That's the walking skeleton — Jeff
  Patton's term.) If the sequence already starts with such a story,
  call it out. If not, propose reordering.

**Case B — the source material is unordered.** Ask:

1. Which stories can't start until another completes? (Dependency)
2. Which story, if delivered alone, exercises every concern at minimum
   depth? (Walking skeleton — deliver it first.)
3. Which stories are independent and can parallelise?

**STOP.** Present the sequence:

```
Delivery order:
  [Story NN] <title> — <walking-skeleton | depends on NN | independent>
  ...
```

Wait for confirmation.

### Step 5: Story index (only if needed)

The skill's output is the story files themselves. A separate index file
is **optional** and exists only to orient a reader who lands in the
feature directory. It must not restate content that already lives in
the design docs.

Prefer one of, in this order:

1. **Add a "Stories" section to the existing design doc** (if there's
   a `solutions-overview.md` or equivalent at the feature level). One
   line per story; references the story files. No new file needed.
2. **Skip the index entirely.** The story files in the directory are
   self-describing — a reader can read the filenames in order.
3. **Create a thin `stories.md`** (NOT `README.md`) only when a clear
   orientation file is justified. Keep it under 30 lines: a one-line
   goal that references the design doc(s), plus the story index.
   Content-named files (`stories.md`, `delivery.md`) are preferred over
   generic `README.md`.

Do **not** create per-feature copies of:

- **Cross-cutting invariants** — they live in `CLAUDE.md`,
  `implement-story.md`, and the relevant skill files (e.g.
  `valuable-unit-tests.md`). Stories reference them where applicable;
  don't restate.
- **Rejected alternatives** — once settled, they don't need persistent
  tracking. If they're useful to remember, they belong in the design
  doc, not in a separate ledger.
- **Open questions** — if a question is blocking a story, it's a red
  card on that story (Step 3). If it's cross-cutting and unresolved,
  park it outside the feature (an issue tracker, a TODO list, a future
  discussion). Don't accumulate open-questions sections.

### Step 6: Write story files

For each story, write `features/<feature>/NN-<kebab-slug>.md` using
the template below. `NN` is a zero-padded two-digit integer in delivery
order; the slug describes what the story delivers (e.g.
`01-evaluate-returns-summary.md`). Use the existing
`features/multi-journey/story-01-journey-owned-resolvers.md` as a
*shape* reference for sections, but follow the simpler `NN-slug.md`
filename convention.

````markdown
# Story NN: <Title>

## Goal
<One paragraph. What changes, and what becomes true that wasn't true
before.>

## Why
<The problem this solves. If alternatives were rejected during design,
note them here so future readers don't re-litigate.>

## Context
<Background the implementer needs. *Reference* the design docs,
conversation, and feature README — don't inline them. Call out the
specific sections that matter.>

## Specification
<Concrete changes the story delivers. File paths, function signatures,
before/after where useful. This is the implementer's reference. Where
the design doc gives an exact change, quote it. Where it gives a
behaviour, describe the outcome and leave implementation to the loop.>

## Tests
<What this story lands in test code. Cite the protocol section being
proven (e.g. "protocol.md §5.1"). Name the test files added or
extended. Describe behaviour at the level qa-test-planner can plan
against — don't pre-decompose into modules; the Plan agent does that
during implementation. Test selection follows
`.claude/skills/valuable-unit-tests.md`.>

## Acceptance Criteria
<Checkboxes derived directly from the green-card examples in Step 3.
Each is observable and verifiable.>

- [ ] <criterion derived from example 1>
- [ ] <criterion derived from example 2>

## Verification
<The exact bash invocations a reviewer runs to prove the criteria.
Include the test command, lint command, and any greppable invariants
(e.g. "no `@hapi/*` imports under `engine/`").>

```bash
npm test
# specific verification steps
```

## Known unknowns
<Red cards that survived Step 3. If empty, omit this section. If
non-empty and any are blocking, the story shouldn't be in the active
sequence yet.>

## What NOT to change
<Explicit scope boundaries. Names the files, modules, or concerns
this story is *not* allowed to touch. Prevents scope creep during
implementation.>
````

### Step 7: Present for review

After writing all files, present:

```
Feature: features/<feature>/
README: <created | updated>
Stories written:
  - story-NN-<slug>.md
  ...
Parked:
  - <decision that didn't become a story> — reason
```

Ask: *Anything to adjust?* Then stop.

## Merging and slicing rules

The skill's job is to produce stories that are *small enough to ship
green independently* but *not so small that file count balloons*. Two
balancing rules:

**Slice when:**
- The blue-card count exceeds ~6 — multiple rules tangled
- The story would break the "every PR ships green and functional"
  invariant if delivered as one unit
- Branch-by-abstraction is needed (introduce new path → switch
  consumers → remove old) — each phase is its own slice

**Merge when:**
- Two adjacent stories share a green-test boundary (delivering them
  separately requires test scaffolding that's thrown away in the next
  story)
- The combined story is still under ~6 blue cards
- Neither story is independently meaningful as a release

When the rules conflict, *slicing wins*. Branch-by-abstraction's
independent green-ness is a stronger constraint than file count.

## What this skill does NOT do

- Does not implement stories — that's `/implement-story`.
- Does not make design decisions — it extracts decisions already made.
  If a "decision" is actually still being debated, it's an Open
  question (Step 1) until resolved.
- Does not invent work — if the source material didn't produce a
  decision, there is no story. Empty output is a valid outcome.
- Does not create stories for rejected alternatives — those live in
  the feature README so they're remembered but not re-litigated.
- Does not duplicate cross-cutting invariants into every story — they
  live once in the feature README and are referenced.
- Does not pre-classify stories — the unified loop in `/implement-story`
  applies to every story that produces code; there is no spec-driven
  vs test-first branching.
- Does not write files before user confirmation at Steps 1, 2, 4, and
  before the final write.
