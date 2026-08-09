import { NextResponse } from "next/server";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "@/lib/radar/jobs/queue";
import { createSupabaseRadarJobQueue } from "@/lib/radar/jobs/supabase-queue-store";
import { submitMemberCandidate } from "@/lib/radar/intake/submit-member-candidate";
import { resolveDailyPipelineRunDate } from "@/lib/radar/pipeline/run-date";
import { InMemoryRadarRepository } from "@/lib/radar/repository/in-memory-repository";
import { SupabaseRadarRepository } from "@/lib/radar/repository/supabase-repository";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";

export const runtime = "nodejs";

type CandidateIntakeBody = {
  threads?: string;
  instagram?: string;
};

function createIntakeDeps() {
  if (isSupabaseServiceConfigured()) {
    const client = createSupabaseServiceClient();
    const repo = new SupabaseRadarRepository(client);
    const queue = createSupabaseRadarJobQueue(client);
    return { repo, queue };
  }
  const repo = new InMemoryRadarRepository();
  const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
  return { repo, queue };
}

export async function POST(request: Request) {
  const member_id = await getMemberIdFromRequest(request);
  if (!member_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CandidateIntakeBody;
  try {
    body = (await request.json()) as CandidateIntakeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const run_date = resolveDailyPipelineRunDate({});

  try {
    const deps = createIntakeDeps();
    const result = await submitMemberCandidate(deps, {
      member_id,
      threads: body.threads,
      instagram: body.instagram,
      run_date,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        candidate_id: result.candidate_id,
        platform: result.platform,
        normalized_username: result.normalized_username,
        identity_resolution: result.identity_resolution,
        reused_existing: result.reused_existing,
        enrich_job_id: result.enrich_job_id,
        source: "member_provided",
      },
      { status: result.reused_existing ? 200 : 201 },
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Failed to submit candidate";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
