/**
 * Go21 activation lifecycle smoke (service role).
 *
 * Run:
 *   npx vercel env run --environment=preview -- npx tsx scripts/go21-activation-e2e-smoke.ts
 *
 * Or with env already loaded. Never prints secrets.
 * Covers: new customer upsert → activate → idempotent re-activate → portal /go21 context.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { activateExperience21d } from "../src/lib/analysis/handoff/experience-21d-activation";
import { coachingTodayLogDate } from "../src/lib/coaching/coaching-time";
import { requireGo21Portal } from "../src/lib/go21/go21-portal";
import { isExperience21dEnrollment } from "../src/lib/coaching/experience-21d";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value === "[SENSITIVE]" || value.startsWith("[SENSITIVE]")) {
    throw new Error(`missing_or_placeholder:${name}`);
  }
  return value;
}

async function main() {
  const out: {
    ok: boolean;
    checks: Record<string, unknown>;
    error?: string;
  } = { ok: false, checks: {} };

  const created = {
    customerIds: [] as string[],
    enrollmentIds: [] as string[],
  };

  try {
    const url = required("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
    // Ensure service modules see the same env
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (memberError || !member?.id) throw new Error(`no_member:${memberError?.message ?? "empty"}`);
    const ownerMemberId = String(member.id);

    const productReceivedDate = coachingTodayLogDate();

    // --- A: brand-new customer (never pre-inserted) via activation upsert ---
    const newCustomerId = randomUUID();
    created.customerIds.push(newCustomerId);
    const a1 = await activateExperience21d({
      ownerMemberId,
      customerId: newCustomerId,
      productReceivedDate,
      customerProfile: { displayName: "測試-E2E-新客" },
    });
    created.enrollmentIds.push(a1.enrollment.id);
    out.checks.newCustomerActivate = {
      pass:
        a1.alreadyActive === false &&
        Boolean(a1.portalToken) &&
        a1.customerDisplayName.includes("測試") &&
        isExperience21dEnrollment(a1.enrollment),
      enrollmentId: a1.enrollment.id,
      hasPortalToken: Boolean(a1.portalToken),
    };

    // Idempotent second tap
    const a2 = await activateExperience21d({
      ownerMemberId,
      customerId: newCustomerId,
      productReceivedDate,
      customerProfile: { displayName: "測試-E2E-新客" },
    });
    out.checks.newCustomerIdempotent = {
      pass:
        a2.alreadyActive === true &&
        a2.enrollment.id === a1.enrollment.id &&
        Boolean(a2.portalToken),
      sameEnrollment: a2.enrollment.id === a1.enrollment.id,
    };

    // Portal resolves to Go21
    const portalA = await requireGo21Portal(a1.portalToken);
    out.checks.newCustomerPortalGo21 = {
      pass: portalA.isGo21 === true && portalA.portal.customerId === newCustomerId,
      enrollmentId: portalA.enrollment.id,
    };

    // --- B: existing cloud customer ---
    const existingCustomerId = randomUUID();
    created.customerIds.push(existingCustomerId);
    const { error: insertErr } = await supabase.from("customers").insert({
      id: existingCustomerId,
      owner_member_id: ownerMemberId,
      display_name: "測試-E2E-既有",
      status: "active",
    });
    if (insertErr) throw new Error(`existing_insert:${insertErr.message}`);

    const b1 = await activateExperience21d({
      ownerMemberId,
      customerId: existingCustomerId,
      productReceivedDate,
      customerProfile: { displayName: "測試-E2E-既有" },
    });
    created.enrollmentIds.push(b1.enrollment.id);
    out.checks.existingCustomerActivate = {
      pass:
        b1.alreadyActive === false &&
        b1.customerDisplayName.includes("既有") &&
        Boolean(b1.portalToken),
    };

    const b2 = await activateExperience21d({
      ownerMemberId,
      customerId: existingCustomerId,
      productReceivedDate,
    });
    out.checks.existingCustomerIdempotent = {
      pass: b2.alreadyActive === true && b2.enrollment.id === b1.enrollment.id,
    };

    const portalB = await requireGo21Portal(b1.portalToken);
    out.checks.existingCustomerPortalGo21 = {
      pass: portalB.isGo21 === true && portalB.portal.customerId === existingCustomerId,
    };

    out.ok = Object.values(out.checks).every(
      (c) => typeof c === "object" && c !== null && "pass" in c && (c as { pass: boolean }).pass,
    );
  } catch (error) {
    out.error = error instanceof Error ? error.message : String(error);
    out.ok = false;
  } finally {
    // Cleanup enrollments then customers
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && key) {
        const supabase = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        if (created.enrollmentIds.length) {
          await supabase.from("coaching_enrollments").delete().in("id", created.enrollmentIds);
        }
        if (created.customerIds.length) {
          await supabase.from("customer_portal_tokens").delete().in("customer_id", created.customerIds);
          await supabase.from("customers").delete().in("id", created.customerIds);
        }
      }
    } catch {
      // best-effort
    }
  }

  writeFileSync(".tmp-go21-activation-e2e-smoke.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: out.ok, checks: out.checks, error: out.error ?? null }, null, 2));
  process.exit(out.ok ? 0 : 1);
}

void main();
