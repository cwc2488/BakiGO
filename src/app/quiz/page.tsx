import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "心理測驗 | Baki GO",
  description: "用有趣的心理測驗破冰，降低陌生開發難度。",
};

export default function QuizIndexPage() {
  redirect("/quiz/fat-loss");
}
