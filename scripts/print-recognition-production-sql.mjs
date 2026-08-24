#!/usr/bin/env node
/**
 * Print concatenated Recognition Center production recovery SQL (035-045).
 *
 * Usage:
 *   node scripts/print-recognition-production-sql.mjs > /tmp/recognition-center-035-045.sql
 *
 * Then paste that file into Supabase Dashboard → SQL Editor, or run
 * the numbered files 035 → 044 one by one.
 *
 * This script does NOT apply SQL. It only concatenates repo files.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "035_recognition_foundation.sql",
  "036_recognition_event_rpcs.sql",
  "037_recognition_public_collection.sql",
  "038_recognition_public_submission_rpc_guards.sql",
  "039_recognition_candidates.sql",
  "040_recognition_photo_review.sql",
  "041_recognition_presentation_exports.sql",
  "042_recognition_award_display_names.sql",
  "043_recognition_admin_only_grants.sql",
  "044_recognition_delete_event.sql",
  "045_recognition_self_service_validation.sql",
];

const header = [
  "-- BakiGO Recognition Center production recovery SQL",
  "-- Concatenated from supabase/migrations/035-045.",
  "-- Idempotent / re-runnable. Does not drop members, customers, coaching, quiz, radar, or leaderboard tables.",
  "-- Apply in Supabase SQL Editor after running supabase/recovery/preflight-recognition-center.sql.",
  "",
].join("\n");

process.stdout.write(header);
for (const file of FILES) {
  const abs = resolve(process.cwd(), "supabase/migrations", file);
  const sql = readFileSync(abs, "utf8").trimEnd();
  process.stdout.write(`\n-- ========== ${file} ==========\n`);
  process.stdout.write(`${sql}\n`);
}
