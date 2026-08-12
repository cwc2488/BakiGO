#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREVIEW = process.env.PHASE4F_PREVIEW_URL || "https://baki-4wit56ekf-baki-go.vercel.app";
const ACTIVE = "Phase4fGateSmokeToken_7f3a9c2e1b8d4e6f0a1c2b3d4e5f6789xx";
const PAUSE = "Phase4fGatePausedToken_7f3a9c2e1b8d4e6f0a1c2b3d4e5f6789xx";
const EXPIRED = "Phase4fGateExpiredToken_7f3a9c2e1b8d4e6f0a1c2b3d4e5f6789x";
const PENDING = "Phase4fGatePendingToken_7f3a9c2e1b8d4e6f0a1c2b3d4e5f6789x";
const EXISTING_PHONE = "0922000222";
const SHARE_ID = "dddddddd-4f01-4000-8000-0000000000d1";
const CUSTOMER_A = "aaaaaaaa-4f01-4000-8000-0000000000a1";
const EXISTING_B = "bbbbbbbb-4f01-4000-8000-0000000000b1";

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1].trim()] = v;
    }
  } catch {}
  return env;
}

function vercelCurl(path, { method = "GET", data } = {}) {
  const url = `${PREVIEW}${path}`;
  const args = ["vercel", "curl", url];
  if (method !== "GET") {
    args.push("--", "--request", method, "--header", "Content-Type: application/json");
    if (data) args.push("--data", JSON.stringify(data));
  }
  const proc = spawnSync("npx", args, { encoding: "utf8", maxBuffer: 5_000_000 });
  const text = `${proc.stdout || ""}\n${proc.stderr || ""}`;
  let body = null;
  const start = text.lastIndexOf("\n{") >= 0 ? text.lastIndexOf("\n{") + 1 : text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      body = JSON.parse(text.slice(start, end + 1));
    } catch {
      body = { raw: text.slice(Math.max(0, end - 300), end + 1) };
    }
  }
  return { body, textTail: text.slice(-400), exit: proc.status };
}

async function main() {
  const phoneNew = `0933${String(Date.now()).slice(-6)}`;
  const checks = {};

  const valid = vercelCurl(`/api/r/${encodeURIComponent(ACTIVE)}`);
  const share = valid.body?.share;
  const payload = JSON.stringify(valid.body || {});
  checks.valid_token = {
    ok:
      valid.body?.ok === true &&
      share?.acceptsNewReferral === true &&
      !payload.includes("token_hash") &&
      !payload.includes("owner_member_id") &&
      !payload.includes("0911000111"),
    accepts: share?.acceptsNewReferral ?? null,
    headline: share?.headline ?? null,
    shareId: share?.shareId ?? null,
  };

  const bNew = vercelCurl(`/api/r/${encodeURIComponent(ACTIVE)}`, {
    method: "POST",
    data: { displayName: "4fLiveB-New2", phone: phoneNew, goalText: "想改善體態" },
  });
  checks.b_new_submit = { ok: bNew.body?.ok === true, body: bNew.body, phone: phoneNew };

  const dup = vercelCurl(`/api/r/${encodeURIComponent(ACTIVE)}`, {
    method: "POST",
    data: { displayName: "別名重複", phone: EXISTING_PHONE, goalText: "再次進入" },
  });
  checks.duplicate_phone_submit = { ok: dup.body?.ok === true, body: dup.body };

  const nameOnly = vercelCurl(`/api/r/${encodeURIComponent(ACTIVE)}`, {
    method: "POST",
    data: { displayName: "只有名字", goalText: "name-only" },
  });
  const nameErr = String(nameOnly.body?.error || "");
  checks.name_only_rejected = {
    ok: nameOnly.body?.ok !== true && (nameErr.includes("電話") || nameErr.includes("LINE")),
    body: nameOnly.body,
  };

  const random = vercelCurl(`/api/r/${encodeURIComponent(`rand_${Date.now()}_abcdefghijklmnopqrstuvwxyz0123`)}`);
  checks.random_token = {
    ok: String(random.body?.error || "").includes("找不到"),
    body: random.body,
  };

  const pausedGet = vercelCurl(`/api/r/${encodeURIComponent(PAUSE)}`);
  const pausedPost = vercelCurl(`/api/r/${encodeURIComponent(PAUSE)}`, {
    method: "POST",
    data: { displayName: "paused-b", phone: "0944000444" },
  });
  checks.paused_share = {
    ok: pausedGet.body?.share?.acceptsNewReferral === false || pausedPost.body?.ok !== true,
    getAccepts: pausedGet.body?.share?.acceptsNewReferral ?? null,
    post: pausedPost.body,
  };

  const expiredGet = vercelCurl(`/api/r/${encodeURIComponent(EXPIRED)}`);
  const expiredPost = vercelCurl(`/api/r/${encodeURIComponent(EXPIRED)}`, {
    method: "POST",
    data: { displayName: "expired-b", phone: "0955000555" },
  });
  checks.expired_share = {
    ok: expiredGet.body?.share?.acceptsNewReferral === false || expiredPost.body?.ok !== true,
    getAccepts: expiredGet.body?.share?.acceptsNewReferral ?? null,
    post: expiredPost.body,
  };

  const pendingGet = vercelCurl(`/api/r/${encodeURIComponent(PENDING)}`);
  const pendingPost = vercelCurl(`/api/r/${encodeURIComponent(PENDING)}`, {
    method: "POST",
    data: { displayName: "pending-b", phone: "0966000666" },
  });
  checks.pending_consent = {
    ok: pendingGet.body?.share?.acceptsNewReferral === false || pendingPost.body?.ok !== true,
    getAccepts: pendingGet.body?.share?.acceptsNewReferral ?? null,
    post: pendingPost.body,
  };

  const unauth = vercelCurl("/api/coaching/referrals");
  checks.referrals_unauth = {
    ok: unauth.body?.error === "Unauthorized",
    body: unauth.body,
  };

  const fileEnv = loadEnv();
  const anon = createClient(fileEnv.NEXT_PUBLIC_SUPABASE_URL, fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const shares = await anon.from("growth_shares").select("id").eq("id", SHARE_ID);
  const attrs = await anon.from("growth_referral_attributions").select("id").eq("share_id", SHARE_ID);
  checks.anon_cannot_see_fixture = {
    ok: (shares.data?.length ?? 0) === 0 && (attrs.data?.length ?? 0) === 0,
    shareRows: shares.data?.length ?? null,
    attrRows: attrs.data?.length ?? null,
  };

  const out = { preview: PREVIEW, phoneNew, customerA: CUSTOMER_A, existingB: EXISTING_B, shareId: SHARE_ID, checks };
  out.ok = Object.values(checks).every((c) => c.ok === true);
  writeFileSync(".tmp-phase4f-live-smoke.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
