# Solution Overview — Journey Configuration

> First draft. Diagrams establish the working mental model; prose is
> deliberately thin. Phases 2–4 of the design conversation will deepen
> each section.

## 1. Core idioms (functional re-cast of classical patterns)

The patterns named earlier (Specification, Strategy, Plugin, Composite +
Visitor) are GoF / OO vocabulary. They identify *recurring problems* —
but their *idiomatic solutions* differ in FP. We keep the problems;
re-cast the idioms.

| OO pattern name | FP idiom we use | What it looks like in this codebase |
|---|---|---|
| Specification | **Declarative data + pure evaluator** | Obligations are plain JSON. The engine is a pure function that interprets them. No predicate classes. |
| Strategy | **Functions-as-values; dependency via parameters** | The journey resolver's `facts` and `tests` are records of functions. The kernel takes the record as a parameter. |
| Plugin / Kernel-and-plugins | **Pure module + adapter record** | The kernel exports pure functions. A journey adapter is a record (data + functions) passed in. No registration ceremony. |
| Composite + Visitor | **Recursive data + fold** | The journey map is a tree of plain objects. The screen resolver is a fold producing a new tree shape. |

A property worth pinning to: **data and functions are separate
citizens.** No data type carries methods. The engine's job is to apply
functions to data; the journey's job is to supply both. This is the
discipline that keeps the kernel pure and the adapter swappable.

## 2. Component view (C4 L3)

### 2.1 Kernel — schema-agnostic, journey-agnostic

```mermaid
%%{init: {'theme': 'default', 'themeVariables': {'fontSize': '14px', 'background': '#ffffff'}}}%%
flowchart LR
    subgraph kernel["Kernel"]
        direction TB
        types["Protocol Types<br/><i>JSDoc typedefs + status constants</i>"]
        eval["Evaluator<br/><i>pure fn: notification + adapter → result</i>"]
        trace["Trace Evaluator<br/><i>wraps evaluator with step capture</i>"]
        mapper["Screen Resolver<br/><i>pure fold: result + journeyMap → screens</i>"]
        comb["Universal Combinators<br/><i>HOFs: or, and, not, always, never</i>"]
    end

    eval -.uses.-> types
    mapper -.uses.-> types
    comb -.produces test values for.-> types
    trace -->|wraps| eval
```

Every kernel module is pure, framework-free, and has no knowledge of any
specific journey.

### 2.2 Adapter — one per journey

```mermaid
%%{init: {'theme': 'default', 'themeVariables': {'fontSize': '14px', 'background': '#ffffff'}}}%%
flowchart LR
    subgraph adapter["Journey Adapter (one per journey)"]
        direction TB
        obs["Obligations<br/><i>JSON data</i>"]
        jmap["Journey Map<br/><i>JSON data</i>"]
        ref["Refdata<br/><i>JSON data, journey-private</i>"]
        resv["Journey Resolver<br/><i>record: facts, tests, submissionDatePath</i>"]
        conv["Conventional Helpers<br/><i>private fns: refdataFlag, lookupRefdata</i>"]
        scen["Scenarios<br/><i>code, demo fixtures</i>"]
    end

    obs -.->|names fact, test by string| resv
    jmap -.->|names obligationRef by id| obs
    resv -->|reads| ref
    resv -->|uses| conv
```

The adapter is the only place schema-specific knowledge lives.

## 3. Conceptual model (data shapes)

Records, not classes. No methods on data types — the engine supplies the
functions.

```mermaid
%%{init: {'theme': 'default', 'themeVariables': {'fontSize': '14px', 'background': '#ffffff'}}}%%
classDiagram
    direction LR

    class JourneyAdapter {
        key: string
        obligations: Obligation[]
        refdata: object
        journeyMap: JourneyMap
        journeyResolver: JourneyResolver
        scenarios?: Scenario[]
    }

    class Obligation {
        id: string
        name: string
        rationale: string
        schemaPaths: string[]
        condition?: Condition
    }

    class Condition {
        fact: string
        test: string
        description?: string
    }

    class JourneyResolver {
        facts: Record~string, FactExtractor~
        tests: Record~string, ConditionTest~
        submissionDatePath: string
    }

    class JourneyMap {
        sections: Section[]
    }

    class Field {
        fieldName: string
        fieldType: string
        obligationRef?: string
        visibility?: Visibility
    }

    class EvaluationResult {
        obligations: EvaluatedObligation[]
        summary: Summary
    }

    class Screen {
        status: ScreenStatus
        fields: EnrichedField[]
    }

    JourneyAdapter "1" *-- "*" Obligation
    JourneyAdapter "1" *-- "1" JourneyResolver
    JourneyAdapter "1" *-- "1" JourneyMap
    Obligation "0..1" o-- "1" Condition
    JourneyMap "1" *-- "*" Field
    Field ..> Obligation : obligationRef
    Condition ..> JourneyResolver : fact + test keys
```

## 4. Flow — evaluating data against obligations

Inputs flow into the evaluator; the output is a set of obligation
statuses. The journey resolver is the only schema-aware participant.

```mermaid
%%{init: {'theme': 'default', 'themeVariables': {'fontSize': '14px', 'background': '#ffffff'}}}%%
flowchart LR
    notif[("Notification<br/><i>schema-shaped data</i>")]
    oblg[("Obligations<br/><i>declarative requirements</i>")]
    rdata[("Refdata<br/><i>lookup tables</i>")]
    jres["Journey Resolver<br/><i>facts + tests</i>"]

    eval(["Evaluator<br/><i>pure fn</i>"])

    result[/"Evaluation Result<br/><i>obligation statuses</i>"/]

    notif --> eval
    oblg --> eval
    jres --> eval
    rdata --> jres
    eval --> result
```

## 5. Flow — mapping the page structure to screens

The journey map is the declarative *page structure*. The screen resolver
folds it with the evaluation result to produce concrete screens with
status.

```mermaid
%%{init: {'theme': 'default', 'themeVariables': {'fontSize': '14px', 'background': '#ffffff'}}}%%
flowchart LR
    result[/"Evaluation Result<br/><i>obligation statuses</i>"/]
    jmap[("Journey Map<br/><i>page structure: sections, screens, fields</i>")]

    sresolver(["Screen Resolver<br/><i>pure fold</i>"])

    screens[/"Screens<br/><i>status per screen + section</i>"/]

    result --> sresolver
    jmap --> sresolver
    sresolver --> screens
```

## 6. Scaling — kernel + N adapters

```mermaid
%%{init: {'theme': 'default', 'themeVariables': {'fontSize': '14px', 'background': '#ffffff'}}}%%
flowchart TB
    subgraph K["Kernel - one"]
        direction LR
        E[Evaluator]
        M[Screen Resolver]
        C[Combinators]
    end

    A1["eu-live-animals adapter"] -.protocol.-> K
    A2["chedpp-plants adapter"] -.protocol.-> K
    AN["future adapter N"] -.protocol.-> K
```

Property: adding adapter *N* requires zero kernel change. The protocol
(Phase 2 deliverable) is what makes this true.

## 7. Crosscutting — combinators

Combinators are higher-order functions that take tests and return tests.
They preserve the `ConditionTest` contract, so the engine sees them as
ordinary tests.

```mermaid
%%{init: {'theme': 'default', 'themeVariables': {'fontSize': '14px', 'background': '#ffffff'}}}%%
flowchart LR
    tA["test A<br/><i>(factValue, refdata) → result</i>"]
    tB["test B<br/><i>(factValue, refdata) → result</i>"]
    OR["or(tA, tB)"]
    composite["new ConditionTest<br/><i>(factValue, refdata) → result</i>"]
    engine[Evaluator]

    tA --> OR
    tB --> OR
    OR --> composite
    composite --> engine
```

Two tiers:

```mermaid
%%{init: {'theme': 'default', 'themeVariables': {'fontSize': '14px', 'background': '#ffffff'}}}%%
flowchart LR
    subgraph universal["Universal (kernel)"]
        UC["or, and, not, always, never"]
    end

    subgraph conventional["Journey-conventional (adapter)"]
        JC["refdataFlag, lookupRefdata<br/><i>knows adapter refdata shape</i>"]
    end

    subgraph journey["A journey resolver"]
        T1[tests.isTransitOrTranshipment]
        T2[tests.requiresCphNumber]
    end

    UC --> T1
    JC --> T2
```

Universal combinators are protocol-only — they cannot peek at refdata
shape. Journey-conventional helpers are private to the adapter; they may
be promoted to the kernel only when a third journey shares the same
convention.

## 8. Architecture — the FE/BE seam

The protocol of §5 defines a logical separation of concerns between two
halves of the application:

```mermaid
%%{init: {'theme': 'default', 'themeVariables': {'fontSize': '14px', 'background': '#ffffff'}}}%%
flowchart LR
    subgraph fe["Frontend (in-process)"]
        RC["Route handlers<br/><i>journey, tasklist, debug</i>"]
        NJK["Nunjucks templates<br/><i>GOV.UK Frontend components<br/>layout, copy, page sequence</i>"]
        RC --> NJK
    end

    subgraph be["Backend (in-process library)"]
        ENG["Engine<br/><i>evaluate · evaluateWithTrace<br/>resolveScreens · rollUpToSections<br/>combinators</i>"]
        ADP["Journey adapters<br/><i>obligations · journeyMap<br/>refdata · resolvers</i>"]
        ENG --> ADP
    end

    RC -->|"notification + journeyKey"| ENG
    ENG -->|"EvaluationResult /<br/>Screen[] / Section[]"| RC
```

**Backend** owns *what is true* about a notification: which obligations
are satisfied, which screens are complete, whether the notification is
submittable, what reference data applies. It is the engine + the
journey adapters + the refdata. It runs in-process today but is
deliberately framework-agnostic — pure functions, no Hapi imports — so
that the *what is true* logic is testable as a library.

**Frontend** owns *how the state is shown* and *how the user moves
through it*: which page renders which screen, the logical sequence and
routing between pages, component selection from GOV.UK Frontend, copy
and layout. It is the route handlers + the Nunjucks templates. The
sequence in which screens are presented to the user is an FE concern,
not encoded in the journey map's section order alone.

**The seam between them is the engine's output:** `EvaluationResult`,
`Screen[]`, `Section[]` (with the optional `trace` for diagnostics).
Nothing else crosses. The FE never inspects the journey map directly;
the engine resolves the map into screens with derived statuses and
hands the FE a flat render-ready model.

This is the *Server-Driven UI* pattern as a separation of concerns —
state lives behind one seam, rendering lives behind the other. Both
halves currently run in the same Hapi process; there is no HTTP / service
boundary and none is planned. The properties that earn this separation
are independent of where it deploys:

- **Single source of truth.** The same engine that drives the rendered
  task list and screen variance also gates submission. Drift between
  *what is accepted* and *what is shown* is structurally impossible
  because both paths terminate in the same `evaluate` /
  `resolveScreens` calls.
- **Common capability across journeys.** One engine; many journey
  adapters (today: `eu-live-animals`, `chedpp-plants`). New journeys
  plug into the registry without changes to the engine itself.
- **Independently testable halves.** The engine is unit-tested against
  fixtures with no Hapi setup; the templates and route handlers can
  evolve without re-deriving obligation logic.

The framework-isolation property (`engine/` has no Hapi imports) makes
the BE half a real library — usable wherever JS runs, easy to test in
isolation, hard to couple to the wrong thing by accident.
