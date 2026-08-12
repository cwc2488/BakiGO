import { normalizeCustomerPhone } from "@/lib/customers/customer-profile";

export type ExistingCustomerMatch = {
  id: string;
  ownerMemberId: string;
  displayName: string;
  phone?: string | null;
  lineId?: string | null;
};

export type ConversionDecision =
  | { action: "create_new"; reason: "no_match" }
  | { action: "link_existing"; customerId: string; reason: "same_owner_phone" }
  | { action: "pending_only"; reason: "insufficient_identity" | "name_only" };

/**
 * Same-owner phone soft dedupe. Name-only never merges. Cross-owner never merges.
 */
export function decideFriendBConversion(input: {
  ownerMemberId: string;
  leadDisplayName: string;
  leadPhone: string | null | undefined;
  leadLineId: string | null | undefined;
  existingCustomers: ExistingCustomerMatch[];
}): ConversionDecision {
  const phone = input.leadPhone ? normalizeCustomerPhone(input.leadPhone) : "";
  const lineId = input.leadLineId?.trim() || "";

  if (phone) {
    const match = input.existingCustomers.find((customer) => {
      if (customer.ownerMemberId !== input.ownerMemberId) return false;
      if (!customer.phone) return false;
      return normalizeCustomerPhone(customer.phone) === phone;
    });
    if (match) {
      return { action: "link_existing", customerId: match.id, reason: "same_owner_phone" };
    }
    return { action: "create_new", reason: "no_match" };
  }

  if (lineId) {
    const lineMatch = input.existingCustomers.find(
      (customer) =>
        customer.ownerMemberId === input.ownerMemberId &&
        customer.lineId &&
        String(customer.lineId).trim() === lineId,
    );
    if (lineMatch) {
      return { action: "link_existing", customerId: lineMatch.id, reason: "same_owner_phone" };
    }
    return { action: "create_new", reason: "no_match" };
  }

  const name = input.leadDisplayName.trim();
  if (!name) {
    return { action: "pending_only", reason: "insufficient_identity" };
  }
  return { action: "pending_only", reason: "name_only" };
}

export function monthKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "invalid";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function computeReferralCenterMetrics(input: {
  asOfIso: string;
  shares: Array<{
    status: string;
    introducerCustomerId: string;
    createdAt: string;
  }>;
  attributions: Array<{
    status: string;
    linkedExistingCustomer: boolean;
    submittedAt: string | null;
    convertedAt: string | null;
    createdAt: string;
  }>;
}): {
  activeShareCustomerCount: number;
  sharesCreatedThisMonth: number;
  interestedFriendsThisMonth: number;
  newCustomersThisMonth: number;
} {
  const month = monthKeyFromIso(input.asOfIso);
  const activeCustomers = new Set(
    input.shares
      .filter((share) => share.status === "active" || share.status === "pending_consent")
      .map((share) => share.introducerCustomerId),
  );
  const sharesCreatedThisMonth = input.shares.filter(
    (share) => monthKeyFromIso(share.createdAt) === month,
  ).length;
  const interestedFriendsThisMonth = input.attributions.filter((row) => {
    const ts = row.submittedAt ?? row.createdAt;
    if (monthKeyFromIso(ts) !== month) return false;
    return ["interested", "submitted", "customer_created"].includes(row.status);
  }).length;
  const newCustomersThisMonth = input.attributions.filter((row) => {
    if (row.status !== "customer_created") return false;
    if (row.linkedExistingCustomer) return false;
    const ts = row.convertedAt ?? row.submittedAt ?? row.createdAt;
    return monthKeyFromIso(ts) === month;
  }).length;

  return {
    activeShareCustomerCount: activeCustomers.size,
    sharesCreatedThisMonth,
    interestedFriendsThisMonth,
    newCustomersThisMonth,
  };
}
