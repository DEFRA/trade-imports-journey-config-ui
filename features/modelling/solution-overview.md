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

## 8. Deployment — Server-Driven UI (forward-looking)

When this work moves beyond the in-process spike to a real
frontend/backend split, the engine and journey adapters live behind
an HTTP boundary as a backend service. The frontend is a thin
renderer that asks the backend for the state it should display, and
the backend gates submission with the same engine that drove the
rendering. This is the **Server-Driven UI (SDUI)** pattern — see
prior art and published practice from Airbnb, Instagram, Spotify,
Lyft, and others on the same problem (conditional flows with strong
server-side validation).

```mermaid
%%{init: {'theme': 'default', 'themeVariables': {'fontSize': '14px', 'background': '#ffffff'}}}%%
flowchart LR
    subgraph fe["Frontend (per-journey or shared)"]
        UI["UI Components<br/><i>thin renderer; owns layout, locale,<br/>components, optimistic state</i>"]
    end

    subgraph be["Backend — Evaluation Service"]
        direction TB
        API["HTTP API<br/><i>POST /journeys/&lcub;key&rcub;/evaluate<br/>POST /journeys/&lcub;key&rcub;/submit<br/>GET&nbsp;&nbsp;/journeys/&lcub;key&rcub;/structure</i>"]
        ENG["Engine<br/><i>evaluate · evaluateWithTrace<br/>resolveScreens · rollUpToSections<br/>combinators</i>"]
        REG[("Journey Registry<br/><i>eu-live-animals<br/>chedpp-plants<br/>future N…</i>")]

        API --> ENG
        ENG --> REG
    end

    UI -->|"notification + journeyKey<br/>(request state)"| API
    API -->|"EvaluationResult / Section[]<br/>(abstract page model)"| UI
    UI -->|"notification + journeyKey<br/>(submit)"| API
    API -.->|"accept iff submittable<br/>else reject with issues"| UI
```

Key properties this enables:

- **Single source of truth.** The engine that gates submission is the
  same engine that drives the UI's task list and screen variance.
  Drift between *what the backend will accept* and *what the frontend
  shows* is structurally impossible.
- **What crosses the wire is data, not rendering.** `Section[]` with
  `Screen[]` is the abstract page model — sections exist, screens
  carry status, fields name their obligation. The frontend owns
  components, layout, copy, locale, optimistic state. The backend
  owns the structure of *what is shown*.
- **Resolvers stay server-side.** Per `protocol.md` §5.6, the
  `JourneyResolver` contains functions; functions don't serialise. The
  journey's resolver code runs in the service. Clients only ever
  reference journeys by key.
- **Common capability across journeys.** One engine; many journey
  adapters; multiple frontend consumers (Animals UI, Plants UI,
  future N). New journeys plug into the same engine without code
  change to the engine itself.

What this section deliberately doesn't decide (parked for follow-on
design):

- Whether `resolveScreens` / `rollUpToSections` run server-side (the
  service returns `Section[]`) or client-side (the service returns
  `EvaluationResult` and the FE folds it against a separately-fetched
  `JourneyMap`). Both are protocol-consistent.
- Whether one service hosts many journeys, or each journey gets its
  own service (federated).
- Caching, versioning, audit-record shape, optimistic-state
  reconciliation. All real questions; none change the engine's
  protocol.
