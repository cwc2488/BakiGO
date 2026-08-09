import { fetchProfileDiscovery } from "@/lib/meta-review/threads-client";
import { jsonFailure, jsonSuccess, requireMetaReviewSession } from "@/lib/meta-review/route-helpers";

export async function GET(request: Request) {
  const auth = await requireMetaReviewSession();
  if (auth.error) {
    return auth.error;
  }

  const username = new URL(request.url).searchParams.get("username") ?? "";
  try {
    const result = await fetchProfileDiscovery(auth.session.accessToken, username);
    return jsonSuccess(result);
  } catch (error) {
    return jsonFailure(error);
  }
}
