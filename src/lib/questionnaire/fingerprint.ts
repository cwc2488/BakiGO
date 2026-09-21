import { createHash } from "crypto";
import type { QuestionnaireContactType } from "@/types/questionnaire";

export function normalizeQuestionnaireContactValue(
  contactType: QuestionnaireContactType,
  raw: string,
): string {
  const trimmed = raw.trim();
  if (contactType === "instagram") {
    return trimmed.toLowerCase().replace(/^@+/, "");
  }
  if (contactType === "line") {
    return trimmed.toLowerCase();
  }
  // phone
  return trimmed.replace(/[\s\-()]+/g, "");
}

/**
 * SHA-256(owner_member_id + contact_type + normalized_contact)
 * Scoped per owner so same contact can exist under different partners.
 */
export function buildQuestionnaireContactFingerprint(input: {
  ownerMemberId: string;
  contactType: QuestionnaireContactType;
  contactValue: string;
}): string {
  const normalized = normalizeQuestionnaireContactValue(input.contactType, input.contactValue);
  const material = `${input.ownerMemberId}|${input.contactType}|${normalized}`;
  return createHash("sha256").update(material).digest("hex");
}
