# Report Writing Skill

## When to use / when not to use

**Use this skill** when producing an analysis report intended for another
AI to consume — i.e. data extraction and interpretation, with every
quantitative claim backed by emitted raw output.

**Do not use this skill** for the three peer agents (`code-reviewer`,
`refactoring-enforcer`, `qa-test-planner`). Their output formats are
prescribed in their own system prompts and include fixes/suggestions,
which this skill explicitly forbids. No current agent invokes this skill;
it exists for future AI-to-AI analysis workflows.

## Purpose

Ensure technical reports use precise, well-defined terminology with concrete examples. Prevent jargon without definitions, vague concepts, and reader confusion. This is a report to communicate findings to another AI for analysis, it should never discuss code solutions, propose architectures, or give estimates. It's data analysis, and interpretation alone, not a development plan.

## Core Rules

### RULE 0: Show raw data, never summarize from memory

**Critical principle:** Reports must be completely accurate. Every quantitative claim must be backed by emitted raw data.

**Required workflow:**

1. **Run extraction query** - Generate actual data (SQL query, function call, script)
2. **Emit raw output** - Include in report (table, code block, or appendix)
3. **Interpret from visible data** - Only after data is visible
4. **NEVER summarize from memory** - If data isn't shown, you're guessing

**Example - BAD (hallucination risk):**

```markdown
We found 11 distinct page skeletons across certificate types.
```

**Example - GOOD (verifiable):**

```markdown
We found 11 distinct page skeletons:

| Hash    | Pages                           | Cert Types | Count |
| ------- | ------------------------------- | ---------- | ----- |
| a7f8... | [Commodity, Purpose, Transport] | CED, CVEDP | 2,500 |
| b2c9... | [Commodity, Purpose]            | CVEDA      | 89    |

...

(See "Data Extraction Query" below for verification)
```

**For every quantitative finding:**

- [ ] Extraction query/script shown
- [ ] Raw data table included
- [ ] Interpretation references visible data
- [ ] If count/percentage claimed, reader can verify by counting rows

### RULE 1: Define all domain-specific terms on first use

**Domain-specific terms include:**

- Compound technical nouns (e.g., "page skeleton", "fingerprint level", "redundancy factor")
- Invented metrics or measurements
- Process-specific concepts (e.g., "deduplication", "clustering threshold")
- Any term that doesn't have a standard industry definition

**Where to define:**

- In a "Terminology" or "Definitions" section near the start of each analysis
- Before the term is used in results/analysis sections

### RULE 2: Use the definition template

Every term definition MUST include:

```markdown
**[Term Name]**

**What it is:** [One sentence describing the concept]

**How it's computed/identified:** [Specific formula, algorithm, or process. Include which fields/data are used]

**What uniqueness/variation means:** [Interpretation - what does it mean when two things have the same/different values?]

**Examples (minimum 2, must be different):**

1. [Concrete example 1 with actual data]
2. [Concrete example 2 with different characteristics to show contrast]
```

### RULE 3: Examples must demonstrate contrast

The two examples should show:

- Different values/outcomes
- Edge cases or common cases
- What makes them similar vs different

**Bad examples (too similar):**

- Example 1: Config A has pages [Commodity, Purpose]
- Example 2: Config B has pages [Transport, Destination]

**Good examples (show contrast):**

- Example 1: Config A with pages [Commodity, Purpose, Transport] and Config B with [Transport, Purpose, Commodity] have **identical** page skeletons (same pages, different order)
- Example 2: Config C with pages [Commodity, Purpose] and Config D with [Commodity, Purpose, Transport] have **different** page skeletons (different page sets)

### RULE 4: First draft validation checklist

Before completing a report section, verify:

- [ ] All compound technical nouns are defined
- [ ] All invented metrics/concepts are defined
- [ ] Each definition uses the template
- [ ] Each definition has 2+ examples
- [ ] Examples show meaningful contrast
- [ ] No undefined terms remain (grep for common patterns: "skeleton", "fingerprint", "factor", "level", "variation", "redundancy")
- [ ] Critically reviewed what has been written for accuracy and narrative relevance to the question that is being asked

## Common Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Using jargon without definition

```markdown
We found 11 distinct page skeletons across 3,254 configs.
```

### ✅ Correct Pattern: Define before use

```markdown
## Terminology

**Page Skeleton:** [full definition with 2 examples]

## Results

We found 11 distinct page skeletons across 3,254 configs.
```

---

### ❌ Anti-Pattern 2: Circular definition

```markdown
**Page Skeleton:** A skeleton of the pages in a configuration
```

### ✅ Correct Pattern: Operational definition

```markdown
**Page Skeleton:** A deterministic hash representing the unique set of pages in a configuration, computed from the SHA-256 hash of alphabetically-sorted page names.
```

---

### ❌ Anti-Pattern 3: Single or identical examples

```markdown
Examples:

1. Config A: [Commodity, Purpose, Transport]
2. Config B: [Commodity, Purpose, Transport]
```

### ✅ Correct Pattern: Contrasting examples

```markdown
Examples:

1. Configs A and B both have pages [Commodity, Purpose, Transport] → **same skeleton** (order-independent)
2. Config C has pages [Commodity, Purpose] → **different skeleton** (missing Transport page)
```

## Usage in Report Generation

### Step 1: Draft with placeholders

On first pass, mark undefined terms:

```markdown
We found 11 distinct {{DEFINE: page skeletons}}.
Redundancy factor is {{DEFINE: redundancy factor}}.
```

### Step 2: Create Terminology section

Add definitions section before Results:

```markdown
## Terminology

**Page Skeleton**
[Complete definition with 2 examples]

**Redundancy Factor**
[Complete definition with 2 examples]
```

### Step 3: Validate

- Search report for undefined technical terms
- Check each definition has 2+ examples
- Verify examples show contrast

## When to Use This Skill

**Always use for:**

- Technical analysis reports
- Documentation introducing new concepts
- Reports for cross-functional audiences (not just developers)

**Can skip for:**

- Internal code comments (audience familiar with codebase)
- Quick status updates
- Reports that only use standard industry terms (e.g., "database", "API", "authentication")

## Enforcement

After generating a report section:

1. Explicitly state: "Checking report against report-writing skill..."
2. List terms that need definition
3. Add Terminology section with all definitions
4. Validate each definition has 2+ contrasting examples
5. Mark as complete only after validation passes
