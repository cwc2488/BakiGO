import { JoinRecruitmentPage } from "@/components/recruitment/JoinRecruitmentPage";
import { normalizeRecruitmentShareCode } from "@/lib/recruitment/recruitment-service";

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function JoinRecruitmentRoute({ params }: PageProps) {
  const { code: rawCode } = await params;
  const code = normalizeRecruitmentShareCode(rawCode);

  if (!code) {
    return (
      <div className="min-h-dvh bg-[#faf6f1] px-5 py-16 text-[#1d1d1f]">
        <div className="mx-auto max-w-md space-y-3">
          <h1 className="text-[1.5rem] font-semibold tracking-tight">連結無效</h1>
          <p className="text-[0.9375rem] leading-7 text-[#636366]">
            這個招募連結格式不正確。請向分享者索取正確連結後再試一次。
          </p>
        </div>
      </div>
    );
  }

  return <JoinRecruitmentPage code={code} />;
}
