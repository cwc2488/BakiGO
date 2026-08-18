# Baki GO — Roadmap

## Current Phase: Foundation

**Status:** In progress

Establish project documentation, Cursor rules, and conventions before building application features.

### Foundation Checklist

- [x] `/docs` folder and core documentation files
- [x] `.cursor/rules/project.mdc` with project principles
- [x] Product philosophy defined (Network Marketing Business OS)
- [ ] Rank qualification rules defined in BUSINESS_RULES.md
- [ ] Activity types and XP rules defined
- [ ] Database technology selection
- [ ] Authentication strategy
- [ ] Design tokens and base UI components
- [ ] CI/CD and deployment pipeline

## Phase 1 — Daily Member Experience

_Focus: Golden Rule — every member knows what to do next._

- Member onboarding (New Member entry)
- Activity logging (enter data once)
- Daily "what to do next" view
- Personal rank progress and auto-calculated stats
- Basic gamification (XP, levels, streaks)

## Phase 2 — Leader & Team

_Focus: Leader First + Meeting Friendly._

- Leader team health dashboard (needs help, improving, falling behind, recognition)
- Team hierarchy and downline views
- Meeting mode for weekly team reviews
- Badges, achievements, and rank promotion celebrations

## Phase 3 — Organization Scale

_Focus: Long-Term Thinking + Data Driven._

- Multi-team and organization-wide rankings
- Advanced rank progression (Active Supervisor → World Team → President)
- Coaching insights based on activity trends
- Admin, billing, and SaaS infrastructure

## Recognition Center — Delivery Track

Recognition Center is a dedicated delivery track for repetitive recognition operations. It is separate from leaderboard ranking, event logging, gamification achievements, and full monthly-meeting PPT automation.

### Phase RC-1 — Documentation Freeze

_Focus: product/rules freeze before schema or feature work._

- Freeze Recognition Admin allowlist model
- Freeze multiple-events-per-month rule
- Freeze collection availability rule (`status = collecting` **and** active time window)
- Freeze duplicate / consolidation behavior
- Freeze photo/original/crop rules
- Freeze 4:3 presentation constraints
- Freeze birthday scope exclusion from Recognition V1
- Document future `Recognition Event Template` compatibility

### Phase RC-2 — Schema / Catalog / Events

_Focus: event model foundation._

- Award catalog tables / seed strategy
- Recognition Event entity
- Event-specific award ordering / enablement
- Recognition Admin allowlist
- PPT theme separation
- Copy previous month settings
- Keep architecture compatible with future Event Templates

### Phase RC-3 — Public Collection

_Focus: secure evidence intake._

- Open-public collection route
- Public token validation
- Submission envelopes + raw entries
- Free-text submitter organization
- Photo upload pipeline (private storage)
- Retain submissions as evidence, not official roster

### Phase RC-4 — Consolidation / Review / History

_Focus: admin working source._ **Implemented in Phase 5.**

- Consolidated candidates
- Exact normalized-name consolidation within same event + same award
- Cross-award duplicate warning behavior
- Review states: pending / approved / needs_fix / rejected
- Month/event history query
- One-tap text export of approved names

### Phase RC-5 — Photo Review

_Focus: presentation safety without AI selection._ **Implemented in Phase 6.**

- Original vs presentation crop separation
- Admin exception queue for group photos / anomalies
- Preserve originals
- Keep public submission flow simple
- Never allow AI to choose the honoree in a multi-person photo

### Phase RC-6 — 4:3 Preview / Validation

_Focus: pre-export confidence._

- Real 4:3 presentation preview
- Empty-award omission
- Validation summary
- Counts, missing photos, unresolved review states, warnings
- Name-only page sizing remains configurable

### Phase RC-7 — PPTX Generation

_Focus: binary export after validation._

- Formal presentation plan → PPTX renderer
- Theme application separated from roster data
- Export audit row / artifact retention

### Optional Phase RC-8 — Photo AI Flags

_Focus: assistive signals only._

- Group-photo detection
- Low-resolution / text-overlay / tiny-subject flags
- No AI honoree selection

### Optional Phase RC-9 — Person History / Timeline

_Focus: longitudinal recognition lookup._

- Search a person’s recognition history
- Achievement timeline
- Optional candidate → member linkage improvements

## Guiding Constraints (All Phases)

1. Mobile-first in every feature.
2. Data entered once; statistics computed automatically.
3. Business rules live in documentation, not hardcoded.
4. Motivation first — every screen increases engagement.
5. Simplicity — usable without CRM experience.
6. Gamification integrated from the start.
7. Meeting-friendly team views from Phase 2 onward.
8. UI aligned with Apple / Apple Fitness / Linear aesthetics.

## Related Documentation

- [PRODUCT.md](./PRODUCT.md)
- [BUSINESS_RULES.md](./BUSINESS_RULES.md)
- [DATABASE.md](./DATABASE.md)
- [UI_SYSTEM.md](./UI_SYSTEM.md)
- [GAME_DESIGN.md](./GAME_DESIGN.md)
- [RECOGNITION.md](./RECOGNITION.md)
