# Baki GO — Game Design

## Purpose

Gamification is a **core product principle**, not an add-on. Progress should feel like a game — inspired by **Apple Fitness** engagement patterns — while driving real network marketing activity.

> Every important milestone should have visual feedback.

## Design Goals

1. **Motivation first** — Every screen increases motivation; every interaction brings users back tomorrow.
2. **Make rank progress visible** — Members always see where they are and what's next on the path to President.
3. **Celebrate milestones** — Rank promotions, streaks, and team wins get clear visual feedback.
4. **Stay authentic** — Gamification rewards real business activity, not app vanity metrics.

## Reward Types

Members earn:

| Reward | Purpose |
|--------|---------|
| **Levels** | Long-term progression within and across ranks |
| **Experience (XP)** | Granular feedback for daily activities |
| **Badges** | Specific accomplishments (first recruit, 30-day streak, etc.) |
| **Achievements** | Named milestones tied to business outcomes |
| **Titles** | Visible status markers (rank-aligned or earned) |
| **Rankings** | Team and organization leaderboards |

All reward totals must be **computed from activity events**, not manually assigned.

## Career Path Integration

Gamification maps directly to the rank progression defined in [PRODUCT.md](./PRODUCT.md):

```
New Member → Supervisor → Active Supervisor → World Team → President
```

Each rank transition is a major celebration moment. Intermediate XP and badge milestones keep members engaged between ranks.

## Core Mechanics

### Progress Visualization

- Activity rings or equivalent for daily/weekly targets.
- Rank progress bar showing distance to next rank.
- Clear numeric progress alongside visual indicators.

### Experience (XP)

- XP earned for qualifying business activities (to be defined in [BUSINESS_RULES.md](./BUSINESS_RULES.md)).
- XP must be derivable from stored events, not manually edited.

### Streaks

- Rules for what counts as a qualifying daily/weekly action.
- Grace periods and streak recovery (document exceptions in [BUSINESS_RULES.md](./BUSINESS_RULES.md)).

### Badges & Achievements

- Named milestones tied to real member outcomes.
- Unlock criteria documented here before implementation.

### Titles & Rankings

- Titles reflect rank or special earned status.
- Rankings computed from activity — team, downline, and organization scope.

## Feedback Loops

```
Activity logged → Immediate feedback → XP/progress update → Milestone check → Celebration (if earned)
```

- **Immediate feedback:** Haptics, animation, or toast on qualifying actions.
- **Progress update:** Recalculate stats automatically — never ask the user to update totals.
- **Celebration:** Full-screen or modal moment for rank promotions and major milestones; subtle inline for daily wins.

## Meeting Integration

- Team achievements visible in meeting mode.
- Shared celebration moments when reviewing group progress weekly.

## Anti-Patterns

- Do not gamify empty actions (e.g., opening the app without meaningful engagement).
- Do not create pay-to-win or dark patterns.
- Do not store gamification totals that should be computed from events.
- Do not reward activity that doesn't map to real business outcomes.

## Data Requirements

Gamification events should be stored as **immutable records** where possible. Aggregates (XP, level, badge ownership, rank progress) are computed or derived from those records. See [DATABASE.md](./DATABASE.md).

## Related Documentation

- [PRODUCT.md](./PRODUCT.md)
- [BUSINESS_RULES.md](./BUSINESS_RULES.md)
- [UI_SYSTEM.md](./UI_SYSTEM.md)
