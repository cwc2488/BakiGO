import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { computeDefaultMeasurementDates } from "@/lib/lose2kg/milestones";
import { createPeriodDraft } from "@/lib/lose2kg/v2-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const memberId = await requireLose2kgAdmin(request);
    const body = (await request.json()) as {
      name?: string;
      firstMeasurementDate?: string;
      measurementDates?: [string, string, string, string];
      staffPassword?: string;
    };
    if (!body.name?.trim() || !body.firstMeasurementDate || !body.staffPassword) {
      return NextResponse.json({ error: "請完成名稱、日期與密碼。" }, { status: 400 });
    }
    const dates =
      body.measurementDates ?? computeDefaultMeasurementDates(body.firstMeasurementDate);
    const result = await createPeriodDraft({
      name: body.name,
      firstMeasurementDate: body.firstMeasurementDate,
      measurementDates: dates,
      staffPassword: body.staffPassword,
      createdByMemberId: memberId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
