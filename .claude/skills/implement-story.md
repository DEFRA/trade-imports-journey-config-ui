---
name: implement-story
description: Rigorous agent-driven story implementation workflow — explore, plan, then test-first per module with qa-test-planner, code-reviewer, and refactoring-enforcer gates. Use when implementing a feature/story file from features/.
---

# Story Implementation Workflow

You are about to implement a story using a **rigorous agent-driven workflow**. This ensures quality, test coverage, and adherence to functional programming principles.

## MANDATORY AGENT TEAM

Your workflow MUST use these agents at the specified stages:

1. **Explore agent** - At start, to find reusable code and understand codebase
2. **Plan agent** - For exploratory stories, to break down work into modules
3. **qa-test-planner agent** - For EVERY module with logic, to plan tests
4. **code-reviewer agent** - For EVERY module after implementation
5. **refactoring-enforcer agent** - After ALL modules are complete

**Do NOT skip agents. They are part of the quality contract.**

## STEP 0: GIT HYGIENE & BRANCH CREATION (MANDATORY)

**Before ANY implementation work begins, ensure a clean working tree and create a feature branch.**

### 0.1 Check Working Tree Status

Run `git status` to check for uncommitted changes:

```bash
git status
```

**IF there are uncommitted or untracked files:**

1. **PAUSE immediately** - Do NOT proceed with story implementation
2. **Show the user** the output of `git status`
3. **Ask the user**:
   ```
   There are uncommitted changes in the working tree:

   [list changed/untracked files]

   Options:
   1. Review and commit these changes first
   2. Stash these changes
   3. Discard these changes (if appropriate)

   Which would you like to do before I start the story?
   ```
4. **Wait for user decision** - Do NOT proceed until the working tree is clean

**IF the working tree is clean** (no uncommitted changes):

- Proceed to Step 0.2

### 0.2 Create Feature Branch

Once the working tree is clean:

1. **Determine branch name** from the story:
  - Read the story file name or title
  - Convert to kebab-case branch name
  - Prefix with `feature/` or `story/`
  - Example: `feature/scenario-based-journey-explorer`

2. **Check if branch already exists**:
   ```bash
   git branch --list | grep <branch-name>
   ```

3. **Create and checkout the branch**:
   ```bash
   git checkout -b <branch-name>
   ```

4. **Confirm to user**:
   ```
   ✅ Created and checked out branch: <branch-name>
   All work for this story will be done on this branch.
   You will merge it manually when satisfied.
   ```

**IMPORTANT**:
- ALL story work MUST happen on this feature branch
- DO NOT merge or push the branch - the user will do this manually
- If branch creation fails, STOP and report error to user

### 0.3 Success Criteria for Step 0

Before proceeding to Step 1:

- [ ] `git status` shows clean working tree
- [ ] Feature branch created and checked out
- [ ] User confirmed aware of branch-based workflow
- [ ] Ready to begin story implementation

---

## THE MANDATORY DEVELOPMENT LOOP

**For EVERY module in exploratory work, follow this loop:**

```
┌─────────────────────────────────────────────────────────────┐
│ START: Story Review                                          │
│ ↓ Use Explore agent                                          │
│ ↓ Use Plan agent (break into modules)                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ FOR EACH MODULE:                                             │
│                                                              │
│  1. Plan Tests → (qa-test-planner agent)                    │
│  2. Write Tests → (failing tests first)                     │
│  3. Implement → (make tests pass, FP style)                 │
│  4. Review → (code-reviewer agent)                          │
│     └─ If issues: Fix and retest OR use /bug-fix            │
│                                                              │
│  REPEAT FOR NEXT MODULE                                      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ AFTER ALL MODULES:                                           │
│                                                              │
│  5. Refactor → (refactoring-enforcer agent)                 │
│  6. Retest → (full test suite)                              │
│  7. Verify → (acceptance criteria)                          │
└─────────────────────────────────────────────────────────────┘
```

**This loop applies even to exploratory/investigative work if it produces code.**

---

## Step 1: Review and Understand the Story

### 1.1 Read All Context

1. **Read the story file** that the user specified
2. **Read all referenced documentation** mentioned in the story's "Context" or "Specification" sections
3. **Use Explore agent** to understand the codebase context:
  - Launch with `subagent_type: "Explore"`
  - Pass story context and ask for:
    - Existing similar implementations
    - Reusable utilities/modules
    - Architecture patterns in the codebase
    - Potential conflicts or dependencies

### 1.2 Classify the Story

Look for these indicators:

**PRESCRIPTIVE STORY** (spec-like, implementation is clear):

- Contains exact SQL, config syntax, or API calls
- Has "Migration Logic" or similar step-by-step sections
- Few ambiguous decisions needed
- Verification commands are provided
- Mostly infrastructure/data/config work
- Example: "Add postgres service to compose.yml with these exact settings"

**EXPLORATORY STORY** (design-heavy, needs test-first):

- Describes behavior without exact implementation
- Multiple valid approaches possible
- Contains business rules or complex logic
- User-facing features
- Requires design decisions
- Example: "Build a parser that validates field configs according to business rules"

### 1.3 Summarize Classification

```
Story type: [PRESCRIPTIVE | EXPLORATORY | UNCERTAIN]
Reasoning: [1-2 sentences why you classified it this way]
Proposed workflow: [SPEC-DRIVEN | TEST-FIRST]
Reusable components found: [List from Explore agent]
```

**If UNCERTAIN**, ask the user:
- Show your reasoning for both classifications
- Ask which approach they prefer
- Wait for confirmation before proceeding

---

## Workflow A: SPEC-DRIVEN (for prescriptive stories)

Use this for infrastructure, migrations, config changes, and other stories that are essentially detailed specifications.

### A1: Extract Implementation Steps

1. **Create TodoWrite entries** directly from the story:
  - List each task from the story's "Tasks" section
  - Add verification as final task
  - Mark first task as `in_progress`
  - Tell the user what I am doing, and what it will achieve

**Example for Story 01 (postgres infrastructure):**

```
1. Add postgres service to compose.yml (in_progress)
2. Create schema migration SQL from spec (pending)
3. Create .gitkeep in db/postgres-data/ (pending)
4. Update .gitignore for postgres-data (pending)
5. Verify postgres starts and schema loads (pending)
```

### A2: Implement Each Task

For each task:

1. **Implement directly** following the story's specifications

  - Use exact SQL, config, or commands provided
  - Don't overthink or over-engineer
  - The story IS the spec

2. **Mark task completed** and move to next

### A3: Run Verification Commands

1. **Execute the verification commands** from the story's "Verification" or "Acceptance Criteria" section
2. **Check all acceptance criteria** boxes
3. **Document results**:
  - What commands were run?
  - Did they all pass?
  - Any deviations from expected output?

### A4: Optional - Codify Verifications as Tests

For regression protection, consider:

1. **Extract verification commands** into a test file
2. **Create integration test** that:
  - Runs the verification commands
  - Asserts expected outputs
  - Can be run in CI/CD

This is OPTIONAL but recommended for critical infrastructure.

### A5: Summary

Report:

- ✅ All tasks completed
- ✅ All acceptance criteria met
- Any deviations or notes
- Next steps (if any)

---

## Workflow B: TEST-FIRST (for exploratory stories)

Use this for features with business logic, complex algorithms, or where design decisions are needed.

**EVEN IF THE STORY SEEMS EXPLORATORY (data analysis, investigation), IF IT WILL PRODUCE CODE, USE THIS WORKFLOW.**

### B1: Plan the Implementation (MANDATORY AGENT USE)

**STEP 1: Use the Plan agent** (NOT optional):

1. **Launch Plan agent** with `subagent_type: "Plan"` and thoroughness `"medium"`:

  - Pass the full story content
  - Pass all referenced documentation
  - Include findings from Explore agent (Step 1.1)
  - Request it to:
    - Break down into modules/components
    - Identify design decisions needed
    - Suggest which existing code to reuse
    - Identify where FP patterns should be applied

2. **Review the plan with the user**:

  - Summarize the plan clearly
  - Highlight any ambiguous points
  - List assumptions that need validation
  - Ask for user confirmation before proceeding
  - Tell the user what you are doing and what it will achieve

**STEP 2: Create comprehensive TodoWrite entries** in test-review-refactor cycles:

```
1. Explore codebase for reusable code (completed)
2. Plan implementation with Plan agent (completed)
3. Plan tests for [module A] (pending)
4. Write tests for [module A] (pending)
5. Implement [module A] (pending)
6. Review [module A] with code-reviewer (pending)
7. Plan tests for [module B] (pending)
8. Write tests for [module B] (pending)
9. Implement [module B] (pending)
10. Review [module B] with code-reviewer (pending)
11. Refactor all modules with refactoring-enforcer (pending)
12. Retest after refactoring (pending)
13. Verify against acceptance criteria (pending)
```

**KEY PATTERN**: Every module follows the cycle: Plan Tests → Write Tests → Implement → Review → (after all modules) Refactor → Retest

### B2: Test-First Loop (MANDATORY AGENTS)

For each module/component:

#### B2a. Plan Tests (MANDATORY - Use qa-test-planner agent)

1. **Read the valuable unit test skill**:

  - Read `.claude/skills/valuable-unit-tests.md`
  - Apply principles to this specific module

2. **Use qa-test-planner agent** (MANDATORY for all modules with logic):

  - Launch with `subagent_type: "qa-test-planner"`
  - Pass the module's planned behavior
  - Get test plan identifying:
    - The contract/promise of the module
    - Highest-risk behaviors
    - What NOT to test (avoid low-value tests)
    - Edge cases and boundaries

3. **Update TodoWrite**:
  - Mark "Plan tests for X" as `completed`
  - Mark "Write tests for X" as `in_progress`

#### B2b. Write Failing Tests

1. **Write tests that FAIL**:

  - No implementation exists yet
  - Focus on behavior/contract
  - Follow Vitest conventions (colocated .test.js)

2. **Run tests to confirm FAILURE**:

   ```bash
   TZ=UTC npx vitest run path/to/test.test.js
   ```

  - Must fail for the RIGHT reason
  - If they pass, you're not testing the right thing

3. **Mark test-writing todo as completed**

#### B2c. Implement

1. **Update TodoWrite**:

  - Mark "Implement X" as `in_progress`

2. **Write minimal implementation**:

  - Make tests green
  - Prefer functional style (pure functions, immutability, composition)
  - Avoid premature optimization

3. **Run tests**:

   ```bash
   TZ=UTC npx vitest run path/to/test.test.js
   ```

  - All tests should PASS
  - If not, continue implementing

4. **Mark implementation todo as completed**

#### B2d. Review Module (MANDATORY - Use code-reviewer agent)

**After each module is implemented and tests pass:**

1. **Update TodoWrite**:

  - Mark "Review [module X] with code-reviewer" as `in_progress`

2. **Launch code-reviewer agent** (MANDATORY):

  - Use `subagent_type: "code-reviewer"`
  - Pass the implemented module code
  - Review for:
    - Security issues
    - Code quality violations
    - Performance problems
    - Missing error handling
    - Violation of FP principles

3. **Address critical findings**:

  - If bugs found: Use `/bug-fix` command
  - If design issues found: Re-enter test-implement loop
  - If minor issues: Fix immediately and rerun tests

4. **Update TodoWrite**:
  - Mark "Review [module X]" as `completed`
  - Move to next module or proceed to refactoring

**Repeat B2a-B2d for each module/component before moving to B3.**

### B3: Refactor (MANDATORY - Use refactoring-enforcer agent)

**After ALL modules are implemented, tested, and reviewed:**

1. **Update TodoWrite**:

  - Mark "Refactor all modules with refactoring-enforcer" as `in_progress`

2. **Launch refactoring-enforcer agent** (MANDATORY):

  - Use `subagent_type: "refactoring-enforcer"`
  - Pass ALL implemented code from this story
  - Request analysis for:
    - FP violations (mutability, side effects, impure functions)
    - Code duplication (DRY violations)
    - Poor decomposition (functions doing too much)
    - Missed opportunities for composition

3. **Apply refactorings** systematically:

  - Make one change at a time
  - Run tests after EACH change
  - If tests fail, revert and try different approach
  - Keep a running list of changes made

4. **Mark refactoring todo as completed**

### B3.1: Retest After Refactoring (MANDATORY)

1. **Update TodoWrite**:

  - Mark "Retest after refactoring" as `in_progress`

2. **Run full test suite** for the story:

   ```bash
   npm test
   ```

3. **Verify tests still pass**:

  - All tests green? Proceed
  - Tests failing? Debug and fix before moving on

4. **Mark retest todo as completed**

### B4: Integration Verification

1. **Run full test suite**:

   ```bash
   npm test
   ```

2. **Check acceptance criteria**:

  - Does implementation meet all criteria?
  - Run any end-to-end verification from story

3. **Document results**

### B5: Summary

Report:

- What was implemented (modules/components)
- Test coverage added
- Acceptance criteria verified
- Any remaining risks
- Design decisions made

---

## Special Cases

### Mixed Stories (Both Prescriptive and Exploratory)

If a story has BOTH config/infra AND business logic:

1. **Split into phases**:

  - Phase 1: Use Workflow A for prescriptive parts
  - Phase 2: Use Workflow B for exploratory parts

2. **Example** (Story 03: Migrate CHEDPP):
  - Prescriptive: Add `pg` dependency, setup connection config
  - Exploratory: Parse JSON, generate SQL, handle properties JSONB

### Bug Fixes During Implementation

If you discover a bug:

1. **STOP the story workflow**
2. **Use `/bug-fix` command**
3. **Resume story after bug is fixed**

### Refactoring Stories

If the story is refactoring existing code:

1. **Run existing tests FIRST** (establish baseline)
2. **Use refactoring-enforcer agent** throughout
3. **Keep tests green** after each change
4. **Add missing tests** if coverage gaps found

### Data Migration Stories

For stories that migrate data:

1. **Treat migration script as code** (use Workflow B)
2. **Write tests for**:
  - Parsing logic
  - Transformation functions
  - Edge cases (null values, missing fields)
3. **Run verification commands** as integration test
4. **Consider idempotency** (can script run multiple times safely?)

---

## Decision Rules Summary

| Story Characteristic        | Workflow    | Key Activities                  |
| --------------------------- | ----------- | ------------------------------- |
| Exact SQL/config provided   | Spec-driven | Implement → Verify              |
| Business rules described    | Test-first  | Test → Implement → Refactor     |
| Infrastructure setup        | Spec-driven | Follow steps → Run verification |
| Algorithm/parsing logic     | Test-first  | Design → Test → Implement       |
| "Add X to config.yml"       | Spec-driven | Direct implementation           |
| "Build a validator that..." | Test-first  | Test-first loop                 |

---

## TodoWrite Patterns

### Spec-Driven Example (Story 01):

```
1. Add postgres service to compose.yml (in_progress)
2. Extract DDL from specification (pending)
3. Create migration file (pending)
4. Create .gitkeep files (pending)
5. Update .gitignore (pending)
6. Verify postgres starts and tables exist (pending)
```

### Test-First Example (Story 03 exploratory parts) - WITH MANDATORY AGENTS:

```
1. Explore codebase for reusable code (completed)
2. Plan implementation with Plan agent (completed)
3. Plan tests for JSON parser with qa-test-planner (pending)
4. Write tests for JSON parser (pending)
5. Implement JSON parser (pending)
6. Review JSON parser with code-reviewer (pending)
7. Plan tests for component extractor with qa-test-planner (pending)
8. Write tests for component extractor (pending)
9. Implement component extractor (pending)
10. Review component extractor with code-reviewer (pending)
11. Plan tests for SQL generator with qa-test-planner (pending)
12. Write tests for SQL generator (pending)
13. Implement SQL generator (pending)
14. Review SQL generator with code-reviewer (pending)
15. Refactor all modules with refactoring-enforcer (pending)
16. Retest after refactoring (pending)
17. Verify CHEDPP migration (pending)
```

### Mixed Example - WITH MANDATORY AGENTS:

```
1. Add pg dependency (completed - spec-driven)
2. Setup connection config (completed - spec-driven)
3. Plan tests for JSON parser with qa-test-planner (pending)
4. Write tests for JSON parser (pending)
5. Implement JSON parser (pending)
6. Review JSON parser with code-reviewer (pending)
7. Plan tests for SQL generator with qa-test-planner (pending)
8. Write tests for SQL generator (pending)
9. Implement SQL generator (pending)
10. Review SQL generator with code-reviewer (pending)
11. Refactor all modules with refactoring-enforcer (pending)
12. Retest after refactoring (pending)
13. Run migration and verify (pending)
```

---

## Critical Success Factors

1. **MANDATORY agent usage** - This is non-negotiable:
  - **Explore agent**: At start, to find reusable code
  - **Plan agent**: For all exploratory stories, to break down work
  - **qa-test-planner agent**: For EVERY module with logic, to plan tests
  - **code-reviewer agent**: For EVERY module after implementation
  - **refactoring-enforcer agent**: After ALL modules are complete
2. **Read the docs** - Always read referenced specifications before implementing
3. **Choose the right workflow** - Don't test-first when spec is provided; don't spec-driven when design is needed
4. **Keep tests green** - Never commit broken tests
5. **Test behavior, not implementation** - Focus on observable outcomes
6. **Follow the story** - It's your contract with the user
7. **TodoWrite rigorously** - Track every step, mark as you go

---

## Workflow Enforcement

**For Workflow A (Spec-driven):**

- NO test-first required for pure config/SQL/infrastructure
- Verification commands ARE the tests
- OPTIONALLY codify verifications as regression tests

**For Workflow B (Test-first):**

- NO production code without tests for business logic
- Tests MUST fail before implementation
- Refactor AFTER tests pass

**If unsure which workflow to use:**

- Default to asking the user
- Show your reasoning for both options
- Wait for confirmation

---

## FINAL CHECKLIST - Before You Start

**STEP 0 - Git Hygiene (MANDATORY):**

- [ ] **`git status` checked** - Working tree is clean
- [ ] **Feature branch created** - Branch name derived from story
- [ ] **User confirmed** - Aware of branch-based workflow
- [ ] **Ready to work on feature branch** - All commits will be on this branch

**STEP 1 - Planning:**

- [ ] **Explore agent launched** - To find reusable code
- [ ] **Story classification done** - SPEC-DRIVEN or TEST-FIRST workflow chosen
- [ ] **Plan agent launched** (if TEST-FIRST) - To break down into modules
- [ ] **TodoWrite created** - With ALL agent steps included
- [ ] **User confirmation received** (if needed) - For ambiguous stories

**During implementation (TEST-FIRST workflow), for EACH module:**

- [ ] **qa-test-planner agent launched** - Before writing tests
- [ ] **Tests written and FAILING** - Before implementation
- [ ] **Tests PASSING** - After implementation
- [ ] **code-reviewer agent launched** - After tests pass
- [ ] **Issues addressed** - From code review

**After all modules (TEST-FIRST workflow):**

- [ ] **refactoring-enforcer agent launched** - To enforce FP patterns
- [ ] **Full test suite PASSING** - After refactoring
- [ ] **Acceptance criteria verified** - Story contract fulfilled

---

**Remember**: The story is your contract. The agents are your quality team. The workflow is your tool. DO NOT skip agents.
