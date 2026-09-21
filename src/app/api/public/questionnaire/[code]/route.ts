import { NextResponse } from "next/server";
import {
  QuestionnaireError,
  getPublicQuestionnaireConfig,
  normalizeQuestionnaireShareCode,
  resolveActiveQuestionnaireOwnerByCode,
} from "@/lib/questionnaire/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: Request, context: Ctx) {
  try {
    const { code: raw } = await context.params;
    const code = normalizeQuestionnaireShareCode(raw);
    if (!code) {
      return NextResponse.json({ valid: false, error: "invalid_code" }, { status: 404 });
    }
    const owner = await resolveActiveQuestionnaireOwnerByCode(code);
    const url = new URL(request.url);
    const config = getPublicQuestionnaireConfig({
      shareCode: owner.shareCode,
      source: url.searchParams.get("source"),
      partnerDisplayName: owner.partnerDisplayName,
    });
    // Never leak member identifiers in the JSON response body
    return NextResponse.json(config);
  } catch (error) {
    if (error instanceof QuestionnaireError) {
      return NextResponse.json(
        { valid: false, error: error.code },
        { status: error.status === 404 ? 404 : error.status },
      );
    }
    return NextResponse.json({ valid: false, error: "lookup_failed" }, { status: 500 });
  }
}
