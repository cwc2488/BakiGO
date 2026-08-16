import { redirect } from "next/navigation";
import { FAT_LOSS_QUIZ_SLUG } from "@/lib/quiz/fat-loss/types";

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ ref?: string; share?: string }>;
};

export default async function QuizShareRedirectRoute({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;

  const dest = "/quiz/fat-loss";

  if (code === FAT_LOSS_QUIZ_SLUG) {
    const ref = query.ref ?? query.share;
    const suffix = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    redirect(`${dest}${suffix}`);
  }

  redirect(`${dest}?share=${encodeURIComponent(code.toUpperCase())}`);
}
