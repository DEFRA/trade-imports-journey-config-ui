# CHEDPP Part 1 Journey Investigation

**Goal:** Produce a complete journey map of the CHEDPP importer-facing pages (Part 1), documenting every page's data sources, visibility conditions, and commodity code variance — even where that variance is NOT driven by field config.

**Why:** The field config for CHEDPP is a single config (commodity '00', 88 components, no commodity-level variance). But the actual importer journey shown in the UI has ~15 pages with conditional visibility, multiple data sources (MDM, reference data, field config, hardcoded), and commodity-specific behaviour that comes from places other than field config. We need to understand the full picture to build the journey map, data config, and obligations files.

**Primary source:** `ipaffs-frontend-notification` codebase (`/Users/benoit/projects/defra/imports/ipaffs-frontend-notification`)

---

## Background: What We Already Know

### Field Config Structure (single config, no variance)

CHEDPP has exactly 1 field config record (commodity code `00`). 10 pages, 88 components:

| Page | Part | Components |
|------|------|------------|
| Commodity | one | 8 |
| Purpose | one | 12 |
| References | one | 5 |
| Traders | one | 11 |
| Transport | one | 6 |
| Acceptance | two | 6 |
| Checks | two | 11 |
| Control Authority | two | 3 |
| Laboratory Tests | two | 12 |
| Refusal | two | 14 |

Part "one" pages (Commodity through Transport) are field config's contribution to the importer journey. Part "two" pages are inspector-facing and out of scope for this investigation.

### Routing Architecture (from existing analysis)

The notification frontend uses **certificate-type-specific routing tables** in `service/src/routes/next_page_routing_tables/`:

- CHEDPP uses `routing_table_default.js` (shared with CVEDP and CED)
- Page order is code-driven, NOT field-config-driven
- Field config provides **boolean flags** for conditional page inclusion (e.g., `isCphNumberRequired()`)
- Field config controls **which fields appear** on pages that are already in the routing table

### What the Screenshots Show (Importer Journey)

The actual Part 1 journey visible in UI screenshots includes approximately these pages:

1. What are you importing (certificate type selection)
2. Origin country
3. Commodity search/selection
4. Additional commodity details
5. Transport to BCP
6. Goods movement services (GMS)
7. Contact details
8. Nominated contacts
9. Documents (phytosanitary certificate)
10. Traders (importer, consignor, consignee)
11. Billing
12. Review / Declare / Submit

Most of these pages are **NOT** in field config. They are structural pages driven by the routing table and handler logic.

---

## Investigation Tasks

### Task 1: Map the Default Routing Table

**File:** `service/src/routes/next_page_routing_tables/routing_table_default.js`

**What to extract:**

1. The complete ordered list of page keys in the routing table
2. For each page entry: the conditions under which it routes to the *next* page (these reveal conditional page skipping)
3. Any CHEDPP-specific branching (check for `notification.type === 'CHEDPP'` conditions)

**Output format:**

```
Page Key → Next Page(s) with conditions
─────────────────────────────────────────
commodity_search → commodity_details (always)
commodity_details → consignment_purpose (always)
consignment_purpose → [conditional based on purpose selection]
...
```

**Key question:** Does the routing table distinguish between CHEDPP and other CHED types that share the default table (CVEDP, CED)?

---

### Task 2: Identify All Part 1 Handlers for CHEDPP

**Directory:** `service/src/routes/handlers/importer/`

**What to extract:**

For each handler file in the importer directory:

1. **Handler name** (file name / route path)
2. **Does it apply to CHEDPP?** — Check for certificate type guards (e.g., `if (notification.type !== 'CHEDPP') return next()`)
3. **Does it fetch field config?** — Look for calls to `getFieldConfig()`, `getFieldConfigNoComplementName()`, or `getFieldConfigWithCertTypeOverride()`
4. **Page visibility logic** — What determines if this page is shown? (routing table condition, field config check, notification state, or always-visible)
5. **Data sources used** — Field config, notification data, MDM calls, reference data service calls, hardcoded values

**Output format (per handler):**

```yaml
handler: consignment_purpose
route: /create-notification/:id/purpose
applies_to_chedpp: true
fetches_field_config: true (getFieldConfigNoComplementName)
field_config_page_queried: "Purpose"
visibility: always (in routing table, no skip condition)
data_sources:
  - field_config: Purpose page radio_buttons values
  - notification: selected purpose stored on notification
other_notes: "No complementName passed for CHEDPP"
```

---

### Task 3: Trace Pages NOT in Field Config

The screenshots show pages that field config doesn't define. For each of these, trace the handler to understand:

**Pages to investigate:**

| Screenshot Page | Likely Handler | Key Questions |
|----------------|----------------|---------------|
| What are you importing | `type_selection` or similar | How does the user arrive? Always first? |
| Origin country | `country_origin` or `origin` | Where does country list come from? MDM? |
| Commodity search | `commodity_search` | How does search work? What API? |
| GMS Declaration | `gms` or `goods_movement_service` | What is GMS? When is it visible? |
| Contact details | `contact_details` | Always visible or conditional? |
| Nominated contacts | `nominated_contacts` | What are these? Visibility rules? |
| Documents | `documents` or `phyto_certificate` | Phytosanitary cert upload? Always required? |
| Billing | `billing` | Who pays? Visibility? |
| Review/Submit | `review`, `declaration` | What sections appear on review? |

**For each page, document:**

1. Route path
2. Handler file location
3. Visibility conditions (always shown, conditional on notification state, conditional on field config)
4. Data sources that populate the page
5. Commodity-specific behaviour (does the page change based on what plant is being imported?)

---

### Task 4: Identify Commodity Code Variance Entry Points

CHEDPP field config has no commodity variance (single config '00'). But commodity-specific behaviour exists somewhere. Find where.

**Investigation approach:**

1. **Search for commodity-code-dependent API calls** in CHEDPP handlers. Look for:
   - Calls to reference data service with commodity code parameters
   - MDM lookups by commodity code
   - Conditional logic based on `notification.commodityCode` or `commodities[].commodityId`

2. **Search for CHEDPP-specific field config fetches** that might use a different commodity code than '00':
   - The field config API accepts any commodity code — does the notification frontend pass the actual commodity code for CHEDPP, or always '00'?
   - Check `service/src/utils/fieldconfig.js` for CHEDPP handling

3. **Identify the "Additional details" page** from screenshots:
   - The annotations say "Where does this come from?" for customs declaration reference and customs document code
   - These are likely commodity-specific fields NOT in field config

4. **BCP selection ("MDM?" annotation in screenshots)**:
   - Trace where Border Control Post selection gets its data
   - This is likely MDM (Master Data Management) — confirm the API

**Output:** A table mapping each point of commodity variance to its data source.

---

### Task 5: Document Page Visibility Matrix

Produce a matrix showing which pages are visible under which conditions for CHEDPP.

**Format:**

| Page | Visible When | Driven By | Notes |
|------|-------------|-----------|-------|
| Type selection | Always (entry point) | Code | First page in journey |
| Origin | Always | Code | After type selection |
| Commodity search | Always | Code | After origin |
| Purpose | Always | Routing table | Field config provides options |
| Transport | Always | Routing table | Field config provides transport type options |
| GMS | [condition?] | [source?] | May depend on entry point |
| Documents | [condition?] | [source?] | Phytosanitary cert |
| ... | ... | ... | ... |

**Conditions to watch for:**

- EU vs RoW imports (entry route may differ)
- Specific commodity groups (regulated vs unregulated plants)
- Transit vs internal market purpose
- Pre-notification vs amendment flows

---

### Task 6: Map Data Sources Per Page

For each Part 1 page, produce a complete list of every data source it consults.

**Categories:**

| Source | Examples | How to Find |
|--------|----------|-------------|
| Field Config | Radio options, field visibility | `getFieldConfig*()` calls in handler |
| MDM | BCPs, inspection locations | HTTP calls to MDM endpoints |
| Reference Data | Country lists, commodity tree | Calls to reference data service |
| Notification State | Previously entered data | `request.notification.*` access |
| Session/Auth | User org, user role | `request.auth.*` or session access |
| Hardcoded | Static option lists | Constants/enums in code |

---

## Deliverables

After completing Tasks 1–6, the team should be able to produce:

### 1. Journey Map (page sequence diagram)

A sequential diagram of every page in the CHEDPP Part 1 journey, with:
- Entry conditions
- Exit routes (which page comes next, and under what condition)
- Skip conditions (when this page is bypassed)

### 2. Data Config (per-page data source map)

For each page: what data it needs, where that data comes from, and whether the data varies by commodity code.

### 3. Obligations File (what the importer must provide)

Derived from the journey map + data config: every piece of information the importer must supply, mapped to:
- Which page collects it
- Whether it's mandatory or conditional
- What drives the condition (commodity, purpose, origin, etc.)

---

## Key Files in ipaffs-frontend-notification

| Purpose | Path |
|---------|------|
| Default routing table | `service/src/routes/next_page_routing_tables/routing_table_default.js` |
| CHED-A routing table (reference) | `service/src/routes/next_page_routing_tables/routing_table_cheda.js` |
| Next page router | `service/src/routes/next_page_router.js` |
| Part 1 handlers | `service/src/routes/handlers/importer/` |
| Field config utility | `service/src/utils/fieldconfig.js` |
| Field config API client | `service/src/integration/field_config.js` |
| Handlebars helpers (field config) | `service/src/utils/handlebars.js` |
| View templates | `service/src/views/` |
| Review page manager | `service/src/routes/handlers/importer/page_managers/review.js` |

---

## Approach Notes

- **Start with the routing table** (Task 1) — this gives the backbone of the journey
- **Then map handlers** (Task 2) — this fills in what each page does
- **Then trace unknowns** (Tasks 3-4) — the pages not in field config are where the interesting variance lives
- **Synthesise into deliverables** (Tasks 5-6) — the visibility matrix and data source map

The routing table is the single most important artifact. Everything else is annotation on top of it.

---

## What This Investigation is NOT

- This is NOT about Part 2 (inspector pages). Those are field-config-driven and already well understood from our extraction work.
- This is NOT about implementing extraction scripts. The goal is to produce the source-of-truth documentation that tells us what CHEDPP Part 1 actually does.
- This is NOT about IMP/CVEDA certificate type overrides. CHEDPP doesn't use the IMP override pattern.
