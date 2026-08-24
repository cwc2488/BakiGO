import { NextResponse } from "next/server";
import { previewRadarLiveGuard } from "@/lib/radar/live/preview-auth";
import { runLiveRadarPipeline } from "@/lib/radar/live/run-live-pipeline";
import { SupabaseRadarRepository } from "@/lib/radar/repository/supabase-repository";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type PipelineBody = {
  candidate_ids?: string[];
  member_id?: string;
};

export async function POST(request: Request) {
  const gate = previewRadarLiveGuard(request);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase service role is not configured" },
      { status: 503 },
    );
  }

  let body: PipelineBody = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      body = (await request.json()) as PipelineBody;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const client = createSupabaseServiceClient();
    const repo = new SupabaseRadarRepository(client);
    const result = await runLiveRadarPipeline({
      client,
      repo,
      candidate_ids: body.candidate_ids,
      member_id: body.member_id ?? null,
    });
    return NextResponse.json({
      ...result,
      THREADS_ACCESS_TOKEN: process.env.THREADS_ACCESS_TOKEN ? "PRESENT" : "ABSENT",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "PRESENT" : "ABSENT",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Live pipeline failed.",
      },
      { status: 502 },
    );
  }
}
