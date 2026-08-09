import type { ZodIssue } from "zod";
import type { CandidateContentCorpus } from "../normalization";
import { buildAllowedContentIdSet } from "../normalization/build-corpus-summary";
import {
  FIT_POLICY_ID,
  getNeedTypeDefinition,
  isNeedTypeSlug,
  validateHealthManagementEvidence,
  validateNeedRelevanceAgainstPolicy,
  validateUmbrellaNeedExclusion,
} from "../fit-policy";
import { FORBIDDEN_AI_SCORE_KEYS, CORE_TRAIT_IDS } from "./constants";
import {
  aiRadarExtractionV1Schema,
  type AiRadarExtractionV1,
} from "./schema";

export type ValidationErrorCode =
  | "FORBIDDEN_SCORE_FIELD"
  | "SCHEMA_PARSE_ERROR"
  | "CROSS_FIELD_VIOLATION"
  | "CORE_TRAITS_INCOMPLETE"
  | "NONE_WITH_INSUFFICIENT_DATA"
  | "FIT_POLICY_VIOLATION"
  | "RELEVANCE_CEILING_VIOLATION"
  | "SOURCE_REF_VIOLATION";

export type ValidationIssue = {
  code: ValidationErrorCode;
  path: string;
  message: string;
};

export type ValidationResult =
  | { success: true; data: AiRadarExtractionV1 }
  | { success: false; issues: ValidationIssue[] };

export type ValidateAiRadarExtractionOptions = {
  corpus?: CandidateContentCorpus;
};

function collectForbiddenKeys(
  value: unknown,
  path = "",
  issues: ValidationIssue[] = [],
): ValidationIssue[] {
  if (value === null || typeof value !== "object") {
    return issues;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectForbiddenKeys(item, `${path}[${index}]`, issues);
    });
    return issues;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_AI_SCORE_KEYS.includes(key as (typeof FORBIDDEN_AI_SCORE_KEYS)[number])) {
      issues.push({
        code: "FORBIDDEN_SCORE_FIELD",
        path: nextPath,
        message: `Field "${key}" is forbidden on AI extraction output`,
      });
    }
    collectForbiddenKeys(nested, nextPath, issues);
  }

  return issues;
}

function collectSourceRefs(value: unknown, path = "", refs: Array<{ path: string; content_id: string }> = []) {
  if (value === null || typeof value !== "object") return refs;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectSourceRefs(item, `${path}[${index}]`, refs);
    });
    return refs;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (key === "source_refs" && Array.isArray(nested)) {
      nested.forEach((ref, index) => {
        if (
          ref &&
          typeof ref === "object" &&
          "content_id" in ref &&
          typeof (ref as { content_id: unknown }).content_id === "string"
        ) {
          refs.push({
            path: `${nextPath}[${index}].content_id`,
            content_id: (ref as { content_id: string }).content_id,
          });
        }
      });
    }
    collectSourceRefs(nested, nextPath, refs);
  }

  return refs;
}

function validateSourceRefsAgainstCorpus(
  data: AiRadarExtractionV1,
  corpus: CandidateContentCorpus,
  issues: ValidationIssue[],
): void {
  const allowed = buildAllowedContentIdSet(corpus);
  const refs = collectSourceRefs(data);

  for (const ref of refs) {
    if (!allowed.has(ref.content_id)) {
      issues.push({
        code: "SOURCE_REF_VIOLATION",
        path: ref.path,
        message: `source_ref.content_id must reference normalized_content_id — unknown id "${ref.content_id}"`,
      });
    }
  }
}

function validateLevelWhenAvailable(
  label: string,
  assessment: {
    availability: "available" | "unknown" | "partial";
    level?: string;
    source_refs?: unknown[];
    reasoning: string;
  },
  issues: ValidationIssue[],
): void {
  if (assessment.availability === "available") {
    if (assessment.level === undefined) {
      issues.push({
        code: "CROSS_FIELD_VIOLATION",
        path: label,
        message: "level is required when availability is available",
      });
      return;
    }

    if (assessment.level !== "none" && (assessment.source_refs?.length ?? 0) < 1) {
      issues.push({
        code: "CROSS_FIELD_VIOLATION",
        path: label,
        message: "source_refs required when level is not none and data is available",
      });
    }

    if (
      assessment.level === "none" &&
      (assessment.source_refs?.length ?? 0) < 1
    ) {
      issues.push({
        code: "CROSS_FIELD_VIOLATION",
        path: label,
        message:
          "level none requires available data — include source_refs showing sufficient content was reviewed",
      });
    }
    return;
  }

  if ("level" in assessment && assessment.level !== undefined) {
    issues.push({
      code: "NONE_WITH_INSUFFICIENT_DATA",
      path: label,
      message: `level must not be set when availability is ${assessment.availability} — insufficient data cannot be expressed as none`,
    });
  }
}

function validateNaturalEntry(
  entry: AiRadarExtractionV1["contactability"]["natural_entry"],
  issues: ValidationIssue[],
): void {
  validateLevelWhenAvailable("contactability.natural_entry", entry, issues);

  if (entry.availability === "available") {
    if (entry.level === "none" && (entry.topic || entry.entry_context)) {
      issues.push({
        code: "CROSS_FIELD_VIOLATION",
        path: "contactability.natural_entry",
        message: "topic/entry_context must not be set when natural_entry level is none",
      });
    }
  } else if (
    ("topic" in entry && entry.topic) ||
    ("entry_context" in entry && entry.entry_context)
  ) {
    issues.push({
      code: "CROSS_FIELD_VIOLATION",
      path: "contactability.natural_entry",
      message: "topic/entry_context must not be set when natural_entry data is unavailable",
    });
  }
}

function validateNeedsModule(
  needs: AiRadarExtractionV1["needs"],
  fitPolicyVersion: string,
  issues: ValidationIssue[],
): void {
  if (fitPolicyVersion !== FIT_POLICY_ID) {
    issues.push({
      code: "FIT_POLICY_VIOLATION",
      path: "fit_policy_version",
      message: `unsupported fit_policy_version "${fitPolicyVersion}" — expected ${FIT_POLICY_ID}`,
    });
  }

  if (needs.availability !== "available") {
    return;
  }

  const umbrellaViolation = validateUmbrellaNeedExclusion({ items: needs.items });
  if (umbrellaViolation) {
    issues.push({
      code: "RELEVANCE_CEILING_VIOLATION",
      path: umbrellaViolation.path,
      message: umbrellaViolation.message,
    });
  }

  for (const [index, need] of needs.items.entries()) {
    const path = `needs.items[${index}]`;

    if (need.strength === "none") {
      issues.push({
        code: "NONE_WITH_INSUFFICIENT_DATA",
        path,
        message:
          "need items must not use strength none — omit undetected needs; empty items array means no needs detected",
      });
    }
    if (need.strength !== "none" && need.source_refs.length < 1) {
      issues.push({
        code: "CROSS_FIELD_VIOLATION",
        path,
        message: "source_refs required for detected needs",
      });
    }

    if (!isNeedTypeSlug(need.need_type)) {
      issues.push({
        code: "FIT_POLICY_VIOLATION",
        path: `${path}.need_type`,
        message: `unknown need_type "${need.need_type}"`,
      });
      continue;
    }

    const policyEntry = getNeedTypeDefinition(need.need_type);
    const relevanceViolation = validateNeedRelevanceAgainstPolicy({
      need_type: need.need_type,
      relevance: need.relevance,
      relevance_evidence_quality: need.relevance_evidence_quality,
      default_relevance: policyEntry.default_relevance,
      relevance_ceiling: policyEntry.relevance_ceiling,
      path: `${path}.relevance`,
    });
    if (relevanceViolation) {
      issues.push({
        code: "RELEVANCE_CEILING_VIOLATION",
        path: relevanceViolation.path,
        message: relevanceViolation.message,
      });
    }

    if (need.need_type === "health_management") {
      const healthViolation = validateHealthManagementEvidence({
        reasoning: need.reasoning,
        path: `${path}.reasoning`,
      });
      if (healthViolation) {
        issues.push({
          code: "FIT_POLICY_VIOLATION",
          path: healthViolation.path,
          message: healthViolation.message,
        });
      }
    }
  }
}

function validateCoreTraits(
  coreTraits: AiRadarExtractionV1["core_traits"],
  issues: ValidationIssue[],
): void {
  const ids = coreTraits.map((t) => t.trait_id);
  const expected = [...CORE_TRAIT_IDS];
  for (const traitId of expected) {
    if (!ids.includes(traitId)) {
      issues.push({
        code: "CORE_TRAITS_INCOMPLETE",
        path: "core_traits",
        message: `missing trait_id ${traitId}`,
      });
    }
  }
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    issues.push({
      code: "CORE_TRAITS_INCOMPLETE",
      path: "core_traits",
      message: "duplicate trait_id entries are forbidden",
    });
  }
}

function validateCrossFieldRules(
  data: AiRadarExtractionV1,
  options?: ValidateAiRadarExtractionOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  validateLevelWhenAvailable(
    "change_window.change_intent",
    data.change_window.change_intent,
    issues,
  );
  validateLevelWhenAvailable(
    "change_window.behavioral_change",
    data.change_window.behavioral_change,
    issues,
  );
  validateLevelWhenAvailable(
    "change_window.solution_gap",
    data.change_window.solution_gap,
    issues,
  );
  validateNaturalEntry(data.contactability.natural_entry, issues);
  validateLevelWhenAvailable(
    "contactability.interaction_openness",
    data.contactability.interaction_openness,
    issues,
  );
  validateNeedsModule(data.needs, data.fit_policy_version, issues);
  validateCoreTraits(data.core_traits, issues);

  if (
    data.location.availability === "available" &&
    !data.location.normalized_city &&
    !data.location.normalized_district
  ) {
    issues.push({
      code: "CROSS_FIELD_VIOLATION",
      path: "location",
      message:
        "normalized_city or normalized_district required when location availability is available",
    });
  }

  if (options?.corpus) {
    validateSourceRefsAgainstCorpus(data, options.corpus, issues);
  }

  return issues;
}

function zodIssuesToValidationIssues(issues: ZodIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    code: "SCHEMA_PARSE_ERROR" as const,
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

export function validateAiRadarExtraction(
  input: unknown,
  options: ValidateAiRadarExtractionOptions = {},
): ValidationResult {
  const forbiddenIssues = collectForbiddenKeys(input);
  if (forbiddenIssues.length > 0) {
    return { success: false, issues: forbiddenIssues };
  }

  const parsed = aiRadarExtractionV1Schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: zodIssuesToValidationIssues(parsed.error.issues),
    };
  }

  const crossFieldIssues = validateCrossFieldRules(parsed.data, options);
  if (crossFieldIssues.length > 0) {
    return { success: false, issues: crossFieldIssues };
  }

  return { success: true, data: parsed.data };
}
