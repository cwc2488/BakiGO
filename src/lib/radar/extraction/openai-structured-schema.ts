import { ZodFirstPartyTypeKind, type ZodTypeAny } from "zod";
import { aiRadarExtractionV1Schema } from "./schema";

export type JsonSchema = Record<string, unknown>;

type ZodDef = {
  typeName: string;
  innerType?: ZodTypeAny;
  schema?: ZodTypeAny;
  shape?: () => Record<string, ZodTypeAny>;
  options?: ZodTypeAny[];
  values?: string[];
  value?: unknown;
  type?: ZodTypeAny;
  minLength?: { value: number } | null;
  maxLength?: { value: number } | null;
  exactLength?: { value: number } | null;
  checks?: Array<{ kind: string; value?: unknown; format?: string }>;
};

function defOf(schema: ZodTypeAny): ZodDef {
  return schema._def as ZodDef;
}

function unwrap(
  schema: ZodTypeAny,
): { schema: ZodTypeAny; optional: boolean; nullable: boolean } {
  let current = schema;
  let optional = false;
  let nullable = false;
  for (let i = 0; i < 12; i += 1) {
    const typeName = defOf(current).typeName;
    if (typeName === ZodFirstPartyTypeKind.ZodOptional) {
      optional = true;
      current = defOf(current).innerType as ZodTypeAny;
      continue;
    }
    if (typeName === ZodFirstPartyTypeKind.ZodNullable) {
      nullable = true;
      current = defOf(current).innerType as ZodTypeAny;
      continue;
    }
    if (typeName === ZodFirstPartyTypeKind.ZodDefault) {
      current = defOf(current).innerType as ZodTypeAny;
      continue;
    }
    if (typeName === ZodFirstPartyTypeKind.ZodEffects) {
      current = (defOf(current).schema ?? defOf(current).innerType) as ZodTypeAny;
      continue;
    }
    break;
  }
  return { schema: current, optional, nullable };
}

function withNull(schema: JsonSchema): JsonSchema {
  return { anyOf: [schema, { type: "null" }] };
}

function convert(schema: ZodTypeAny): JsonSchema {
  const unwrapped = unwrap(schema);
  const inner = convertCore(unwrapped.schema);
  if (unwrapped.optional || unwrapped.nullable) return withNull(inner);
  return inner;
}

function convertCore(schema: ZodTypeAny): JsonSchema {
  const def = defOf(schema);
  switch (def.typeName) {
    case ZodFirstPartyTypeKind.ZodString: {
      const checks = def.checks ?? [];
      const node: JsonSchema = { type: "string" };
      if (checks.some((check) => check.kind === "datetime")) {
        node.format = "date-time";
      }
      if (checks.some((check) => check.kind === "uuid")) {
        node.format = "uuid";
      }
      if (checks.some((check) => check.kind === "email")) {
        node.format = "email";
      }
      // OpenAI strict string constraints: pattern/format only. Encode min(1) as .+
      const min = checks.find((check) => check.kind === "min");
      if (typeof min?.value === "number" && min.value >= 1 && !node.format) {
        node.pattern = ".+";
      }
      return node;
    }
    case ZodFirstPartyTypeKind.ZodNumber: {
      return { type: "number" };
    }
    case ZodFirstPartyTypeKind.ZodBoolean: {
      return { type: "boolean" };
    }
    case ZodFirstPartyTypeKind.ZodLiteral: {
      const value = def.value;
      if (typeof value === "string") return { type: "string", enum: [value] };
      if (typeof value === "number") return { type: "number", enum: [value] };
      if (typeof value === "boolean") return { type: "boolean", enum: [value] };
      throw new Error("Unsupported Zod literal for OpenAI JSON Schema");
    }
    case ZodFirstPartyTypeKind.ZodEnum: {
      return { type: "string", enum: [...(def.values ?? [])] };
    }
    case ZodFirstPartyTypeKind.ZodArray: {
      const node: JsonSchema = {
        type: "array",
        items: convert(def.type as ZodTypeAny),
      };
      const min = def.minLength?.value ?? def.exactLength?.value;
      const max = def.maxLength?.value ?? def.exactLength?.value;
      if (typeof min === "number") node.minItems = min;
      if (typeof max === "number") node.maxItems = max;
      return node;
    }
    case ZodFirstPartyTypeKind.ZodObject: {
      const shape = def.shape ? def.shape() : {};
      const properties: Record<string, JsonSchema> = {};
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = convert(value);
      }
      return {
        type: "object",
        properties,
        required: Object.keys(properties),
        additionalProperties: false,
      };
    }
    case ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
    case ZodFirstPartyTypeKind.ZodUnion: {
      return {
        anyOf: (def.options ?? []).map((option) => convert(option)),
      };
    }
    default:
      throw new Error(`Unsupported Zod type for OpenAI structured output: ${def.typeName}`);
  }
}

/** OpenAI-strict JSON Schema generated from Extraction Schema v1. Not a second business schema. */
export function buildAiRadarExtractionOpenAiJsonSchema(): JsonSchema {
  const schema = convert(aiRadarExtractionV1Schema);
  if (schema.type !== "object") {
    throw new Error("Extraction v1 root must be an object for OpenAI structured outputs.");
  }
  return schema;
}

export const OPENAI_EXTRACTION_JSON_SCHEMA_NAME = "ai_radar_extraction_v1";

/**
 * Narrows source_refs[].content_id to the corpus ids supplied to the model.
 * Extraction v1 already rejects any other id; this makes an invented identifier
 * structurally impossible instead of a post-hoc validation failure.
 */
export function constrainSourceRefContentIds(
  node: JsonSchema,
  allowedContentIds: string[],
): JsonSchema {
  if (allowedContentIds.length === 0) return node;

  const walk = (current: JsonSchema, insideSourceRefs: boolean): JsonSchema => {
    if (Array.isArray(current.anyOf)) {
      return {
        ...current,
        anyOf: (current.anyOf as JsonSchema[]).map((option) => walk(option, insideSourceRefs)),
      };
    }
    if (current.type === "array" && current.items && typeof current.items === "object") {
      return { ...current, items: walk(current.items as JsonSchema, insideSourceRefs) };
    }
    if (current.type === "object" && current.properties) {
      const properties = current.properties as Record<string, JsonSchema>;
      const next: Record<string, JsonSchema> = {};
      for (const [key, value] of Object.entries(properties)) {
        if (insideSourceRefs && key === "content_id") {
          next[key] = { type: "string", enum: [...allowedContentIds] };
          continue;
        }
        next[key] = walk(value, insideSourceRefs || key === "source_refs");
      }
      return { ...current, properties: next };
    }
    return current;
  };

  return walk(node, false);
}

export function buildOpenAiExtractionResponseFormat(options?: {
  allowedContentIds?: string[];
}) {
  const base = buildAiRadarExtractionOpenAiJsonSchema();
  const schema = options?.allowedContentIds
    ? constrainSourceRefContentIds(base, options.allowedContentIds)
    : base;
  return {
    type: "json_schema" as const,
    json_schema: {
      name: OPENAI_EXTRACTION_JSON_SCHEMA_NAME,
      strict: true,
      schema,
    },
  };
}

/**
 * OpenAI strict mode encodes omitted optionals as JSON null.
 * Zod v1 treats those fields as optional (absent), not nullable.
 * This is a wire-format mapping, not content repair.
 */
export function omitJsonNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitJsonNulls);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested === null) continue;
      output[key] = omitJsonNulls(nested);
    }
    return output;
  }
  return value;
}

export function assertOpenAiStrictObjectGraph(node: JsonSchema, path = "$"): void {
  if (node.anyOf && Array.isArray(node.anyOf)) {
    for (const [index, option] of (node.anyOf as JsonSchema[]).entries()) {
      assertOpenAiStrictObjectGraph(option, `${path}.anyOf[${index}]`);
    }
    return;
  }
  if (node.type === "object") {
    if (node.additionalProperties !== false) {
      throw new Error(`${path} must set additionalProperties: false`);
    }
    const properties = (node.properties as Record<string, JsonSchema> | undefined) ?? {};
    const required = new Set((node.required as string[] | undefined) ?? []);
    for (const key of Object.keys(properties)) {
      if (!required.has(key)) {
        throw new Error(`${path}.${key} must be required for OpenAI strict mode`);
      }
      assertOpenAiStrictObjectGraph(properties[key], `${path}.${key}`);
    }
    return;
  }
  if (node.type === "array" && node.items && typeof node.items === "object") {
    assertOpenAiStrictObjectGraph(node.items as JsonSchema, `${path}.items`);
  }
}
