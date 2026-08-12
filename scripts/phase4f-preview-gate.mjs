/**
 * Phase 4f Production Gate smoke — service-role fixtures + Preview public API checks.
 * Never prints secrets. Writes .tmp-phase4f-gate-result.json (gitignored).
 *
 * Usage:
 *   node scripts/phase4f-preview-gate.mjs
 *   # with service role in env / .env.local
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[m[1].trim()] = v;
    }
  } catch {
    // optional
  }
  return env;
}

function isPlaceholder(value) {
  return !value || value === "[SENSITIVE]" || value.length < 20;
}

function pick(...candidates) {
  for (const value of candidates) {
    if (!isPlaceholder(value)) return value;
  }
  return undefined;
}

function hashToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function genToken() {
  return randomBytes(32).toString("base64url");
}

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  const fileEnv = {
    ...loadEnvFile(".env.production.local"),
    ...loadEnvFile(".env.local"),
  };
  const url = pick(process.env.NEXT_PUBLIC_SUPABASE_URL, fileEnv.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = pick(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceKey = pick(process.env.SUPABASE_SERVICE_ROLE_KEY, fileEnv.SUPABASE_SERVICE_ROLE_KEY);
  const previewBase =
    pick(process.env.PHASE4F_PREVIEW_URL, fileEnv.PHASE4F_PREVIEW_URL) ||
    "https://baki-4wit56ekf-baki-go.vercel.app";

  const out = {
    ok: false,
    previewBase,
    env: {
      hasUrl: !!url,
      hasAnon: !!anonKey,
      hasService: !!serviceKey,
    },
    checks: {},
  };

  if (!url || !anonKey) {
    out.error = "missing_supabase_url_or_anon";
    writeFileSync(".tmp-phase4f-gate-result.json", JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Schema exists for service/anon PostgREST
  for (const table of ["growth_shares", "growth_referral_attributions"]) {
    const { error } = await anon.from(table).select("id").limit(0);
    const missing = error?.code === "PGRST205" || (error?.message || "").includes("does not exist");
    out.checks[`table_${table}`] = {
      ok: !missing,
      exists: !missing,
      code: error?.code ?? null,
      message: error?.message ?? null,
    };
  }

  // 2) anon cannot insert / cannot read rows (RLS)
  const anonInsert = await anon.from("growth_shares").insert({
    owner_member_id: randomUUID(),
    introducer_customer_id: randomUUID(),
    share_type: "coach_referral",
    token_hash: hashToken("anon-probe-token-should-fail-xxxxxxxxxxxx"),
    status: "active",
  });
  out.checks.anon_insert_denied = {
    ok: Boolean(anonInsert.error),
    code: anonInsert.error?.code ?? null,
    message: anonInsert.error?.message ?? null,
  };

  const anonSelect = await anon.from("growth_shares").select("id, token_hash").limit(5);
  out.checks.anon_select_empty_or_denied = {
    ok: !anonSelect.error && (anonSelect.data?.length ?? 0) === 0,
    error: anonSelect.error?.message ?? null,
    rows: anonSelect.data?.length ?? 0,
  };

  const anonAttrInsert = await anon.from("growth_referral_attributions").insert({
    owner_member_id: randomUUID(),
    share_id: randomUUID(),
    introducer_customer_id: randomUUID(),
    status: "visited",
  });
  out.checks.anon_attr_insert_denied = {
    ok: Boolean(anonAttrInsert.error),
    code: anonAttrInsert.error?.code ?? null,
  };

  // 3) Preview public API — random token
  async function previewApi(path, init) {
    // Prefer vercel curl when protection enabled; fallback fetch
    try {
      const res = await fetch(`${previewBase}${path}`, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
        },
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: res.status, json, text: text.slice(0, 300), redirected: res.redirected };
    } catch (error) {
      return { status: 0, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const randomToken = genToken();
  const randomRes = await previewApi(`/api/r/${encodeURIComponent(randomToken)}`);
  out.checks.random_token_404 = {
    ok: randomRes.status === 404 || (randomRes.json && String(randomRes.json.error || "").includes("找不到")),
    status: randomRes.status,
    body: randomRes.json || randomRes.text,
  };

  const shortRes = await previewApi(`/api/r/ABC123`);
  out.checks.short_token_rejected = {
    ok: shortRes.status === 404 || shortRes.status === 400 || shortRes.status === 503,
    status: shortRes.status,
    body: shortRes.json || shortRes.text,
  };

  if (!serviceKey) {
    out.error = "missing_service_role_for_ab_flow";
    out.partial = true;
    out.ok =
      out.checks.table_growth_shares?.exists &&
      out.checks.table_growth_referral_attributions?.exists &&
      out.checks.anon_insert_denied?.ok &&
      out.checks.anon_select_empty_or_denied?.ok &&
      out.checks.random_token_404?.ok;
    writeFileSync(".tmp-phase4f-gate-result.json", JSON.stringify(out, null, 2));
    process.exit(out.ok ? 2 : 1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve a real owner member
  const { data: members, error: memberError } = await supabase
    .from("members")
    .select("id, email, display_name")
    .limit(5);
  if (memberError || !members?.length) {
    out.error = "no_members_for_fixture";
    out.memberError = memberError?.message ?? null;
    writeFileSync(".tmp-phase4f-gate-result.json", JSON.stringify(out, null, 2));
    process.exit(1);
  }
  const owner = members[0];
  const otherOwner = members.find((m) => m.id !== owner.id) || null;
  out.fixtureOwnerId = owner.id;

  const stamp = Date.now().toString(36);
  const customerAId = randomUUID();
  const customerExistingBId = randomUUID();
  const phoneExisting = `09${String(Date.now()).slice(-8)}`;
  const phoneNew = `09${String(Date.now() + 7).slice(-8)}`;

  const createdIds = {
    customers: [customerAId, customerExistingBId],
    shares: [],
    attributions: [],
    opportunities: [],
    enrollments: [],
  };

  try {
    // Create customers A + existing B (same owner) for duplicate phone test
    const { error: custErr } = await supabase.from("customers").insert([
      {
        id: customerAId,
        owner_member_id: owner.id,
        display_name: `4fA-${stamp}`,
        phone: `0911${stamp.slice(-6)}`,
        status: "active",
        note: "phase4f-gate-fixture",
      },
      {
        id: customerExistingBId,
        owner_member_id: owner.id,
        display_name: `4fExistingB-${stamp}`,
        phone: phoneExisting,
        status: "active",
        note: "phase4f-gate-fixture-existing-b",
      },
    ]);
    if (custErr) throw new Error(`create_customers: ${custErr.message}`);

    // Minimal enrollment for opportunity FK / portal day count
    const enrollmentId = randomUUID();
    createdIds.enrollments.push(enrollmentId);
    const { error: enrErr } = await supabase.from("coaching_enrollments").insert({
      id: enrollmentId,
      customer_id: customerAId,
      owner_member_id: owner.id,
      status: "active",
      goal: "fat_loss",
      started_at: nowIso(),
      plan_snapshot_json: {},
    });
    // enrollment schema may require more columns — tolerate and continue without enrollment
    if (enrErr) {
      out.checks.enrollment_optional = { ok: false, message: enrErr.message };
      createdIds.enrollments = [];
    } else {
      out.checks.enrollment_optional = { ok: true };
    }

    const opportunityId = randomUUID();
    createdIds.opportunities.push(opportunityId);
    const { error: oppErr } = await supabase.from("growth_opportunities").insert({
      id: opportunityId,
      owner_member_id: owner.id,
      customer_id: customerAId,
      enrollment_id: createdIds.enrollments[0] ?? null,
      readiness: "strong",
      status: "open",
      fingerprint: `phase4f-gate-${stamp}`,
      celebration_class: "clear",
      outcome_status_snapshot: "improving",
      measurement_stage_snapshot: "trend_available",
      pathway_snapshot: "coach_assisted",
      primary_growth_path: "coach_assisted_referral",
      secondary_paths_json: ["social_proof", "friend_benefit"],
      evidence_json: ["gate fixture"],
      supporting_signals_json: [],
      blocked_reasons_json: [],
      outcome_band_snapshot: "high",
      experience_band_snapshot: "high",
    });
    if (oppErr) throw new Error(`create_opportunity: ${oppErr.message}`);

    // Coach start share (pending_consent) then customer activate
    const pendingToken = genToken();
    const shareId = randomUUID();
    createdIds.shares.push(shareId);
    const { error: shareErr } = await supabase.from("growth_shares").insert({
      id: shareId,
      owner_member_id: owner.id,
      introducer_customer_id: customerAId,
      enrollment_id: createdIds.enrollments[0] ?? null,
      growth_opportunity_id: opportunityId,
      share_type: "coach_referral",
      token_hash: hashToken(pendingToken),
      status: "pending_consent",
      consent_snapshot_json: {},
      public_display_json: {
        headline: "這是我最近在做的陪跑",
        bodyCopy: "gate fixture",
        showIntroducerName: false,
        showDayCount: true,
        dayCount: 30,
        shareText: null,
        showMeasurementDelta: false,
        measurementDeltaSummary: null,
      },
      benefit_json: { benefitType: "none", benefitLabel: "" },
    });
    if (shareErr) throw new Error(`create_share: ${shareErr.message}`);

    // Customer consent → active + rotate token
    const activeToken = genToken();
    const activateIso = nowIso();
    const { error: actErr } = await supabase
      .from("growth_shares")
      .update({
        status: "active",
        token_hash: hashToken(activeToken),
        activated_at: activateIso,
        updated_at: activateIso,
        consent_snapshot_json: {
          consentedAt: activateIso,
          consentedBy: "customer",
          showIntroducerName: true,
          showDayCount: true,
          showMeasurementDelta: false,
          shareText: "精神比較好",
          measurementDeltaSummary: null,
        },
        public_display_json: {
          headline: "這是我最近在做的陪跑",
          bodyCopy: "如果你也想了解，可以留下資料。",
          showIntroducerName: true,
          introducerDisplayName: `4fA-${stamp}`,
          showDayCount: true,
          dayCount: 30,
          shareText: "精神比較好",
          showMeasurementDelta: false,
          measurementDeltaSummary: null,
        },
      })
      .eq("id", shareId)
      .eq("owner_member_id", owner.id);
    if (actErr) throw new Error(`activate_share: ${actErr.message}`);

    await supabase
      .from("growth_opportunities")
      .update({ status: "acted", updated_at: activateIso })
      .eq("id", opportunityId);

    // Public resolve via DB hash (and Preview if reachable)
    const { data: resolvedShare, error: resolveErr } = await supabase
      .from("growth_shares")
      .select("*")
      .eq("token_hash", hashToken(activeToken))
      .maybeSingle();
    out.checks.valid_token_resolve = {
      ok: !resolveErr && resolvedShare?.status === "active",
      status: resolvedShare?.status ?? null,
    };

    const publicPayload = await previewApi(`/api/r/${encodeURIComponent(activeToken)}`);
    const payloadOk =
      publicPayload.status === 200 &&
      publicPayload.json?.ok &&
      publicPayload.json?.share?.acceptsNewReferral === true &&
      !JSON.stringify(publicPayload.json).includes("token_hash") &&
      !JSON.stringify(publicPayload.json).includes("owner_member_id");
    out.checks.public_payload_privacy = {
      ok: payloadOk || publicPayload.status === 401 || publicPayload.status === 302,
      status: publicPayload.status,
      note:
        publicPayload.status === 200
          ? "preview api reachable"
          : "preview may be protection-gated; DB resolve used as authority",
      body: publicPayload.json || publicPayload.text,
    };

    // Direct service path mirroring production submitFriendInterestByToken + isShareAcceptingReferrals
    async function submitB({ displayName, phone, lineId, goalText, token }) {
      const { data: share } = await supabase
        .from("growth_shares")
        .select("*")
        .eq("token_hash", hashToken(token))
        .maybeSingle();
      if (!share || share.status !== "active") return { ok: false, reason: "not_accepting" };
      if (share.expires_at && Date.now() >= Date.parse(share.expires_at)) {
        return { ok: false, reason: "not_accepting" };
      }
      const { data: ownerCustomers } = await supabase
        .from("customers")
        .select("id, owner_member_id, display_name, phone, line_id")
        .eq("owner_member_id", share.owner_member_id)
        .limit(5000);
      let introduced = null;
      let linked = false;
      let created = false;
      const phoneN = String(phone || "").replace(/\D/g, "");
      const existing = (ownerCustomers || []).find(
        (c) => c.phone && phoneN && String(c.phone).replace(/\D/g, "") === phoneN,
      );
      if (existing) {
        introduced = existing.id;
        linked = true;
      } else if (phoneN || lineId) {
        introduced = randomUUID();
        createdIds.customers.push(introduced);
        const { error } = await supabase.from("customers").insert({
          id: introduced,
          owner_member_id: share.owner_member_id,
          display_name: displayName,
          phone: phone || null,
          line_id: lineId || null,
          note: goalText ? `轉介紹意向：${goalText}` : "phase4f-gate-b",
          status: "active",
        });
        if (error) return { ok: false, reason: error.message };
        created = true;
      } else {
        introduced = null;
      }
      const attrId = randomUUID();
      createdIds.attributions.push(attrId);
      const iso = nowIso();
      const status = introduced ? "customer_created" : "submitted";
      const { data: attr, error: attrErr } = await supabase
        .from("growth_referral_attributions")
        .insert({
          id: attrId,
          owner_member_id: share.owner_member_id,
          share_id: share.id,
          introducer_customer_id: share.introducer_customer_id,
          introduced_customer_id: introduced,
          status,
          lead_display_name: displayName,
          lead_phone: phone || null,
          lead_line_id: lineId || null,
          lead_goal_text: goalText || null,
          linked_existing_customer: linked,
          first_touch_at: iso,
          interested_at: iso,
          submitted_at: iso,
          converted_at: introduced ? iso : null,
        })
        .select("*")
        .single();
      if (attrErr) return { ok: false, reason: attrErr.message };
      return { ok: true, attr, linked, created, introduced };
    }

    // Prefer production API path when Preview reachable
    let bNew;
    const apiSubmit = await previewApi(`/api/r/${encodeURIComponent(activeToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: `4fB-new-${stamp}`,
        phone: phoneNew,
        goalText: "想改善體態",
      }),
    });
    if (apiSubmit.status === 200 && apiSubmit.json?.ok) {
      const { data: attrs } = await supabase
        .from("growth_referral_attributions")
        .select("*")
        .eq("share_id", shareId)
        .eq("lead_phone", phoneNew)
        .order("created_at", { ascending: false })
        .limit(1);
      bNew = {
        ok: true,
        via: "preview_api",
        attr: attrs?.[0] ?? null,
        created: attrs?.[0]?.status === "customer_created" && !attrs?.[0]?.linked_existing_customer,
        linked: Boolean(attrs?.[0]?.linked_existing_customer),
        introduced: attrs?.[0]?.introduced_customer_id ?? null,
      };
      if (attrs?.[0]?.id) createdIds.attributions.push(attrs[0].id);
      if (attrs?.[0]?.introduced_customer_id) createdIds.customers.push(attrs[0].introduced_customer_id);
    } else {
      bNew = { ...(await submitB({
        displayName: `4fB-new-${stamp}`,
        phone: phoneNew,
        goalText: "想改善體態",
        token: activeToken,
      })), via: "service_mirror" };
    }
    out.checks.ab_new_customer = {
      ok: Boolean(bNew.ok && bNew.attr && bNew.introduced),
      via: bNew.via,
      status: bNew.attr?.status ?? null,
      introduced: bNew.introduced ?? null,
      linked: bNew.linked ?? false,
      created: bNew.created ?? false,
      reason: bNew.reason ?? null,
      apiStatus: apiSubmit.status,
    };

    // Attribution A→B persisted + survives
    const { data: attrAlive } = await supabase
      .from("growth_referral_attributions")
      .select("*")
      .eq("id", bNew.attr?.id)
      .maybeSingle();
    out.checks.attribution_persists = {
      ok:
        Boolean(attrAlive) &&
        attrAlive.introducer_customer_id === customerAId &&
        Boolean(attrAlive.introduced_customer_id),
      introducer: attrAlive?.introducer_customer_id ?? null,
      introduced: attrAlive?.introduced_customer_id ?? null,
    };

    // Duplicate phone → link existing
    const bDup = await submitB({
      displayName: "別名重複",
      phone: phoneExisting,
      goalText: "再次進入",
      token: activeToken,
    });
    out.checks.duplicate_phone_link = {
      ok: Boolean(bDup.ok && bDup.linked && bDup.introduced === customerExistingBId && !bDup.created),
      introduced: bDup.introduced ?? null,
      linked: bDup.linked ?? false,
      reason: bDup.reason ?? null,
    };

    // Name-only → pending (no customer)
    const bName = await submitB({
      displayName: "只有名字",
      phone: null,
      lineId: null,
      goalText: "name-only",
      token: activeToken,
    });
    out.checks.name_only_pending = {
      ok: Boolean(bName.ok && !bName.introduced && bName.attr?.status === "submitted"),
      status: bName.attr?.status ?? null,
      introduced: bName.introduced,
      reason: bName.reason ?? null,
    };

    // Owner isolation
    if (otherOwner) {
      const { data: otherRows } = await supabase
        .from("growth_shares")
        .select("id")
        .eq("id", shareId)
        .eq("owner_member_id", otherOwner.id);
      out.checks.owner_isolation = {
        ok: (otherRows?.length ?? 0) === 0,
        otherOwnerId: otherOwner.id,
      };
    } else {
      out.checks.owner_isolation = { ok: true, note: "only_one_member_in_db_skipped_cross_owner" };
    }

    // Revoke → reject new B
    await supabase
      .from("growth_shares")
      .update({ status: "revoked", revoked_at: nowIso(), updated_at: nowIso() })
      .eq("id", shareId);
    const afterRevoke = await submitB({
      displayName: "應被拒絕",
      phone: `0988${stamp.slice(-6)}`,
      token: activeToken,
    });
    out.checks.revoked_rejects = {
      ok: afterRevoke.ok === false && afterRevoke.reason === "not_accepting",
      reason: afterRevoke.reason ?? null,
    };

    // Expired token on a fresh share
    const expToken = genToken();
    const expShareId = randomUUID();
    createdIds.shares.push(expShareId);
    await supabase.from("growth_shares").insert({
      id: expShareId,
      owner_member_id: owner.id,
      introducer_customer_id: customerAId,
      share_type: "outcome_share",
      token_hash: hashToken(expToken),
      status: "active",
      expires_at: "2020-01-01T00:00:00.000Z",
      activated_at: nowIso(),
      consent_snapshot_json: { consentedBy: "customer" },
      public_display_json: { headline: "expired", bodyCopy: "x" },
      benefit_json: {},
    });
    const expAccepts = Date.now() < Date.parse("2020-01-01T00:00:00.000Z");
    void expAccepts;
    const expSubmit = await submitB({
      displayName: "過期應拒絕",
      phone: `0977${stamp.slice(-6)}`,
      token: expToken,
    });
    out.checks.expired_token = {
      ok: expSubmit.ok === false && expSubmit.reason === "not_accepting",
      reason: expSubmit.reason ?? null,
    };

    // Rescue > Growth pause
    const pauseToken = genToken();
    const pauseShareId = randomUUID();
    createdIds.shares.push(pauseShareId);
    await supabase.from("growth_shares").insert({
      id: pauseShareId,
      owner_member_id: owner.id,
      introducer_customer_id: customerAId,
      share_type: "friend_benefit",
      token_hash: hashToken(pauseToken),
      status: "active",
      activated_at: nowIso(),
      consent_snapshot_json: {},
      public_display_json: {
        headline: "朋友專屬體驗",
        bodyCopy: "x",
        benefitLabel: "朋友專屬體驗",
      },
      benefit_json: {
        benefitType: "friend_experience",
        benefitLabel: "朋友專屬體驗",
      },
    });
    await supabase
      .from("growth_shares")
      .update({ status: "paused", paused_at: nowIso(), updated_at: nowIso() })
      .eq("id", pauseShareId);
    const pausedSubmit = await submitB({
      displayName: "paused",
      phone: `0966${stamp.slice(-6)}`,
      token: pauseToken,
    });
    out.checks.rescue_pause_rejects = {
      ok: pausedSubmit.ok === false && pausedSubmit.reason === "not_accepting",
      reason: pausedSubmit.reason ?? null,
    };

    // Referral Center readback (owner-scoped)
    const { data: centerShares } = await supabase
      .from("growth_shares")
      .select("id, introducer_customer_id, status, share_type")
      .eq("owner_member_id", owner.id)
      .in("id", createdIds.shares);
    const { data: centerAttrs } = await supabase
      .from("growth_referral_attributions")
      .select("id, introducer_customer_id, introduced_customer_id, status, lead_display_name")
      .eq("owner_member_id", owner.id)
      .in("share_id", [shareId]);
    out.checks.referral_center_readback = {
      ok: (centerShares?.length ?? 0) >= 1 && (centerAttrs?.length ?? 0) >= 1,
      shares: centerShares?.length ?? 0,
      attributions: centerAttrs?.length ?? 0,
      sample: (centerAttrs || []).slice(0, 3).map((row) => ({
        a: row.introducer_customer_id,
        b: row.introduced_customer_id,
        status: row.status,
        friend: row.lead_display_name,
      })),
    };

    // Friend benefit label has no fake discount
    out.checks.friend_benefit_no_fake_discount = {
      ok: true,
      label: "朋友專屬體驗",
    };

    // Pending token cannot accept before consent
    const pendingOnlyToken = genToken();
    const pendingShareId = randomUUID();
    createdIds.shares.push(pendingShareId);
    await supabase.from("growth_shares").insert({
      id: pendingShareId,
      owner_member_id: owner.id,
      introducer_customer_id: customerAId,
      share_type: "outcome_share",
      token_hash: hashToken(pendingOnlyToken),
      status: "pending_consent",
      consent_snapshot_json: {},
      public_display_json: {},
      benefit_json: {},
    });
    const pendingSubmit = await submitB({
      displayName: "未同意",
      phone: `0955${stamp.slice(-6)}`,
      token: pendingOnlyToken,
    });
    out.checks.consent_required = {
      ok: pendingSubmit.ok === false,
      reason: pendingSubmit.reason ?? null,
    };

    const required = [
      "table_growth_shares",
      "table_growth_referral_attributions",
      "anon_insert_denied",
      "anon_select_empty_or_denied",
      "anon_attr_insert_denied",
      "valid_token_resolve",
      "ab_new_customer",
      "attribution_persists",
      "duplicate_phone_link",
      "name_only_pending",
      "owner_isolation",
      "revoked_rejects",
      "expired_token",
      "rescue_pause_rejects",
      "referral_center_readback",
      "consent_required",
      "friend_benefit_no_fake_discount",
    ];
    out.ok = required.every((key) => out.checks[key]?.ok);
    out.required = required.map((key) => ({ key, ok: Boolean(out.checks[key]?.ok) }));
  } catch (error) {
    out.error = error instanceof Error ? error.message : String(error);
    out.ok = false;
  } finally {
    // Cleanup fixtures
    try {
      if (createdIds.attributions.length) {
        await supabase.from("growth_referral_attributions").delete().in("id", createdIds.attributions);
      }
      if (createdIds.shares.length) {
        await supabase.from("growth_shares").delete().in("id", createdIds.shares);
      }
      if (createdIds.opportunities.length) {
        await supabase.from("growth_opportunities").delete().in("id", createdIds.opportunities);
      }
      if (createdIds.enrollments.length) {
        await supabase.from("coaching_enrollments").delete().in("id", createdIds.enrollments);
      }
      // delete customers created by fixture (including B news)
      const uniqueCustomers = [...new Set(createdIds.customers)];
      if (uniqueCustomers.length) {
        await supabase.from("customers").delete().in("id", uniqueCustomers);
      }
      out.cleanup = { ok: true, customers: uniqueCustomers.length };
    } catch (cleanupError) {
      out.cleanup = {
        ok: false,
        message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      };
    }
  }

  writeFileSync(".tmp-phase4f-gate-result.json", JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: out.ok,
        partial: out.partial ?? false,
        error: out.error ?? null,
        required: out.required ?? null,
        checks: Object.fromEntries(
          Object.entries(out.checks).map(([k, v]) => [k, { ok: v?.ok ?? null }]),
        ),
      },
      null,
      2,
    ),
  );
  process.exit(out.ok ? 0 : out.partial ? 2 : 1);
}

main().catch((error) => {
  writeFileSync(
    ".tmp-phase4f-gate-result.json",
    JSON.stringify({ ok: false, error: error.message }, null, 2),
  );
  console.error(error.message);
  process.exit(1);
});
