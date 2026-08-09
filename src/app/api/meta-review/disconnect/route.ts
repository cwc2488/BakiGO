import { clearMetaReviewSession } from "@/lib/meta-review/session";

export async function POST() {
  await clearMetaReviewSession();
  return Response.json({ ok: true });
}
