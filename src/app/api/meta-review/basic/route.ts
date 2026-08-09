import { fetchThreadsBasic } from "@/lib/meta-review/threads-client";
import { jsonFailure, jsonSuccess, requireMetaReviewSession } from "@/lib/meta-review/route-helpers";

export async function GET() {
  const auth = await requireMetaReviewSession();
  if (auth.error) {
    return auth.error;
  }

  try {
    const result = await fetchThreadsBasic(auth.session.accessToken);
    return jsonSuccess(result);
  } catch (error) {
    return jsonFailure(error);
  }
}
