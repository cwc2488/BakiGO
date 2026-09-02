import { noStoreJson } from "@/lib/radar/jobs/auto-drain";
import { loadRadarFailureAudit } from "@/lib/radar/jobs/failure-audit";
import {
  loadMemberSnapshotGapReport,
  resolveMemberIdByDisplayName,
} from "@/lib/radar/jobs/member-snapshot-gap";
import { loadRadarOpsStatus } from "@/lib/radar/jobs/ops-status";
import {
  createSupabaseServiceClient,
  isRadarCronAuthorized,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TODAY_RUN_FALLBACK = "e65f60d5-05ef-4cc3-a375-915c6dd01e69";

export async function GET(request: Request) {
  if (!isRadarCronAuthorized(request)) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return noStoreJson({ error: "Supabase service role is not configured" }, { status: 503 });
  }

  try {
    const url = new URL(request.url);
    const requested = url.searchParams.get("pipeline_run_id")?.trim() || null;
    const member_id = url.searchParams.get("member_id")?.trim() || null;
    const member_name = url.searchParams.get("member_name")?.trim() || null;
    const snapshot_date = url.searchParams.get("snapshot_date")?.trim() || null;
    const client = createSupabaseServiceClient();
    const ops = await loadRadarOpsStatus(client);
    const pipeline_run_id = requested ?? ops.run?.pipeline_run_id ?? TODAY_RUN_FALLBACK;
    const failures = await loadRadarFailureAudit(client, pipeline_run_id);

    let member_lookup = null;
    if (member_name) {
      member_lookup = await resolveMemberIdByDisplayName(client, member_name);
    }

    let member_snapshot_gap = null;
    const resolvedMemberId = member_id || member_lookup?.[0]?.id || null;
    if (resolvedMemberId) {
      member_snapshot_gap = await loadMemberSnapshotGapReport(client, {
        member_id: resolvedMemberId,
        snapshot_date: snapshot_date || ops.current_run_date || ops.run?.run_date || "",
        pipeline_run_id,
      });
    }

    return noStoreJson({
      ok: true,
      read_only: true,
      pipeline_run_id,
      ops,
      failures,
      member_lookup,
      member_snapshot_gap,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Radar status failed";
    return noStoreJson({ error: message }, { status: 500 });
  }
}
