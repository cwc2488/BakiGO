import { buildAllowedContentIdSet } from "../normalization/build-corpus-summary";
import {
  getNeedTypeDefinition,
  isNeedTypeSlug,
  UMBRELLA_NEED_TYPE,
} from "../fit-policy";
import type { NeedRelevanceLevel } from "../fit-policy/need-types";
import type { CandidateContentCorpus } from "../normalization/schema";
import { CORE_TRAIT_IDS } from "./constants";

/**
 * Deterministic conformance for Extraction v1.
 *
 * Every action here is either lossless (moving a value the policy already
 * prescribes) or downward (a weaker claim than the model made). Extraction
 * Schema v1 and the scoring policy are unchanged: this closes the gap between
 * what our own prompt/provider contract allows the model to emit and what
 * Extraction v1 already demands. It never invents evidence, text or levels.
 */
export const CONFORMANCE_ACTIONS = [
  "core_traits_deduped",
  "core_traits_filled",
  "core_traits_unknown_dropped",
  "unknown_source_ref_dropped",
  "trait_evidence_event_dropped",
  "module_downgraded_to_unknown",
  "need_item_dropped",
  "umbrella_need_moved_to_advisory",
  "need_relevance_clamped_to_ceiling",
  "location_downgraded_to_unknown",
] as const;

export type ConformanceAction = (typeof CONFORMANCE_ACTIONS)[number];

export type ConformanceResult = {
  data: unknown;
  actions: ConformanceAction[];
};

const RELEVANCE_ORDER: NeedRelevanceLevel[] = [
  "unrelated",
  "adjacent",
  "relevant",
  "high_fit",
];

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function relevanceRank(value: unknown): number {
  return RELEVANCE_ORDER.indexOf(value as NeedRelevanceLevel);
}

/** Assessment modules that carry availability + level + source_refs. */
const LEVELLED_MODULE_PATHS: Array<[string, string]> = [
  ["change_window", "change_intent"],
  ["change_window", "behavioral_change"],
  ["change_window", "solution_gap"],
  ["contactability", "natural_entry"],
  ["contactability", "interaction_openness"],
];

function downgradeToUnknown(module: Rec): Rec {
  const reasoning =
    typeof module.reasoning === "string" && module.reasoning.trim()
      ? module.reasoning
      : "insufficient verifiable evidence in the supplied corpus";
  return { availability: "unknown", reasoning };
}

function pruneSourceRefs(
  container: Rec,
  allowed: Set<string> | null,
  actions: ConformanceAction[],
): { removed: number; remaining: number } {
  if (!allowed) {
    return { removed: 0, remaining: asArray(container.source_refs).length };
  }
  const refs = asArray(container.source_refs);
  if (refs.length === 0) return { removed: 0, remaining: 0 };

  const kept = refs.filter((ref) => {
    if (!isRec(ref)) return false;
    return typeof ref.content_id === "string" && allowed.has(ref.content_id);
  });
  const removed = refs.length - kept.length;
  if (removed > 0) {
    container.source_refs = kept;
    actions.push("unknown_source_ref_dropped");
  }
  return { removed, remaining: kept.length };
}

function conformLevelledModule(
  parent: Rec,
  key: string,
  allowed: Set<string> | null,
  actions: ConformanceAction[],
): void {
  const module = parent[key];
  if (!isRec(module)) return;

  pruneSourceRefs(module, allowed, actions);

  if (module.availability !== "available") return;

  const refCount = asArray(module.source_refs).length;
  // Extraction v1 requires reviewed evidence for any available level, including
  // an explicit "none". Without refs the honest statement is "unknown".
  if (refCount === 0) {
    parent[key] = downgradeToUnknown(module);
    actions.push("module_downgraded_to_unknown");
    return;
  }
  if (module.level === undefined || module.level === null) {
    parent[key] = downgradeToUnknown(module);
    actions.push("module_downgraded_to_unknown");
  }
}

function conformNaturalEntryExtras(parent: Rec): void {
  const entry = parent.natural_entry;
  if (!isRec(entry)) return;
  if (entry.availability !== "available" || entry.level === "none") {
    delete entry.topic;
    delete entry.entry_context;
  }
}

function conformLocation(
  root: Rec,
  allowed: Set<string> | null,
  actions: ConformanceAction[],
): void {
  const location = root.location;
  if (!isRec(location)) return;

  pruneSourceRefs(location, allowed, actions);
  if (location.availability !== "available") return;

  const hasPlace =
    (typeof location.normalized_city === "string" && location.normalized_city.trim()) ||
    (typeof location.normalized_district === "string" && location.normalized_district.trim());
  const refCount = asArray(location.source_refs).length;

  if (!hasPlace || refCount === 0) {
    root.location = downgradeToUnknown(location);
    actions.push("location_downgraded_to_unknown");
  }
}

function conformNeeds(
  root: Rec,
  allowed: Set<string> | null,
  actions: ConformanceAction[],
): void {
  const needs = root.needs;
  if (!isRec(needs)) return;

  pruneSourceRefs(needs, allowed, actions);
  if (needs.availability !== "available") return;

  const items = asArray(needs.items).filter(isRec);
  const kept: Rec[] = [];
  const movedToAdvisory: string[] = [];

  for (const item of items) {
    pruneSourceRefs(item, allowed, actions);

    // Undetected needs are omitted, never expressed as strength none.
    if (item.strength === "none" || asArray(item.source_refs).length === 0) {
      actions.push("need_item_dropped");
      continue;
    }

    const needType = typeof item.need_type === "string" ? item.need_type : "";
    if (!isNeedTypeSlug(needType)) {
      actions.push("need_item_dropped");
      continue;
    }

    const policy = getNeedTypeDefinition(needType);
    const current = relevanceRank(item.relevance);
    const ceiling = relevanceRank(policy.relevance_ceiling);
    let next = item.relevance as NeedRelevanceLevel;

    if (current > ceiling) next = policy.relevance_ceiling;
    if (
      policy.default_relevance === "adjacent" &&
      (next === "relevant" || next === "high_fit")
    ) {
      next = "adjacent";
    }
    if (
      policy.default_relevance === "relevant" &&
      next === "high_fit" &&
      item.relevance_evidence_quality !== "direct"
    ) {
      next = "relevant";
    }
    if (next !== item.relevance) {
      item.relevance = next;
      actions.push("need_relevance_clamped_to_ceiling");
    }

    kept.push(item);
  }

  const hasSpecific = kept.some((item) => item.need_type !== UMBRELLA_NEED_TYPE);
  const finalItems = kept.filter((item) => {
    if (item.need_type === UMBRELLA_NEED_TYPE && hasSpecific) {
      movedToAdvisory.push(UMBRELLA_NEED_TYPE);
      return false;
    }
    return true;
  });

  needs.items = finalItems;

  if (movedToAdvisory.length > 0) {
    const advisory = isRec(root.advisory) ? root.advisory : {};
    const tags = new Set(
      asArray(advisory.umbrella_need_tags).filter(
        (tag): tag is string => typeof tag === "string",
      ),
    );
    for (const tag of movedToAdvisory) tags.add(tag);
    advisory.umbrella_need_tags = [...tags];
    root.advisory = advisory;
    actions.push("umbrella_need_moved_to_advisory");
  }
}

function conformCoreTraits(
  root: Rec,
  allowed: Set<string> | null,
  actions: ConformanceAction[],
): void {
  const raw = asArray(root.core_traits).filter(isRec);
  const merged = new Map<string, Rec>();

  for (const trait of raw) {
    const traitId = typeof trait.trait_id === "string" ? trait.trait_id : "";
    if (!(CORE_TRAIT_IDS as readonly string[]).includes(traitId)) {
      actions.push("core_traits_unknown_dropped");
      continue;
    }

    const events = asArray(trait.evidence_events).filter(isRec);
    const keptEvents: Rec[] = [];
    for (const event of events) {
      pruneSourceRefs(event, allowed, actions);
      if (asArray(event.source_refs).length === 0) {
        actions.push("trait_evidence_event_dropped");
        continue;
      }
      keptEvents.push(event);
    }

    const existing = merged.get(traitId);
    if (!existing) {
      trait.evidence_events = keptEvents;
      merged.set(traitId, trait);
      continue;
    }

    const seen = new Set(
      asArray(existing.evidence_events)
        .filter(isRec)
        .map((event) => String(event.event_id ?? "")),
    );
    for (const event of keptEvents) {
      const id = String(event.event_id ?? "");
      if (id && seen.has(id)) continue;
      seen.add(id);
      (existing.evidence_events as Rec[]).push(event);
    }
    actions.push("core_traits_deduped");
  }

  let filled = false;
  for (const traitId of CORE_TRAIT_IDS) {
    if (merged.has(traitId)) continue;
    // No evidence found for this trait is a valid v1 statement; the trait
    // engine reads it as insufficient, not as a positive or negative signal.
    merged.set(traitId, { trait_id: traitId, evidence_events: [] });
    filled = true;
  }
  if (filled) actions.push("core_traits_filled");

  root.core_traits = CORE_TRAIT_IDS.map((traitId) => merged.get(traitId));
}

export function applyExtractionConformance(
  input: unknown,
  options: { corpus?: CandidateContentCorpus } = {},
): ConformanceResult {
  if (!isRec(input)) return { data: input, actions: [] };

  const root = structuredClone(input) as Rec;
  const allowed = options.corpus ? buildAllowedContentIdSet(options.corpus) : null;
  const actions: ConformanceAction[] = [];

  for (const [parentKey, moduleKey] of LEVELLED_MODULE_PATHS) {
    const parent = root[parentKey];
    if (isRec(parent)) conformLevelledModule(parent, moduleKey, allowed, actions);
  }
  if (isRec(root.contactability)) conformNaturalEntryExtras(root.contactability);

  conformNeeds(root, allowed, actions);
  conformLocation(root, allowed, actions);
  conformCoreTraits(root, allowed, actions);
  return { data: root, actions: [...new Set(actions)] };
}
