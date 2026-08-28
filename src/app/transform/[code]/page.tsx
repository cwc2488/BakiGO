import { TransformationLandingPage } from "@/components/transformation/TransformationLandingPage";
import { normalizeTransformationShareCode } from "@/lib/transformation/transformation-service";

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function TransformRoute({ params }: PageProps) {
  const { code: rawCode } = await params;
  const code = normalizeTransformationShareCode(rawCode);

  if (!code) {
    return (
      <div className="min-h-dvh bg-black px-5 py-16 text-white">
        <div className="mx-auto max-w-md space-y-3">
          <h1 className="text-[1.5rem] font-bold tracking-tight">連結無效</h1>
          <p className="text-[0.9375rem] leading-7 text-white/70">
            這個連結格式不正確。請向分享者索取正確連結後再試一次。
          </p>
        </div>
      </div>
    );
  }

  return <TransformationLandingPage code={code} />;
}
