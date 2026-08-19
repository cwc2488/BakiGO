import { QuizShareEntryClient } from "@/components/quiz/QuizShareEntryClient";
import { normalizeResultShareCode } from "@/lib/quiz/viral/quiz-result-share-codes";

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ gs?: string; share?: string }>;
};

export default async function ResultShareEntryRoute({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;
  const dest = new URLSearchParams();
  const normalized = normalizeResultShareCode(code);
  if (normalized) dest.set("rs", normalized);
  if (query.gs) dest.set("gs", query.gs);
  if (query.share) dest.set("share", query.share);
  const suffix = dest.toString();
  return <QuizShareEntryClient dest={`/quiz/fat-loss${suffix ? `?${suffix}` : ""}`} />;
}
