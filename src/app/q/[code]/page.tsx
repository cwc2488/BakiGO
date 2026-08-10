import { redirect } from "next/navigation";
import { FAT_LOSS_QUIZ_SLUG } from "@/lib/quiz/fat-loss/types";

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ ref?: string; share?: string }>;
};

export default async function QuizShareRedirectRoute({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;

  if (code === FAT_LOSS_QUIZ_SLUG) {
    const ref = query.ref ?? query.share;
    const suffix = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    redirect(`/quiz/fat-loss/start${suffix}`);
  }

  redirect(`/quiz/fat-loss/start?share=${encodeURIComponent(code.toUpperCase())}`);
}
