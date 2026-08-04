# Baki GO — Database

## Purpose

This document defines the data model, persistence strategy, and conventions for Baki GO. The schema supports a **Network Marketing Business Operating System** with **single entry of data** and **automatic calculation** of all statistics.

## Principles

1. **Source of truth** — Store raw, user-entered activity data; compute aggregates rather than duplicating them.
2. **No redundant fields** — Avoid columns that mirror calculated values unless required for performance and documented here.
3. **Auditability** — Prefer timestamps and clear ownership on mutable records.
4. **Scalability** — Design for growth in organizations, members, downlines, and activity history.
5. **Long-term thinking** — Schema decisions should still make sense five years from now.

## Technology

_To be decided (e.g., PostgreSQL, Supabase, PlanetScale)._

## Entity Overview

_To be defined as features are scoped._

### Conceptual Model (placeholder)

```
Organization
  └── has many → Teams
  └── has many → Members

Member
  └── belongs to → Organization, Team, Sponsor (Member)
  └── has one → Rank (computed or derived)
  └── has many → ActivityEvents (source of truth)
  └── has many → GamificationEvents

ActivityEvent
  └── immutable record of a logged business action
  └── drives all personal, team, and leader statistics

Rank
  └── New Member → Supervisor → Active Supervisor → World Team → President
  └── progress computed from ActivityEvents per BUSINESS_RULES.md
```

## Naming Conventions

- Tables: `snake_case`, plural (e.g., `activity_events`, `members`)
- Primary keys: `id` (UUID preferred)
- Foreign keys: `{entity}_id`
- Timestamps: `created_at`, `updated_at` on mutable tables

## Computed vs Stored Data

| Type | Storage | Notes |
|------|---------|-------|
| Logged activities | Stored | Single source of truth |
| Rank progress | Computed | Derived from activities + BUSINESS_RULES.md |
| Team health signals | Computed | Needs help, improving, falling behind, recognition |
| Daily next actions | Computed | Derived from rank, history, and team context |
| Gamification (XP, levels, badges) | Events stored, totals computed | Rules in GAME_DESIGN.md |
| Meeting summaries | Computed | Aggregated at read time for team scope |

## Migrations

- All schema changes go through versioned migrations.
- Document breaking changes in this file and in [BUSINESS_RULES.md](./BUSINESS_RULES.md) when they affect domain behavior.

## Related Documentation

- [PRODUCT.md](./PRODUCT.md)
- [BUSINESS_RULES.md](./BUSINESS_RULES.md)
- [GAME_DESIGN.md](./GAME_DESIGN.md)
