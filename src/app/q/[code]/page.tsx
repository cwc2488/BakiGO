import { QuizShareEntryClient } from "@/components/quiz/QuizShareEntryClient";
import { FAT_LOSS_QUIZ_SLUG } from "@/lib/quiz/fat-loss/types";

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ ref?: string; share?: string; gs?: string }>;
};

export default async function QuizShareEntryRoute({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;
  const dest = new URLSearchParams();

  if (code === FAT_LOSS_QUIZ_SLUG) {
    const ref = query.ref ?? query.share;
    if (ref) dest.set("ref", ref);
  } else {
    dest.set("share", code.toUpperCase());
  }
  if (query.gs) dest.set("gs", query.gs);

  const suffix = dest.toString();
  return <QuizShareEntryClient dest={`/quiz/fat-loss${suffix ? `?${suffix}` : ""}`} />;
}
