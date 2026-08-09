import { fetchKeywordSearch } from "@/lib/meta-review/threads-client";
import { jsonFailure, jsonSuccess, requireMetaReviewSession } from "@/lib/meta-review/route-helpers";

export async function GET(request: Request) {
  const auth = await requireMetaReviewSession();
  if (auth.error) {
    return auth.error;
  }

  const keyword = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const result = await fetchKeywordSearch(auth.session.accessToken, keyword);
    return jsonSuccess(result);
  } catch (error) {
    return jsonFailure(error);
  }
}
