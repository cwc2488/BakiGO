import { AnalysisExperienceSwitch } from "@/components/reset/ResetExperiencePage";
import { ResetShell } from "@/components/reset/ResetShell";
import { isPlausibleAnalysisSessionToken } from "@/lib/analysis/analysis-session-token";

export const runtime = "nodejs";

export default async function AnalysisTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isPlausibleAnalysisSessionToken(token)) {
    return (
      <ResetShell act="quiz">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
          <p className="rx-body">找不到這份測驗，或連結無效。</p>
          <a href="/quiz/fat-loss" className="rx-kicker underline-offset-2 hover:underline">
            回到心理測驗
          </a>
        </div>
      </ResetShell>
    );
  }
  return <AnalysisExperienceSwitch token={token} />;
}
