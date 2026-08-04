# Baki GO — UI System

## Design Philosophy

Baki GO's interface should feel **calm, precise, and motivating** — inspired by **Apple**, **Apple Fitness**, and **Linear**.

Every screen should **increase motivation**. Every interaction should make users want to come back tomorrow.

| Influence | What to borrow |
|-----------|----------------|
| **Apple** | Clarity, generous whitespace, typography hierarchy, subtle motion |
| **Apple Fitness** | Rings, progress visualization, celebratory feedback, activity-centric layouts |
| **Linear** | Speed, keyboard-friendly patterns, minimal chrome, crisp dark/light modes |

## Mobile-First

Everything must be designed for phones first. Desktop is secondary.

- Design every screen for **320px–428px** viewports first.
- Touch targets: minimum **44×44 pt**.
- Primary actions live in thumb-reachable zones (bottom of screen).
- Desktop layouts extend mobile patterns — do not design desktop-first and shrink down.

## Simplicity

Usable by someone who has never used CRM software.

- One primary action per screen when possible.
- Plain language — no CRM jargon.
- If a feature feels complicated, redesign it.

## Motivation-First Screens

Every member-facing screen should answer:

1. Where am I on my path?
2. What should I do next?
3. What did I accomplish recently?

## Leader-First Screens

Leader views must instantly surface:

- Who needs help
- Who is improving
- Who is falling behind
- Who deserves recognition

Leader UI is scannable at a glance — no digging through reports.

## Meeting Mode

The product naturally supports weekly meetings.

- Single shared screen for team progress review.
- Optimized for projection or group viewing on a phone or tablet.
- Read-only, live-calculated stats — no manual prep before meetings.

## Typography

_To be finalized (system fonts or custom stack)._

- Prefer native-feeling font stacks on mobile.
- Clear hierarchy: display → title → body → caption.

## Color & Theme

_To be defined (light/dark, accent, semantic colors)._

- Support light and dark modes from the start.
- Use semantic tokens (e.g., `success`, `warning`, `surface`) — not raw hex in components.

## Spacing & Layout

- Consistent spacing scale (e.g., 4px base unit).
- Card-based layouts for scannable content on mobile.
- Full-bleed sections for hero stats, rank progress, and activity rings.

## Components

_To be built as the design system matures._

Planned categories:

- Navigation (tab bar, headers)
- Daily action cards ("what to do next")
- Data display (stat cards, member lists, rank progress)
- Input (forms optimized for one-handed activity logging)
- Feedback (toasts, modals, achievement overlays, rank promotion celebrations)
- Gamification (rings, badges, streak indicators, leaderboards)
- Meeting view (team summary layout)
- Leader dashboard (team health signals)

## Motion & Feedback

- Subtle, purposeful animations — never decorative noise.
- Celebrate milestones and rank promotions (Apple Fitness–style completions).
- Respect `prefers-reduced-motion`.

## Accessibility

- WCAG 2.1 AA minimum.
- Sufficient color contrast in both themes.
- Screen reader labels on all interactive elements.

## Implementation Notes

- UI tokens and components live in code; **design decisions and rationale** live in this document.
- Do not embed business logic in UI components — consume computed data from the domain layer.

## Related Documentation

- [PRODUCT.md](./PRODUCT.md)
- [GAME_DESIGN.md](./GAME_DESIGN.md)
