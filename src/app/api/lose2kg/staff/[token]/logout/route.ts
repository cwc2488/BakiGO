import { lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { clearLose2kgStaffSessionCookie } from "@/lib/lose2kg/staff-session-cookie";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  try {
    await clearLose2kgStaffSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
