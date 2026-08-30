import { AnalysisSessionError } from "@/lib/analysis/analysis-session-service";
import { normalizeCustomerPhone } from "@/lib/customers/customer-profile";
import {
  CoachingServiceError,
  createCoachingEnrollment,
  getActiveEnrollmentForCustomer,
  serializeCoachingEnrollment,
} from "@/lib/coaching/coaching-service";
import { cloneDefaultCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import {
  deriveExperience21dSchedule,
  isExperience21dEnrollment,
  isIsoDate,
  safe21dReturnPath,
  withExperience21dSnapshot,
} from "@/lib/coaching/experience-21d";
import { resolveEnrollmentStartDate } from "@/lib/coaching/enrollment-window";
import {
  ensureCustomerPortalTokenServiceRole,
  ensureOwnedCloudCustomer,
} from "@/lib/go21/ensure-cloud-customer";
import {
  buildGo21DailyTargetsSnapshot,
  loadGo21DailyTargetsRecord,
  saveGo21DailyTargets,
} from "@/lib/go21/daily-targets";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

function requireService() {
  if (!isSupabaseServiceConfigured()) {
    throw new AnalysisSessionError("Service unavailable.", 503, "unavailable");
  }
  return createSupabaseServiceClient();
}

function normalizeLineId(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export type Experience21dMatchedCustomer = {
  id: string;
  displayName: string;
  phone: string | null;
  lineId: string | null;
};

export type Experience21dActivationContext = {
  interest: {
    id: string;
    displayName: string;
    status: string;
    contactChannel: string | null;
    contactValue: string | null;
    customerId: string | null;
  };
  matchedCustomer: Experience21dMatchedCustomer | null;
  prefill: {
    displayName: string;
    phone: string | null;
    lineId: string | null;
  };
  createCustomerHref: string;
  activeExperience: {
    enrollmentId: string;
    startDate: string | null;
    plannedEndAt: string | null;
    status: string;
  } | null;
  activeOtherCoaching: boolean;
};

export async function getExperience21dActivationContext(
  ownerMemberId: string,
  interestId: string,
): Promise<Experience21dActivationContext | null> {
  const supabase = requireService();
  const { data } = await supabase
    .from("experience_21d_interests")
    .select("id, display_name, status, contact_channel, contact_value, customer_id, owner_member_id")
    .eq("id", interestId)
    .eq("owner_member_id", ownerMemberId)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) return null;

  const displayName = String(data.display_name || "").trim() || "尚未留名";
  const channel = data.contact_channel ? String(data.contact_channel) : null;
  const value = data.contact_value ? String(data.contact_value) : null;
  const linkedCustomerId = data.customer_id ? String(data.customer_id) : null;
  const matchedCustomer = await matchOwnedCustomer({
    ownerMemberId,
    linkedCustomerId,
    channel,
    value,
  });
  const active = matchedCustomer
    ? await getActiveEnrollmentForCustomer({
        customerId: matchedCustomer.id,
        ownerMemberId,
      })
    : null;
  const returnPath = `/quiz/21d/${interestId}/start`;
  const params = new URLSearchParams({ create: "1", returnTo: returnPath });
  if (displayName && displayName !== "尚未留名") params.set("name", displayName);
  if (channel === "phone" && value) params.set("phone", value);
  if (channel === "line" && value) params.set("line", value);

  return {
    interest: {
      id: String(data.id),
      displayName,
      status: String(data.status),
      contactChannel: channel,
      contactValue: value,
      customerId: linkedCustomerId,
    },
    matchedCustomer,
    prefill: {
      displayName: displayName === "尚未留名" ? "" : displayName,
      phone: channel === "phone" ? value : null,
      lineId: channel === "line" ? value : null,
    },
    createCustomerHref: `/customers/list?${params.toString()}`,
    activeExperience:
      active && isExperience21dEnrollment(active)
        ? {
            enrollmentId: active.id,
            startDate: resolveEnrollmentStartDate(active.startedAt),
            plannedEndAt: active.plannedEndAt ?? null,
            status: active.status,
          }
        : null,
    activeOtherCoaching: Boolean(active && !isExperience21dEnrollment(active)),
  };
}

async function matchOwnedCustomer(input: {
  ownerMemberId: string;
  linkedCustomerId: string | null;
  channel: string | null;
  value: string | null;
}): Promise<Experience21dMatchedCustomer | null> {
  const supabase = requireService();
  if (input.linkedCustomerId) {
    const linked = await loadOwnedCustomer(input.ownerMemberId, input.linkedCustomerId);
    if (linked) return linked;
  }
  if (input.channel === "phone" && input.value) {
    const normalized = normalizeCustomerPhone(input.value);
    const { data } = await supabase
      .from("customers")
      .select("id, display_name, phone, line_id")
      .eq("owner_member_id", input.ownerMemberId)
      .not("phone", "is", null);
    const match = (data ?? []).find(
      (row) => row.phone && normalizeCustomerPhone(String(row.phone)) === normalized,
    );
    if (match) return mapCustomer(match);
  }
  if (input.channel === "line" && input.value) {
    const normalized = normalizeLineId(input.value);
    const { data } = await supabase
      .from("customers")
      .select("id, display_name, phone, line_id")
      .eq("owner_member_id", input.ownerMemberId)
      .not("line_id", "is", null);
    const match = (data ?? []).find(
      (row) => row.line_id && normalizeLineId(String(row.line_id)) === normalized,
    );
    if (match) return mapCustomer(match);
  }
  return null;
}

async function loadOwnedCustomer(
  ownerMemberId: string,
  customerId: string,
): Promise<Experience21dMatchedCustomer | null> {
  const supabase = requireService();
  const { data } = await supabase
    .from("customers")
    .select("id, display_name, phone, line_id")
    .eq("id", customerId)
    .eq("owner_member_id", ownerMemberId)
    .maybeSingle();
  return data ? mapCustomer(data) : null;
}

function mapCustomer(row: {
  id: string;
  display_name: string;
  phone: string | null;
  line_id: string | null;
}): Experience21dMatchedCustomer {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    phone: row.phone ? String(row.phone) : null,
    lineId: row.line_id ? String(row.line_id) : null,
  };
}

export async function activateExperience21d(input: {
  ownerMemberId: string;
  customerId: string;
  productReceivedDate: string;
  interestId?: string | null;
  /** Local CRM profile — used to upsert cloud customer when sync has not finished. */
  customerProfile?: {
    displayName?: string | null;
    phone?: string | null;
    lineId?: string | null;
    heightCm?: number | null;
    sex?: string | null;
    birthYear?: number | null;
    birthDate?: string | null;
  } | null;
  /** Optional daily coaching targets set at activation. */
  dailyTargets?: {
    waterMl?: number | null;
    caloriesKcal?: number | null;
    proteinG?: number | null;
    sleepHours?: number | null;
  } | null;
}): Promise<{
  alreadyActive: boolean;
  enrollment: ReturnType<typeof serializeCoachingEnrollment>;
  schedule: ReturnType<typeof deriveExperience21dSchedule>;
  customerDisplayName: string;
  portalToken: string;
}> {
  if (!isIsoDate(input.productReceivedDate)) {
    throw new CoachingServiceError("請選擇顧客拿到產品的日期", 400);
  }

  // Ensure cloud customer exists (local CRM → cloud race is a common activation failure).
  const ensured = await ensureOwnedCloudCustomer({
    ownerMemberId: input.ownerMemberId,
    customerId: input.customerId,
    profile: input.customerProfile,
  });
  const customer = (await loadOwnedCustomer(input.ownerMemberId, input.customerId)) ?? {
    id: ensured.id,
    displayName: ensured.displayName,
    phone: null,
    lineId: null,
  };

  let interestId: string | undefined;
  if (input.interestId) {
    const context = await getExperience21dActivationContext(input.ownerMemberId, input.interestId);
    if (!context) throw new AnalysisSessionError("找不到這筆名單", 404, "not_found");
    if (context.interest.status !== "joined") {
      throw new CoachingServiceError("請先確認成交", 409);
    }
    interestId = context.interest.id;
  }

  const schedule = deriveExperience21dSchedule(input.productReceivedDate);
  const portal = await ensureCustomerPortalTokenServiceRole(input.customerId);
  const existing = await getActiveEnrollmentForCustomer({
    customerId: input.customerId,
    ownerMemberId: input.ownerMemberId,
  });
  if (existing) {
    if (isExperience21dEnrollment(existing)) {
      if (input.dailyTargets) {
        await maybeSaveActivationTargets({
          enrollmentId: existing.id,
          customerId: input.customerId,
          ownerMemberId: input.ownerMemberId,
          dailyTargets: input.dailyTargets,
        });
      }
      return {
        alreadyActive: true,
        enrollment: serializeCoachingEnrollment(existing),
        schedule: {
          productReceivedDate:
            existing.planSnapshot.experience21d?.productReceivedDate ?? input.productReceivedDate,
          startDate: resolveEnrollmentStartDate(existing.startedAt) ?? schedule.startDate,
          plannedEndAt: existing.plannedEndAt ?? schedule.plannedEndAt,
        },
        customerDisplayName: customer.displayName,
        portalToken: portal.token,
      };
    }
    throw new CoachingServiceError("這位顧客目前已在陪跑中", 409);
  }

  const snapshot = withExperience21dSnapshot(cloneDefaultCoachingPlanSnapshot(), {
    productReceivedDate: schedule.productReceivedDate,
    interestId,
  });

  let enrollment;
  try {
    enrollment = await createCoachingEnrollment({
      customerId: input.customerId,
      ownerMemberId: input.ownerMemberId,
      goal: "21 天體驗",
      planSnapshot: snapshot,
      startDate: schedule.startDate,
      plannedEndAt: schedule.plannedEndAt,
    });
  } catch (error) {
    if (error instanceof CoachingServiceError && error.status === 409) {
      const raced = await getActiveEnrollmentForCustomer({
        customerId: input.customerId,
        ownerMemberId: input.ownerMemberId,
      });
      if (raced && isExperience21dEnrollment(raced)) {
        return {
          alreadyActive: true,
          enrollment: serializeCoachingEnrollment(raced),
          schedule,
          customerDisplayName: customer.displayName,
          portalToken: portal.token,
        };
      }
    }
    throw error;
  }

  if (interestId) {
    const supabase = requireService();
    await supabase
      .from("experience_21d_interests")
      .update({ customer_id: input.customerId, updated_at: new Date().toISOString() })
      .eq("id", interestId)
      .eq("owner_member_id", input.ownerMemberId);
  }

  if (input.dailyTargets) {
    await maybeSaveActivationTargets({
      enrollmentId: enrollment.id,
      customerId: input.customerId,
      ownerMemberId: input.ownerMemberId,
      dailyTargets: input.dailyTargets,
    });
  }

  return {
    alreadyActive: false,
    enrollment: serializeCoachingEnrollment(enrollment),
    schedule,
    customerDisplayName: customer.displayName,
    portalToken: portal.token,
  };
}

async function maybeSaveActivationTargets(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  dailyTargets: {
    waterMl?: number | null;
    caloriesKcal?: number | null;
    proteinG?: number | null;
    sleepHours?: number | null;
  };
}): Promise<void> {
  const t = input.dailyTargets;
  if (
    t.waterMl == null &&
    t.caloriesKcal == null &&
    t.proteinG == null &&
    t.sleepHours == null
  ) {
    return;
  }
  try {
    const snapshot = buildGo21DailyTargetsSnapshot({
      waterMl: t.waterMl,
      caloriesKcal: t.caloriesKcal,
      proteinG: t.proteinG,
      sleepHours: t.sleepHours,
      source: "activation",
    });
    const prior = await loadGo21DailyTargetsRecord(input.enrollmentId);
    await saveGo21DailyTargets({
      enrollmentId: input.enrollmentId,
      customerId: input.customerId,
      ownerMemberId: input.ownerMemberId,
      snapshot,
      reason: "activation",
      prior,
    });
  } catch {
    // Targets column may be missing pre-070 — activation must still succeed.
  }
}

export function assertSafe21dReturnPath(raw: string | null | undefined): string | null {
  return safe21dReturnPath(raw);
}
