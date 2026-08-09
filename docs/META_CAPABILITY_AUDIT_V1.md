# AI Radar — Meta Official API Capability Audit v1

**Status:** Accepted (2026-08-09)  
**Scope:** Official Meta Threads API + Instagram Graph API only  
**Policy:** No scraping, undocumented endpoints, browser automation, private APIs, or unofficial libraries. Fixture adapters OK for tests only.

Architecture updates: [`docs/AI_RADAR.md`](./AI_RADAR.md) §3.1, §4.1, §5.3, §8.1

---

## Executive Summary

| Conclusion | Detail |
|---|---|
| **Production discover path** | **Threads only** — `keyword_search` / TAG → `username` |
| **Instagram role** | **Enrichment only** — `business_discovery` for Business/Creator when username known |
| **IG hashtag → Candidate** | **NOT SUPPORTED** — no author identity in official API |
| **Member intake required** | Personal IG, low-follower Threads, long-tail coverage |
| **Org keyword dedup required** | Shared keywords must not duplicate Meta API calls |

---

## Threads Capability Matrix

| Question | Verdict | Official basis |
|---|---|---|
| Keyword search public posts? | **SUPPORTED_WITH_CONSTRAINTS** | `GET /keyword_search`; Advanced Access + `threads_keyword_search` |
| Author identity from search? | **SUPPORTED_WITH_CONSTRAINTS** | `username` returned; `owner` excluded |
| Arbitrary public profile? | **SUPPORTED_WITH_CONSTRAINTS** | `profile_lookup`; public + ≥100 followers; Advanced Access |
| Public account recent posts? | **SUPPORTED_WITH_CONSTRAINTS** | `profile_posts`; `since`/`until` supported |
| Third-party replies/conversations? | **NOT_SUPPORTED** | `threads_read_replies` allowed usage: own threads only |
| Only authenticated user data? | **NOT_SUPPORTED** (overall) | Public discovery exists with gates |
| Profile discovery API? | **SUPPORTED** | `profile_lookup` + `profile_posts` |
| Rate limits | **SUPPORTED_WITH_CONSTRAINTS** | keyword: 2,200/24h; profile: 1,000/24h per token owner |
| App Review | **Required** | Advanced Access + Business Verification for public third-party content |

References: [Keyword Search](https://developers.facebook.com/docs/threads/keyword-search/), [Threads Profiles](https://developers.facebook.com/docs/threads/threads-profiles/), [Retrieve Posts](https://developers.facebook.com/docs/threads/retrieve-and-discover-posts/retrieve-posts/)

---

## Instagram Capability Matrix

| Question | Verdict | Official basis |
|---|---|---|
| Business Discovery targets? | **SUPPORTED_WITH_CONSTRAINTS** | Business/Creator only; exact username |
| Personal/consumer accounts? | **NOT_SUPPORTED** | API cannot access consumer accounts |
| Hashtag search? | **SUPPORTED_WITH_CONSTRAINTS** | Public Content Access + App Review; 30 hashtags/7d |
| Hashtag author identity? | **NOT_SUPPORTED** | Cannot request `username` on hashtag media |
| Arbitrary public posts? | **SUPPORTED_WITH_CONSTRAINTS** | BD field expansion only; no direct `GET /{ig-media-id}` |
| Third-party comment text? | **NOT_SUPPORTED** | Counts only via BD; comments need media owner |
| Cross-platform linking API? | **NOT_SUPPORTED** | `connected_threads_user` is app-user scoped |

References: [Business Discovery](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery/), [Hashtag recent_media](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag/recent-media/)

---

## AI Radar Feature Matrix

| Feature | Verdict |
|---|---|
| keyword discovery (automated) | **SUPPORTED_WITH_CONSTRAINTS** — Threads only |
| hashtag discovery → Candidate | **NOT_SUPPORTED** (IG); TAG search on Threads OK with username |
| candidate identity resolution | **SUPPORTED_WITH_CONSTRAINTS** — username-based |
| public profile enrichment | **SUPPORTED_WITH_CONSTRAINTS** — Threads ≥100 followers; IG Professional |
| recent public post enrichment | **SUPPORTED_WITH_CONSTRAINTS** |
| reply/discussion enrichment | **NOT_SUPPORTED** (third-party) |
| cross-platform identity linking | **NOT_SUPPORTED** (official API) |
| 90-day content collection | **SUPPORTED_WITH_CONSTRAINTS** — Threads since/until; IG paginated BD |
| location from profile text | **SUPPORTED_WITH_CONSTRAINTS** — biography parsing |

---

## Production Acquisition Strategy v1 (Accepted)

### Layer A — Automated System Radar
- Threads only; official API; Advanced Access
- Org keyword pool → one discover execution per unique phrase
- Quota-aware planning

### Layer B — Member Candidate Intake
- First-class: `POST /api/radar/candidates`
- Threads or Instagram username/URL
- Global dedup; partial enrich OK

### Layer C — Interaction-Based Discovery
- Future only; not V1 automation

---

## Architecture Impacts Implemented

| Change | Location |
|---|---|
| Threads-only discover | `map-keyword-to-platforms.ts`, `discover-worker.ts` |
| IG discover disabled | `MetaInstagramAdapter.discoverByKeyword()` → `[]` |
| Org keyword pool | `build-org-keyword-pool.ts`, `orchestrator.ts` |
| Quota allocator | `quota-allocator.ts`, `radar_pipeline_config.daily_caps` |
| Member intake API | `POST /api/radar/candidates` |
| Capability states | `capability-states.ts`, `candidate_refresh_state` |
| Migration | `020_radar_acquisition_v1.sql` |

---

## Prerequisites Before Live Threads API

1. Meta app with **Threads Use Case**
2. **Advanced Access** for `threads_basic`, `threads_keyword_search`, `threads_profile_discovery`
3. **Business Verification** complete
4. **App Review** approved for public content discovery use case
5. System-owned **Threads account** with long-lived user access token
6. System-owned **Instagram Professional + Facebook Page** for IG enrichment principal
7. Live Meta adapter implementation (explicitly **not** in this phase)
8. Quota monitoring against official limits (2,200 keyword / 1,000 profile per 24h)

---

## Product Features NOT Achievable via Official API

1. IG hashtag → automated Candidate
2. Systematic enrich of personal Instagram accounts
3. Threads profile enrich for accounts with <100 followers (full API path)
4. Third-party reply/comment text for discovery candidates
5. Official automatic Threads ↔ IG identity linking
6. IG 90-day window via hashtag (24h recent_media only)
7. Unlimited Taiwan-wide stranger search (hard quotas)
8. Scraping or undocumented endpoint fallbacks

---

## Deliberately Out of Scope (This Phase)

- Live Meta API adapter implementation
- Opening Generation / Gamification
- Member intake UI
- Layer C interaction-based discovery
