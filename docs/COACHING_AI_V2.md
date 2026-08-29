# AI Coach V2 — 21-Day Freeform Coach

## Status

**Implementation branch:** `feat/ai-coach-v2`  
**Production:** unchanged (baseline `3156098`). Do not promote V2 to Production from this mission.

## Product outcome

Upgrade from a reactive daily meal-analysis report into a continuous 21-day conversational AI Coach.

Customer feeling targets:

- 「我知道它是 AI，但我願意跟它聊天。」
- 「它記得我。」
- 「它知道我們最近在處理什麼。」
- 「它有時候會發現連我自己都沒注意到的事情。」

## Root cause of V1 chatbot feel

V1 was architecturally a **structured daily report generator**, not a coach conversation:

1. Mandatory JSON sections (`encouragement`, `daily_food_summary`, per-meal cards, `tomorrow_focus`) rendered verbatim in UI.
2. System owned topics; AI only owned wording — fixed agenda every day.
3. Praise / meal analysis / follow-up slots were schema-required or post-processed in.
4. Memory was snapshot layers without conversational continuity or open-loop callbacks.
5. No freeform customer↔coach message channel — only form submit → report.

## North-star loop

Observe → Remember → Understand → Reason → Choose coaching strategy → Respond naturally → Preserve useful state/open loops → Observe next.

## Principle

**Structured internally. Free externally.**

Internal structure (identity, lifecycle, memory, open loops, hypotheses, safety, escalation) is strict.  
Customer-facing text is **not** forced into praise → analysis → advice → question.

## Architecture

| Layer | Role |
|-------|------|
| Lifecycle | 21-day AI intensive cycle; stages guide reasoning, do not script turns |
| Recent context | Bounded recent turns (not full 21-day raw dump) |
| Durable memory | Compact coaching-relevant facts only |
| Open loops | Create / retrieve / update / close unfinished threads |
| Hypotheses | Probabilistic, revisable, evidence-backed |
| Decision context | Existing signal engine stays for coach/attention authority |
| Freeform generation | Model chooses intention + natural `coach_message` |
| Day-21 reflection | Personalized evidence synthesis for customer + coach |
| Cost telemetry | Reuse `ai_llm_call_log`; tag V2 point keys |

## Customer-facing contract

Primary field: `coach_message` (natural prose of any useful length/shape).

When `coach_message` is present, the portal renders **that message only** (plus lifecycle chrome). Legacy sectioned fields remain for coach-side / regression bridge and are not shown as a template report.

## Photo modality

Meal photos remain evidence. Vision observations still run. The coach is **not** required to emit a standardized nutrition report for every photo.

## Safety

Hard boundaries retained: no medical diagnosis, no dangerous restriction, no ED encouragement, no fabricated history, escalate high-risk / out-of-scope to human coach via Attention signals.

## Cost

Bounded recent context + compressed durable memory. Mechanical memory maintenance may use a cheaper path; coaching generation uses quality where it matters. Intensive AI coaching ends after the 21-day cycle.

## Source of truth

This doc + `docs/COACHING.md` (V1 baseline). V2 prompts live under `src/lib/coaching/ai/v2/`. Do not keep competing V1 rigid customer-facing prompt rules active on the V2 path.
