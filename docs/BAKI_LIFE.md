# Baki Life — Owner Private Life OS

## Purpose

Baki Life is an **Owner-only** private Life OS for personal finance, life goals, and monthly financial snapshots. It shares Baki Go infrastructure (auth, hosting, Supabase) but is an **independent module**: separate UI, routing, data fetching, and APIs.

Routes:

- `/life` — dashboard
- `/life/ledger` — income / expense / transfer
- `/life/goals` — life goals + goal pockets
- `/life/analytics` — income & expense analytics
- `/life/assets` — accounts, credit cards, snapshots
- `/life/quick` — ultra-light quick expense entry (home-screen PWA)

## Authority

Owner = Super Admin (`resolveIsSuperAdmin` / `assertSuperAdmin`). See `docs/BUSINESS_RULES.md`.

- Server layout gate + client `SuperAdminGuard`
- All `/api/life/*` require Super Admin
- Tables are service-role only (no anon/authenticated grants)

## Accounting invariants

Amounts are stored as **integer cents** (`bigint`) in TWD. Never use float.

### Transaction kinds

| Kind | Income stats | Expense stats | Net worth effect |
|------|--------------|---------------|------------------|
| `income` | yes | no | +asset |
| `expense` | no | yes | −asset or +liability (credit swipe) |
| `transfer` | no | no | move between assets (incl. goal pocket) |
| `credit_payment` | no | no | −bank asset, −CC liability |
| `credit_refund` | no | reduces expense | −CC liability (and optional asset restore) |

Debit card = expense from the bank account (e.g. 將來銀行). No separate debit liability.

### Snapshot & 未記錄生活費

Between snapshot \(S_0\) and \(S_1\):

```
theoretical_net = S0.net + recorded_income − recorded_expense
unrecorded_living = max(0, theoretical_net − S1.net)
```

Transfers, goal-pocket transfers, and credit-card payments must **not** affect income/expense or the unrecorded gap incorrectly. Credit swipes count as expense at swipe time; payments do not create a second expense.

After a snapshot is saved, account balances are set to the entered actuals so the next period starts clean.

## Goals vs goal pockets

- **Life Goal** — aspiration (amount optional, status, date).
- **Goal Pocket** — asset account (`goal_pocket`), optionally linked to a parent bank and a Life Goal.
- Concepts are independent: a goal may have no pocket; a pocket may track funds for a goal.

## PWA

`/life` uses a scoped manifest (`/life/manifest.webmanifest`) and Life-specific icons so Add to Home Screen can show **Baki Life** without replacing the main Baki Go PWA.

## Performance

- `/life/*` uses a dedicated Life shell (no Baki Go bottom nav / reminder schedulers).
- `/life/quick` loads minimal client UI and only the queries needed to post one expense.
