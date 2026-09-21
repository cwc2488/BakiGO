import { PublicSurveyPage } from "@/components/questionnaire/PublicSurveyPage";
import { normalizeQuestionnaireShareCode } from "@/lib/questionnaire/service";
import type { QuestionnaireSource } from "@/types/questionnaire";

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ source?: string }>;
};

export default async function SurveyPublicRoute({ params, searchParams }: PageProps) {
  const { code: rawCode } = await params;
  const query = await searchParams;
  const code = normalizeQuestionnaireShareCode(rawCode);
  const source: QuestionnaireSource = query.source === "onsite" ? "onsite" : "online";

  if (!code) {
    return (
      <div className="min-h-dvh bg-[#f7f4ef] px-5 py-16 text-[#1d1d1f]">
        <div className="mx-auto max-w-md space-y-3">
          <h1 className="text-[1.5rem] font-semibold tracking-tight">連結無效</h1>
          <p className="text-[0.9375rem] leading-7 text-[#636366]">
            這個問卷連結格式不正確。請向分享者索取正確連結後再試一次。
          </p>
        </div>
      </div>
    );
  }

  return <PublicSurveyPage code={code} initialSource={source} />;
}
