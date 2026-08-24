/**
 * RADAR-SCALE-01 P2A.2 — anon probe for the tables and function 047 added.
 *
 * Uses only the public anon key, exactly as a browser would. Every attempt must
 * be refused. A "relation does not exist" answer would mean 047 is not applied;
 * a success would mean the RADAR-SECURITY-01 boundary is open.
 *
 * Run: node scripts/radar-p2a-047-anon-probe.mjs
 */

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) throw new Error("anon key or url missing from .env.local");

const headers = {
  apikey: anon,
  Authorization: `Bearer ${anon}`,
  "Content-Type": "application/json",
};

const attempt = async (label, path, init = {}) => {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers, ...init });
  const text = await response.text();
  let code = null;
  try {
    code = JSON.parse(text).code ?? null;
  } catch {
    code = null;
  }
  const denied = response.status === 401 || response.status === 403 || code === "42501";
  const missing = code === "42P01" || code === "PGRST205" || code === "PGRST202";
  console.log(
    `${denied ? "DENIED " : missing ? "MISSING" : "OPEN   "} ${label} — HTTP ${response.status}${
      code ? ` ${code}` : ""
    } ${text.slice(0, 120).replace(/\s+/g, " ")}`,
  );
  return { denied, missing };
};

const tables = ["candidate_development_claims", "candidate_development_claim_events"];
const results = [];

for (const table of tables) {
  results.push(await attempt(`select ${table}`, `${table}?select=*&limit=1`));
  results.push(
    await attempt(`insert ${table}`, table, {
      method: "POST",
      body: JSON.stringify({ candidate_id: "anon-probe" }),
    }),
  );
  results.push(
    await attempt(`update ${table}`, `${table}?candidate_id=eq.anon-probe`, {
      method: "PATCH",
      body: JSON.stringify({ member_id: "00000000-0000-0000-0000-000000000000" }),
    }),
  );
  results.push(
    await attempt(`delete ${table}`, `${table}?candidate_id=eq.anon-probe`, { method: "DELETE" }),
  );
}

results.push(
  await attempt("rpc claim_candidate_development", "rpc/claim_candidate_development", {
    method: "POST",
    body: JSON.stringify({
      p_candidate_id: "anon-probe",
      p_member_id: "00000000-0000-0000-0000-000000000000",
      p_expires_at: new Date(Date.now() + 86400000).toISOString(),
      p_allocatable_at: new Date(Date.now() + 172800000).toISOString(),
    }),
  }),
);

const open = results.filter((result) => !result.denied);
const missing = results.filter((result) => result.missing);
console.log(
  `\n${results.length - open.length}/${results.length} attempts denied` +
    (missing.length ? ` — ${missing.length} reported the object as missing (047 not applied?)` : "") +
    (open.length - missing.length > 0 ? " — ANON BOUNDARY OPEN" : ""),
);
process.exit(open.length ? 1 : 0);
