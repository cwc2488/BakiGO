/**
 * RADAR-SCALE-01 P2A.2 — local database proof for 047_radar_allocation_v1.sql.
 *
 * Runs the real migration against a throwaway in-process Postgres (PGlite WASM)
 * so the SQL, constraints, trigger, and privilege lockdown are verified before
 * anyone pastes it into the Supabase SQL Editor. Touches no remote database.
 *
 * Setup (one-off, outside the repo dependency tree):
 *   mkdir -p .tmp-pglite && cd .tmp-pglite \
 *     && printf '{"name":"tmp-pglite","private":true,"type":"module"}' > package.json \
 *     && npm install @electric-sql/pglite
 *
 * Run: node scripts/radar-p2a-047-local-proof.mjs
 *
 * Not covered here: true concurrency. Two genuinely parallel sessions need a
 * real server and are proved after the migration is applied.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(
  pathToFileURL(`${process.cwd()}/.tmp-pglite/node_modules/@electric-sql/pglite/dist/index.js`)
    .href
);

const MIGRATION = readFileSync("supabase/migrations/047_radar_allocation_v1.sql", "utf8");

// Rule values come from the single source of truth, not from a copy in here.
const RULES_SRC = readFileSync(
  "src/lib/radar/allocation/allocation-rules.ts",
  "utf8",
).split("DEFAULT_ALLOCATION_RULES")[1];

const rule = (key) => {
  const match = new RegExp(`${key}:\\s*(\\d+)`).exec(RULES_SRC);
  if (!match) throw new Error(`rule ${key} not found in allocation-rules.ts`);
  return Number(match[1]);
};

const CLAIM_DAYS = rule("development_claim_days");
const COOLDOWN_DAYS = rule("post_release_global_cooldown_days");
const DAY_MS = 24 * 60 * 60 * 1000;

const results = [];
const record = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const check = async (name, fn) => {
  try {
    const detail = await fn();
    record(name, true, detail ?? "");
  } catch (error) {
    record(name, false, error.message.split("\n")[0]);
  }
};

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const errorCode = async (fn) => {
  try {
    await fn();
    return null;
  } catch (error) {
    return { code: error.code ?? "?", message: error.message };
  }
};

const db = new PGlite();

// ---------------------------------------------------------------------------
// Prerequisites: Supabase roles plus the shape 047 depends on from 016.
// ---------------------------------------------------------------------------

await db.exec(`
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;

  CREATE TABLE public.members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT
  );

  CREATE TABLE public.candidate_pool (
    id TEXT PRIMARY KEY,
    lifecycle_state TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE public.member_candidate_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES public.candidate_pool (id) ON DELETE CASCADE,
    development_state TEXT,
    excluded_from_recommendations BOOLEAN NOT NULL DEFAULT false,
    exclusion_reason_code TEXT,
    development_started_at TIMESTAMPTZ,
    development_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (member_id, candidate_id)
  );

  CREATE TABLE public.radar_pipeline_config (
    id TEXT PRIMARY KEY DEFAULT 'radar_daily_pipeline_v1',
    source_freshness_window_days INTEGER NOT NULL DEFAULT 7,
    daily_caps JSONB NOT NULL DEFAULT '{}'::jsonb,
    worker JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  INSERT INTO public.radar_pipeline_config (id) VALUES ('radar_daily_pipeline_v1');
`);

// ---------------------------------------------------------------------------
// A. Migration applies, and applies again
// ---------------------------------------------------------------------------

await check("047 applies cleanly", async () => {
  await db.exec(MIGRATION);
  return "no errors";
});

await check("047 is idempotent (second run)", async () => {
  await db.exec(MIGRATION);
  const objects = await db.query(`
    SELECT
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'public'
        AND tablename LIKE 'candidate_development%') AS tables,
      (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'
        AND tablename LIKE 'candidate_development%') AS indexes,
      (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND c.relname LIKE 'candidate_development%') AS triggers,
      (SELECT count(*) FROM information_schema.columns
        WHERE table_name = 'member_candidate_state' AND column_name = 'skip_expires_at') AS skip_col,
      (SELECT count(*) FROM information_schema.columns
        WHERE table_name = 'radar_pipeline_config' AND column_name = 'allocation') AS alloc_col
  `);
  const row = objects.rows[0];
  expect(Number(row.tables) === 2, `expected 2 tables, got ${row.tables}`);
  expect(Number(row.triggers) === 2, `expected 2 triggers, got ${row.triggers}`);
  expect(Number(row.skip_col) === 1, "skip_expires_at missing");
  expect(Number(row.alloc_col) === 1, "allocation column missing");
  return `tables=${row.tables} indexes=${row.indexes} triggers=${row.triggers}`;
});

await check("allocation config defaults to empty (no constants in DB)", async () => {
  const res = await db.query(
    "SELECT allocation FROM public.radar_pipeline_config WHERE id = 'radar_daily_pipeline_v1'",
  );
  expect(
    JSON.stringify(res.rows[0].allocation) === "{}",
    `expected {}, got ${JSON.stringify(res.rows[0].allocation)}`,
  );
  return "{}";
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const members = await db.query(`
  INSERT INTO public.members (email)
  VALUES ('a@example.com'), ('b@example.com'), ('c@example.com'), ('d@example.com')
  RETURNING id
`);
const [A, B, C, D] = members.rows.map((row) => row.id);
await db.exec("INSERT INTO public.candidate_pool (id) VALUES ('cand-1')");

const claim = async (memberId) => {
  const now = Date.now();
  const expiresAt = new Date(now + CLAIM_DAYS * DAY_MS).toISOString();
  const allocatableAt = new Date(
    now + (CLAIM_DAYS + COOLDOWN_DAYS) * DAY_MS,
  ).toISOString();
  const res = await db.query(
    "SELECT * FROM public.claim_candidate_development($1, $2, $3, $4, $5)",
    ["cand-1", memberId, expiresAt, allocatableAt, "radar_allocation_v1"],
  );
  return res.rows;
};

const events = async () => {
  const res = await db.query(`
    SELECT event, reason, member_id
    FROM public.candidate_development_claim_events
    ORDER BY recorded_at, event
  `);
  return res.rows;
};

const lock = async () => {
  const res = await db.query("SELECT * FROM public.candidate_development_claims");
  return res.rows;
};

/**
 * Ages a lock row to reach an expiry or cooldown boundary. Rewriting claimed_at
 * or released_at is a time-travel artifact, not a business event, so the history
 * trigger is held back for the edit — otherwise the harness would manufacture
 * the very events it is trying to verify.
 */
const timeTravel = async (sql, params = []) => {
  await db.exec(
    "ALTER TABLE public.candidate_development_claims DISABLE TRIGGER trg_candidate_development_claim_events",
  );
  try {
    await db.query(sql, params);
  } finally {
    await db.exec(
      "ALTER TABLE public.candidate_development_claims ENABLE TRIGGER trg_candidate_development_claim_events",
    );
  }
};

// ---------------------------------------------------------------------------
// B. One lock row per candidate
// ---------------------------------------------------------------------------

await check("primary key allows at most one lock row per candidate", async () => {
  const res = await db.query(`
    SELECT con.contype, array_agg(att.attname) AS cols
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN unnest(con.conkey) AS k(attnum) ON true
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = k.attnum
    WHERE rel.relname = 'candidate_development_claims' AND con.contype = 'p'
    GROUP BY con.contype
  `);
  expect(res.rows.length === 1, "no primary key found");
  expect(
    JSON.stringify(res.rows[0].cols) === JSON.stringify(["candidate_id"]),
    `unexpected key columns ${JSON.stringify(res.rows[0].cols)}`,
  );
  return "PRIMARY KEY (candidate_id)";
});

// ---------------------------------------------------------------------------
// C. Claim lifecycle
// ---------------------------------------------------------------------------

await check("first claim wins and returns the row", async () => {
  const rows = await claim(A);
  expect(rows.length === 1, `expected 1 row, got ${rows.length}`);
  expect(rows[0].member_id === A, "wrong holder");
  const expires = new Date(rows[0].expires_at).getTime();
  const claimed = new Date(rows[0].claimed_at).getTime();
  const allocatable = new Date(rows[0].allocatable_at).getTime();
  expect(
    Math.round((expires - claimed) / DAY_MS) === CLAIM_DAYS,
    "claim window is not the configured claim length",
  );
  expect(
    Math.round((allocatable - expires) / DAY_MS) === COOLDOWN_DAYS,
    "cooldown after expiry is not the configured cooldown",
  );
  return `expires +${CLAIM_DAYS}d, allocatable +${COOLDOWN_DAYS}d after expiry`;
});

await check("history records exactly one claimed event", async () => {
  const rows = await events();
  expect(rows.length === 1, `expected 1 event, got ${rows.length}`);
  expect(rows[0].event === "claimed" && rows[0].member_id === A, "wrong event");
  return "claimed(A)";
});

await check("second member gets 0 rows while the claim is live", async () => {
  const rows = await claim(B);
  expect(rows.length === 0, `expected 0 rows, got ${rows.length}`);
  const held = await lock();
  expect(held[0].member_id === A, "holder changed on a losing claim");
  return "0-row collision, holder unchanged";
});

await check("losing claim leaks nothing about the holder", async () => {
  const rows = await claim(B);
  expect(rows.length === 0, "expected no rows");
  expect(JSON.stringify(rows) === "[]", "loser received row data");
  return "empty result set";
});

await check("holder retry is idempotent and does not extend 90 days", async () => {
  const before = (await lock())[0];
  const eventsBefore = (await events()).length;
  const rows = await claim(A);
  const after = (await lock())[0];
  expect(rows.length === 1, "holder retry should succeed");
  expect(
    new Date(after.claimed_at).getTime() === new Date(before.claimed_at).getTime(),
    "claimed_at moved",
  );
  expect(
    new Date(after.expires_at).getTime() === new Date(before.expires_at).getTime(),
    "expires_at extended",
  );
  expect(
    new Date(after.allocatable_at).getTime() === new Date(before.allocatable_at).getTime(),
    "allocatable_at moved",
  );
  expect((await events()).length === eventsBefore, "retry polluted history");
  return "dates preserved, no new event";
});

await check("expired claim still blocks during the global cooldown", async () => {
  // Age the claim past its 90 days. claimed_at moves too, because a claim that
  // expires before it starts is exactly what the window constraint forbids.
  await timeTravel(
    `
    UPDATE public.candidate_development_claims
    SET claimed_at = now() - (($1 + 1) || ' days')::interval,
        expires_at = now() - INTERVAL '1 day',
        allocatable_at = now() + (($2 - 1) || ' days')::interval
    WHERE candidate_id = 'cand-1'
  `,
    [String(CLAIM_DAYS), String(COOLDOWN_DAYS)],
  );
  const rows = await claim(B);
  expect(rows.length === 0, "cooldown did not block");
  const own = await claim(A);
  expect(own.length === 0, "previous holder was allowed to renew");
  return "blocked for other members and for the previous holder";
});

await check("test-only expiry edits write no history", async () => {
  const rows = await events();
  expect(rows.length === 1, `expected history untouched, got ${rows.length}`);
  return "still 1 event";
});

await check("cooldown boundary releases the candidate with no sweeper", async () => {
  await timeTravel(`
    UPDATE public.candidate_development_claims
    SET allocatable_at = now() - INTERVAL '1 second'
    WHERE candidate_id = 'cand-1'
  `);
  const rows = await claim(B);
  expect(rows.length === 1, "cooldown expiry did not free the candidate");
  expect(rows[0].member_id === B, "wrong new holder");
  return "B claimed after cooldown, nothing had to run";
});

await check("takeover records natural expiry as expired, not gave_up", async () => {
  const rows = await events();
  const superseded = rows.filter((row) => row.event === "superseded");
  expect(superseded.length === 1, `expected 1 superseded event, got ${superseded.length}`);
  expect(superseded[0].reason === "expired", `reason was ${superseded[0].reason}`);
  expect(superseded[0].member_id === A, "superseded event attributed to wrong member");
  const claimed = rows.filter((row) => row.event === "claimed");
  expect(claimed.length === 2, `expected 2 claimed events, got ${claimed.length}`);
  return "superseded(expired, A) + claimed(B)";
});

await check("early release starts the cooldown from the release", async () => {
  const released = await db.query(
    `
    UPDATE public.candidate_development_claims
    SET released_at = now(),
        release_reason = 'gave_up',
        allocatable_at = now() + ($1 || ' days')::interval,
        updated_at = now()
    WHERE candidate_id = 'cand-1'
    RETURNING released_at, allocatable_at, expires_at
  `,
    [String(COOLDOWN_DAYS)],
  );
  const row = released.rows[0];
  const gap = new Date(row.allocatable_at).getTime() - new Date(row.released_at).getTime();
  expect(
    Math.round(gap / DAY_MS) === COOLDOWN_DAYS,
    "cooldown is not measured from the release",
  );
  expect(
    new Date(row.allocatable_at).getTime() < new Date(row.expires_at).getTime() + COOLDOWN_DAYS * DAY_MS,
    "early release did not move the date forward",
  );
  const blocked = await claim(C);
  expect(blocked.length === 0, "release cooldown did not block");
  const history = await events();
  const releasedEvents = history.filter((event) => event.event === "released");
  expect(releasedEvents.length === 1, "release not recorded");
  expect(releasedEvents[0].reason === "gave_up", "release reason lost");
  return "released(gave_up) recorded, C blocked for the cooldown";
});

await check("candidate is reallocatable once the release cooldown ends", async () => {
  // Age the release past its cooldown; allocatable_at may never precede the
  // release itself, so both timestamps move together.
  await timeTravel(
    `
    UPDATE public.candidate_development_claims
    SET released_at = now() - (($1 + 1) || ' days')::interval,
        allocatable_at = now() - INTERVAL '1 day'
    WHERE candidate_id = 'cand-1'
  `,
    [String(COOLDOWN_DAYS)],
  );
  const rows = await claim(C);
  expect(rows.length === 1, "C could not claim after the cooldown");
  const history = await events();
  const superseded = history.filter((event) => event.event === "superseded");
  expect(superseded.length === 2, `expected 2 superseded events, got ${superseded.length}`);
  expect(superseded[1].reason === "gave_up", "gave_up release lost on takeover");
  return "claimed(C) with superseded(gave_up, B) preserved";
});

await check("converted stores infinity and never becomes allocatable", async () => {
  await db.exec(`
    UPDATE public.candidate_development_claims
    SET released_at = now(),
        release_reason = 'converted',
        allocatable_at = 'infinity'
    WHERE candidate_id = 'cand-1'
  `);
  const stored = await db.query(`
    SELECT allocatable_at,
           allocatable_at = 'infinity'::timestamptz AS is_infinity,
           allocatable_at <= now() AS allocatable_now
    FROM public.candidate_development_claims
  `);
  expect(stored.rows[0].is_infinity, "infinity was not stored");
  expect(stored.rows[0].allocatable_now === false, "infinity compared as allocatable");
  const rows = await claim(D);
  expect(rows.length === 0, "converted candidate was reallocated");
  return "allocatable_at = infinity, claim returns 0 rows";
});

// ---------------------------------------------------------------------------
// D. Constraints
// ---------------------------------------------------------------------------

const rawClaim = (columns, values) =>
  db.query(
    `INSERT INTO public.candidate_development_claims (${columns}) VALUES (${values})`,
  );

await check("a second lock row for the same candidate is rejected", async () => {
  const failure = await errorCode(() =>
    rawClaim(
      "candidate_id, member_id, expires_at, allocatable_at",
      `'cand-1', '${D}', now() + INTERVAL '90 days', now() + INTERVAL '104 days'`,
    ),
  );
  expect(failure?.code === "23505", `expected 23505, got ${failure?.code}`);
  return "23505 unique_violation";
});

await db.exec("INSERT INTO public.candidate_pool (id) VALUES ('cand-2')");

await check("a live claim cannot be allocatable before it expires", async () => {
  const failure = await errorCode(() =>
    rawClaim(
      "candidate_id, member_id, expires_at, allocatable_at",
      `'cand-2', '${A}', now() + INTERVAL '90 days', now() + INTERVAL '1 day'`,
    ),
  );
  expect(failure?.code === "23514", `expected 23514, got ${failure?.code}`);
  return "23514 check_violation";
});

await check("claims cannot record natural expiry as a member action", async () => {
  const failure = await errorCode(() =>
    rawClaim(
      "candidate_id, member_id, expires_at, allocatable_at, released_at, release_reason",
      `'cand-2', '${A}', now() + INTERVAL '90 days', now() + INTERVAL '104 days', now(), 'expired'`,
    ),
  );
  expect(failure?.code === "23514", `expected 23514, got ${failure?.code}`);
  return "release_reason 'expired' rejected on the lock row";
});

await check("released_at and release_reason must move together", async () => {
  const failure = await errorCode(() =>
    rawClaim(
      "candidate_id, member_id, expires_at, allocatable_at, released_at",
      `'cand-2', '${A}', now() + INTERVAL '90 days', now() + INTERVAL '104 days', now()`,
    ),
  );
  expect(failure?.code === "23514", `expected 23514, got ${failure?.code}`);
  return "23514 check_violation";
});

await check("history rows cannot be rewritten", async () => {
  const target = await db.query(
    "SELECT id FROM public.candidate_development_claim_events ORDER BY recorded_at LIMIT 1",
  );
  expect(target.rows.length === 1, "no history row to test against");
  const failure = await errorCode(() =>
    db.query(
      "UPDATE public.candidate_development_claim_events SET reason = 'failed' WHERE id = $1",
      [target.rows[0].id],
    ),
  );
  expect(failure !== null, "update was allowed");
  expect(
    failure.message.includes("append-only"),
    `unexpected error: ${failure.message}`,
  );
  return "append-only trigger raised";
});

// ---------------------------------------------------------------------------
// E. RADAR-SECURITY-01 lockdown
// ---------------------------------------------------------------------------

await check("RLS is enabled with no policies on both new tables", async () => {
  const res = await db.query(`
    SELECT c.relname, c.relrowsecurity,
           (SELECT count(*) FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname LIKE 'candidate_development%'
    ORDER BY c.relname
  `);
  expect(res.rows.length === 2, `expected 2 tables, got ${res.rows.length}`);
  for (const row of res.rows) {
    expect(row.relrowsecurity === true, `${row.relname}: RLS off`);
    expect(Number(row.policies) === 0, `${row.relname}: has policies`);
  }
  return res.rows.map((row) => `${row.relname}=rls,0 policies`).join(" ");
});

await check("anon and authenticated hold no table privileges", async () => {
  const res = await db.query(`
    SELECT r.rolname, t.tablename, p.priv,
           has_table_privilege(r.rolname, 'public.' || t.tablename, p.priv) AS granted
    FROM (VALUES ('anon'), ('authenticated')) AS r(rolname)
    CROSS JOIN (VALUES ('candidate_development_claims'), ('candidate_development_claim_events')) AS t(tablename)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
  `);
  const granted = res.rows.filter((row) => row.granted);
  expect(granted.length === 0, `unexpected grants: ${JSON.stringify(granted)}`);
  return `${res.rows.length} role/table/privilege combinations all denied`;
});

await check("service_role keeps full table access", async () => {
  const res = await db.query(`
    SELECT t.tablename, p.priv,
           has_table_privilege('service_role', 'public.' || t.tablename, p.priv) AS granted
    FROM (VALUES ('candidate_development_claims'), ('candidate_development_claim_events')) AS t(tablename)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
  `);
  const denied = res.rows.filter((row) => !row.granted);
  expect(denied.length === 0, `unexpected denials: ${JSON.stringify(denied)}`);
  return "all privileges retained";
});

await check("only service_role may execute the new functions", async () => {
  const res = await db.query(`
    SELECT p.oid::regprocedure::text AS signature,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role,
           p.prosecdef AS security_definer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'claim_candidate_development',
        'record_candidate_development_claim_event',
        'reject_candidate_development_claim_event_update'
      )
    ORDER BY p.proname
  `);
  expect(res.rows.length === 3, `expected 3 functions, got ${res.rows.length}`);
  for (const row of res.rows) {
    expect(row.anon === false, `${row.signature}: anon can execute`);
    expect(row.authenticated === false, `${row.signature}: authenticated can execute`);
    expect(row.service_role === true, `${row.signature}: service_role cannot execute`);
    expect(row.security_definer === false, `${row.signature}: is SECURITY DEFINER`);
  }
  return "3 functions, anon/authenticated denied, service_role granted";
});

await check("anon is refused at runtime, not just on paper", async () => {
  await db.exec("SET ROLE anon");
  const read = await errorCode(() =>
    db.query("SELECT count(*) FROM public.candidate_development_claims"),
  );
  const write = await errorCode(() =>
    db.query(
      "SELECT * FROM public.claim_candidate_development('cand-2', gen_random_uuid(), now() + INTERVAL '1 day', now() + INTERVAL '2 days')",
    ),
  );
  await db.exec("RESET ROLE");
  expect(read?.code === "42501", `read: expected 42501, got ${read?.code}`);
  expect(write?.code === "42501", `rpc: expected 42501, got ${write?.code}`);
  return "42501 on both read and claim";
});

await check("service_role still reads through RLS with no policies", async () => {
  await db.exec("SET ROLE service_role");
  const res = await db.query("SELECT count(*)::int AS rows FROM public.candidate_development_claims");
  await db.exec("RESET ROLE");
  expect(res.rows[0].rows === 1, `expected the lock row, got ${res.rows[0].rows}`);
  return "1 lock row visible (BYPASSRLS path intact)";
});

await check("history stays prunable for retention", async () => {
  await db.exec("DELETE FROM public.candidate_development_claim_events WHERE reason = 'expired'");
  return "DELETE allowed, UPDATE still blocked";
});

await db.close();

const failed = results.filter((result) => !result.passed);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed` +
    (failed.length ? ` — FAILED: ${failed.map((f) => f.name).join(", ")}` : ""),
);
process.exit(failed.length ? 1 : 0);
