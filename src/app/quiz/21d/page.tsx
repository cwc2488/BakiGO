import { Suspense } from "react";
import { QuizPartnerWorkbench } from "@/components/quiz/QuizPartnerWorkbench";

/**
 * Canonical logged-in Partner Quiz Hub (`/quiz/21d`).
 *
 * Contains: 21 天名單 / 我的分享 / 我的成效.
 * Public consumer Quiz (`/quiz/fat-loss`, `/q/{code}`) is a separate experience.
 * Do not replace this route with the older simple `/quiz/hub` shell during
 * baseline recovery, branch restores, or Production deploys.
 */
export default function Quiz21dRoute() {
  return (
    <Suspense>
      <QuizPartnerWorkbench />
    </Suspense>
  );
}
