# AI Radar — Architecture & Integration Spec

Version: 1.0 (Architecture)

Status: **Meta Capability Audit v1 accepted** — acquisition architecture updated; Live Meta adapter **not implemented**

Product requirements: [`docs/prd.md`](./prd.md)

Meta capability audit: [`docs/META_CAPABILITY_AUDIT_V1.md`](./META_CAPABILITY_AUDIT_V1.md)

Last updated: 2026-08-09 (acquisition v1)

---

## 1. Purpose

This document is the **technical architecture source of truth** for AI Radar v1. It solidifies integration boundaries, data flow, and platform whitelists confirmed by product.

It does **not** duplicate PRD product behavior (scoring UX, lifecycle, Candidate Card fields). When behavior conflicts, PRD wins for product; this doc wins for **integration and system structure**.

---

## 2. Confirmed V1 Decisions

| Decision | V1 Choice |
|---|---|
| **Primary discovery** | **Threads only** — automated stranger discovery via official `keyword_search` / TAG (Layer A) |
| **Instagram role** | **Enrichment only** — `business_discovery` when exact username known and account is Business/Creator; **never** automated stranger discovery |
| **Member Candidate Intake** | **Layer B — first-class** — `POST /api/radar/candidates`; not a fallback |
| **Org keyword pool** | Member keywords → normalize → dedupe → **one** system discovery execution per unique phrase; multi-member attribution preserved |
| **Quota planning** | Explicit daily budgets (keyword search, profile discovery, new/refresh enrich, reserve %) — do not assume Meta doc maximums |
| **Interaction discovery** | **Layer C — future** — mentions / supported interactions; **not** V1 automated stranger discovery |
| **Friends of Friends (FoF)** | Empty adapter, registry **disabled**, UI **completely hidden** — architecture reserved for future compliant sources |
| **Keyword search** | **System defaults + member customization** — personal changes affect **discovery attribution** for that member only |
| **Keyword → score boundary** | Keywords are **Discovery-only** — a keyword hit **must never** directly increase Recommendation Score |
| **Discovery intent taxonomy** | Five top-level intents (§5.6); stored **separately** from individual keywords |
| **Discovery signal types** | `broad_need`, `pain_complaint`, `change_intent`, `action_intent`, `solution_seeking` (§5.7) |
| **Temporal discovery** | `temporal_signal` — **auxiliary** metadata only; not a 6th primary signal type (§5.14) |
| **Exclusion discovery** | `negative_signal` / `exclusion_signal` — reduce false-positive discovery events (§5.15, §6.9) |
| **Keyword library locale (V1)** | **`zh-TW`** — formal + colloquial Taiwan Traditional Chinese; architecture remains locale-aware |
| **Geographic discovery scope** | **Taiwan-wide** — geography is a **scoring** factor, not Candidate eligibility (§5.16) |
| **Distance scoring v1** | Fine-grained Taiwan model; unknown = **5**; 1 primary + ≤3 secondary development areas (§11.1.3) |
| **Development areas** | Primary full score; secondary proportional cap (**exact district max 8**); best-of areas, no stacking |
| **Core traits scoring** | Quality-weighted mean/volume/temporal/contradiction + direct gates + confidence (§11.1.3) |
| **Eligibility exclusions** | Competitor/same-industry + existing member/known customer — **not** negative score (§6.9) |
| **Acquisition & tokens** | **System-level acquisition** — Baki Go holds compliant Meta tokens; **V1 does not require each member to bind Instagram/Threads** |
| **Candidate pool** | **Shared global pool** (system-populated) + **per-member personalized Top20** |
| **Instagram keyword mapping** | **`mapKeywordToPlatforms()` → Threads discover; Instagram `skip`** — IG hashtag **never** creates Candidate (audit/analytics future only) |
| **Partial data** | Candidates with incomplete 90-day IG data **still** enter Analyze → Score → Rank; `data_completeness = partial`; score adjustment **TBD** in Scoring spec |
| **Threads <100 followers** | Discovery hit may create Candidate from `username`; enrich may be `partial` with `below_threads_profile_threshold` — **not** negative evidence |
| **IG enrichment** | Only when exact username + Business Discovery succeeds; personal/consumer → `unsupported_account_type` / `partial` |
| **Reply/comment enrichment** | **NOT SUPPORTED** for third-party media via official API |
| **Cross-platform auto-link** | **NOT SUPPORTED** via official API — username match alone does **not** merge |
| **Manual identity merge** | `merge_pending_confirmation` + member yes/no; persisted to avoid re-asking |
| **Pool visibility (member)** | Global pool is **system layer** — **no** member browse/search UI; RLS/API enforced |
| **Leader view (V1)** | **Aggregate performance metrics** within org downline scope — **not** pool browse or member learning data |
| **Refresh strategy** | **Adaptive incremental refresh** — 03:00 builds refresh **queue**, not full-pool re-fetch |
| **Scoring** | **Scoring Engine v1 (100 pts):** 40/25/20/5/5/5 + **personal learning layer** (±20% guardrail, activate at 20 outcomes); LLM **never** outputs final score |
| **Personal learning samples** | **Success + Failure only** (`already_know`, `give_up` excluded); failure-aware via `failure_reason_code` |
| **Failure reason UX** | **6–8 fixed codes + Other** (optional free text); structured code separate from text |
| **AI provider** | **Abstraction layer** — domain logic never depends on a specific vendor SDK; **no production model selected yet** |
| **Model selection** | **Benchmark-first** — 50-candidate dataset, human ground truth, then choose V1 model |
| **03:00 scheduler** | **Job queue / worker** orchestration — not one monolithic cron run |
| **Pipeline failures** | **Partial success** — one candidate failure must not abort daily pipeline |
| **Stale analysis fallback** | Max **7 days** — older valid analysis **cannot** qualify for Top20 |
| **Data status UX** | Backend machine states; member-facing **human-readable** warnings only when material |
| **Retention** | **Tiered**, configurable — raw snapshots **90 days**; outcomes & recommendation history **long-term** |
| **Learning recency** | **Medium decay** — ~6 months prioritized; gradual, versioned, not hard cutoff |
| **Compliance** | Official Meta APIs only; no login simulation, bypass, or high-risk scraping |

---

## 3. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Daily Job (03:00, per PRD)                   │
│   Discover → Refresh Queue → Enrich → Analyze → Score → Rank     │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
 System Acquisition       Global Candidate Pool    Personal Ranking
 (service tokens)         (shared snapshots)       (per-member Top20)
```

### 3.1 Golden data flow (Production Acquisition v1)

```
Layer A — Automated System Radar (Threads only)
Member keywords (all members)
        → normalize + dedupe → org keyword pool
        → quota allocator (keyword_search budget)
        → ONE discover job per unique phrase
        → Threads keyword_search / TAG → username → Global Pool
        → multi-member discovery attribution (keyword/member)

Layer B — Member Candidate Intake (first-class)
POST /api/radar/candidates (Threads or IG username/URL)
        → resolve platform + normalized username
        → global identity dedup → Pool
        → official enrich attempt → may remain partial

Enrich (system token)
        → Threads: profile_lookup + profile_posts (≥100 followers for full enrich)
        → Instagram: business_discovery ONLY when exact username + Professional account
        → capability states: available | partial | below_threads_profile_threshold | unsupported_account_type | ...

Layer C — Interaction-Based (future, not V1 automation)
        → mentions / supported interactions on system-bound accounts only

Pool-level AI analysis (actual fetched data only; partial OK)
        → Analyze → Score → Rank → per-member Top20
        → keywords do NOT add score points — attribution only

Adaptive refresh queue — quota-competes with new-candidate enrich
```

**Removed from production:** IG hashtag → Candidate; third-party reply/comment text fetch; automatic cross-platform identity linking; scraping / undocumented APIs.

**V1 member binding:** Members do **not** connect Instagram/Threads to receive Top20 from Layer A. Layer B intake accepts member-provided usernames/URLs without OAuth.

**V1 member visibility:** Global pool is system-internal; members see only their own Top20 / development / history (§6.7).

---

## 4. Candidate Acquisition Layer

### 4.1 Orchestrator responsibilities

- Build **org keyword pool** (normalize, dedupe, prioritize within quota)
- Enqueue **one discover job per unique phrase** — never duplicate Meta API calls for shared keywords
- Route **Threads-only** discovery; **Instagram enrichment-only** via enrich worker
- Enforce **Compliance Guard** (whitelist-only endpoints, audit logging)
- Execute acquisition with **system-level tokens** (not per-member OAuth in V1)
- **Quota-aware planning** — keyword search, profile discovery, new/refresh enrich budgets + reserve capacity
- Write verified identities into global pool; **IG hashtag never creates Candidate**
- Preserve **multi-member discovery attribution** on shared keyword hits
- Accept **Layer B member intake** via `POST /api/radar/candidates`

### 4.1.1 Production Acquisition Layers (v1)

| Layer | Status | Role |
|---|---|---|
| **A — Automated System Radar** | V1 | Threads `keyword_search` / TAG → username → pool; Advanced Access required |
| **B — Member Candidate Intake** | V1 | First-class; member submits Threads/IG username or URL |
| **C — Interaction-Based** | Future | Mentions / supported interactions; not V1 stranger automation |

### 4.1.2 Org Keyword Intelligence Pool

```
Member keywords (system + custom − disabled)
    → normalizeKeywordPhrase()
    → dedupe by normalized_phrase
    → priority = max(discovery_weight) + member spread
    → quota allocator selects top-N phrases
    → ONE discover job / phrase / day
    → attributions[] fan-out to recordDiscovery per member
```

**Hard rule:** Multiple members using the same keyword MUST NOT produce duplicate Meta API queries.

**Implementation:** `src/lib/radar/keywords/build-org-keyword-pool.ts`, orchestrator in `src/lib/radar/pipeline/orchestrator.ts`.

### 4.1.3 Quota-aware daily budgets

Configured in `radar_pipeline_config.daily_caps` (defaults conservative — do not assume Meta maximums):

| Budget key | Default | Purpose |
|---|---|---|
| `keyword_search_daily_budget` | 50 | Org discover jobs (Threads keyword_search) |
| `profile_discovery_daily_budget` | 100 | profile_lookup + profile_posts |
| `new_candidate_enrichment_budget` | 30 | Post-discover / intake enrich |
| `refresh_enrichment_budget` | 70 | Adaptive refresh queue enrich |
| `reserve_capacity_pct` | 10 | Held back from each budget |

**Implementation:** `src/lib/radar/pipeline/quota-allocator.ts`

### 4.1.4 Meta capability states (acquisition/enrichment)

Machine-readable outcomes on `candidate_refresh_state.enrichment_capability_state`:

`available` · `permission_required` · `below_threads_profile_threshold` · `unsupported_account_type` · `rate_limited` · `source_unavailable` · `partial`

These are **not** scoring negatives.

**Implementation:** `src/lib/radar/acquisition/capability-states.ts`

### 4.1.5 Member Candidate Intake API

| | |
|---|---|
| **Endpoint** | `POST /api/radar/candidates` |
| **Auth** | Member Bearer token |
| **Input** | `{ threads?: string }` OR `{ instagram?: string }` — username or profile URL |
| **Behavior** | Resolve platform + normalized username → dedup → pool → enqueue enrich |
| **Attribution** | `candidate_member_submissions` + `candidate_discoveries.discovery_source = member_provided` |
| **UI** | Not in V1 scope — backend contract only |

**Implementation:** `src/app/api/radar/candidates/route.ts`, `src/lib/radar/intake/`

### 4.2 Source adapter registry (V1)

| Adapter ID | V1 Status | Role |
|---|---|---|
| `threads_meta` | **Enabled** | Primary discovery; profile lookup; public posts |
| `instagram_official` | **Enabled (restricted)** | Enrichment + secondary discovery via whitelisted endpoints only |
| `friends_of_friends` | **Disabled** | Empty implementation; no UI; no candidate output |

Future compliant adapters register here without changing orchestrator contracts.

### 4.3 FoF (V1)

- **Adapter interface exists**; implementation returns no candidates.
- Registry entry: `enabled: false`.
- **No settings, no toggle, no empty state** in member UI.
- Reserved for future sources (manual seed, member import, future official APIs).

### 4.4 System-level token model (confirmed)

| Principle | V1 rule |
|---|---|
| **Member OAuth** | **Not required** — members never need to bind IG/Threads to receive Top20 |
| **Acquisition executor** | Baki Go **system service account(s)** with App Review–approved permissions |
| **Pool population** | All discovery/enrichment writes to **one shared global pool** |
| **Personalization boundary** | Per-member layer starts at **discovery attribution → score → Top20**, using personal keyword/distance/history/learning |

**System token storage:** Encrypted at rest; rotation policy TBD. Audit every fetch in `source_fetch_audit_log`.

#### 4.4.1 Meta endpoint token exceptions

Meta APIs require a **valid user access token** and, for Instagram Graph, an `{ig-user-id}` query principal (IG professional account). V1 satisfies this with **Baki Go-owned system accounts** — not member accounts.

| Endpoint / area | Token requirement | V1 handling | Member bind required? |
|---|---|---|---|
| Threads `keyword_search`, `profile_lookup`, `profile_posts` | Threads user access token | **System Threads service token** | **No** |
| Threads `me?fields=recently_searched_keywords` | Same token owner | System token (quota ops) | **No** |
| IG `business_discovery`, `ig_hashtag_search`, `recent_media`, `top_media`, `recently_searched_hashtags` | Facebook user token + `{ig-user-id}` of linked IG professional account | **System IG professional account** as query principal | **No** |
| IG `GET /{ig-user-id}/media` | Own media only | **Not used** (excluded) | — |
| IG `connected_threads_user` | App user's own IG only | **Not used** (excluded) | — |
| Future: member-scoped social actions (post, reply, DM) | Per-user token | Out of V1 scope | Would be **exception** if added later |

**Important:** If Meta policy or App Review later mandates per-business token ownership, treat that as a **future exception path** — do not redesign V1 around mandatory member binding unless explicitly decided.

---

## 5. Keyword Model

### 5.1 System defaults + member customization

| Layer | Scope | Mutability |
|---|---|---|
| `radar_system_keywords` | All members (baseline) | Admin/system only; members cannot edit |
| `radar_member_keywords` | Single member | Member can add custom keywords |
| `radar_member_keyword_disabled` | Single member | Member can disable a system keyword **for themselves only** |

**Rules:**

- Personal add / disable / delete affects **only that member's discovery attribution** (which keywords surfaced a candidate *for them*).
- Personal changes do **not** modify system defaults.
- System acquisition may still ingest the **union** of all member keywords for pool efficiency (exact dedup strategy TBD in scheduler spec).

### 5.2 Effective keywords (per member)

Used for **discovery attribution** and effective keyword set for that member's discovery surface area:

```
effective_keywords(member) =
  system_defaults
  − member_disabled_system_keywords
  ∪ member_custom_keywords
```

Effective keywords determine **which discoveries attribute to the member** — they do **not** add Recommendation Score points (§5.4).

### 5.3 Platform mapping — `mapKeywordToPlatforms()` (Production v1)

**Location:** `src/lib/radar/keywords/map-keyword-to-platforms.ts`

**Production contract (post Meta Capability Audit v1):**

```typescript
type PlatformMappingResult = {
  threads: { eligible: true; query: string };
  instagram: { action: "skip"; reason: "enrichment_only_v1" };
};

function discoverPlatformsForKeyword(keyword: string): ["threads"];
```

| Platform | Automated Discover | Enrich |
|---|---|---|
| **Threads** | ✅ `keyword_search`, TAG | ✅ `profile_lookup`, `profile_posts` |
| **Instagram** | ❌ **never** | ✅ `business_discovery` when username known + Professional account |

**Hard constraints:**

- IG hashtag APIs **must not** create Candidates — audit/analytics future only.
- `MetaInstagramAdapter.discoverByKeyword()` returns **empty array** in production.
- Fixture adapters may simulate IG discover **only in explicit tests**.

**Org pool input:** All member effective keywords feed `buildOrgKeywordPool()` before discover — not per-member duplicate searches.

### 5.3.1 Org keyword deduplication (confirmed)

See §4.1.2. Attribution preserved in `candidate_discoveries` per member; API execution is org-level.

### 5.4 Discovery-only invariant (confirmed)

Keywords and keyword hits are **Discovery signals only**. They must **never** directly contribute points to Recommendation Score.

| Rule | Behavior |
|---|---|
| Keyword hit | Surfaces a candidate into the pipeline — **not** a score boost |
| Complaint keyword | Does **not** auto-imply high Change Motivation |
| Action-intent keyword | Does **not** auto-imply high Change Motivation or Activity |
| Solution-seeking keyword | Does **not** auto-imply high Needs |
| Scoring inputs | **Only** Analysis Engine structured output → Scoring Engine components (§11.1.3) |

**Forbidden:** Adding a keyword-matched bonus, keyword-relevance factor, or intent-based point allocation to baseline or personalized scoring.

### 5.5 Required pipeline flow (confirmed)

```
Keyword Hit
    → Discovery metadata (keyword, intent, signal_type, temporal_signal?)
    → Exclusion filter on event/content (§5.15) — excluded events STOP; Candidate not globally blacklisted
    → Candidate Discovery (attribution persisted)
    → Public Data fetch / enrich
    → Eligibility gate (§6.9): existing member/customer · competitor/same-industry
    → Analysis Engine (90-day public context) — skip when eligibility excludes & match is early
    → Change Motivation / Activity / Needs / Core Traits / Other Signals
    → Scoring Engine (+ per-member Distance §11.1.3) → Ranking → Top20
```

Analysis Engine must evaluate **broader recent public context** — not the discovery keyword alone — and distinguish at minimum:

| Signal in content | Meaning (analysis output — not discovery metadata) |
|---|---|
| Casual complaint | Low or no change motivation |
| Recurring pain point | Stronger need / motivation signal |
| Explicit desire to change | Change motivation signal |
| Active change behavior | Activity + change motivation signal |

**Only Analysis Engine output** may influence scoring components.

### 5.6 Discovery intent taxonomy v1.0 (confirmed)

Five **top-level intents** — stable taxonomy; individual keywords version independently.

| Intent | Scope (discovery targeting) |
|---|---|
| `body_transformation` | Body shape, weight, fitness transformation |
| `health_improvement` | Health, wellness, lifestyle improvement |
| `income_need` | Income pressure, financial need, side income |
| `career_business_change` | Job, career, business, entrepreneurship change |
| `life_change` | Broader life transition, reset, major change |

Intents classify **why** a keyword exists — not how many points a candidate receives.

### 5.7 Discovery signal types v1.0 (confirmed)

Each keyword/phrase belongs to **one intent** and **one signal type**:

| Signal type | Role | Scoring |
|---|---|---|
| `broad_need` | Broad short-form keywords; maximize discovery **recall** | Discovery metadata only |
| `pain_complaint` | Pain, frustration, complaint, dissatisfaction expressions | Discovery metadata only |
| `change_intent` | Higher-intent phrases expressing desire or intention to change | Discovery metadata only |
| `action_intent` | Phrases indicating change **already begun** | Discovery metadata only |
| `solution_seeking` | Actively asking for advice, methods, opportunities, solutions | Discovery metadata only |

Signal types are **Discovery metadata** for library organization, query prioritization, and attribution — **not** scoring inputs.

### 5.8 Keyword storage model (confirmed)

Store **intent** and **keyword/phrase** separately so individual entries can be added, disabled, discovery-weighted, or versioned **without** changing the top-level intent taxonomy.

**Conceptual fields (`radar_system_keywords` / `radar_member_keywords`):**

| Field | Purpose |
|---|---|
| `phrase` | Keyword or phrase text |
| `signal_role` | `positive` (discovery) \| `exclusion` (negative/exclusion signal) |
| `discovery_intent` | One of five intents (§5.6) — for positive signals |
| `signal_type` | One of five primary types (§5.7) — for positive signals |
| `temporal_signal` | Optional auxiliary temporal tag — separate from intent/type |
| `locale` | `zh-TW` for V1 system defaults |
| `discovery_weight` | Optional prioritization for discovery queue — **not** recommendation score |
| `version` | Library version pin |
| `enabled` | Active for discovery |

`candidate_discoveries` records which **keyword**, **intent**, **signal_type**, and optional **temporal_signal** linked the candidate to a member — for attribution and ops, not score calculation.

### 5.9 Matching strategy (confirmed)

System Default Keyword Library contains **both**:

| Category | Purpose |
|---|---|
| **Broad short-form keywords** | Maximize candidate discovery recall (`broad_need`) |
| **Higher-intent phrases** | Express change, frustration, desire, or active action — improve discovery **precision** |

All discovered candidates still pass through the full **Analysis → Scoring → Ranking** pipeline regardless of signal type.

### 5.10 Language scope v1.0 (confirmed)

| Rule | Spec |
|---|---|
| Locale | **`zh-TW`** |
| Content | Formal keywords **and** natural Taiwanese social-media expressions |
| Colloquial | Include phrases expressing desire, frustration, pain points, change intention |
| V1 scope | **Do not** auto-expand to Simplified Chinese or multilingual discovery |
| Future | Schema and library remain **locale-aware** for additional markets |

### 5.11 Pain / complaint discovery signals (confirmed)

V1 `zh-TW` library **must include** pain-point, frustration, complaint, and dissatisfaction expressions across all five intents — e.g. body-image frustration, health frustration, income pressure, work dissatisfaction, broader life-change dissatisfaction.

| Rule | Behavior |
|---|---|
| Use | Candidate **Discovery** only |
| Complaint keyword | **Must not** automatically imply high Change Motivation |
| Scoring | Analysis Engine evaluates full public context (§5.5) |

### 5.12 Action-intent discovery signals (confirmed)

V1 `zh-TW` library **must include** action-oriented phrases indicating change has **already begun**.

Examples (non-exhaustive):

- 今天開始減脂 / 開始健身 / 最近開始控制飲食 / 決定要減肥
- 開始找副業 / 最近在研究創業 / 開始找新工作 / 決定重新開始

Even `action_intent` matches **must not** directly add Recommendation Score. Candidate still passes through normal **90-day Analysis → Scoring** pipeline.

### 5.13 Solution-seeking discovery signals (confirmed)

`solution_seeking` = public expressions where the candidate **actively asks** for advice, recommendations, methods, opportunities, or solutions related to one of the five Discovery Intents.

| Rule | Behavior |
|---|---|
| Classification | Discovery metadata only |
| Scoring | Analysis Engine determines actual needs/motivation from full context |

### 5.14 Temporal discovery signal (confirmed)

`temporal_signal` is **auxiliary discovery metadata** — **not** a sixth primary signal type.

**V1 primary signal types remain unchanged:** `broad_need`, `pain_complaint`, `change_intent`, `action_intent`, `solution_seeking`.

Store temporal metadata **separately** from `discovery_intent` and `signal_type`.

| Rule | Behavior |
|---|---|
| Purpose | Tag time-relative expressions in discovery phrases/content |
| Scoring | **Must not** directly add Recommendation Score |
| Analysis | Analysis Engine must determine whether temporal context actually represents a **current** change signal |

**Example zh-TW temporal expressions (non-exhaustive):**

最近 · 這陣子 · 最近幾天 · 最近幾週 · 這個月 · 今年 · 最近開始 · 剛開始 · 最近一直

**Storage:** Optional `temporal_signal` field on keyword library entries and/or `candidate_discoveries` attribution — separate from intent and signal type.

### 5.15 Negative / exclusion discovery signals (confirmed)

Add **`negative_signal` / `exclusion_signal`** entries to the V1 Discovery Library.

| Rule | Behavior |
|---|---|
| Primary purpose | Reduce obvious **false-positive discovery events** and unnecessary AI/API processing |
| Scope | Applies primarily to the **discovery event/content** — **not** permanent Candidate identity blacklist |
| Single post match | Candidate **must not** be globally blacklisted because one post matches an exclusion signal |
| Matching | **Contextual rules** — not naive single-word blocking |
| Audit | Preserve **`exclusion_reason_code`** for precision/recall tuning |
| Scoring | Excluded discovery events do **not** reach scoring as positive evidence — **not** a negative Recommendation Score |

**Example exclusion contexts (non-exhaustive):**

| Context | Example |
|---|---|
| Third-party | 「幫朋友問」 |
| Professional / educational | Content about others' needs, not personal need |
| Advertising / sales | Promotional or seller content |
| Quotation / repost | Repost without personal intent |
| Opposite / irrelevant | Clearly unrelated semantic context |

### 5.16 Geographic discovery scope (confirmed)

| Rule | Behavior |
|---|---|
| V1 scope | Candidate Discovery targets **Taiwan broadly** |
| Eligibility | **Must not** hard-filter Candidates solely because they are geographically distant from a member |
| Geography role | Primarily a **scoring factor** (`location_score`, max 5) — not a pool-entry requirement |
| Ranking | A distant Candidate with strong Change Motivation / Needs / Activity **may outrank** a nearby weak Candidate |
| Unknown location | **Do not guess** — preserve as `unknown`; handle per scoring policy (§11.1.3) |
| Future | Architecture remains extensible to additional markets |

---

## 6. Global Candidate Pool + Personalized Top20

### 6.1 Global pool (shared, system-populated)

All **verified** compliant discoveries write into one logical pool:

- **One underlying person = one pool record** (with platform identities attached)
- **Shared:** public profile snapshots, content snapshots, AI analysis cache (when identity verified)
- **Dedup** by platform external ID
- **Auto-merge** only with strong evidence (§6.4) — never on username alone

### 6.2 Per-member layer (private)

Each member gets their own:

- Discovery attribution (which keyword / intent / signal_type surfaced this candidate *for them*)
- Recommendation score (inputs: **Analysis components**, **distance**, **dev history**, **personal learning** — **not** keyword match)
- Daily **Top20** (fixed count per PRD)
- Development history, learning signals, known/fail/success records
- Manual identity merge confirmations (§6.6)

**Member A and Member B may see different Top20 lists for the same underlying candidate.**

### 6.3 Ranking exclusion

When a member starts development on a candidate, that candidate **immediately leaves that member's ranking** (PRD §11). Pool record remains for others unless they also develop.

### 6.4 Cross-platform auto-merge (confirmed)

**Username match alone does NOT constitute 100% identity confidence.**

| Evidence type | Auto-merge? |
|---|---|
| Threads username === IG username | **No** — keep separate identities |
| Profile explicit cross-link (e.g. IG URL in Threads bio, verified link fields) | **Yes** — if unambiguous |
| Meta official account relationship API (when available & whitelisted) | **Yes** |
| Other unique, reliable, documentable evidence | **Case-by-case** — must be enumerated in merge rules before implementation |

When **only username matches:**

- Maintain **two independent identities**
- **Do not** auto-merge
- **Do not** combine both platforms' content into a single AI analysis run

**Priority:** Identity accuracy > merge rate.

### 6.5 Manual identity merge (confirmed)

When system detects **high suspicion** of same person but **lacks auto-merge evidence**:

| Rule | Behavior |
|---|---|
| AI merge | **Forbidden** |
| Pool state | Both identities remain separate; may set `merge_pending_confirmation` on the pair |
| Candidate Card | May show: *「疑似找到同一人的 Instagram / Threads 帳號」* + minimal public info for member judgment |
| Member actions | **「是同一人」** → merge identities, then combined analysis may proceed **after** merge |
| | **「不是同一人」** → identities stay split; record decision |
| Persistence | Store `member_identity_merge_decisions` (or equivalent) so the **same pair is not re-prompted** for that member |

Manual merge by one member does **not** automatically change another member's view unless product decides otherwise (TBD — default: global merge once confirmed? **Open:** §12).

### 6.6 Instagram hashtag identity resolution (confirmed)

Hashtag APIs return media **without** `username`. Resolution rules:

```
IG hashtag media fetched
        │
        ▼
Can official API / whitelisted fields resolve to a unique candidate identity?
        │
   YES ─┴─ NO
   │        │
   ▼        ▼
 Pool    unresolved_discovery record → STOP
           (no candidate, no analyze, no score, no Top20)
```

**Forbidden:**

- Parsing caption to infer author
- AI guessing author identity
- Creating unverified / provisional candidate records

**Priority:** Identity correctness > candidate count.

---

## 6.7 Access control & visibility (confirmed)

Global Candidate Pool is a **system-level shared data layer**. Transparency to members is **intentional absence of UI** plus **mandatory backend enforcement**.

### 6.7.1 Member access (allow list)

Members may access **only their own**:

| Allowed | Description |
|---|---|
| **Top20** | Daily personalized ranking |
| **Development** | In-progress and own lifecycle state |
| **Recommendation history** | Past recommendations shown to them |
| **Re-recommendations** | Candidates the system surfaces again to them (with prior context per PRD §14) |

### 6.7.2 Member access (deny list)

Members must **not** access:

- Global pool browse, search, or export
- Other members' scores, rankings, development, history, or AI learning
- System-wide candidate lists beyond their own surfaced recommendations

**Enforcement:** Supabase **RLS** + API authorization — **not** frontend hiding alone.

### 6.7.3 Leader Aggregate View (V1 — confirmed)

Leaders may view **aggregate performance metrics** for members within their **authorized downline scope**.

**Scope resolution:** Use existing Baki Go org hierarchy (`organization_relationships`, downline traversal — same family as leader forest / map views). Backend computes eligible `member_id` set; RLS and API handlers **must** filter to that set.

**V1 metrics (minimum):**

| Metric | Notes |
|---|---|
| `recommendations_count` | Candidates recommended into scope |
| `viewed_count` / `viewed_rate` | |
| `development_started_count` / `development_started_rate` | |
| `success_count` | |
| `failure_count` | |
| `already_know_count` | |
| `give_up_count` | |
| `conversion_rate` / `success_rate` | Derived from development outcomes |
| `member_level_activity_summary` | Per-member rollup within scope |

**Explicitly NOT granted to leaders:**

- Global Candidate Pool browse or candidate-level PII dump
- Other members' **AI learning profiles** or raw learning weights
- Other members' **individual Top20 ordering** (unless future product says otherwise)
- Cross-scope members outside hierarchy

Leader view is **performance / action analytics**, not a backdoor to pool or learning data.

### 6.8 Candidate data status — backend vs UX (confirmed)

#### Machine-readable backend states

Persist at minimum:

| State / field | Purpose |
|---|---|
| `data_completeness` | `full` \| `partial` |
| `analysis_freshness` | `current` \| `stale` |
| `merge_status` | e.g. `none` \| `merge_pending_confirmation` |
| `last_successful_analysis_at` | Timestamp |
| `source_completeness` | Per-platform fetch completeness metadata |

These drive scoring eligibility (§7.4), ranking, and ops — **not** shown verbatim to members by default.

#### Member-facing UX (human-readable)

Show warnings **only when data quality may materially affect interpretation**:

| Backend | Member message (example) |
|---|---|
| `partial` | 「部分社群資料無法取得」 |
| `stale` | 「此分析更新於 X 天前」 |
| `merge_pending_confirmation` | 「疑似找到同一人的其他社群帳號」 |
| `full` + current | **No warning** |

**Top20 gate:** Analysis older than **7-day stale threshold** → **must not qualify** (§7.4), regardless of UX copy.

### 6.9 Candidate eligibility & exclusion (confirmed)

Eligibility rules determine whether a Candidate enters **normal AI Radar discovery, analysis, and Top20**. They are **not** negative Recommendation Score adjustments.

#### 6.9.1 Pipeline placement

```
Discover → exclusion filter (event-level, §5.15)
        → enrich (when needed for evidence)
        → eligibility checks (§6.9.2–§6.9.4)
        → Analyze / Score / Rank (eligible only)
```

| Rule | Behavior |
|---|---|
| Existing member / known customer | Check **before expensive AI analysis** whenever reliable matching data is available |
| Exclusion outcome | Exclude from normal Top20 eligibility — **do not consume a Top20 slot** |
| Scoring | **Not** treated as a negative scoring signal |

#### 6.9.2 Discovery-event exclusion (§5.15 recap)

Negative/exclusion signals filter **individual discovery events**. The underlying Candidate identity remains in the system unless separately excluded by §6.9.3–§6.9.4.

#### 6.9.3 Competitor / same-industry exclusion (confirmed)

V1 excludes obvious **same-industry / competitor** Candidates from normal Candidate Discovery and Top20 eligibility.

**Example profile/context types (non-exhaustive):**

- Fitness coaches / personal trainers
- Weight-management / nutrition professionals
- Fitness-business operators
- Weight-management / health-product sellers
- Other direct-selling / network-marketing participants
- Other clearly competing profiles

| Rule | Behavior |
|---|---|
| Evidence | Determine from **sufficient public profile/context evidence** — not a single keyword/post |
| Single match | **Do not** permanently blacklist based on one keyword or post |
| Uncertain cases | **Must not** classify as competitor solely by AI guesswork |
| Storage | Structured **`exclusion_reason_code`** (e.g. `competitor_fitness_coach`, `competitor_network_marketing`) |
| Config | Exclusion logic **configurable and versioned** |
| Scoring | **Eligibility/exclusion rule** — not a negative Recommendation Score |

#### 6.9.4 Existing member / known customer exclusion (confirmed)

Before Candidate **Analysis / Scoring / Top20** eligibility, check whether the Candidate can be **reliably matched** against Baki Go's existing member/customer records.

| Rule | Behavior |
|---|---|
| Reliable match | Exclude from normal AI Radar Candidate eligibility |
| Top20 | **Do not** consume a Top20 slot |
| Reason code | e.g. `existing_member`, `known_customer` |
| Scoring | **Not** a negative scoring signal |
| Identity bar | Requires **reliable identifiers/evidence** |
| Forbidden | Classifying as existing member/customer merely because public content mentions Herbalife or related terms |
| Timing | Run **before expensive AI analysis** when reliable match data is available |

---

## 7. Daily Job Phases

Aligned with PRD §5; split for implementation clarity:

| Phase | Scope | Output |
|---|---|---|
| **Discover** | System tokens; union of keywords via `mapKeywordToPlatforms()`; exclusion filter (§5.15) | Verified identities → pool; excluded events → audit; unresolved → audit only |
| **Enrich** | Global pool (system tokens) | Threads profile/posts; IG `business_discovery` when username known |
| **Eligibility** | Before expensive analysis when possible (§6.9) | Competitor/same-industry · existing member/known customer checks |
| **Analyze** | Eligible global snapshots | AI over **actual fetched data** (~90 days target); `data_completeness: full \| partial` |
| **Score** | Per-member | Baseline components from Analysis + **per-member distance** (§11.1.3) + **personal learning** + dev history |
| **Rank** | Per-member | Top20 snapshot; partial candidates **allowed**; exclude in-development + ineligible |

**03:00 also runs:** adaptive **refresh queue** planning (§7.1) before/at enrich — does **not** re-fetch entire pool.

Daily execution uses **job queue / worker** architecture (§7.2) — scheduler **triggers only**, does not run the full pipeline inline.

### 7.1 Adaptive incremental refresh (confirmed)

**Policy module (planned):** `src/lib/radar/refresh/build-refresh-queue.ts` — **not** hard-coded in connectors.

| Principle | Rule |
|---|---|
| Full-pool daily re-fetch | **Forbidden** in V1 |
| Queue builder | Daily 03:00 pipeline computes **today's refresh queue** from priority signals |
| Tunability | Frequencies/thresholds live in refresh policy config — adjustable for API quota, AI cost, pool size |

**Priority signals (non-exhaustive, weighted in policy — weights TBD):**

1. Candidate near / entering **any** member's Top20
2. **Recent high activity** (public posts, engagement spikes)
3. **Recommendation score** moved significantly (per-member deltas aggregated)
4. Hit by **multiple members'** discovery keywords
5. New **needs / change-motivation** signals from latest analysis
6. Marked **awaiting re-evaluation**

**De-prioritization:** Low activity + low relevance → longer refresh interval automatically.

Connectors **only execute** refresh jobs handed by the queue; they do **not** decide frequency.

### 7.2 Scheduler & job queue architecture (confirmed)

**Pattern:** `Scheduler (03:00 trigger) → Job Queue → Workers`

The 03:00 scheduler **orchestrates** the daily pipeline. It must **not** execute Discover → Rank as one long-running cron/Edge Function.

**Pipeline stages (queued jobs):**

```
Scheduler → Discover → Refresh/Enrich → Analyze → Score → Rank → Member Top20
```

| Requirement | Rule |
|---|---|
| Retry | Jobs independently retryable |
| Idempotency | Safe to re-run same job key |
| Concurrency | Controlled worker pool; respect Meta/AI rate limits |
| Backoff | Exponential backoff on transient failures |
| Dead letter | Failed jobs visible for ops + manual retry |
| Audit | Job status + execution log per run |
| Scale | Horizontal worker scaling |
| Isolation | **One candidate/job failure must not abort** the entire daily pipeline |

**Separation:** Queue/worker **infrastructure** is separate from Radar **domain logic** (orchestrator, scoring, learning).

**Technology:** Concrete queue (Supabase pg_cron + table queue, SQS, BullMQ, etc.) — **not selected yet** (§12.E).

### 7.3 Daily pipeline failure strategy — Partial Success (confirmed)

| Scenario | Behavior |
|---|---|
| Single candidate/job fails | Pipeline **continues** for other candidates |
| Retry | Automatic per retry policy |
| Retries exhausted | Apply **Stale Analysis Policy** (§7.4) — never fabricate data |
| Data integrity | **Never** overwrite valid historical data with failed/partial run output |
| No prior valid analysis | Candidate **must not** enter Top20 on fabricated/default analysis |
| Run status | Report `success` \| `partial_success` \| `failed` |
| Top20 | **Does not wait** for every candidate job to succeed |
| Ops visibility | Failed jobs remain in dead-letter / failed-job view |

### 7.4 Stale analysis policy (confirmed)

When a candidate **refresh/analysis job fails**, fallback to prior analysis is **time-bounded**.

| Condition | Behavior |
|---|---|
| Most recent valid analysis **≤ 7 days** old | May **temporarily** use for scoring/ranking |
| | Mark candidate **`stale`** |
| | Preserve `last_successful_analysis_at` |
| | Continue retry per job policy |
| Most recent valid analysis **> 7 days** old | **Must not** use to qualify for Top20 |
| Any case | **Never** fabricate missing/current data |

**Rationale:** AI Radar emphasizes **current timing and change motivation** — analysis older than 7 days is too stale for ranking eligibility.

**Interaction with partial data:** `partial` + fresh analysis may still rank; `stale` + analysis > 7 days → **excluded from Top20** even if previously partial-OK.

---

## 8. Instagram V1 — Role & Constraints

### 8.1 Role (confirmed — post Meta Capability Audit v1)

- **NOT** an automated stranger discovery platform in V1 production.
- **Primary use:** enrich candidates when **exact username** is known and target is Instagram **Business/Creator**.
- **Hashtag endpoints:** **NOT** used for Candidate creation — identity unavailable per official API; future audit/analytics only if App Review permits.
- **Personal/consumer accounts:** `unsupported_account_type` — Layer B intake may still add Candidate; enrich remains partial.

### 8.2 Integration prerequisites

- **Instagram API with Facebook Login** on `graph.facebook.com`
- Query **on behalf of** a **Baki Go system-owned Instagram professional account** (Business/Creator) as `{ig-user-id}` — **not** each member's account (§4.4)
- Hashtag endpoints additionally require **Instagram Public Content Access** (App Review + Business Verification)

Official references:

- [Business Discovery](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery/)
- [Hashtag Search guide](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/hashtag-search/)
- [IG Hashtag Search](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search/)
- [recent_media](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag/recent-media/)
- [top_media](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag/top-media/)
- [Instagram Public Content Access](https://developers.facebook.com/docs/features-reference/instagram-public-content-access/)
- [IG User fields](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/)
- [IG Media fields](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/)

**Whitelist policy:** Only endpoints listed in §8.3 may be called by `instagram_official`. Update this section when Meta changes official API docs.

---

## 8.3 Instagram V1 Allowed Endpoints Whitelist

### In-scope (5)

#### 1. Business Discovery

| | |
|---|---|
| **Endpoint** | `GET /{ig-user-id}?fields=business_discovery.username({target_username}){...}` |
| **Host** | `graph.facebook.com` |
| **Purpose** | Fetch **another** Instagram Business/Creator account's public profile and nested public media fields when username is known |
| **Permissions** | `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`; if Page role via Business Manager, also `ads_management` or `ads_read` |
| **Retrievable data** | **IG User (public):** `id`, `username`, `biography`, `followers_count`, `media_count`, `website`, etc. **Nested media (public):** `id`, `caption`, `comments_count`, `like_count`, `view_count`, `permalink`, `timestamp`, `media_type`, `media_url`, etc. via field expansion |
| **Limits** | Target must be Business/Creator; age-gated accounts not returned; query must use **system** IG professional account as `{ig-user-id}`; **direct `GET /{ig-media-id}` on returned IDs fails** (insufficient permissions per Meta docs) |
| **Token** | System service token + system `{ig-user-id}` (§4.4.1) |
| **AI Radar** | **Yes — enrichment primary path** |

#### 2. Hashtag ID lookup

| | |
|---|---|
| **Endpoint** | `GET /ig_hashtag_search?user_id={ig-user-id}&q={hashtag}` |
| **Host** | `graph.facebook.com` |
| **Purpose** | Resolve hashtag name → `ig-hashtag-id` for secondary discovery |
| **Permissions / Feature** | Feature: **Instagram Public Content Access**; Permission: `instagram_basic` (+ BM extras per Meta docs) |
| **Retrievable data** | Hashtag `id` (static, global) |
| **Limits** | Max **30 unique hashtags per rolling 7 days**; sensitive/offensive hashtags return generic error; emoji not supported; Story hashtags not supported |
| **AI Radar** | **Yes — secondary discovery** (identity must resolve per §6.6) |
| **Token** | System service token + system `{ig-user-id}` (§4.4.1) |

#### 3. Hashtag recent media

| | |
|---|---|
| **Endpoint** | `GET /{ig-hashtag-id}/recent_media?user_id={ig-user-id}&fields=...` |
| **Host** | `graph.facebook.com` |
| **Purpose** | Recent public posts tagged with hashtag |
| **Permissions / Feature** | Same as §8.3.2 |
| **Retrievable data** | `id`, `caption`, `media_type`, `comments_count`, `like_count`, `permalink`, `timestamp`, `media_url`, `children`; **`username` cannot be requested** |
| **Limits** | Public media only; **published within 24 hours before query**; no promoted/ads media; pagination max **50** per page; shares 30-hashtag/7-day quota |
| **AI Radar** | **Partial — discovery only**; identity gate §6.6; insufficient alone for 90-day analysis |
| **Token** | System service token + system `{ig-user-id}` (§4.4.1) |

#### 4. Hashtag top media

| | |
|---|---|
| **Endpoint** | `GET /{ig-hashtag-id}/top_media?user_id={ig-user-id}&fields=...` |
| **Host** | `graph.facebook.com` |
| **Purpose** | Popular public posts tagged with hashtag |
| **Permissions / Feature** | Same as §8.3.2 |
| **Retrievable data** | Same field set as recent_media; **`username` cannot be requested** |
| **Limits** | Public only; no promoted/ads; pagination max **50**; 30-hashtag/7-day quota; pagination uses `after` cursor only |
| **AI Radar** | **Partial — discovery only**; identity gate §6.6 |
| **Token** | System service token + system `{ig-user-id}` (§4.4.1) |

#### 5. Recently searched hashtags (operations)

| | |
|---|---|
| **Endpoint** | `GET /{ig-user-id}/recently_searched_hashtags` |
| **Host** | `graph.facebook.com` |
| **Purpose** | Quota management — which hashtags this IG account already queried this week |
| **Permissions / Feature** | Same as §8.3.2 |
| **Retrievable data** | List of hashtags searched in current week |
| **Limits** | Operational; tied to 30-hashtag/7-day cap |
| **AI Radar** | **No candidate output** — scheduling/compliance only |
| **Token** | System service token + system `{ig-user-id}` (§4.4.1) |

---

## 8.4 Partial data policy (confirmed)

When full 90-day Instagram (or other platform) history is unavailable:

| Rule | Behavior |
|---|---|
| Pipeline | Candidate **may** proceed: Analyze → Score → Rank → Top20 |
| `data_completeness` | Set to `partial` (vs `full`) on candidate / snapshot |
| AI analysis | **Only** use actually retrieved public fields — **never** infer, fabricate, or fill gaps |
| Top20 eligibility | **Not** auto-excluded for being `partial` alone |
| Candidate Card | Human-readable warning when material (§6.8) — not raw enum labels |
| Score adjustment for incomplete data | **Not decided** — deferred to Scoring spec (§12.D) |
| Stale analysis | Analysis **> 7 days** → **cannot** qualify for Top20 (§7.4) |

Threads-primary candidates with partial IG enrichment remain valid pool members.

---

## 8.5 Explicit exclude (4)

These endpoints must **not** be called by `instagram_official` in V1:

| Endpoint | Reason |
|---|---|
| `GET /{ig-user-id}/media` | Returns only the **authenticated app user's own** media — not third-party discovery |
| `GET /{ig-media-id}` on media IDs from discovery/hashtag | Meta Business Discovery docs: direct GET **fails** due to insufficient permissions; use field expansion only |
| Instagram API with Instagram Login `/me` and self-management endpoints | Manages **authorized user's own** account only; no third-party public discovery |
| `GET /{ig-user-id}/connected_threads_user` | Returns Threads user linked to **app user's own** IG account — not for arbitrary candidate lookup |

Also out of scope for V1 Instagram connector: publishing, comments, messaging, insights on third-party accounts, and any non-whitelisted Graph endpoints.

---

## 9. Threads V1 — Role (confirmed, whitelist TBD)

Threads is the **primary discovery** platform for V1.

Documented endpoints for next whitelist pass (already verified against Meta docs; formal table to be added in a future revision):

| Endpoint | Purpose | Notes |
|---|---|---|
| `GET /v1.0/keyword_search` | Keyword/tag search | System Threads token; 2,200 queries / 24h / token owner |
| `GET /v1.0/profile_lookup` | Public profile by username | System Threads token; ≥100 followers; 1,000 req / 24h |
| `GET /v1.0/profile_posts` | Public posts by username | System Threads token; supports `since` / `until` |
| `GET /v1.0/me?fields=recently_searched_keywords` | Keyword quota tracking | System Threads token (ops) |

Official references:

- [Keyword Search](https://developers.facebook.com/docs/threads/keyword-search/)
- [Threads Profiles](https://developers.facebook.com/docs/threads/threads-profiles/)
- [Retrieve Posts](https://developers.facebook.com/docs/threads/retrieve-and-discover-posts/retrieve-posts/)

---

## 10. Conceptual Data Model

Implementation pending; entities for schema design:

| Entity | Scope | Notes |
|---|---|---|
| `candidate_pool` | Global | `data_completeness`, `analysis_freshness`, `merge_status`, `location_normalized`, timestamps |
| `candidate_identities` | Global | Platform + external ID; separate until merge |
| `candidate_identity_merge_groups` | Global | After auto-merge or member confirmation |
| `candidate_location` | Global | Normalized Taiwan city/county + district, or `unknown` — **no** universal distance score |
| `candidate_profile_snapshots` | Global | Profile/bio/avatar; retention tier §12.2 |
| `candidate_content_snapshots_raw` | Global | Raw Threads/IG payloads; **90-day** default TTL §12.2 |
| `candidate_content_normalized` | Global | Normalized public content; separate retention tier |
| `candidate_discoveries` | Per-member attribution | `keyword`, `discovery_intent`, `signal_type`, `temporal_signal?`, source — not used in score |
| `discovery_exclusion_events` | System audit | Event-level exclusions; `exclusion_reason_code`; not global Candidate blacklist |
| `candidate_eligibility_state` | Global | Latest eligibility outcome + `exclusion_reason_code` when ineligible |
| `unresolved_discoveries` | System audit | Hashtag/media with no resolvable identity — **never** promoted to candidate |
| `identity_merge_pending` | Global / per-pair | `merge_pending_confirmation` state |
| `member_identity_merge_decisions` | Per-member | Persisted yes/no; prevents re-prompt |
| `candidate_source_registry` | System | Adapter config; FoF `enabled: false` in V1 |
| `radar_system_credentials` | System | Encrypted Meta system tokens (IG + Threads) |
| `radar_system_keywords` | System | Library: `phrase`, `discovery_intent`, `signal_type`, `signal_role` (`positive` \| `exclusion`), `temporal_signal?`, `locale`, `version` |
| `radar_member_keywords` | Per-member | Custom keywords; same schema |
| `radar_exclusion_reason_codes` | System | Versioned codes for discovery + eligibility exclusions |
| `radar_competitor_exclusion_config` | System | Versioned competitor/same-industry rules |
| `radar_geographic_scoring_config` | System | Versioned Taiwan adjacency / living-area policy |
| `radar_secondary_area_scoring_config` | System | Secondary-area modifier; exact-district cap **8** (proportional formula configurable) |
| `member_development_areas` | Per-member | **1 primary** + **≤3 secondary**; normalized city/county + district; **not** device GPS |
| `radar_member_keyword_disabled` | Per-member | Disabled system keywords |
| `member_candidate_scores_daily` | Per-member | Daily score/rank + **per-member `location_score`** + component breakdown |
| `member_candidate_scores_weekly` | Per-member | Compacted weekly rollups |
| `member_candidate_scores_monthly` | Per-member | Compacted monthly rollups |
| `member_recommendation_occurrences` | Per-member | Long-term recommendation history §12.6 |
| `member_development_records` | Per-member | Lifecycle + results; long-term §12.5 |
| `failure_reason_codes` | System | 6–8 fixed + `other`; category for learning eligibility |
| `member_learning_profile` | Per-member | Personalized weights; guardrail-enforced |
| `member_learning_profile_versions` | Per-member | History + audit fields |
| `learning_recency_decay_config` | System | Versioned decay curve (**medium** default); params configurable |
| `candidate_analysis_runs` | Global | AI results; separate retention tier §12.2 |
| `radar_retention_policies` | System | Configurable TTL/compaction per data class §12.1 |
| `radar_baseline_scoring_config` | System | Baseline v1.0 caps; versioned |
| `radar_core_traits_scoring_config` | System | Trait max weights + level target ratios + neutral-anchoring formula + **display precision v1**; versioned |
| `radar_core_traits_confidence_config` | System | Policy **`core_trait_confidence_v1`** + component mappings; versioned |
| `radar_core_trait_context_taxonomy` | System | V1 context categories for cross-context consistency; versioned |
| `radar_core_trait_level_config` | System | Threshold + gates + **behavioral event dedup v1** + **cross-trait evidence reuse v1** + neutral/positive/negative policies (§11.1.3) |
| `radar_core_trait_evidence_quality_config` | System | Taxonomy + multipliers + gate eligibility + quality-weighted mean/volume/temporal/contradiction (§11.1.3) |
| `radar_core_trait_observability_config` | System | **`core_trait_profile_observability_v1`** + scale + thresholds — 0–9/10–29/30+ bands, inflation exclusions (§11.1.3) |
| `candidate_refresh_queue` | System | Daily adaptive refresh job list |
| `candidate_refresh_state` | Global | `last_successful_analysis_at`, `analysis_freshness`, refresh tier |
| `member_daily_top20` | Per-member | Daily ranking snapshot |
| `radar_job_runs` | System | Daily pipeline run status: success / partial_success / failed |
| `radar_jobs` | System | Queue jobs: type, status, retries, dead-letter |
| `leader_radar_aggregate_snapshots` | Per-leader scope | Precomputed rollups for Leader Aggregate View |
| `source_fetch_audit_log` | System | Endpoint, adapter, token id, quota, compliance |
| `fof_seeds` | Reserved | Schema may exist; unused in V1 |

---

## 11. Planned Code Layout (not implemented)

```
src/lib/radar/
├── orchestrator/
├── compliance/
├── credentials/             # system token vault (not member OAuth)
├── keywords/
│   ├── map-keyword-to-platforms.ts
│   ├── intent-taxonomy.ts       # five intents — stable enum
│   ├── signal-types.ts          # five primary discovery signal types
│   └── temporal-signals.ts      # auxiliary temporal metadata — not a 6th type
├── discovery/
│   └── exclusion-filter.ts      # event-level negative/exclusion signals
├── eligibility/
│   ├── competitor-check.ts      # same-industry exclusion — evidence-based
│   └── existing-member-check.ts # member/customer match — reliable IDs only
├── geography/
│   └── taiwan-adjacency.ts      # versioned district/county adjacency policy
├── identity/
│   ├── auto-merge.ts        # strong evidence only
│   ├── manual-merge.ts      # member confirmation flow
│   └── hashtag-resolution.ts
├── pool/
├── refresh/
│   └── build-refresh-queue.ts   # adaptive policy — not in connectors
├── scoring/
│   ├── baseline/
│   │   ├── compute-overall-score.ts      # Scoring Engine v1: 40/25/20/5/5/5 → 100
│   │   ├── normalize-needs.ts          # multi-need strength/evidence rules
│   │   ├── resolve-distance.ts         # multi-area best-of; primary + secondary §11.1.3
│   │   ├── core-trait-taxonomy.ts      # four CoreTraitId + supporting signals (not scored)
│   │   ├── core-trait-context-taxonomy.ts  # health_fitness, work_career, etc.
│   │   ├── validate-trait-evidence.ts  # behavioral dedup; within-trait dedup; cross-trait event_id reuse
│   │   ├── compute-trait-level.ts      # quality-weighted mean → gates → effective
│   │   ├── compute-trait-confidence.ts # core_trait_confidence_v1
│   │   ├── compute-profile-observability.ts  # core_trait_profile_observability_v1 — no score impact
│   │   └── compute-core-traits-score.ts  # neutral-anchored → points
│   └── personal-learning/              # member_learning_profile adjustments
├── leader/
│   └── aggregate-metrics.ts     # downline-scoped rollups only
├── ranking/
├── learning/
│   ├── apply-recency-decay.ts   # medium decay; versioned config
│   └── update-profile.ts
├── retention/
│   ├── retention-policies.ts    # configurable tiers — not hard-coded TTLs
│   ├── purge-raw-snapshots.ts   # scheduled 90-day cleanup
│   └── compact-score-history.ts
├── ai/
│   ├── provider-interface.ts
│   ├── analysis-engine.ts
│   └── providers/               # vendor implementations
├── benchmark/                   # separate from production scoring
│   └── run-benchmark.ts
├── jobs/
│   ├── scheduler.ts             # 03:00 trigger only
│   ├── queue/                   # enqueue, retry, dead-letter
│   └── workers/                 # discover, enrich, analyze, score, rank
└── sources/
    ├── registry.ts
    ├── threads-meta/
    ├── instagram-official/  # whitelist-only connector
    └── friends-of-friends/  # empty adapter, disabled
```

No scrapers. No non-whitelisted Meta calls.

---

## 11.1 Scoring architecture (confirmed)

V1 uses **Baseline + Personalized Learning**. Final recommendation score is **computed**, not LLM-guessed.

### 11.1.1 Separation of concerns

```
Public snapshots
        │
        ▼
AI Analysis Engine ──► AI Provider Interface ──► Provider Implementation
        │                      (structured JSON; no vendor lock-in)
        ▼
Scoring Engine ──► baseline components ──► 0–100 score + factor breakdown
        │
        ▼
Personal Learning Layer ──► member-specific weight adjustments (from Success/Failure history)
        │
        ▼
member_candidate_scores (traceable components)
```

| Layer | Scope | Mutability |
|---|---|---|
| **Global Baseline model** | All members | System-defined; **not** modified by individual learning |
| **`member_learning_profile`** | Per member | Adjusts how baseline components apply **for that member only** |
| **Final score** | Per member | Baseline components + personal adjustments; **explainable** |

### 11.1.2 Core rules

| Rule | Behavior |
|---|---|
| Cold start | `success_count + failure_count < 20` → **100% Baseline**; outcomes stored but weights unchanged |
| Learning isolation | Member A's Success/Failure **never** changes Member B's profile or global baseline |
| LLM boundary | LLM produces **structured analysis fields only** — **never** the final `98.7` recommendation score |
| Traceability | Every score stores **component breakdown** (for UI ↑↓ reasons and audit) |
| Keywords | **Discovery-only** — never a scoring component or score bonus (§5.4) |
| Partial data | May affect analysis inputs; **score penalty for partial — TBD** in weight spec |

### 11.1.3 Scoring Engine v1 (confirmed — implemented)

**Policy version:** **`AI_RADAR_SCORING_VERSION = "v1"`**  
**Implementation:** `src/lib/radar/scoring/` — deterministic pure functions + acceptance tests

All members share the same component caps. Components sum to **100 points** (full precision internally; Candidate UI **1 decimal**).

```
overall_score =
    change_window_score      (max 40)
  + needs_fit_score          (max 25)
  + contactability_score     (max 20)
  + core_traits_score        (max  5)
  + activity_score           (max  5)
  + location_score           (max  5)
```

**Product philosophy:** AI Radar optimizes for **「現在最值得 Member 優先接觸的人」** — not social popularity, followers, or posting volume.

| Component | Max | Producer → Scorer |
|---|---|---|
| **`change_window_score`** | **40** | AI extraction (3 sub-levels) → Scoring Engine |
| **`needs_fit_score`** | **25** | AI extraction (strength × relevance, MAX across needs) → Scoring Engine |
| **`contactability_score`** | **20** | AI extraction (Natural Entry + Interaction Openness) → Scoring Engine |
| **`core_traits_score`** | **5** | AI **evidence events only** → deterministic trait pipeline → Scoring Engine |
| **`activity_score`** | **5** | AI/fetch: days since last meaningful activity → Scoring Engine (**freshness only**) |
| **`location_score`** | **5** | Geography resolver (not LLM guess) → Scoring Engine |
| **Total** | **100** | Ranking uses **unrounded** internal score; UI rounds to **1 decimal** |

**Removed from v1 baseline:** `other_public_signals_score` (legacy 10 pt bucket) — superseded by structured Change Window / Needs / Contactability.

**Rule Engine alignment:** All caps, level→points mappings, gates, and multipliers live in Scoring Engine config — UI is a renderer only.

#### Change Window (max 40)

Answers **「為什麼是現在？」** — three independent sub-scores:

| Sub-component | Max | Levels → points |
|---|---:|---|
| **Change Intent** | **12** | `none`=0 · `emerging`=4 · `clear`=8 · `strong`=12 |
| **Behavioral Change** | **13** | `none`=0 · `exploring`=4 · `trying`=9 · `committed_action`=13 |
| **Solution Gap** | **15** | `closed`=0 · `small`=5 · `open`=10 · `active_gap`=15 |

| Rule | Behavior |
|---|---|
| Dissatisfaction ≠ Change Intent | Strong complaints **must not** auto-map to strong change intent |
| Behavior separation | Actual behavior scored in **Behavioral Change** — not double-counted in Change Intent |
| Solution Gap independence | High behavioral change **does not** imply high Solution Gap — satisfied solution → `closed`=0 |
| AI role | Classify **levels only** — Scoring Engine maps to points |

#### Needs / Fit (max 25)

```
needs_fit_score = MAX over valid needs of:
  25 × strength_ratio × relevance_multiplier
```

| Need Strength | `strength_ratio` |
|---|---:|
| `none` | 0 |
| `emerging` | 0.33 |
| `clear` | 0.67 |
| `strong` | 1.00 |

| Need Relevance | `relevance_multiplier` |
|---|---:|
| `unrelated` | 0 |
| `adjacent` | 0.25 |
| `relevant` | 0.75 |
| `high_fit` | 1.00 |

| Rule | Behavior |
|---|---|
| Multiple needs | **MAX only** — **forbidden** to sum multiple needs |
| Intelligence preservation | All needs retained for recommendation reasons / Natural Entry — not only the scoring winner |
| Relevance policy | Need Relevance **must** use configurable **Fit Policy** — not permanently hard-coded in prompt |
| Search/trying | 「正在找方法」belongs to **Change Window** — **must not** inflate Need Strength |

#### Contactability (max 20)

**≠ Activity · ≠ Extroversion · ≠ Followers**

| Sub-component | Max | Levels → points |
|---|---:|---|
| **Natural Entry** | **12** | `none`=0 · `generic`=4 · `relevant`=8 · `high_leverage`=12 |
| **Interaction Openness** | **8** | `low`=0 · `limited`=2 · `open`=5 · `highly_open`=8 |

| Rule | Behavior |
|---|---|
| Natural Entry | Conversation opening opportunity — **not** permission to pitch product immediately |
| `suggested_opening` | AI **may** produce — **advisory only**, **must not** affect score |
| Forbidden inputs | Followers, post count, AI personality guess, 「看起來很外向」 |

#### Activity (max 5)

**Freshness only** — not popularity, volume, influence, or extroversion.

| Days since last meaningful Candidate-attributable activity | Points |
|---:|---:|
| ≤ 3 | **5** |
| 4–7 | **4** |
| 8–14 | **3** |
| 15–30 | **2** |
| 31–60 | **1** |
| > 60 or no data | **0** |

| Rule | Behavior |
|---|---|
| Volume forbidden | 30 posts/day **must not** beat 1 post/day on same freshness band |
| Meaningful only | Count **有效、可歸因於本人**的公開活動 — not raw post volume |

#### Location (max 5)

**Development convenience only** — **not** Candidate quality.

| Relationship | Points |
|---|---:|
| `same_district` | **5** |
| `same_city` | **4** |
| `nearby_city` | **3** |
| `far` | **1** |
| `unknown` | **0** |

| Rule | Behavior |
|---|---|
| Data quality | Reliable **coarse** public location only — **no** precise address inference |
| Unknown semantics | `unknown` = **0 points** — **not** a negative trait inference |
| `nearby_city` | Determined by versioned **`radar_geographic_scoring_config`** / practical-area policy |
| Independence | Location **must not** modify other component scores |
| Per-member | Member development areas + best-of evaluation — see geographic config (cap remains **5**) |

**Config:** `radar_geographic_scoring_config` (versioned).  
**Planned module:** `resolve-location.ts` (replaces legacy `resolve-distance.ts` naming for v1 caps).

**Legacy note:** Pre-v1 docs used `distance_score` max **10** with `unknown`=5 neutral — **superseded** by Location v1 above for Scoring Engine v1.

#### Core Traits (max 5) — **FINAL** (confirmed)

**Auxiliary** factor — must **not** override Change Window, Needs/Fit, or Contactability. **Forbidden:** a single trait causing a large swing in total recommendation score.

**LLM must not directly assign final `trait_level` or `core_traits_score`.**

##### Required pipeline (confirmed)

```
Public Content
    → Profile Observability Engine (candidate corpus — § Profile Observability Layer v1)
    → Evidence Event Extraction (LLM — strength + quality per event)
    → Behavioral Event Deduplication (§ Behavioral Event Deduplication Policy v1)
    → Evidence Validation (within-trait dedup; cross-trait reuse — § Cross-Trait Evidence Reuse Policy v1)
    → Deterministic Trait Level Engine (quality-weighted mean → positive gate fallback → negative weak gate)
    → Deterministic Confidence Engine (core_trait_confidence_v1)
    → Profile Observability Diagnosis (per-trait — § Profile Observability Layer v1)
    → Neutral-Anchored Trait Scoring
    → core_traits_score (≤ 5.0)
```

| Rule | Behavior |
|---|---|
| Missing evidence | **≠** negative / contradictory evidence |
| Explainability | Every trait assessment **explainable and auditable** |
| LLM boundary | **Evidence events + per-event strength + context tags + reasoning** — **never** `trait_level`, confidence %, or points |
| `trait_level` | **Deterministic Trait Level Engine** — configurable, versioned |
| Confidence | **`core_trait_confidence_v1`** — after validation/dedup |
| Profile observability | **`core_trait_profile_observability_v1`** — parallel diagnostic layer; **no score impact** |
| Personal learning | May adjust **weight** of Core Traits factor (±20% guardrail) — not bypass pipeline |

##### Behavioral Event Deduplication Policy v1 (confirmed)

Policy ID: **`core_trait_behavioral_event_deduplication_v1`**

**Do NOT deduplicate solely by story/topic.**

Multiple posts belonging to the same broader story may become **separate Evidence Events** only when they represent **independently meaningful behavioral stages**.

**Core unit:** **`underlying_behavioral_event`** — stable identity stored as **`event_id`**.

| Rule | Behavior |
|---|---|
| **Not topic-only** | **Must not** collapse all posts about the same story/topic into one event by default |
| **Same action/outcome** | Repeated descriptions of the **same action/outcome** → **one** event |
| **Follow-up same occurrence** | Follow-up posts referring to the **same behavioral occurrence** → **one** event |
| **Distinct stages** | Distinct actions at **materially different stages** → **may** be separate events |
| **Long-running goals** | A long-running goal/project **may** contain **multiple** valid Evidence Events |
| **Split forbidden** | **Do not** artificially split one **continuous action** merely to increase evidence count |
| **Relationships** | Preserve links via shared **`story_id`** / **`episode_id`** where applicable — grouping only, **not** dedup keys |
| **Timestamps** | Each Evidence Event retains its **own timestamp** — genuine longitudinal behavior contributes to Temporal Coverage |
| **Pipeline order** | Deduplication **must occur before** Evidence Volume, Trait Gates, Temporal Coverage, and Confidence calculations |

```
Broader story / project (optional story_id)
    → episode_id (optional sub-arc — not a dedup key)
    → underlying_behavioral_event (event_id) — dedup unit
    → per-trait TraitEvidenceEvent (cross-trait reuse permitted — § Cross-Trait Evidence Reuse Policy v1)
```

| Example | Dedup outcome |
|---|---|
| Three posts re-describing the same completed workout on the same day | **One** `event_id` |
| "Started training" post + separate "Finished first 5K" post weeks later | **Two** `event_id`s — distinct behavioral stages; optional shared `story_id` |
| Live updates during one continuous event (same occurrence) | **One** `event_id` |
| Splitting one paragraph into three same-trait evidence rows | **Forbidden** — see § Cross-Trait Evidence Reuse Policy v1 |

| Rule | Behavior |
|---|---|
| Genuine stages | Separate events only when stages are **independently meaningful** — not keyword/topic similarity alone |
| Audit | Log **`event_id`**, optional **`story_id`** / **`episode_id`**, source refs, **`event_timestamp`** |
| Validation | **`validate-trait-evidence.ts`** applies behavioral dedup before within-trait / cross-trait rules |
| Config | Versioned in **`radar_core_trait_level_config`** |

##### Cross-Trait Evidence Reuse Policy v1 (confirmed)

Policy ID: **`core_trait_cross_trait_evidence_reuse_v1`**

A single **underlying Evidence Event** (`underlying_behavioral_event` / **`event_id`** — § Behavioral Event Deduplication Policy v1) may **support or contradict multiple Core Traits** when the event **genuinely contains evidence relevant to each trait**.

| Scope | Rule |
|---|---|
| **Cross-trait** | Same underlying event **may** appear in **multiple** trait assessments when genuinely relevant |
| **Within-trait** | One underlying event → **count once** per trait — **must not** duplicate |
| **Split forbidden** | **Do not** split one event into multiple same-trait evidence events because several sentences or behaviors within it support the **same** trait |
| **Per-trait strength** | Each trait assessment may **independently** assign its own **`evidence_strength`** — same event may support different traits to **different degrees** |
| **Shared identity** | Preserve a shared **`event_id`** so cross-trait reuse remains **auditable** |
| **Dedup unit** | Deduplication occurs at the **underlying-event level within each trait** |

```
underlying_behavioral_event (event_id — § Behavioral Event Deduplication Policy v1)
    → per trait: at most one TraitEvidenceEvent with that event_id
    → per trait: trait-specific evidence_strength (+ reasoning) as assigned
```

| Rule | Behavior |
|---|---|
| Genuine relevance | Reuse across traits only when evidence is **genuinely relevant** — not keyword inflation |
| Reposts / duplicates | Multiple posts about same **`underlying_behavioral_event`** → **one** `event_id` (§ Behavioral Event Deduplication Policy v1); within each trait → **one** evidence event |
| Audit | Log **`event_id`**, trait_id, per-trait **`evidence_strength`**, source refs |
| Validation | **`validate-trait-evidence.ts`** enforces within-trait dedup; preserves cross-trait `event_id` linkage |
| Config | Versioned in **`radar_core_trait_level_config`** |

##### Four Core Traits (FINAL — PRD: 四大特性)

| `trait_id` | Name (EN) | Definition |
|---|---|---|
| `consistency_resilience` | Consistency & Resilience | Ability to **sustain action over time**. Ability to **continue or recover** after rejection, failure, setbacks, or periods without results. |
| `responsibility_commitment` | Responsibility & Commitment | **Reliability toward commitments**. Evidence that the person takes promises, responsibilities, and agreed actions seriously. |
| `team_collaboration` | Team Collaboration | **Willingness to cooperate** toward shared goals. Ability to support others, work within shared methods, and contribute to collective outcomes. |
| `sharing_influence` | Sharing & Influence | **Natural tendency to share** useful experiences/opportunities. Tendency to think of others, invite participation, and positively bring others into activities. |

Each trait is assessed **independently** with:

| Field | Purpose |
|---|---|
| **Trait definition** | As above — stable product taxonomy |
| **Observable public signals** | Lawful public data that may support assessment |
| **Positive evidence** | Signals supporting trait presence/strength |
| **Negative / contradictory evidence** | Signals arguing against the trait |
| **`trait_level`** | **`effective_trait_level`** — from Trait Level Engine after evidence gate; used for scoring/UI |
| **`confidence`** | **0.0–1.0** — from **`core_trait_confidence_v1`**, not LLM |
| **`profile_observability`** | Per-trait observability diagnosis — from **`core_trait_profile_observability_v1`**; **not** level, confidence, or score |

##### Evidence strength classification (confirmed)

The LLM **must NOT** directly assign final Core Trait `trait_level`.

For each **validated, deduplicated** evidence event, LLM classifies trait evidence strength as **exactly one** of:

| `evidence_strength` | Internal value | Role |
|---|---:|---|
| `positive_strong` | **+2** | Positive evidence |
| `positive` | **+1** | Positive evidence |
| `neutral` | **0** | **Non-directional** — see § Neutral evidence handling v1 |
| `contradictory` | **−1** | Contradictory evidence |
| `contradictory_strong` | **−2** | Contradictory evidence |

| Rule | Behavior |
|---|---|
| Observable behavior | Evidence must refer to **observable public behavior/context** — not unsupported personality inference |
| Intention vs behavior | Intention alone **must not** automatically equal demonstrated behavior |
| Inflation forbidden | Reposts, duplicates, same underlying behavioral event **must not** inflate counts — see § Behavioral Event Deduplication Policy v1 + § Cross-Trait Evidence Reuse Policy v1 |
| `neutral` | **Must not** count as positive or contradictory — **non-directional** |
| Quality separation | **`evidence_strength`** and **`evidence_quality`** are **separate dimensions** — see § Evidence quality architecture v1 |
| Audit | Preserve **source ref, evidence event, context, timestamp, `evidence_strength`, `evidence_quality`, internal value, reasoning** |
| Points | LLM **never** outputs final weighted Core Trait points |

##### Evidence quality architecture v1 (confirmed)

Policy ID: **`core_trait_evidence_quality_v1`**

**Evidence direction/strength and evidence quality must be modeled as separate dimensions.**

| Dimension | Answers |
|---|---|
| **`evidence_strength`** | How **strongly** the content **supports or contradicts** the Core Trait |
| **`evidence_quality`** | How **reliably** the content represents **actual Candidate behavior** vs vague language, slogans, reposts, unsupported self-presentation, or ambiguous context |

**Each validated Evidence Event must contain at minimum:**

| Field | Required |
|---|---|
| **`evidence_strength`** | `positive_strong` \| `positive` \| `neutral` \| `contradictory` \| `contradictory_strong` |
| **`evidence_quality`** | **`direct`** \| **`contextual`** \| **`ambiguous`** — determined **separately** from directional strength |
| **`quality_reasoning`** | Why this quality tier was assigned (audit) |

##### Evidence Quality taxonomy v1 (confirmed)

Three levels — stored in versioned **`radar_core_trait_evidence_quality_config`**:

| `evidence_quality` | Definition |
|---|---|
| **`direct`** | **Concrete behavior/event** clearly attributable to the Candidate. May include **observable action**, **specific event progression**, **demonstrated response**, or **outcome**. |
| **`contextual`** | **Reasonable contextual evidence** attributable to the Candidate, but **behavioral chain or outcome is incomplete**. |
| **`ambiguous`** | **Generic statement**, **slogan**, **vague self-description**, **unclear context**, or content with **weak linkage** to demonstrated behavior. |

**Reliability ordering (conceptual — not a score):** `direct` > `contextual` > `ambiguous`

| Rule | Behavior |
|---|---|
| Independence | **`evidence_strength`** and **`evidence_quality`** are **independent dimensions** — classify separately |
| Strong wording ≠ quality | **Strong/emotional wording must not** automatically increase Evidence Quality |
| Behavior vs self-report | **Demonstrated behavior** should **generally outrank** generic self-description |
| Quotes / reposts | Quotes/reposts **without meaningful Candidate-specific context** must **not** be treated as **`direct`** behavioral evidence |
| Reasoning | **Preserve** the reason for the quality classification (`quality_reasoning`) |
| Versioning | Taxonomy **and** multiplier mapping **must be versioned** in **`radar_core_trait_evidence_quality_config`** |

##### Quality-weighted Evidence Mean v1 (confirmed)

Policy IDs: **`core_trait_evidence_quality_multiplier_v1`** + **`core_trait_quality_weighted_evidence_mean_v1`**

**Replaces** the previous unweighted arithmetic mean (`sum/count`) in the versioned scoring policy.

Evidence Quality **weights** directional evidence for **`evidence_mean`** — **not** Recommendation Score points directly.

**Quality multipliers** (versioned in **`radar_core_trait_evidence_quality_config`**):

| `evidence_quality` | Multiplier |
|---|---:|
| **`direct`** | **1.00** |
| **`contextual`** | **0.75** |
| **`ambiguous`** | **0.25** |

**Base evidence values** (from `evidence_strength`):

| `evidence_strength` | Base value |
|---|---:|
| `positive_strong` | **+2** |
| `positive` | **+1** |
| `neutral` | **0** |
| `contradictory` | **−1** |
| `contradictory_strong` | **−2** |

**Only directional evidence participates** in the mean:

`positive_strong` \| `positive` \| `contradictory` \| `contradictory_strong`

**`neutral` is excluded from both numerator and denominator.**

**Formula:**

```
weighted_contribution(event) = base_evidence_value × quality_multiplier
evidence_mean_numerator   = Σ weighted_contribution(directional events)
evidence_mean_denominator = Σ quality_multiplier(directional events)
evidence_mean             = evidence_mean_numerator / evidence_mean_denominator
```

Per-event (audit):

```
effective_evidence_value = base_evidence_value × quality_multiplier   // weighted contribution to numerator
```

| Rule | Behavior |
|---|---|
| Input | **Validated, deduplicated** evidence events only |
| Bounds | **`evidence_mean`** remains bounded **−2.0 … +2.0** |
| Symmetry | Quality weighting applies **symmetrically** to positive and contradictory evidence |
| Quantity | Evidence **quantity must not independently increase Trait Level** — gates + weighted mean only |
| Gate eligibility | **Separate** — **`ambiguous`** may affect **`evidence_mean`** but **cannot** unlock **`strong`**, **`very_strong`**, or stable **`weak`** gates (§ Evidence Quality gate eligibility v1) |
| Not score points | Quality **must not** directly add Recommendation Score points |
| Audit | Preserve **numerator**, **denominator**, per-event **base**, **multiplier**, **effective contribution**, and final **`evidence_mean`** |
| Config | Store **`evidence_mean_policy_version`** (e.g. `core_trait_quality_weighted_evidence_mean_v1`) |

**Example:** Three directional events — `positive_strong`/`direct`, `positive`/`contextual`, `contradictory`/`ambiguous`:

```
contributions: +2.00, +0.75, −0.25  →  numerator   = 2.50
multipliers:    1.00,  0.75,  0.25  →  denominator = 2.00
evidence_mean = 2.50 / 2.00 = 1.25 → raw_trait_level = strong
```

**V1 engine scope (confirmed):**

| Engine | Uses `evidence_strength` | Uses `evidence_quality` |
|---|---|---|
| Trait Level Engine (mean + gates) | **Yes** — base values | **Yes** — quality-weighted mean |
| Confidence Engine (`evidence_volume`) | Directional event count (audit) | **Yes** — quality-weighted volume (§ Quality-weighted Evidence Volume v1) |
| Confidence Engine (`temporal_coverage`) | All directional buckets (audit) | **Yes** — quality-gated buckets only (§ Quality-gated Temporal Coverage v1) |
| Confidence Engine (`contradiction_consistency`) | Contradictory strength | **Yes** — quality-aware impact (§ Quality-aware Contradiction Consistency v1) |
| Scoring Engine | Via `effective_trait_level` | **Indirectly** — via mean + confidence paths |

Quality is **required at extraction** and **preserved through validation/dedup** so future policy updates can re-score without re-fetching content.

```
TraitEvidenceEvent {
  evidence_strength          // categorical
  evidence_quality           // direct | contextual | ambiguous
  base_evidence_value        // from strength mapping
  quality_multiplier         // from quality mapping
  effective_evidence_value   // base × multiplier — numerator contribution
  strength_reasoning
  quality_reasoning
  evidence_quality_policy_version
  evidence_mean_policy_version   // core_trait_quality_weighted_evidence_mean_v1
  ...
}
```

##### Evidence strength base values (confirmed)

Symmetric **base internal** numeric model — **not** Recommendation Score points:

| Rule | Behavior |
|---|---|
| Purpose | **Base inputs** for quality-weighted mean (§ Quality-weighted Evidence Mean v1) |
| Exposure | **Must never** be exposed to members or added directly to final AI Radar score |
| Input | **Validated, deduplicated** evidence events only |
| Mean input | Trait Level Engine uses **quality-weighted `evidence_mean`** — not unweighted `sum/count` |
| `neutral` | **Non-directional** — excluded from numerator and denominator |
| Dedup | Within each trait: **one** evidence event per **`event_id`** (`underlying_behavioral_event`) — cross-trait reuse permitted (§ Cross-Trait Evidence Reuse Policy v1); identity defined by § Behavioral Event Deduplication Policy v1 |
| Audit | Preserve **base**, **quality**, **multiplier**, **effective contribution**, **numerator**, **denominator**, **mean** |
| Contradiction | **`contradiction_consistency`** uses **quality-aware** contradictory impact (§ Quality-aware Contradiction Consistency v1) |
| Config | Base mapping in **`radar_core_trait_level_config`**; multipliers in **`radar_core_trait_evidence_quality_config`** |

##### Neutral evidence handling v1 (confirmed)

Policy ID: **`core_trait_neutral_evidence_v1`**

**`neutral` evidence events must NOT participate in directional Trait Level calculations.**

**Classification:**

| Category | `evidence_strength` values |
|---|---|
| **`directional_evidence`** | `positive_strong` \| `positive` \| `contradictory` \| `contradictory_strong` |
| **`non_directional_evidence`** | `neutral` |

**Evidence Mean** — quality-weighted; directional events only (§ Quality-weighted Evidence Mean v1):

```
evidence_mean = Σ(base_evidence_value × quality_multiplier) / Σ(quality_multiplier)
```

**`neutral` excluded** from numerator and denominator.

| `neutral` events | Behavior |
|---|---|
| Numerator | **Excluded** |
| Denominator | **Excluded** |
| Evidence Volume (Confidence) | **Excluded** — does not contribute to weighted volume (§ Quality-weighted Evidence Volume v1) |
| Evidence Minimum Gates | **Do not unlock** — cannot satisfy moderate / strong / very_strong / weak gates |
| Positive event count | **Do not count** |
| Contradictory event count | **Do not count** |

**Preservation** — neutral evidence is **not discarded**:

| Rule | Behavior |
|---|---|
| Context | Retained for **context**, **audit**, and **debugging** |
| References | Preserve **source references** + LLM **classification reasoning** |
| Re-analysis | Available for **future re-analysis** after model or policy updates |
| Storage | Include in `evidence_events` with `evidence_strength: "neutral"` — flagged non-directional |
| Input scope | All calculations use **validated, deduplicated** evidence events only |

**No directional evidence after filtering:**

| Field / behavior | Value |
|---|---|
| **`effective_trait_level`** | **`insufficient`** |
| **Scoring baseline** | **`final_ratio = 0.50`** (neutral 50%) |
| **`evidence_mean`** | Undefined / null — **do not compute** when denominator = 0 (no directional evidence) |
| **`evidence_mean_denominator`** | **0** |

##### Deterministic Trait Level Engine (confirmed)

**Aggregation model: Quality-Weighted Evidence Mean** — Trait Level reflects **quality-weighted direction/strength**, not raw event count.

**Design principle:**

| Layer | Answers |
|---|---|
| **Trait Level** | What does the available evidence **indicate**? |
| **Confidence** | How strongly can we **trust** that conclusion? (Confidence Engine — separate) |

**Formula:**

```
evidence_mean_numerator   = Σ(base_evidence_value × quality_multiplier)
evidence_mean_denominator = Σ(quality_multiplier)
evidence_mean             = evidence_mean_numerator / evidence_mean_denominator
```

On **validated, deduplicated** **`directional_evidence`** events only (§ Quality-weighted Evidence Mean v1). **`neutral`** excluded from **both** numerator and denominator.

| Rule | Behavior |
|---|---|
| Mean vs gate | **Weighted mean** reflects direction/strength; **count/time gates** cap level separately |
| Quantity vs confidence | Event count affects **Confidence Engine** only — **not** Trait Level independently |
| Input | **Validated, deduplicated** evidence events only |
| `neutral` | **Excluded** from mean numerator/denominator and gate counts |
| Missing evidence | **Do not** convert missing evidence into zero-strength behavioral events |
| Bounds | **`evidence_mean`** bounded **−2.0 … +2.0** |
| Quantity | Event **count must not independently increase Trait Level** — only weighted mean + gates |
| No directional evidence | denominator = 0 → **`insufficient`**, scoring **0.50** |
| Audit | Preserve **`evidence_mean`**, **`evidence_mean_numerator`**, **`evidence_mean_denominator`**, per-event contributions, **`directional_evidence_event_count`**, neutral events |
| Deterministic | Same events + same config version → same `raw_trait_level` → same `effective_trait_level` |

##### Level threshold policy v1 (confirmed)

Policy ID: **`core_trait_level_threshold_v1`**

Map **`evidence_mean`** → **`raw_trait_level`** deterministically:

| Condition | `raw_trait_level` |
|---|---|
| No **directional** evidence events | **`insufficient`** |
| `evidence_mean` **< 0.00** | **`weak`** |
| `evidence_mean` **≥ 0.00** and **< 0.75** | **`moderate`** |
| `evidence_mean` **≥ 0.75** and **< 1.50** | **`strong`** |
| `evidence_mean` **≥ 1.50** | **`very_strong`** |

Stored in versioned **`radar_core_trait_level_config`**. Thresholds remain **configurable** for future calibration.

**Example:** `positive_strong`/`direct`, `positive`/`contextual`, `contradictory`/`ambiguous` → numerator **2.50**, denominator **2.00**, **`evidence_mean = 1.25`** → **`raw_trait_level = strong`**. (`neutral` stored but excluded.)

##### Evidence sufficiency gates v1 (confirmed)

Policy IDs: **`core_trait_evidence_minimum_gate_v1`** (umbrella) + **`core_trait_positive_sufficiency_v1`** + **`core_trait_very_strong_direct_evidence_v1`** + **`core_trait_evidence_quality_gate_eligibility_v1`** + negative gate policies (§ Negative trait gate v1).

**Purpose:** Apply evidence sufficiency **conservatively around the neutral baseline** — for **both positive and negative** conclusions. Prevent overclaiming; **must not** manufacture evidence.

**Core principle — two independent inputs:**

| Input | Source | Role |
|---|---|---|
| **`evidence_mean`** | Trait Level threshold policy | Proposes **`raw_trait_level`** |
| **Count / time gates** | Positive + negative sufficiency policies | Define **maximum permitted effective level** |

**Count/time gates do NOT automatically grant a level.** They cap how high the effective level may be via **highest-permitted-level fallback** (§ Positive evidence gate fallback v1). A gate may **downgrade** — **must never upgrade**.

```
raw_trait_level       = level_from(evidence_mean)              // core_trait_level_threshold_v1
clamped_level         = positive_gate_fallback(raw_trait_level) // core_trait_positive_sufficiency_v1
if raw_trait_level == weak:
  clamped_level       = raw_trait_level                         // positive fallback N/A
effective_trait_level = apply_negative_weak_gate(clamped_level) // § Negative trait gate v1
```

**Principle:**

| Sparse evidence | Must NOT claim |
|---|---|
| Single strong **positive** event | Stable **very strong** trait |
| Single strong **contradictory** event | Stable **weak** (negative personality) label |

Sparse evidence **pulls categorical interpretation toward neutral** (`insufficient` / `moderate`).

##### Evidence Quality gate eligibility v1 (confirmed)

Policy ID: **`core_trait_evidence_quality_gate_eligibility_v1`**

**`ambiguous` evidence may contribute weak directional information to `evidence_mean`** (via confirmed **0.25** quality multiplier) but **must NOT independently unlock higher Trait Levels** through count/time gates.

**Gate-eligible evidence** (versioned in **`radar_core_trait_evidence_quality_config`**):

| `evidence_quality` | Gate eligibility |
|---|---|
| **`direct`** | **Eligible** — counts toward sufficiency gates |
| **`contextual`** | **Eligible** — counts toward sufficiency gates |
| **`ambiguous`** | **NOT eligible** for **`strong`** / **`very_strong`** evidence-count gates; **NOT eligible** for **`very_strong`** temporal gates; **NOT eligible** for stable **`weak`** contradictory gates |

| Rule | Behavior |
|---|---|
| Evidence Mean | **`ambiguous` remains in quality-weighted mean** (numerator + denominator via 0.25 multiplier) |
| **`strong` gate** | **`ambiguous` must not** count toward minimum **gate-eligible** supporting-event requirement |
| **`very_strong` gate** | **`ambiguous` excluded**; **≥1 `direct`** gate-eligible positive required (§ Very Strong Direct Evidence Requirement v1) |
| **Temporal coverage (confidence)** | **`ambiguous` / `neutral` excluded** — see § Quality-gated Temporal Coverage v1 |
| **`weak` gate (negative)** | See § **Weak Direct Evidence Requirement v1** — gate-eligible contradictory + **≥1 direct** |
| **`moderate` gate** | **≥1** supporting event — **any** quality (including **`ambiguous`**) may satisfy the minimum count |
| Substitution forbidden | Large quantities of **`ambiguous`** statements **must never substitute** for demonstrated/contextually supported behavior (§ symmetric quality philosophy — Negative Evidence Quality Gate v1) |
| Counts | Preserve **`directional_evidence_event_count`** (total) and **`gate_eligible_*_event_count`** (direct + contextual) **separately** |
| Audit | Per-event **`gate_eligible`** flag + aggregate gate-eligible counts + policy version |

```
function is_gate_eligible(evidence_quality):
  return evidence_quality in ("direct", "contextual")

gate_eligible_positive_count =
  count(positive events where is_gate_eligible(evidence_quality))

gate_eligible_positive_bucket_count =
  distinct temporal buckets among gate-eligible positive events

gate_eligible_direct_positive_count =
  count(positive events where evidence_quality == "direct")

gate_eligible_contradictory_count =
  count(contradictory events where is_gate_eligible(evidence_quality))

gate_eligible_contradictory_bucket_count =
  distinct temporal buckets among gate-eligible contradictory events

gate_eligible_direct_contradictory_count =
  count(contradictory events where evidence_quality == "direct")
```

##### Positive evidence sufficiency v1 (confirmed)

Policy ID: **`core_trait_positive_sufficiency_v1`**

**Confirmed positive gates** — each level's gate must be **fully satisfied** before that level may be assigned:

| Level | Gate requirements |
|---|---|
| **`moderate`** | **≥ 1** validated, deduplicated, independent **supporting** evidence event (`positive` / `positive_strong`) — **any** quality |
| **`strong`** | **≥ 2** **gate-eligible** supporting evidence events (`direct` or `contextual` quality) — **does NOT require `direct`** |
| **`very_strong`** | See § **Very Strong Direct Evidence Requirement v1** — all conditions required |

**`strong` does NOT require evidence across multiple Temporal Buckets** — temporal spread applies **only** to **`very_strong`**.

**`strong` does NOT require `direct` evidence** — **`contextual`** gate-eligible events suffice.

##### Very Strong Direct Evidence Requirement v1 (confirmed)

Policy ID: **`core_trait_very_strong_direct_evidence_v1`**

**Effective `very_strong` requires ALL of:**

| # | Condition |
|---|---|
| 1 | **`evidence_mean ≥ 1.50`** |
| 2 | **`gate_eligible_positive_event_count ≥ 3`** |
| 3 | Gate-eligible positive evidence spans **≥ 2** Temporal Buckets |
| 4 | Gate-eligible evidence quality **`direct`** or **`contextual`** only (`ambiguous` **excluded** from gate counts and temporal coverage) |
| 5 | **≥ 1** qualifying gate-eligible positive event with **`evidence_quality = direct`** |

```
gate_eligible_direct_positive_count =
  count(positive events where evidence_quality == "direct")

function very_strong_gate_satisfied(...):
  return evidence_mean >= 1.50
     AND gate_eligible_positive_count >= 3
     AND gate_eligible_positive_bucket_count >= 2
     AND gate_eligible_direct_positive_count >= 1
```

| Scenario | **Maximum / effective** |
|---|---|
| **3 contextual** events across **≥2** buckets, mean ≥ 1.50 | **`strong`** — no `direct` event; very_strong gate fails → fallback |
| **1 direct + 2 contextual** across **≥2** buckets, mean ≥ 1.50 | **Eligible for `very_strong`** — subject to full gate + mean |
| **`ambiguous` only** | **Excluded** from gate counts and temporal coverage — mean contribution only |

**Temporal buckets** (90-day window; **evidence-event timestamps**, not fetch time):

| Bucket | Range |
|---|---|
| `recent` | 0–30 days |
| `mid` | 31–60 days |
| `older` | 61–90 days |

**Supporting / positive event** = validated, deduplicated, independent event with `positive` or `positive_strong`. **Excludes** `neutral` and contradictory evidence. Same **`underlying_behavioral_event`** → **one** event (§ Behavioral Event Deduplication Policy v1).

```
function gate_satisfied(level, evidence_mean,
                        supporting_count,                    // any quality — moderate only
                        gate_eligible_positive_count,
                        gate_eligible_positive_bucket_count,
                        gate_eligible_direct_positive_count):
  moderate:    supporting_count >= 1
  strong:      gate_eligible_positive_count >= 2
  very_strong: evidence_mean >= 1.50
               AND gate_eligible_positive_count >= 3
               AND gate_eligible_positive_bucket_count >= 2
               AND gate_eligible_direct_positive_count >= 1   // core_trait_very_strong_direct_evidence_v1
```

function mean_supports(level, raw_trait_level):
  // evidence_mean band must support the resulting level — gate may downgrade, never upgrade
  return level_order(raw_trait_level) >= level_order(level)
```

##### Positive evidence gate fallback v1 (confirmed)

When **`raw_trait_level`** (positive path: `moderate` / `strong` / `very_strong`) **fails** its evidence sufficiency gate, **downgrade to the highest lower positive level whose requirements are satisfied** — and whose level is still **supported by `evidence_mean`**.

```
function positive_gate_fallback(raw_trait_level):
  candidates = levels from raw_trait_level down through [very_strong, strong, moderate]
  for L in candidates:
    if gate_satisfied(L) AND mean_supports(L, raw_trait_level):
      if L < raw_trait_level: gate_reason = "positive_gate:fallback_to_{L}"
      else:                   gate_reason = "within_bounds"
      return L
  gate_reason = "positive_gate:no_sufficient_support"
  return insufficient
```

**Example — `raw_trait_level = very_strong`, very_strong gate fails:**

```
1. Evaluate very_strong gate → fail
2. Evaluate strong eligibility   → if satisfied AND mean supports strong → effective = strong
3. Else evaluate moderate        → if satisfied AND mean supports moderate → effective = moderate
4. Else → insufficient
```

| Rule | Behavior |
|---|---|
| Fallback direction | **Downgrade only** — gates **must never upgrade** beyond `raw_trait_level` |
| Mean independence | **`evidence_mean`** threshold must **still support** the resulting level |
| Preserve | **`raw_trait_level`**, **`effective_trait_level`** — both stored |
| Downgrade audit | Record **`gate_reason`** whenever a fallback downgrade occurs |
| UI | Candidate-facing uses **`effective_trait_level`** |
| Scoring | **`target_ratio`** from **`effective_trait_level`** (not raw) |
| Dedup | Same **`underlying_behavioral_event`** → **one** evidence event (§ Behavioral Event Deduplication Policy v1) |
| Config | Versioned in **`radar_core_trait_level_config`** + **`radar_core_trait_evidence_quality_config`** |

**Examples (fallback + evidence_mean):**

| Direct | Contextual (gate-eligible) | Buckets (eligible) | `evidence_mean` | Raw | **Effective** | `gate_reason` (example) |
|---:|---:|---|---:|---|---|---|
| 0 | 2 | any | 1.60 | `very_strong` | **`strong`** | `positive_gate:fallback_to_strong` |
| 0 | 3+ | ≥ 2 | 1.60 | `very_strong` | **`strong`** | `positive_gate:fallback_to_strong` |
| 1+ | 2+ (total ≥3 eligible) | ≥ 2 | 1.60 | `very_strong` | **`very_strong`** | `within_bounds` |
| 0 | 3+ | 1 only (eligible) | 1.60 | `very_strong` | **`strong`** | `positive_gate:fallback_to_strong` |
| 0 | 0 (5 ambiguous only) | any | 0.25 | `moderate`* | **`moderate`** | `within_bounds` |
| 0 | 0 (5 ambiguous only) | any | 1.60† | `very_strong` | **`moderate`** | `positive_gate:fallback_to_moderate` |

\*Mean from ambiguous-only directional events at 0.25 multiplier.  
†High mean but **gate-eligible count = 0** blocks `strong` / `very_strong`.

**Legacy symmetric floor** (directional evidence count — negative path only):

| Directional events | **Floor** (min level) |
|---:|---|
| **0** | **`insufficient`** |
| **1+** | **`insufficient`** (general floor — does not force `weak`) |

**`weak` is not set by the general floor alone** — see § Negative trait gate v1.

Level order for comparisons: `insufficient` < `weak` < `moderate` < `strong` < `very_strong`.

| Rule | Behavior |
|---|---|
| Count unit | **Validated, deduplicated, directional, independent** events |
| `neutral` | **Non-directional** — excluded from all gate counts (§ Neutral evidence handling v1) |
| Negative evidence | **Preserve** contradictory evidence + `evidence_mean` — **do not discard** when gated |
| Contradiction Engine | Contradictory evidence **still contributes** to `contradiction_consistency` |
| Sparse vs negative | **Missing/sparse** and **actual negative** evidence remain **semantically distinct** |
| Output | **`effective_trait_level`** — **scoring + Candidate-facing UI** |
| Confidence | Confidence Engine operates **independently** |

**Examples (fallback / negative path):**

| Raw | Positive | After positive fallback | `gate_reason` (example) |
|---|---:|---|---|
| `very_strong` | 1 | `moderate` | `positive_gate:fallback_to_moderate` |
| `weak` | 2 directional (sparse negative) | → negative gate → `insufficient` | `negative_gate:gate_eligible_count=2` |

##### Negative trait gate v1 (confirmed)

Policies **`core_trait_negative_minimum_gate_v1`** + **`core_trait_negative_temporal_gate_v1`** + **`core_trait_negative_evidence_quality_gate_v1`** + **`core_trait_weak_direct_evidence_v1`** — applied **after** positive gate fallback.

##### Negative Evidence Quality Gate v1 (confirmed)

Policy ID: **`core_trait_negative_evidence_quality_gate_v1`**

**`ambiguous` contradictory evidence must NOT count** toward the minimum evidence requirements for an **`effective weak`** Core Trait classification.

**Gate-eligible contradictory evidence:**

| `evidence_quality` | Weak gate |
|---|---|
| **`direct`** | **Eligible** |
| **`contextual`** | **Eligible** |
| **`ambiguous`** | **NOT eligible** |

**`ambiguous` contradictory evidence:**

| Rule | Behavior |
|---|---|
| Evidence Mean | **May influence** via confirmed **0.25** quality multiplier |
| Weak count gate | **Cannot** count toward evidence-count gate |
| Weak temporal gate | **Cannot** count toward temporal gate |
| Direct requirement | **Cannot satisfy** the **Direct Evidence** requirement |

**Symmetric quality philosophy (confirmed):**

> **Ambiguous positive evidence cannot prove a candidate is strongly good; ambiguous contradictory evidence cannot prove a candidate is stably weak.**

##### Weak Direct Evidence Requirement v1 (confirmed)

Policy ID: **`core_trait_weak_direct_evidence_v1`**

**Effective `weak` requires ALL of:**

| # | Condition |
|---|---|
| 1 | **`evidence_mean < 0.00`** (equivalently **`raw_trait_level == weak`**, quality-adjusted) |
| 2 | **`gate_eligible_contradictory_event_count ≥ 3`** |
| 3 | Contradictory **gate-eligible** evidence spans **≥ 2** Temporal Buckets |
| 4 | Gate-eligible evidence quality **`direct`** or **`contextual`** only (`ambiguous` **excluded**) |
| 5 | **≥ 1** qualifying contradictory evidence event with **`evidence_quality = direct`** |

```
gate_eligible_direct_contradictory_count =
  count(contradictory events where evidence_quality == "direct")

function weak_gate_satisfied(...):
  return evidence_mean < 0.00
     AND gate_eligible_contradictory_event_count >= 3
     AND gate_eligible_contradictory_temporal_bucket_count >= 2
     AND gate_eligible_direct_contradictory_count >= 1
```

| Scenario | **Effective** |
|---|---|
| **3 contextual** contradictory across **≥2** buckets, mean **< 0** | **`insufficient`** — no `direct` event; stable weak gate fails |
| **1 direct + 2 contextual** contradictory across **≥2** buckets, mean **< 0** | **`weak`** — all requirements satisfied |
| **`ambiguous` contradictory only** | Mean influence only — **cannot** satisfy count, temporal, or direct requirements |

**If raw level is `weak` but any gate fails** (§ Negative evidence gate failure behavior v1):

| Field / behavior | Value |
|---|---|
| **`effective_trait_level`** | **`insufficient`** |
| **`negative_signal_present`** | **`true`** |
| **Assessment + evidence** | **Preserve `raw_trait_level`** and **all evidence** internally |
| **UI** | **Must not** display a **stable weak trait conclusion** unless **all** requirements satisfied |

**`effective_trait_level = weak` requires ALL of the above** — necessary, **not sufficient**:

**Temporal buckets** (90-day window; **event timestamps**, not fetch time):

| Bucket | Range |
|---|---|
| `recent` | 0–30 days |
| `mid` | 31–60 days |
| `older` | 61–90 days |

**Contradictory event** = validated, deduplicated, independent event with `contradictory` or `contradictory_strong`. Same **`underlying_behavioral_event`** → **one** event (§ Behavioral Event Deduplication Policy v1). **Weak gate** uses **gate-eligible** subset + **≥1 direct** — § Weak Direct Evidence Requirement v1.

```
if clamped_level == weak
   AND evidence_mean < 0.00
   AND gate_eligible_contradictory_event_count >= 3
   AND gate_eligible_contradictory_temporal_bucket_count >= 2
   AND gate_eligible_direct_contradictory_count >= 1:
    effective_trait_level = weak
    negative_signal_present = (contradictory_event_count > 0)
    gate_reason = "within_bounds"
else if clamped_level == weak:
    effective_trait_level = insufficient
    raw_trait_level       = weak                              // preserved
    negative_signal_present = true
    gate_reason = "negative_gate:..."       // count, temporal, or direct failure
else:
    effective_trait_level = clamped_level
    negative_signal_present = (contradictory_event_count > 0)
```

| Sub-gate | Rule |
|---|---|
| **Minimum count** (`core_trait_negative_minimum_gate_v1`) | 0–2 **gate-eligible** contradictory → **cannot** support `weak` |
| **Temporal spread** (`core_trait_negative_temporal_gate_v1`) | 3+ **gate-eligible** contradictory but **< 2 gate-eligible buckets** → **cannot** support `weak` |
| **Quality gate** (`core_trait_negative_evidence_quality_gate_v1`) | Only **`direct`** / **`contextual`** contradictory is gate-eligible; **`ambiguous` excluded** |
| **Direct requirement** (`core_trait_weak_direct_evidence_v1`) | **≥1 `direct`** gate-eligible contradictory required — contextual-only cannot satisfy stable **`weak`** |

##### Negative evidence gate failure behavior v1 (confirmed)

When **`raw_trait_level == weak`** (`evidence_mean < 0`) but the **Weak Direct Evidence Gate** (and/or count/temporal/quality sub-gates) is **not** satisfied:

| Field / behavior | Value |
|---|---|
| **`effective_trait_level`** | **`insufficient`** |
| **`raw_trait_level`** | **`weak`** — **preserved**; do not overwrite |
| **Contradictory evidence** | **Preserve all** events + evidence references |
| **`negative_signal_present`** | **`true`** |
| **`gate_reason`** | Record applicable failure (e.g. `negative_gate:gate_eligible_count=2`, `negative_gate:gate_eligible_temporal_buckets=1`, `negative_gate:direct_required=0`) |

**Forbidden:** A gated negative assessment **must NOT** be converted to **`moderate`**.

| Why | |
|---|---|
| **`moderate`** | Implies an **actual moderate trait assessment** — some reliable positive evidence |
| **`insufficient`** | Correct semantic when evidence is **too sparse** to support a **stable** negative personality conclusion |

**Candidate-facing UI:**

| Rule | Behavior |
|---|---|
| Primary display | **`insufficient`-evidence state** (from `effective_trait_level`) |
| Optional hint | May indicate that **limited contradictory signals** were observed (`negative_signal_present`) |
| Forbidden | Present candidate as having a **stable weak personality trait** unless **all** Weak Direct Evidence requirements satisfied |
| Forbidden | Display **`moderate`** as a fallback for gated negative |

**Scoring:**

| Rule | Behavior |
|---|---|
| Input level | **`effective_trait_level = insufficient`** |
| Ratio | **`final_ratio = 0.50`** (confirmed neutral ratio — confidence does not apply) |
| Future analyses | Contradictory evidence **remains stored** — available as rolling **90-day** window evolves |

**Audit — persist on each trait score:**

| Field | |
|---|---|
| `raw_trait_level` | Pre-gate level (`weak` when mean band is weak) |
| `effective_trait_level` | Post-gate level (`insufficient` on gate failure) |
| `evidence_mean` | Unchanged |
| `negative_signal_present` | `true` when contradictory evidence exists but weak gate failed |
| `contradictory_event_count` | Total contradictory events (all qualities — preserved) |
| `gate_eligible_contradictory_event_count` | Contradictory events with `direct` / `contextual` quality only |
| `gate_eligible_direct_contradictory_event_count` | Gate-eligible contradictory with **`evidence_quality = direct`** |
| `contradictory_temporal_bucket_count` | Buckets among **all** contradictory events |
| `gate_eligible_contradictory_temporal_bucket_count` | Buckets among **gate-eligible** contradictory events only |
| `gate_reason` | Specific negative-gate failure code |
| Evidence references | Per-event refs in `evidence_events` |
| `trait_level_config_version` / `scoring_config_version` | Policy versions |

| Rule | Behavior |
|---|---|
| Necessary not sufficient | All **five** conditions → `weak` **permitted** — does **not** auto-assign if `evidence_mean ≥ 0` |
| UI | **Must not** show stable **weak** conclusion until **all** gates satisfied (§ Weak Direct Evidence Requirement v1) |
| Storage | Gated negative evidence **preserved internally** even when UI cannot display `weak` |
| Audit | See § Negative evidence gate failure behavior v1 |
| Contradiction Engine | Contradictory evidence **still contributes** to confidence/contradiction — independently |
| Config | Versioned in **`radar_core_trait_level_config`** |

**Examples:**

| Raw | Direct | Contextual (eligible) | Total contradictory | Buckets (eligible) | **Effective** | `gate_reason` | Notes |
|---|---:|---:|---:|---|---|---|---|
| `weak` | 0 | 2 | any | any | `insufficient` | `negative_gate:gate_eligible_count=2` | |
| `weak` | 0 | 3+ | any | ≥ 2 | `insufficient` | `negative_gate:direct_required=0` | contextual-only — cannot satisfy stable weak |
| `weak` | 1+ | 2+ (total ≥3) | any | ≥ 2 | `weak` | `within_bounds` | 1 direct + 2 contextual |
| `weak` | 1+ | 3+ | any | 1 only | `insufficient` | `negative_gate:gate_eligible_temporal_buckets=1` | |
| `moderate` | 3+ | 3+ | 3+ | 2+ | `moderate` | — | negative gate N/A |

##### Assessment scale (confirmed)

Semantic definitions for each `trait_level` assigned by the engine:

| `trait_level` | Definition |
|---|---|
| **`insufficient`** | Not enough **reliable** public evidence to assess the trait. **Must NOT** be interpreted as weak or negative. **UI must use** § Profile Observability Layer v1 to distinguish sparse profile vs no trait-relevant evidence. |
| **`weak`** | Available evidence suggests **weak** expression of the trait and/or **meaningful contradictory** evidence. |
| **`moderate`** | Some **reliable positive** evidence exists, but consistency or breadth is **limited**. |
| **`strong`** | **Multiple reliable** and reasonably **consistent positive** signals exist. |
| **`very_strong`** | **Strong, repeated, cross-context or longitudinal** evidence supports the trait. |

##### Mild weighting v1 — trait maximums (confirmed)

Maximum **Core Traits** contribution = **5.0 points** (secondary ranking factor).

| `trait_id` | Trait maximum |
|---|---:|
| `consistency_resilience` | **1.5** |
| `responsibility_commitment` | **1.3** |
| `team_collaboration` | **1.2** |
| `sharing_influence` | **1.0** |
| **Total** | **5.0** |

##### Final Core Traits scoring v1 (confirmed)

End-to-end per trait:

```
1. quality-weighted mean  → raw_trait_level              (core_trait_quality_weighted_evidence_mean_v1)
2. positive gates       → highest-permitted fallback     (core_trait_positive_sufficiency_v1)
                          clamped_level (never upgrades raw)
3. negative weak gate   → effective_trait_level        (mean<0 + ≥3 gate-eligible contradictory + ≥2 buckets + ≥1 direct)
4. effective_trait_level → target_ratio                 (from effective — not raw)
5. confidence           → final_ratio                  (neutral anchoring — except insufficient)
6. final_trait_score = trait_max × final_ratio
7. core_traits_score = sum(four traits); cap 5.0   — full precision; § Core Traits Score Display Precision v1
```

**Target ratios:**

| `trait_level` | Target ratio |
|---|---:|
| `insufficient` | **0.50** |
| `weak` | **0.25** |
| `moderate` | **0.50** |
| `strong` | **0.75** |
| `very_strong` | **1.00** |

**Final scoring formula:**

```
final_ratio = 0.50 + confidence × (target_ratio − 0.50)
final_trait_score = trait_max × final_ratio
```

For **`insufficient`**: always **`final_ratio = 0.50`** — confidence does not apply.

**Trait maximums:** 1.5 / 1.3 / 1.2 / 1.0 → **total cap 5.0**.

**Audit:** Preserve **`evidence_mean`**, **`evidence_mean_numerator`**, **`evidence_mean_denominator`**, **`raw_trait_level`**, **`effective_trait_level`**, **`negative_signal_present`**, **`directional_evidence_event_count`**, **`gate_eligible_positive_event_count`**, **`gate_eligible_direct_positive_event_count`**, **`gate_eligible_contradictory_event_count`**, **`gate_eligible_direct_contradictory_event_count`**, neutral evidence events, **`positive_event_count`**, **`positive_temporal_buckets_covered`**, **`gate_eligible_positive_temporal_buckets_covered`**, **`contradictory_event_count`**, **`contradictory_temporal_bucket_count`**, **`gate_eligible_contradictory_temporal_bucket_count`**, **`gate_reason`**, evidence references, policy versions.

**UI:** Candidate-facing assessments use **`effective_trait_level`**. When negative gate fails: show **`insufficient`** — may note limited contradictory signals via **`negative_signal_present`**; **must not** show stable **`weak`** or fallback to **`moderate`** (§ Negative evidence gate failure behavior v1). When **`effective_trait_level = insufficient`**, **must** surface **`trait_observability_diagnosis`** (§ Profile Observability Layer v1) — low profile observability is **not** a negative trait signal.

##### Confidence adjustment — neutral anchoring (confirmed)

Confidence influences scoring through **neutral anchoring** — **not** direct score multiplication. See § Final Core Traits scoring v1 for full formula.

**For `insufficient`:** always **`final_ratio = 0.50`** — confidence does not apply.

**For assessable levels:**

```
final_ratio = 0.50 + confidence × (target_ratio − 0.50)
final_trait_score = trait_max × final_ratio
```

Where `confidence` is **0.0–1.0** from **`core_trait_confidence_v1`**.

| Behavior | |
|---|---|
| Low confidence | Pulls assessment **toward neutral (0.50)** |
| High confidence | Allows `trait_level` target to exert **greater** scoring influence |
| **`insufficient` vs `moderate`** | May yield **same numeric** score (`0.50`) but **must remain distinguishable** in storage/UI |
| **Negative gate failure** | `raw_trait_level = weak` + `effective_trait_level = insufficient` — **never** map to `moderate` because score equals moderate at low confidence |
| Forbidden | `target_score × confidence` |
| Forbidden | Converting `insufficient` → `moderate` because numeric score equals |
| Forbidden | Converting gated negative (`raw weak`, gate failed) → `moderate` |

**Example (`consistency_resilience`, max 1.5, `strong`, target 0.75):**

| `confidence` | `final_ratio` | `final_trait_score` |
|---:|---:|---:|
| 0.0 | 0.50 | 0.75 |
| 0.5 | 0.625 | 0.9375 |
| 1.0 | 0.75 | 1.125 |

##### `core_trait_confidence_v1` (confirmed)

Versioned policy ID: **`core_trait_confidence_v1`**

**Aggregate formula** (all components normalized **0.0–1.0**):

```
confidence =
  temporal_coverage          × 0.35 +
  contradiction_consistency  × 0.30 +
  cross_context_consistency  × 0.20 +
  evidence_volume            × 0.15
```

| Component | Weight |
|---|---:|
| `temporal_coverage` | **0.35** |
| `contradiction_consistency` | **0.30** |
| `cross_context_consistency` | **0.20** |
| `evidence_volume` | **0.15** |

| Rule | Behavior |
|---|---|
| Dedup | **Behavioral dedup before** all downstream engines (§ Behavioral Event Deduplication Policy v1) |
| Same behavioral event | Repeated / follow-up posts about same occurrence → **one** evidence event — not independent |
| Distinct stages | Materially different behavioral stages in same story → **separate** events allowed; optional shared `story_id` |
| Post frequency | High posting frequency alone **must not** produce high confidence |
| Audit | Preserve **each component score separately** |
| Version | Store **`confidence_policy_version`** (e.g. `core_trait_confidence_v1`) |
| Bounds | Final `confidence` **0.0–1.0** |
| Config | Weights/thresholds **configurable** in `radar_core_traits_confidence_config` for future calibration |

**`contradiction_consistency` direction:** same as other components — **1.0 = little/no reliable contradictory evidence**; **0.0 = strong contradictory evidence**.

##### Quality-weighted Evidence Volume v1 (confirmed)

Policy ID: **`core_trait_quality_weighted_evidence_volume_v1`**

**Replaces** raw directional event count for the **`evidence_volume`** Confidence component only.

**Formula:**

```
weighted_evidence_count = Σ quality_multiplier(directional events)
evidence_volume         = min(weighted_evidence_count / 4.0, 1.0)
```

**Quality multipliers** (same as mean — versioned in **`radar_core_trait_evidence_quality_config`**):

| `evidence_quality` | Multiplier |
|---|---:|
| **`direct`** | **1.00** |
| **`contextual`** | **0.75** |
| **`ambiguous`** | **0.25** |

**Examples:**

| Events | Weighted count | `evidence_volume` |
|---|---:|---:|
| 1 **`direct`** | 1.00 | **0.25** |
| 1 **`contextual`** | 0.75 | **0.1875** |
| 1 **`ambiguous`** | 0.25 | **0.0625** |
| 4 **`ambiguous`** | 1.00 | **0.25** |
| 4 **`contextual`** | 3.00 | **0.75** |
| 4 **`direct`** | 4.00 | **1.00** |

| Rule | Behavior |
|---|---|
| Input | **Validated, deduplicated, directional** evidence events only |
| `neutral` | **Does not contribute** |
| Saturation | **`evidence_volume`** saturates at **1.00** — weighted count **> 4.0** adds nothing to this component |
| Storage | Additional evidence **beyond weighted 4.0** remains stored — cannot increase **`evidence_volume`** |
| Scope | Modifies **`evidence_volume` component only** — temporal, cross-context unchanged; contradiction uses separate quality-aware policy |
| Gate eligibility | **Unchanged** — **`ambiguous`** still cannot unlock **`strong`**, **`very_strong`**, or stable **`weak`** gates |
| Audit | Preserve **`directional_evidence_event_count`** (raw) and **`weighted_evidence_count`** separately |
| Weight | Contributes **15%** of **`core_trait_confidence_v1`** |
| Config | Versioned in **`radar_core_traits_confidence_config`**; store **`evidence_volume_policy_version`** |

##### Evidence Volume Policy v1 (superseded)

~~Raw event-count saturating table (0→0, 1→0.25, … 4+→1.00)~~ — **replaced by** § Quality-weighted Evidence Volume v1.

##### Quality-gated Temporal Coverage v1 (confirmed)

Policy ID: **`core_trait_quality_gated_temporal_coverage_v1`**

**Temporal Coverage must only be unlocked by sufficiently reliable directional evidence.**

**Temporal-bucket eligible evidence quality:**

| `evidence_quality` | Temporal bucket eligibility |
|---|---|
| **`direct`** | **Eligible** |
| **`contextual`** | **Eligible** |
| **`ambiguous`** | **NOT eligible** |
| **`neutral`** | **NOT eligible** (non-directional) |

**90-day buckets** (by **evidence event timestamp**, not fetch time):

| Bucket | Range |
|---|---|
| `recent` | 0–30 days |
| `mid` | 31–60 days |
| `older` | 61–90 days |

**Mapping** — by **qualifying** (gate-eligible quality) buckets covered:

| Qualifying buckets covered | `temporal_coverage` |
|---:|---:|
| **0** | **0.00** |
| **1** | **0.40** |
| **2** | **0.70** |
| **3** | **1.00** |

```
qualifying_temporal_buckets =
  distinct buckets among directional events
  where evidence_quality in ("direct", "contextual")

temporal_coverage = map(count(qualifying_temporal_buckets))
```

| Rule | Behavior |
|---|---|
| Input | **Validated, deduplicated, directional** evidence events only |
| `ambiguous` | May still influence **Evidence Mean** and **weighted Evidence Volume** — **cannot** establish temporal stability |
| Per bucket | Multiple qualifying events in same bucket → **one** covered bucket |
| Per trait | Calculated **independently per Core Trait** |
| Window | Evidence **outside 90-day window** → **does not contribute** |
| Gate eligibility | Trait-level gates **unchanged** — this policy affects **Confidence `temporal_coverage` only** |
| Audit | Preserve **`temporal_buckets_covered`** (all directional) and **`qualifying_temporal_buckets_covered`** (direct/contextual) separately |
| Weight | Contributes **35%** of **`core_trait_confidence_v1`** |
| Config | Versioned in **`radar_core_traits_confidence_config`**; store **`temporal_coverage_policy_version`** |

##### Temporal Coverage Policy v1 (superseded)

~~Bucket mapping applied to all directional events regardless of quality~~ — **replaced by** § Quality-gated Temporal Coverage v1.

##### Cross-context Consistency Policy v1 (confirmed)

Uses a **fixed, versioned Context Taxonomy** — LLM **classifies** evidence events; engine **counts** distinct contexts deterministically. LLM **must not** directly output a cross-context consistency score.

**V1 context categories (`radar_core_trait_context_taxonomy`):**

| `context_id` | |
|---|---|
| `health_fitness` | |
| `work_career` | |
| `learning_growth` | |
| `relationships_social` | |
| `personal_goals` | |
| `team_community` | |

| Distinct valid contexts | `cross_context_consistency` |
|---:|---:|
| 0 | **0.00** |
| 1 | **0.40** |
| 2 | **0.70** |
| 3+ | **1.00** |

| Rule | Behavior |
|---|---|
| LLM role | Classify **validated evidence events** into taxonomy — not score consistency |
| Same context | Multiple events from **same context** → **do not** increase component |
| Split forbidden | One **`underlying_behavioral_event`** **must not** be artificially split to inflate contexts or counts — § Behavioral Event Deduplication Policy v1 |
| Multi-context events | If genuinely multi-context → preserve classifications; dedup at **evidence-event level** |
| Weight | Contributes **20%** of `core_trait_confidence_v1` |
| Audit | Store **context classifications** per evidence event |

##### Quality-aware Contradiction Consistency v1 (confirmed)

Policy ID: **`core_trait_quality_aware_contradiction_consistency_v1`**

**Contradiction Consistency must account for Evidence Quality** — **`evidence_strength`** and **`evidence_quality`** remain **separate dimensions** on each event.

**Contradiction impact hierarchy** (uses existing Evidence Quality taxonomy):

| `evidence_quality` | Contradiction impact |
|---|---|
| **`direct`** | **Strongest** — direct behavioral contradiction |
| **`contextual`** | **Reduced** — incomplete behavioral chain |
| **`ambiguous`** | **Weak** — slogans, vague self-description, unclear linkage |

**Quality impact multipliers** (same values as mean/volume — versioned in **`radar_core_trait_evidence_quality_config`**):

| `evidence_quality` | Multiplier |
|---|---:|
| **`direct`** | **1.00** |
| **`contextual`** | **0.75** |
| **`ambiguous`** | **0.25** |

**Per contradictory event** ( `contradictory` / `contradictory_strong` only):

```
contradiction_impact(event) = |base_evidence_value| × quality_multiplier
weighted_contradiction_profile = Σ contradiction_impact(contradictory events)
```

Engine derives **`contradiction_strength`** **deterministically** from the **quality-weighted contradictory profile** relative to overall directional evidence coverage and positive profile — then maps to **`contradiction_consistency`**.

| Rule | Behavior |
|---|---|
| Strong wording ≠ strong impact | **`contradictory_strong` wording alone** must **not** auto-create **`strong`** contradiction impact without **`direct`** quality |
| Behavior vs slogans | **Direct behavioral contradiction** must carry **substantially more weight** than vague self-description or slogans |
| Taxonomy | Apply **`direct` / `contextual` / `ambiguous`** consistently across all quality-aware engines |
| Separation | Preserve **`evidence_strength`** and **`evidence_quality`** separately — do not collapse |
| Missing evidence | **Never** interpret missing evidence as contradiction |
| Deterministic | Same events + same policy version → same `contradiction_strength` → same `contradiction_consistency` |
| Dedup | Duplicate/redundant contradictory posts about same **`underlying_behavioral_event`** → **one** evidence event (§ Behavioral Event Deduplication Policy v1) |
| Weight | Contributes **30%** of **`core_trait_confidence_v1`** |
| Audit | Preserve **`contradiction_strength`**, **`contradiction_consistency`**, per-event quality + strength, **`weighted_contradiction_profile`**, reason codes |
| Config | Versioned in **`radar_core_traits_confidence_config`**; store **`contradiction_consistency_policy_version`** |

##### Contradiction Consistency Policy v1 (confirmed)

**Do NOT** use simple positive-vs-negative evidence count ratio.

**`contradiction_strength`** is derived **deterministically** from **quality-weighted** contradictory evidence (`contradictory` / `contradictory_strong`) and overall evidence coverage — **not** LLM-assigned at trait level (§ Quality-aware Contradiction Consistency v1). Engine maps to `contradiction_consistency` (higher = **less** contradiction):

| `contradiction_strength` | `contradiction_consistency` | Definition |
|---|---:|---|
| `insufficient` | **0.50** | Not enough relevant evidence to reliably evaluate contradiction |
| `none` | **1.00** | Sufficient evidence; **no meaningful reliable** contradiction found |
| `weak` | **0.75** | Minor or ambiguous contradictory evidence |
| `moderate` | **0.50** | Meaningful contradiction materially challenges trait consistency |
| `strong` | **0.25** | Clear, direct, reliable contradiction substantially conflicts with positive assessment |

| Rule | Behavior |
|---|---|
| `none` inference | **Never** infer `none` merely from absence of observed contradiction when coverage is **insufficient** |
| Quality | **Quality-aware** — `direct` contradictory events dominate impact; `ambiguous` contributes weak impact only |
| Strong contradiction | One **`direct`** **`contradictory_strong`** event may outweigh several **`ambiguous`** **`contradictory`** events |
| Missing evidence | **Not** contradictory evidence |
| Dedup | Duplicate/redundant contradictory posts about same **`underlying_behavioral_event`** → **one** evidence event (§ Behavioral Event Deduplication Policy v1) |
| Weight | Contributes **30%** of `core_trait_confidence_v1` |
| Audit | Preserve contradiction evidence, **quality + strength separately**, **`weighted_contradiction_profile`**, reason codes |

**Planned modules:** `validate-trait-evidence.ts`, `compute-trait-confidence.ts`, `compute-profile-observability.ts`, `core-trait-context-taxonomy.ts`

##### Audit record (confirmed)

Persist **independently** on each trait score:

| Field | |
|---|---|
| `trait_level` | **`effective_trait_level`** for scoring/UI |
| `raw_trait_level` | Pre-gate level from `evidence_mean` |
| `evidence_mean` | Quality-weighted mean; null when denominator = 0; bounded **−2.0 … +2.0** |
| `evidence_mean_numerator` | **Σ(base × quality_multiplier)** over directional events |
| `evidence_mean_denominator` | **Σ(quality_multiplier)** over directional events |
| `directional_evidence_event_count` | Count of directional events (audit; **not** mean denominator) |
| `neutral_evidence_event_count` | Non-directional events — preserved, not scored |
| `gate_eligible_positive_event_count` | Positive events with `direct` / `contextual` quality — strong/very_strong gates |
| `gate_eligible_direct_positive_event_count` | Gate-eligible positive events with **`evidence_quality = direct`** — very_strong gate |
| `positive_event_count` | Total `positive` / `positive_strong` (all qualities) |
| `positive_temporal_buckets_covered` | Buckets among all positive events |
| `gate_eligible_positive_temporal_buckets_covered` | Buckets among gate-eligible positive events — very_strong gate |
| `contradictory_event_count` | Total contradictory events (all qualities) |
| `gate_eligible_contradictory_event_count` | Contradictory events with `direct` / `contextual` quality — weak gate |
| `gate_eligible_direct_contradictory_event_count` | Gate-eligible contradictory with **`evidence_quality = direct`** — weak gate |
| `contradictory_temporal_bucket_count` | Buckets among all contradictory events |
| `gate_eligible_contradictory_temporal_bucket_count` | Buckets among gate-eligible contradictory events |
| `negative_signal_present` | `true` when contradictory evidence exists but effective ≠ `weak` (gate failure) |
| `gate_reason` | e.g. `positive_gate:fallback_to_strong`, `negative_gate:direct_required=0`, `within_bounds` |
| `confidence` | 0.0–1.0 + component breakdown |
| `weighted_evidence_count` | **Σ(quality_multiplier)** — `evidence_volume` input |
| `temporal_buckets_covered` | Buckets among **all directional** events — audit |
| `qualifying_temporal_buckets_covered` | Buckets among **`direct`/`contextual`** directional events — `temporal_coverage` input |
| Evidence events | All validated events — per-event strength, quality, **base / multiplier / effective** values, context, timestamp, reasoning |
| `qualifying_temporal_buckets_covered` | Buckets among **`direct`/`contextual`** directional events — `temporal_coverage` input |
| `weighted_contradiction_profile` | **Σ \|base\| × quality_multiplier** over contradictory events — contradiction input |
| `contradiction_strength` | Engine-derived quality-aware profile → mapped band |
| `contradiction_consistency_policy_version` | e.g. `core_trait_quality_aware_contradiction_consistency_v1` |

```typescript
type TraitLevel =
  | "insufficient"
  | "weak"
  | "moderate"
  | "strong"
  | "very_strong";

type EvidenceStrength =
  | "positive_strong"
  | "positive"
  | "neutral"
  | "contradictory"
  | "contradictory_strong";

// Base values — Trait Level input before quality multiplier
const EVIDENCE_STRENGTH_BASE: Record<EvidenceStrength, number> = {
  positive_strong: 2,
  positive: 1,
  neutral: 0,
  contradictory: -1,
  contradictory_strong: -2,
};

const EVIDENCE_QUALITY_MULTIPLIER_V1: Record<EvidenceQuality, number> = {
  direct: 1.0,
  contextual: 0.75,
  ambiguous: 0.25,
};

// Per event: effective_evidence_value = base × multiplier (numerator contribution)
// evidence_mean = sum(effective_evidence_value) / sum(quality_multiplier)

type ContextCategoryId =
  | "health_fitness"
  | "work_career"
  | "learning_growth"
  | "relationships_social"
  | "personal_goals"
  | "team_community";

type ContradictionStrength =
  | "insufficient"
  | "none"
  | "weak"
  | "moderate"
  | "strong";

type CoreTraitConfidenceComponents = {
  evidence_volume: number;              // 0.0–1.0
  temporal_coverage: number;            // 0.0–1.0
  cross_context_consistency: number;    // 0.0–1.0
  contradiction_consistency: number;    // 0.0–1.0; 1.0 = little/no contradiction
};

type CoreTraitConfidenceAudit = {
  confidence_policy_version: string;    // "core_trait_confidence_v1"
  raw_evidence_count: number;
  deduplicated_evidence_event_count: number;   // all strengths including neutral
  directional_evidence_event_count: number;    // raw directional count — audit only
  weighted_evidence_count: number;             // Σ quality_multiplier — evidence_volume input
  evidence_volume_policy_version: string;     // "core_trait_quality_weighted_evidence_volume_v1"
  temporal_buckets_covered: ("recent" | "mid" | "older")[];           // all directional — audit
  qualifying_temporal_buckets_covered: ("recent" | "mid" | "older")[]; // direct/contextual — temporal_coverage input
  temporal_coverage_policy_version: string;  // "core_trait_quality_gated_temporal_coverage_v1"
  weighted_contradiction_profile: number;    // Σ |base| × quality_multiplier — contradictory events
  contradiction_consistency_policy_version: string;
  distinct_contexts: ContextCategoryId[];
  contradiction_strength: ContradictionStrength;
};

type EvidenceQuality =
  | "direct"       // concrete behavior/event clearly attributable
  | "contextual"   // reasonable context; incomplete behavioral chain
  | "ambiguous";   // generic/slogan/vague/weak behavioral linkage

type TraitEvidenceEvent = {
  event_id: string;                          // underlying_behavioral_event — dedup + cross-trait auditable
  story_id?: string;                         // optional broader narrative grouping — not a dedup key
  episode_id?: string;                       // optional sub-arc within story — not a dedup key
  evidence_ref: string;
  event_timestamp: string;
  context_categories: ContextCategoryId[];
  evidence_strength: EvidenceStrength;
  evidence_quality: EvidenceQuality;
  base_evidence_value: number;               // from EVIDENCE_STRENGTH_BASE
  quality_multiplier: number;                // from EVIDENCE_QUALITY_MULTIPLIER_V1
  effective_evidence_value: number;          // base × multiplier — numerator contribution
  gate_eligible: boolean;                    // direct | contextual — sufficiency gate input
  behavioral_deduplication_policy_version: string;  // core_trait_behavioral_event_deduplication_v1
  strength_reasoning: string;
  quality_reasoning: string;
  evidence_quality_policy_version: string;
  evidence_mean_policy_version: string;    // core_trait_quality_weighted_evidence_mean_v1
};

type CoreTraitScoreBreakdown = {
  trait_id: CoreTraitId;
  trait_max: number;
  raw_trait_level: TraitLevel;
  effective_trait_level: TraitLevel;    // post gate — scoring + UI
  trait_level_config_version: string;   // includes threshold + gate policies
  evidence_mean: number | null;           // null when denominator = 0
  evidence_mean_numerator: number;
  evidence_mean_denominator: number;
  evidence_mean_policy_version: string;
  directional_evidence_event_count: number;
  neutral_evidence_event_count: number;
  positive_event_count: number;
  gate_eligible_positive_event_count: number;
  gate_eligible_direct_positive_event_count: number;
  positive_temporal_buckets_covered: ("recent" | "mid" | "older")[];
  gate_eligible_positive_temporal_buckets_covered: ("recent" | "mid" | "older")[];
  contradictory_event_count: number;
  gate_eligible_contradictory_event_count: number;
  gate_eligible_direct_contradictory_event_count: number;
  contradictory_temporal_bucket_count: number;
  gate_eligible_contradictory_temporal_bucket_count: number;
  contradictory_temporal_buckets_covered: ("recent" | "mid" | "older")[];
  negative_signal_present: boolean;
  gate_reason: string;
  target_ratio: number;                 // from effective_trait_level
  confidence: number;
  confidence_components: CoreTraitConfidenceComponents;
  confidence_audit: CoreTraitConfidenceAudit;
  evidence_events: TraitEvidenceEvent[]; // classified events used
  final_ratio: number;
  final_trait_score: number;
  scoring_config_version: string;
};

type CoreTraitsScoreResult = {
  trait_scores: CoreTraitScoreBreakdown[];
  core_traits_score: number;       // canonical — full precision; sum ≤ 5.0; ranking input
  profile_observability: ProfileObservabilityAudit;
  trait_observability: TraitObservability[];  // one per CoreTraitId
  // display: UI rounds total to 1 decimal only — never persisted as canonical
};
```

##### Profile Observability Layer v1 (confirmed)

Policy ID: **`core_trait_profile_observability_v1`**

A **separate diagnostic layer** in Core Traits analysis — distinguishes **observation opportunity** from **trait assessment outcome**.

**Purpose — two distinct situations:**

| Situation | Meaning |
|---|---|
| **A — Trait evidence absence** | **Sufficient** public content exists, but **little/no evidence** was found for a **specific** Core Trait |
| **B — Profile observation limited** | The Candidate's **overall** public content is **too sparse** to provide a meaningful observation opportunity |

```
Public content corpus (90d target)
    → Profile Observability Engine (candidate-level metrics + level)
    → … trait engines (level + confidence) …
    → Profile Observability Diagnosis (per-trait — combines A vs B)
    → UI reliability indicator (optional warning — no score change)
```

**Hard boundaries:**

| Rule | Behavior |
|---|---|
| **No score impact** | **`profile_observability` must NOT** directly add or subtract **Recommendation Score** or **`core_traits_score`** |
| **Separate from `trait_level`** | Observability is **not** a trait level; **`insufficient`** remains the assessment outcome when evidence is lacking |
| **Separate from `confidence`** | Observability measures **whether observation was possible** — confidence measures **trust in the assessed conclusion** |
| **Not negative signal** | **Low observability must NOT** be interpreted as a **negative Candidate trait** |
| **Analysis quality only** | **`profile_observability`** is metadata about **analysis quality** — **NOT Candidate quality** |
| **UI allowed** | Candidate UI **may** display an **observability warning** or **reliability indicator** — **categorical level only** (§ Profile Observability Scale v1) |
| **Audit** | Preserve **underlying observability metrics** for audit/debugging |
| **Versioning** | Policy **must be versioned** in **`radar_core_trait_observability_config`** |

**Relationship to `data_completeness`:**

| Layer | Scope | Question answered |
|---|---|---|
| **`data_completeness`** (`full` \| `partial`) | Candidate fetch / pipeline | Did we retrieve all targeted platform data? |
| **`profile_observability`** | Core Traits analysis | From what we **did** retrieve, was there enough **observable public surface** to assess traits meaningfully? |

Partial fetch **may reduce** profile observability — but the layers remain **independent** and both must be stored.

##### Profile Observability Scale v1 (confirmed)

Policy ID: **`core_trait_profile_observability_scale_v1`**

**Three categorical levels only:**

| `profile_observability_level` | `analyzable_item_count` (90d) | Meaning |
|---|---|---|
| **`low`** | **0 – 9** | Too little analyzable Candidate-originated content for meaningful trait observation |
| **`medium`** | **10 – 29** | Some analyzable surface — trait assessment may be partial or trait-specific |
| **`high`** | **30+** | Substantial analyzable surface — meaningful observation opportunity across traits |

| Rule | Behavior |
|---|---|
| **Candidate UI** | Expose **`low` \| `medium` \| `high` only** — **must NOT** show a pseudo-precise **0–100** (or 0.0–1.0) observability score |
| **Audit / debug** | Underlying numeric metrics **may** be preserved internally — **not** member-facing |
| **Content basis** | Count only **analyzable Candidate-originated** public content within the **active analysis window** (~90d target) |
| **Inflation forbidden** | **Reposts**, **duplicates**, **empty shares**, and content **without meaningful Candidate expression** **must NOT** artificially increase observability |
| **Not Candidate quality** | Observability describes **how much we could observe** — **not** how good the Candidate is |
| **No score impact** | **`profile_observability` must NEVER** directly affect **Recommendation Score** or **`core_traits_score`** |
| **Thresholds** | § Profile Observability Thresholds v1 — **`analyzable_item_count`** drives level |
| **Config** | Stored in **`radar_core_trait_observability_config`** — versioned with scale + thresholds policies |

##### Profile Observability Thresholds v1 (confirmed)

Policy ID: **`core_trait_profile_observability_thresholds_v1`**

Based on **analyzable Candidate-originated** public content within the **active 90-day analysis window**:

| `analyzable_item_count` | `profile_observability_level` |
|---:|---|
| **0 – 9** | **`low`** |
| **10 – 29** | **`medium`** |
| **30+** | **`high`** |

```
analyzable_item_count = count of meaningful analyzable Candidate-originated items
                        after exclusions/dedup (below)
                        within active 90-day window

profile_observability_level =
  analyzable_item_count <= 9   → low
  analyzable_item_count <= 29  → medium
  analyzable_item_count >= 30  → high
```

| Rule | Behavior |
|---|---|
| **Count unit** | **Meaningful analyzable Candidate-originated content items** — **not** raw post volume |
| **Window** | Active **90-day** analysis window only |
| **Score forbidden** | Observability remains **analysis-quality metadata** — **must NOT** directly modify **Recommendation Score** |

**Exclude or deduplicate before counting:**

| Exclusion | Behavior |
|---|---|
| **Pure reposts** | Excluded — not Candidate-originated expression |
| **Duplicate content** | Deduplicated — same underlying content counts **once** |
| **Empty shares** | Excluded — no meaningful expression |
| **No meaningful Candidate expression** | Excluded — stubs, link-only, generic reshares without added voice |
| **Unreliable attribution** | Excluded — content that **cannot reliably be attributed** to the Candidate |

| Rule | Behavior |
|---|---|
| Primary metric | **`analyzable_item_count`** — sole driver of **`profile_observability_level`** in v1 |
| Supporting metrics | **`observation_window_days_covered`**, **`distinct_active_days`**, exclusion counts — **audit/debug only** |
| UI | Expose **`low` / `medium` / `high` only** — **not** raw count or pseudo-score unless debug/leader audit view |
| Config | Threshold bands versioned in **`radar_core_trait_observability_config`** |

**Candidate-level output** — computed from **analyzable Candidate-originated** public content before trait scoring:

| Field | Purpose |
|---|---|
| **`profile_observability_level`** | **`low` \| `medium` \| `high`** — member-facing categorical level |
| **`profile_observability_metrics`** | Underlying raw metrics — audit/debug only; **`analyzable_item_count`** drives level |

**Audit metrics** (supporting — **not** alternate level drivers in v1):

| Metric | Role |
|---|---|
| **`analyzable_item_count`** | **Primary** — meaningful analyzable Candidate-originated items after exclusions/dedup |
| `observation_window_days_covered` | Days spanned by analyzable content within 90d window — audit |
| `distinct_active_days` | Days with at least one analyzable item — audit |
| `excluded_repost_count` | Pure reposts excluded — inflation guard audit |
| `excluded_duplicate_count` | Duplicates collapsed — inflation guard audit |
| `excluded_empty_share_count` | Empty shares excluded — inflation guard audit |
| `excluded_no_expression_count` | No meaningful Candidate expression — inflation guard audit |
| `excluded_unattributable_count` | Cannot reliably attribute to Candidate — inflation guard audit |

**Per-trait diagnosis** — computed **after** Trait Level + Confidence engines:

| `trait_observability_diagnosis` | When |
|---|---|
| **`insufficient_observation_opportunity`** | **`profile_observability_level = low`** — profile too sparse for meaningful trait observation (situation **B**) |
| **`no_relevant_evidence_found`** | Profile **`medium`** or **`high`**, but **`effective_trait_level = insufficient`** — observation existed; no reliable trait evidence found (situation **A**) |
| **`assessed`** | Profile **`medium`** or **`high`**, and **`effective_trait_level ≠ insufficient`** — trait was assessable from available content |
| **`observation_limited_assessed`** | Profile **`low`**, but trait reached a **non-insufficient** level — rare; preserve for audit; UI may still show profile-level reliability warning |

| Rule | Behavior |
|---|---|
| Diagnosis input | **`profile_observability_level`** + **`effective_trait_level`** — **not** `confidence` |
| Scoring forbidden | Diagnosis **must not** modify **`final_ratio`**, **`target_ratio`**, or **`core_traits_score`** |
| UI copy | Situation **A** ≠ situation **B** — different member-facing explanations |
| Leader view | May surface aggregate observability patterns — **not** as trait weakness |

```typescript
type ProfileObservabilityLevel = "low" | "medium" | "high";

type ProfileObservabilityMetrics = {
  analyzable_item_count: number;              // primary — drives profile_observability_level
  observation_window_days_covered: number;
  distinct_active_days: number;
  excluded_repost_count: number;
  excluded_duplicate_count: number;
  excluded_empty_share_count: number;
  excluded_no_expression_count: number;
  excluded_unattributable_count: number;
  // extensible — audit/debug only; internal
};

type ProfileObservabilityAudit = {
  profile_observability_policy_version: string;      // core_trait_profile_observability_v1
  profile_observability_scale_version: string;       // core_trait_profile_observability_scale_v1
  profile_observability_thresholds_version: string;  // core_trait_profile_observability_thresholds_v1
  profile_observability_level: ProfileObservabilityLevel;  // low | medium | high — UI-facing
  metrics: ProfileObservabilityMetrics;
  data_completeness: "full" | "partial";
};

type TraitObservabilityDiagnosis =
  | "insufficient_observation_opportunity"   // situation B
  | "no_relevant_evidence_found"             // situation A
  | "assessed"
  | "observation_limited_assessed";

type TraitObservability = {
  trait_id: CoreTraitId;
  trait_observability_diagnosis: TraitObservabilityDiagnosis;
  profile_observability_level: ProfileObservabilityLevel;  // snapshot at diagnosis time
};
```

| Rule | Behavior |
|---|---|
| Engine | **`compute-profile-observability.ts`** — candidate metrics early; per-trait diagnosis after trait engines |
| Forbidden | Using observability to downgrade/upgrade **`trait_level`**, **`confidence`**, or Recommendation Score |
| Config | **`core_trait_profile_observability_thresholds_v1`** bands + inflation exclusions in **`radar_core_trait_observability_config`** |
| Audit | Persist **`ProfileObservabilityAudit`** + per-trait **`TraitObservability`** alongside **`CoreTraitsScoreResult`** |

##### Supporting signals (confirmed)

Analysis may reference **supporting signals** that help interpret public evidence for the four Core Traits:

| Supporting signal | Role |
|---|---|
| `autonomy` | Evidence input only |
| `growth_orientation` | Evidence input only |
| `interpersonal_connectivity` | Evidence input only |
| `communication_ability` | Evidence input only |
| `learning_speed` | Evidence input only |
| `problem_solving_orientation` | Evidence input only |

| Rule | Behavior |
|---|---|
| Purpose | May **support** inference toward one or more of the four Core Traits |
| Scoring | **Must NOT** become independent Core Trait points |
| Eligibility | Counts only when it provides evidence **for** a confirmed Core Trait |
| Forbidden | Adding a 5th–10th scored trait or parallel point bucket for supporting signals |

##### Analysis Engine output (structured — not points)

For **each** of the four traits, Analysis Engine (LLM) extracts and classifies **evidence events** — **not** `trait_level`, confidence %, or points:

```typescript
type CoreTraitId =
  | "consistency_resilience"
  | "responsibility_commitment"
  | "team_collaboration"
  | "sharing_influence";

type SupportingSignalId =
  | "autonomy"
  | "growth_orientation"
  | "interpersonal_connectivity"
  | "communication_ability"
  | "learning_speed"
  | "problem_solving_orientation";

type CoreTraitEvidenceExtraction = {
  trait_id: CoreTraitId;
  evidence_events: TraitEvidenceEvent[];  // pre-dedup extraction; validated downstream
  supporting_signals_used: SupportingSignalId[];
  // trait_level, confidence, points — computed downstream
};

type CoreTraitsAnalysis = {
  traits: CoreTraitEvidenceExtraction[];  // exactly four — one per CoreTraitId
  analysis_schema_version: string;
};
```

| Rule | Behavior |
|---|---|
| LLM output | **Evidence events** with **`event_id`**, optional **`story_id`** / **`episode_id`**, **`evidence_strength`**, **`evidence_quality`**, context, timestamp, strength + quality reasoning |
| Forbidden | Direct `trait_level`, confidence %, Recommendation Score points, same-trait event splitting, topic-only dedup, or member-facing collapsed strength×quality score |
| Downstream | Behavioral dedup (§ Behavioral Event Deduplication Policy v1) → validate/dedup within trait (§ Cross-Trait Evidence Reuse Policy v1) → Trait Level Engine → Confidence Engine → Scoring Engine |

##### Scoring Engine conversion (deterministic)

Scoring Engine reads **`effective_trait_level`** + **`confidence`** (`core_trait_confidence_v1`) + **`radar_core_traits_scoring_config`**, applies neutral-anchored formula per trait, sums to **`core_traits_score` (≤ 5.0)**.

| Requirement | |
|---|---|
| Trait level | Use **`effective_trait_level`** post gate — not `raw_trait_level` |
| Formula | `final_ratio = 0.50 + confidence × (target_ratio − 0.50)` for assessable levels; `insufficient` fixed at **0.50** |
| Per-trait caps | **1.5 + 1.3 + 1.2 + 1.0 = 5.0** |
| Semantics | Preserve **`raw_trait_level`** vs **`effective_trait_level`** + **`gate_reason`** + **`negative_signal_present`**; gated negative → `insufficient`, never `moderate`; evidence retained for Confidence Engine + future 90d windows |
| Forbidden | `target_score × confidence` |
| Audit | Full `CoreTraitScoreBreakdown` + confidence component breakdown |
| Secondary role | Must not override Change Window, Needs/Fit, Contactability |
| Display precision | § Core Traits Score Display Precision v1 — full precision canonical; UI rounds total to 1 decimal |

##### Core Traits Score Display Precision v1 (confirmed)

Policy ID: **`core_trait_score_display_precision_v1`**

| Layer | Precision |
|---|---|
| **Engine / storage** | Store and calculate **`core_traits_score`** and per-trait **`final_trait_score`** using **full precision** |
| **Canonical score** | **`core_traits_score`** (unrounded) — **sole** persisted and ranking input |
| **Candidate UI** | Display **total** Core Traits score rounded to **1 decimal place** |
| **Ranking / sorting** | **Always** use the **unrounded internal** **`core_traits_score`** — never the display-rounded value |

**Example:**

```
internal:  core_traits_score = 3.684375
UI:        3.7 / 5
ranking:   3.684375
```

| Rule | Behavior |
|---|---|
| **No rounded persistence** | **Do not** persist the rounded display value as the **canonical** score |
| **Per-trait scores** | Per-trait **`final_trait_score`** also stored at **full precision** — display rules for individual traits **TBD** in UI spec |
| **Baseline total** | Rounded Core Traits display contributes to baseline UI total formatting (§11.1.3 baseline **one decimal** UI) — underlying component remains full precision |
| **Top20 / Rank** | Member Top20 and all sort keys use **unrounded** component + total scores |
| **Audit** | Persist full-precision values in score breakdown records |
| **Config** | Versioned in **`radar_core_traits_scoring_config`** |

**Planned modules:** `compute-core-traits-score.ts`, `compute-trait-confidence.ts`, `compute-profile-observability.ts`, `core-trait-taxonomy.ts`

#### Other Public Signals — **removed from Scoring Engine v1**

Legacy 10 pt bucket superseded by structured **Change Window**, **Needs/Fit**, and **Contactability**. Non-scored advisory signals may still appear in Candidate intelligence UI.

#### Partial data interaction

- Partial snapshots may reduce **analysis confidence** for affected components.
- Whether partial data **caps or penalizes** component scores — **still TBD** (§12.D).

### 11.1.7 AI Extraction Schema v1 (confirmed — implemented)

**Implementation:** `src/lib/radar/extraction/` — Zod schema + `validateAiRadarExtraction()` + `mapExtractionToScoringInput()`

| Boundary | Behavior |
|---|---|
| AI **may** | Classify levels with `availability`, extract evidence events, cite `source_refs`, advisory copy |
| AI **must not** | Output scores, `trait_level`, `confidence`, `suggested_opening`, or bypass gates |
| Location | AI extracts coarse signals only — **`resolveLocationLevel()`** computes level per Candidate × Member |
| Observability | **`analyzable_items`** from Content Normalization Layer — **removed from LLM extraction** |
| Fit Policy | Envelope-level **`fit_policy_version`** — one policy per analysis run |
| Activity / Observability | **Pipeline-owned** — `assembleAnalysisScoringInput()` injects activity + observability |
| `none` vs `unknown` | `none` only when `availability: available` + sufficient reviewed content; `unknown`/`partial` **must not** carry `level` |
| Opening message | **Removed** from extraction — generated later by Opening Generation workflow on 「我要開發」 |
| Natural Entry extras | Optional **`topic`** / **`entry_context`** for Opening Generation — not scored |

**Pipeline:**

```
Platform Adapters → Raw Snapshots → normalizeCandidateContent()
    → validateAiRadarExtraction(extraction, { corpus })
    → assembleAnalysisScoringInput(extraction, { corpus })
    → computeOverallScore()
```

**Modules:** `schema.ts`, `validate-ai-radar-extraction.ts`, `map-extraction-to-scoring-input.ts`, `assemble-analysis-scoring-input.ts`, `resolve-location.ts`

### 11.1.9 Content Normalization Layer v1 (confirmed — implemented)

**Implementation:** `src/lib/radar/normalization/` — deterministic content normalization before AI extraction.

| Rule | Behavior |
|---|---|
| Policy ID | `content_normalization_v1` |
| Activity | `last_meaningful_activity_at` derived deterministically — **not** from LLM |
| Observability | `analyzable_items` + `data_completeness` injected by pipeline |
| Partial semantics | `observed_level` with `partial` = observed-in-fetched-data only — not Candidate quality |
| 90-day window | Query-time filter — **no** `outside_analysis_window` intrinsic exclusion |
| V1 dedup | `exact`, `cross_platform`, `repost`, **`near_duplicate`** (≥0.95 text similarity) |
| Story content | **Excluded** in V1 |
| OCR | **Not** in V1 |
| Quote rule | Preserve quoted context; Needs/Traits/Change Window evidence uses **`candidate_commentary_text` only** |
| Source trace | `source_ref.content_id` = `normalized_content_id` → `external_content_id` → `raw_snapshot_id` |

### 11.1.8 Fit Policy v1 (confirmed — implemented)

**Implementation:** `src/lib/radar/fit-policy/` — need taxonomy + relevance ceiling validation wired into extraction validation.

| Rule | Behavior |
|---|---|
| Policy Ceiling | `adjacent` default → max `adjacent`; `high_fit` ceiling → max `high_fit` |
| Evidence Exception | `relevant` default may upgrade to `high_fit` only with `relevance_evidence_quality: direct` |
| Umbrella exclusion | `personal_growth_life_change` forbidden in scored `needs[]` when a specific need exists — use `advisory.umbrella_need_tags` |
| Need vs Change Window | Need Strength does **not** require search/compare/try/action — those belong to Behavioral Change / Solution Gap |
| `health_management` | Candidate-stated wellness goals only — no inferred disease/diagnosis |

**Org defaults (v1):**

| `need_type` | default | ceiling |
|---|---|---|
| `body_composition_change` | high_fit | high_fit |
| `weight_fat_management` | high_fit | high_fit |
| `muscle_fitness_performance` | relevant | high_fit |
| `health_management` | relevant | high_fit |
| `nutrition_lifestyle` | high_fit | high_fit |
| `income_pressure` | adjacent | adjacent |
| `supplemental_income` | high_fit | high_fit |
| `career_dissatisfaction` | adjacent | adjacent |
| `entrepreneurship_autonomy` | relevant | high_fit |
| `personal_growth_life_change` (umbrella) | adjacent | adjacent |

**Example guardrails:**

- `income_pressure` from 「缺錢」 stays `adjacent` — use `supplemental_income` when Candidate explicitly seeks extra income
- Candidate wants fat loss but has taken no action → Need Strength = `strong`, Behavioral Change = `none`

---

### 11.1.4 Personal Learning layer (confirmed)

Personal Learning has **no separate fixed point allocation** on the 100-point scale. It adjusts **factor weights** applied to baseline component scores.

#### Activation threshold

| State | Condition | Behavior |
|---|---|---|
| **Inactive** | `success_count + failure_count < 20` | **100% Baseline Scoring**; store outcomes for future training; **do not** modify personalized weights |
| **Active** | `success_count + failure_count ≥ 20` | Personal Learning **begins gradually** — no abrupt replacement of baseline weights |

Eligible sample count = **`success` + `failure` only** (see §11.1.5).

#### ±20% relative guardrail (confirmed)

Each factor's personalized weight may deviate at most **±20% relative** to that factor's baseline weight (baseline points = baseline weight when total = 100):

| Factor | Baseline pts | Allowed personalized range |
|---|---:|---|
| Change Window | 40 | **32 – 48** |
| Needs / Fit | 25 | **20 – 30** |
| Contactability | 20 | **16 – 24** |
| Core Traits | 5 | **4 – 6** |
| Activity | 5 | **4 – 6** |
| Location | 5 | **4 – 6** |

**Rules:**

- After adjustments, **normalize** the personalized weight vector to **total 100%**.
- Learning **must never exceed** these bounds — even if outcomes suggest larger shifts.
- `learning_strength` ramps gradually from activation; bounds are hard caps.

#### Audit fields (required on profile + score records)

| Field | Purpose |
|---|---|
| `baseline_version` | Which baseline config was used |
| `personalized_weights` | Final weight vector after learning + normalization |
| `eligible_sample_count` | `success_count + failure_count` at train time |
| `learning_strength` | Current ramp / influence level (0–1 when active) |
| `last_trained_at` | Last learning update timestamp |
| `learning_profile_version` | Versioned profile for replay/audit |

#### Core principles

| Principle | Rule |
|---|---|
| Role | Personalization layer over baseline — adjusts **factor influence** |
| Gradual | From outcome #20 onward, increase influence smoothly |
| Isolation | **Only that member's** eligible outcomes; never cross-member signals |
| Explainability | Traceable factor shifts |
| Versioning | Profile + baseline versioned |
| LLM | **Never** generates final recommendation score |
| Recency decay | **Medium** — ~6 months prioritized; gradual influence decay (§12.3); curve **TBD** |

**Conceptual flow:**

```
baseline_components → baseline_score (0–100)
personalized_weights = apply_learning(baseline_weights, member_learning_profile)  // ±20% + normalize
final_score = score_with_weights(baseline_components, personalized_weights)
// persist: baseline breakdown + weight deltas + audit fields
```

Learning update formula (how outcomes shift weights within guardrail) — **TBD** (§13.D).

---

### 11.1.5 Eligible learning outcomes (confirmed)

| Outcome | Learning sample? | Signal |
|---|---|---|
| **`success`** | **Yes** | Positive |
| **`failure`** | **Yes** | Negative (failure-aware — §11.1.6) |
| **`already_know`** | **No** | Lifecycle/analytics only |
| **`give_up`** | **No** | Lifecycle/analytics only |

**Activation:** `success_count + failure_count >= 20`.

`already_know` and `give_up` remain in development history and Leader Aggregate metrics but **must not** modify personalized scoring weights.

---

### 11.1.6 Failure-aware learning (confirmed)

`failure` is **not** a uniform negative signal.

Personal Learning uses **`failure_reason_code`** to determine:

| Question | Driven by code |
|---|---|
| Is failure attributable to **candidate selection / AI analysis**? | Reason category |
| Which **scoring factor** does this failure inform? | Reason → factor mapping |
| Should this failure affect learning **at all**? | Reason category |

**Rules:**

- **Member-execution failures** (e.g. no follow-up, no time to develop) → **must not** auto-penalize candidate-related scoring factors.
- **Candidate-related failures** → may update the corresponding factor learning signal.
- Store **raw outcome** and **`failure_reason_code`** separately from optional free text so learning logic can be **versioned/changed** later.

See §11.2 for UX taxonomy structure.

---

### 11.2 Failure reason UX (confirmed)

V1 uses a **compact** taxonomy — not 15–20 visible options.

| Rule | Spec |
|---|---|
| Fixed options | **6–8** selectable reasons |
| Other | **`other`** code + optional **free-text** explanation |
| Storage | Structured **`failure_reason_code`** separate from optional `failure_reason_text` |
| Learning relevance | Each code tagged **`candidate_related`** \| **`member_execution`** \| **`neutral`** (or equivalent) — only relevant codes affect Personal Learning |

**Taxonomy codes (product-defined — TBD):** enumerate 6–8 fixed codes in `docs/BUSINESS_RULES.md` or Radar scoring spec before implementation.

---

### 11.3 AI Provider architecture (confirmed)

Radar domain logic **must not** directly depend on OpenAI, Google, Anthropic, or any specific model SDK.

**Structure:**

```
Analysis Engine → AI Provider Interface → Provider Implementation(s)
```

**Interface minimum capabilities:**

| Capability | Notes |
|---|---|
| Structured candidate analysis | Domain prompt in, schema-validated JSON out |
| Structured JSON output | Schema version enforced |
| Model/version identification | Returned on every call |
| Token/cost metadata | For audit and benchmark |
| Retry/error handling | Transient failures; no silent fallback to guessed analysis |

**Persist per analysis run:**

| Field | |
|---|---|
| `provider` | e.g. `openai`, `anthropic` (implementation label) |
| `model` | Model id used |
| `prompt_version` | |
| `analysis_schema_version` | |
| `created_at` | |

**Switching providers** must not require rewriting scoring, ranking, lifecycle, or learning logic.

**Production model:** **Not selected yet** — chosen after benchmark (§11.4).

**Planned path:** `src/lib/radar/ai/provider-interface.ts`, `src/lib/radar/ai/providers/`.

---

### 11.4 AI model selection & benchmark v1 (confirmed)

Do **not** hard-code the production model. Select V1 primary model from **benchmark results**.

#### Benchmark framework (before production model selection)

Run the **same** candidate dataset + **same** Analysis Schema / prompt version against **multiple** providers/models.

**Evaluate at minimum:**

| Metric | |
|---|---|
| Change Motivation accuracy | vs human labels |
| Needs identification accuracy | |
| Core Traits assessment quality | |
| Structured output reliability | schema pass rate |
| Hallucination / unsupported inference rate | |
| Consistency across repeated runs | |
| Latency | |
| Token usage | |
| Estimated cost per candidate | |

Optimize for **AI Radar task performance**, not model brand.

**Keep benchmark tooling separate** from production scoring logic (`src/lib/radar/benchmark/`).

#### Benchmark v1 dataset (confirmed)

| Rule | Spec |
|---|---|
| Dataset size | **50 candidates** |
| Same dataset | Identical across all models tested |
| Same schema/prompt | Locked `analysis_schema_version` + `prompt_version` |
| Ground truth | **Human-reviewed labels** — never one model's output as truth for another |
| Privacy | De-identify candidates where required |
| Retention | Preserve **each model's raw output** for later comparison |
| Comparison | Side-by-side accuracy, unsupported inference, consistency, latency, tokens, cost |
| Gate | **Do not select production model** until results reviewed |

---

## 12. Data lifecycle & retention (confirmed)

**Strategy:** **Tiered retention** — no single global TTL for all AI Radar data.

All durations below are **defaults / architecture**; actual values live in **`radar_retention_policies`** (configurable). Design **deletion and anonymization paths** so policy can evolve without schema redesign.

### 12.1 Retention tiers (by data class)

| Data class | Default policy (confirmed where noted) | Notes |
|---|---|---|
| **Raw public content snapshots** | **90 days** (§12.2) | Scheduled purge job |
| **Normalized public content** | Configurable | Separate from raw |
| **AI analysis results** | Configurable | Survive raw snapshot expiry |
| **Score / ranking history** | Tiered compaction (§12.4) | Daily → weekly → monthly |
| **Recommendation history** | **Long-term** (§12.6) | Independent of raw TTL |
| **Success / Failure / development history** | **Long-term** (§12.5) | Not deleted when raw expires |
| **Personal Learning data** | **Long-term** + recency decay (§12.3) | Outcomes retained; influence decays |
| **Source / API audit logs** | Configurable | Ops/compliance |

**Invariant:** Expiring raw public content **must not** delete derived analysis, recommendation history, development outcomes, or Personal Learning records.

### 12.2 Raw public content retention (confirmed)

| Rule | Spec |
|---|---|
| TTL | **90 days** for raw Threads/Instagram public-content snapshots |
| Configurable | Yes — via retention policy config |
| Derived data | AI analysis, recommendations, outcomes, learning **preserved** |
| Cleanup | **Scheduled retention job** — not inline on read |
| Dedup | Do not retain unnecessary duplicate raw snapshots |
| Compliance | Deletion path must support future legal/compliance erasure requests |

### 12.3 Personal Learning retention & recency decay (confirmed)

#### Outcome retention

| Rule | Behavior |
|---|---|
| Eligible outcomes (`success`, `failure`) | **Retain long-term** — do not delete by age alone |
| Raw snapshot expiry | Does **not** delete associated outcome or derived learning record |
| Audit | Historical outcomes remain for audit / longitudinal analysis |

#### Recency decay — **Medium** (confirmed)

Personal Learning prioritizes approximately the **most recent 6 months** of eligible outcomes.

| Rule | Behavior |
|---|---|
| Recent outcomes | **Higher** learning influence |
| Older than ~6 months | **Gradually lower** influence — not zeroed, not ignored |
| Hard 180-day cutoff | **Forbidden** — decay must be gradual |
| Curve/parameters | **Configurable + versioned** — exact curve **TBD** |
| Guardrail | Personalized weights still obey **±20%** baseline bounds (§11.1.4) |

**Planned module:** `apply-recency-decay.ts` with `learning_recency_decay_config` version pin on each train run.

### 12.4 Score / ranking history retention (confirmed)

Use **tiered historical resolution** — do not delete all old scoring data.

| Tier | Resolution |
|---|---|
| **Recent** | Daily score/rank records with component breakdown |
| **Older** | Compact to **weekly** summaries |
| **Long-term** | Compact to **monthly** summaries |

| Rule | Behavior |
|---|---|
| Compaction | Preserve meaningful score movement + major change reasons |
| Audit | Must not destroy recommendation/development/outcome audit trail |
| Raw daily rows | May delete **after successful aggregation** per configurable rules |
| Periods | Aggregation windows **configurable** — not hard-coded |
| Candidate Card | Still supports recent **↑/↓** and primary change reason from recent daily tier |

### 12.5 Development & outcome history

- **Long-term retention** for Success / Failure / Already Know / Give Up lifecycle records
- Independent of raw snapshot TTL
- Feeds Leader Aggregate View and member history

### 12.6 Recommendation history retention (confirmed)

**Long-term retention.** Each recommendation is an **occurrence** — never overwrite prior rows.

**Minimum fields per occurrence:**

| Field | |
|---|---|
| `member_id` | |
| `candidate_id` | |
| `recommended_at` | |
| `recommendation_score` | At time of recommendation |
| `rank` | |
| `recommendation_reasons` | Structured |
| `viewed` / `development_started` | State flags |
| `result` | When applicable |
| `previous_recommendation_id` | Link to prior occurrence if re-recommend |
| `re_recommendation_reason` | When applicable |

| Rule | Behavior |
|---|---|
| Leaves Top20 | **Does not delete** history |
| Re-recommended | **New occurrence** — supports PRD UI: 曾推薦 / 上次原因 / 本次重新推薦原因 |
| Raw snapshot expiry | **Does not delete** recommendation history |

---

## 13. Open Technical Decisions

To be confirmed item-by-item before implementation:

### A. Meta platform & compliance

1. App Review scope and timeline — checklist drafted; confirm `pages_read_user_content` inclusion + Access Verification need
2. System credential provisioning — which Baki Go-owned IG/Threads accounts; token rotation; secret storage
3. System token quota budget — 2,200 Threads keyword / 24h, 1,000 profile / 24h, 30 IG hashtags / 7d — sizing for member count

### B. Discovery & identity (partially resolved — see §4.4, §5.3, §6.4–§6.6, §8.4)

4. **`mapKeywordToPlatforms()` initial rules** — exact suitability heuristics (blocklist, max length, charset)
5. **Hashtag → identity resolution** — which official fields (if any beyond username) count as "reliable" in V1
6. **Manual merge scope** — member confirmation applies globally to pool or per-member view only?
7. **When to trigger IG `business_discovery`** — always after Threads username discovery, or on-demand at enrich phase only?

### C. Pool & access control — **resolved** (see §6.7)

~~Global pool visibility · RLS · refresh strategy~~

### D. Scoring & AI

~~13. Baseline component caps~~ — **resolved (§11.1.3)**  
~~14. Learning activation & guardrail~~ — **resolved (§11.1.4–§11.1.5)**  
~~16. AI provider architecture~~ — **resolved (§11.3)**  
~~Failure reason structure~~ — **resolved (§11.2)** — codes themselves **TBD**

15. **Partial-data score penalty** — whether / how `data_completeness = partial` caps or penalizes components
20. **Learning weight update formula** — how success/failure (+ failure_reason) shifts weights within ±20%
~~21. Structured output schemas~~ — **resolved:** §11.1.7 AI Extraction Schema v1 (`src/lib/radar/extraction/`)
~~22. Needs taxonomy~~ — **resolved:** §11.1.8 Fit Policy v1 (`src/lib/radar/fit-policy/`)
~~23. Four Core Trait definitions~~ — **resolved (§11.1.3 FINAL)**
~~24. Core traits per-trait max weights~~ — **resolved (§11.1.3):** 1.5 / 1.3 / 1.2 / 1.0 = 5.0
~~25. Core traits level target ratios + neutral anchoring~~ — **resolved (§11.1.3)**
~~26. Core traits confidence policy~~ — **resolved:** `core_trait_confidence_v1` + four component policies (§11.1.3)
~~27. Trait Level mean aggregation~~ — **resolved (§11.1.3)**
~~28. Trait Level threshold bands~~ — **resolved:** `core_trait_level_threshold_v1`
~~29. Evidence / trait level gates~~ — **resolved:** very_strong + weak each require **≥1 direct** gate-eligible event; symmetric direct requirements (§11.1.3)
30. **Secondary area proportional modifier** — exact formula for non-exact-district tiers (exact-district cap **8** confirmed)
~~Distance neutral bucket~~ — **resolved (§11.1.3): unknown = 5**
31. **Failure reason codes** — exact 6–8 labels + `other`; factor mapping for failure-aware learning
32. **Benchmark v1** — human label protocol + 50-candidate dataset curation
33. **Production AI model** — select after benchmark review
~~Evidence Quality taxonomy~~ — **resolved:** `direct` / `contextual` / `ambiguous` (§11.1.3)
~~Evidence Quality multiplier policy~~ — **resolved:** 1.00 / 0.75 / 0.25 multipliers (§11.1.3)
~~Quality-weighted Evidence Mean~~ — **resolved:** `Σ(base×mult)/Σ(mult)` replaces unweighted `sum/count`; bounded −2…+2 (§11.1.3)
~~Quality-weighted Evidence Volume~~ — **resolved:** `Σ(mult)` → `min(count/4, 1.0)` for confidence `evidence_volume` only (§11.1.3)
~~Quality-gated Temporal Coverage~~ — **resolved:** only `direct`/`contextual` directional events unlock buckets (§11.1.3)
~~Quality-aware Contradiction Consistency~~ — **resolved:** direct/contextual/ambiguous hierarchy for contradiction impact; deterministic + versioned (§11.1.3)
~~Evidence Quality gate eligibility~~ — **resolved:** positive + **`core_trait_negative_evidence_quality_gate_v1`** (§11.1.3)
~~Behavioral Event Deduplication~~ — **resolved:** `core_trait_behavioral_event_deduplication_v1` — stage-based dedup; not topic-only; `story_id` / `episode_id` grouping (§11.1.3)
~~Cross-Trait Evidence Reuse~~ — **resolved:** `core_trait_cross_trait_evidence_reuse_v1` (§11.1.3)
~~Profile Observability Layer~~ — **resolved:** `core_trait_profile_observability_v1` — separate from level/confidence/score; situation A vs B diagnosis (§11.1.3)
~~Profile Observability Scale~~ — **resolved:** `core_trait_profile_observability_scale_v1` — `low` / `medium` / `high`; no pseudo-score in Candidate UI; Candidate-originated analyzable content only (§11.1.3)
~~Profile Observability Thresholds~~ — **resolved:** `core_trait_profile_observability_thresholds_v1` — 0–9 low / 10–29 medium / 30+ high; analyzable_item_count; inflation exclusions (§11.1.3)
~~Core Traits Score Display Precision~~ — **resolved:** `core_trait_score_display_precision_v1` — full precision canonical; UI 1 decimal total; ranking uses unrounded (§11.1.3)

### E. Product & operations

34. **Queue technology** — concrete job queue/worker stack (infra only)
35. **Retention policy values** — normalized content, analysis, audit log TTLs (raw=90d confirmed)
36. **Learning recency decay curve** — exact medium-decay function (6-month center)
37. **Score history compaction windows** — when daily→weekly→monthly kicks in
38. **System default keyword list** — initial `zh-TW` phrase inventory per intent × signal type + exclusion + temporal (taxonomy resolved §5.6–§5.15)
39. **Exclusion reason codes** — full inventory for discovery-event vs eligibility exclusions
40. **Competitor exclusion evidence rules** — minimum public-profile signals before `competitor_*` classification
41. **Taiwan geographic adjacency data** — district/county/living-area source for `radar_geographic_scoring_config`
42. **Refresh policy** initial thresholds / tier intervals
43. **Leader aggregate** — downline depth + time window defaults
44. **Manual merge scope** — global vs per-member (§6.5)

---

## 14. Implementation Gate

Do **not** start production implementation until:

1. This architecture doc is accepted (this revision)
2. Critical open items in §13 are resolved or explicitly deferred
3. Threads endpoint whitelist is formalized (§9)
4. Meta App Review path is agreed
5. **Production AI model selected** from benchmark v1 review (§11.4)
6. **Failure reason codes** enumerated (§11.2)

**May proceed in parallel (docs/tests/scaffolding):** provider interface, job queue abstractions, benchmark framework, baseline scoring engine — without production model or final failure codes.

---

## 15. Change Log

| Date | Change |
|---|---|
| 2026-08-08 | Initial architecture: Instagram whitelist, Threads-primary / IG-enrichment roles, FoF disabled, global pool + personal Top20, keyword model |
| 2026-08-09 | System-level acquisition (no member OAuth); `mapKeywordToPlatforms()`; partial data policy; IG hashtag identity gate; cross-platform merge rules; manual merge flow |
| 2026-08-09 | Pool visibility + Leader Aggregate View; adaptive refresh queue; Baseline + Personal Learning scoring; change_motivation max 35 |
| 2026-08-09 | **Baseline Scoring v1.0 confirmed:** 35+20+20+10+5+10=100; component rules; personal learning as bounded adjustment layer |
| 2026-08-09 | Personal learning ±20% guardrail, 20-outcome activation, failure-aware learning, failure reason UX, AI provider + benchmark v1, job queue scheduler, partial-success pipeline |
| 2026-08-09 | Stale analysis (7-day), data status UX, tiered retention (raw 90d), medium learning decay, score compaction, recommendation history long-term |
| 2026-08-09 | System Default Keywords v1.0: five intents, five signal types, zh-TW locale, discovery-only boundary (no keyword score factor) |
| 2026-08-09 | Temporal/auxiliary signals, exclusion discovery, eligibility rules (competitor + existing member), Taiwan-wide discovery, Distance v1 fine-grained model, member development area reference |
| 2026-08-09 | Multiple development areas (1 primary + ≤3 secondary, secondary exact cap 8), Core Traits structured evidence architecture |
| 2026-08-09 | **Core Traits FINAL:** four trait IDs + definitions, supporting signals (non-scored), evidence → deterministic scoring pipeline |
| 2026-08-09 | **Core Traits mild weighting v1:** per-trait max 1.5 / 1.3 / 1.2 / 1.0 = 5.0; LLM evidence-only |
| 2026-08-09 | **Core Traits assessment scale + mapping:** five `trait_level` states; deterministic 50/25/50/75/100%; insufficient ≠ moderate semantically |
| 2026-08-09 | **Core Traits confidence:** neutral-anchored adjustment; Deterministic Confidence Engine (4 dimensions, unequal weighting); LLM evidence-only |
| 2026-08-09 | **`core_trait_confidence_v1` FINAL:** component weights, evidence volume / temporal / cross-context / contradiction policies |
| 2026-08-09 | **Trait Level evidence rubric:** per-event strength classification; Deterministic Trait Level Engine; LLM no longer assigns `trait_level` |
| 2026-08-09 | **Evidence strength internal values:** symmetric +2/+1/0/−1/−2; Trait Level Engine input only — not exposed as score points |
| 2026-08-09 | **Trait Level mean aggregation:** `evidence_mean = sum/count`; quantity → Confidence only, not Level |
| 2026-08-09 | **`core_trait_level_threshold_v1` FINAL:** evidence_mean bands + complete Core Traits scoring pipeline |
| 2026-08-09 | **`core_trait_evidence_minimum_gate_v1`:** raw vs effective trait level; assessable count caps overclaiming |
| 2026-08-09 | **Symmetric evidence gate:** conservative floor/ceiling around neutral; sparse negative ≠ stable weak label |
| 2026-08-09 | **`core_trait_negative_minimum_gate_v1`:** `weak` requires ≥3 contradictory events; necessary not sufficient |
| 2026-08-09 | **`core_trait_negative_temporal_gate_v1`:** `weak` also requires contradictory events in ≥2 temporal buckets (90d) |
| 2026-08-09 | **`core_trait_positive_minimum_gate_v1` + `core_trait_positive_temporal_gate_v1`:** `very_strong` requires ≥3 positive events + ≥2 temporal buckets (90d); otherwise downgrade to `strong` |
| 2026-08-09 | **`core_trait_positive_sufficiency_v1`:** unified positive ceilings — moderate ≥1 assessable, strong ≥2 positive (no temporal req), very_strong ≥3 positive + ≥2 buckets; gates cap max level, evidence_mean grants independently |
| 2026-08-09 | **Negative evidence gate failure behavior v1:** gated negative → `effective = insufficient` (not `moderate`); preserve `raw = weak`, contradictory evidence, `negative_signal_present`, audit fields; scoring at neutral 0.50 |
| 2026-08-09 | **Positive evidence gate fallback v1:** cascade downgrade to highest lower satisfied level (very_strong → strong → moderate → insufficient); gates downgrade only, never upgrade; `gate_reason` on fallback |
| 2026-08-09 | **`core_trait_neutral_evidence_v1`:** neutral excluded from evidence_mean, gates, volume, positive/contradictory counts; preserved for audit/re-analysis; no directional evidence → insufficient + 50% baseline |
| 2026-08-09 | **Evidence quality architecture v1:** `evidence_strength` + `evidence_quality` as separate required dimensions per event; quality policy versioned |
| 2026-08-09 | **Evidence Quality taxonomy v1:** `direct` / `contextual` / `ambiguous`; independent from strength |
| 2026-08-09 | **`core_trait_evidence_quality_multiplier_v1`:** multipliers 1.00 / 0.75 / 0.25; `effective_evidence_value = base × multiplier`; Trait Level mean uses effective values; symmetric for ± evidence |
| 2026-08-09 | **`core_trait_evidence_quality_gate_eligibility_v1`:** `ambiguous` in mean only; `direct`/`contextual` gate-eligible; separate total vs gate-eligible counts |
| 2026-08-09 | **`core_trait_negative_evidence_quality_gate_v1`:** ambiguous contradictory excluded from weak count/temporal gates; symmetric quality philosophy |
| 2026-08-09 | **`core_trait_very_strong_direct_evidence_v1`:** very_strong requires ≥1 `direct` gate-eligible positive; 3 contextual + 2 buckets → max strong |
| 2026-08-09 | **`core_trait_weak_direct_evidence_v1`:** stable weak requires mean<0 + ≥3 gate-eligible contradictory + ≥2 buckets + **≥1 direct** |
| 2026-08-09 | **`core_trait_quality_weighted_evidence_mean_v1`:** `evidence_mean = Σ(base×mult)/Σ(mult)` replaces unweighted sum/count; bounded −2…+2; preserve numerator/denominator |
| 2026-08-09 | **`core_trait_quality_weighted_evidence_volume_v1`:** `evidence_volume = min(Σ quality_multiplier / 4, 1.0)`; raw vs weighted count preserved |
| 2026-08-09 | **`core_trait_quality_gated_temporal_coverage_v1`:** temporal_coverage from qualifying buckets (`direct`/`contextual` only) |
| 2026-08-09 | **`core_trait_quality_aware_contradiction_consistency_v1`:** contradiction impact weighted by evidence quality; strength + quality preserved separately; missing ≠ contradiction |
| 2026-08-09 | **`core_trait_cross_trait_evidence_reuse_v1`:** shared `event_id` across traits; within-trait one count per underlying event; per-trait `evidence_strength`; no same-trait splitting |
| 2026-08-09 | **`core_trait_behavioral_event_deduplication_v1`:** `underlying_behavioral_event` dedup unit; not topic-only; stage-based separation; `story_id`/`episode_id` grouping; dedup before volume/gates/temporal/confidence |
| 2026-08-09 | **`core_trait_profile_observability_v1`:** separate diagnostic layer; situation A (no trait evidence) vs B (sparse profile); no score/level/confidence impact; UI reliability indicator allowed |
| 2026-08-09 | **`core_trait_profile_observability_scale_v1`:** `low`/`medium`/`high` only; no pseudo 0–100 UI; Candidate-originated analyzable content; repost/duplicate/empty-share inflation forbidden |
| 2026-08-09 | **`core_trait_profile_observability_thresholds_v1`:** 0–9→low, 10–29→medium, 30+→high; `analyzable_item_count`; exclude reposts/duplicates/empty shares/unattributable; no score impact |
| 2026-08-09 | **`core_trait_score_display_precision_v1`:** full precision storage/calculation; Candidate UI total rounded to 1 decimal (e.g. 3.684375→3.7/5); ranking uses unrounded canonical score |
| 2026-08-09 | **Scoring Engine v1 implemented:** `src/lib/radar/scoring/` — 40/25/20/5/5/5; deterministic modules + 16 acceptance tests; supersedes legacy 35/20/20/10/5/10 baseline |
| 2026-08-09 | **Daily Pipeline P0/P1:** migration `016_radar_daily_pipeline_v1.sql`; global/member state split; `radar_jobs` queue + `claim_radar_jobs()`; analysis fingerprint without `normalization_run_id`; source vs semantic freshness helpers |
| 2026-08-09 | **Content Normalization v1:** `src/lib/radar/normalization/` — deterministic corpus builder; activity/observability migrated off LLM extraction; `near_duplicate` dedup; migration `015_content_normalization_v1.sql` |
| 2026-08-09 | **Fit Policy v1:** `src/lib/radar/fit-policy/` — 10 need types; Policy Ceiling + Evidence Exception; umbrella exclusion; health_management inference guard; wired into extraction validation |
