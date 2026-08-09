import {
  FIT_POLICY_ID,
  FIT_POLICY_VERSION,
  NEED_TYPE_DEFINITIONS,
  NEED_TYPE_SLUGS,
  type NeedTypeDefinition,
  type NeedTypeSlug,
} from "./need-types";

export type FitPolicyV1 = {
  policy_id: typeof FIT_POLICY_ID;
  version: typeof FIT_POLICY_VERSION;
  need_types: NeedTypeDefinition[];
};

export const FIT_POLICY_V1: FitPolicyV1 = {
  policy_id: FIT_POLICY_ID,
  version: FIT_POLICY_VERSION,
  need_types: NEED_TYPE_SLUGS.map((slug) => NEED_TYPE_DEFINITIONS[slug]),
};

export function getFitPolicyNeedEntry(
  slug: NeedTypeSlug,
): NeedTypeDefinition {
  return NEED_TYPE_DEFINITIONS[slug];
}
