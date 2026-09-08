import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { createPeriod } from "@/lib/lose2kg/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const memberId = await requireLose2kgAdmin(request);
    const body = (await request.json()) as {
      name?: string;
      firstMeasurementDate?: string;
      measurementDates?: [string, string, string, string];
    };
    if (!body.name?.trim() || !body.firstMeasurementDate?.trim()) {
      return NextResponse.json({ error: "請填寫期數名稱與第一次量測日期。" }, { status: 400 });
    }
    const period = await createPeriod({
      name: body.name,
      firstMeasurementDate: body.firstMeasurementDate,
      measurementDates: body.measurementDates,
      createdByMemberId: memberId,
    });
    return NextResponse.json({ ok: true, period });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
