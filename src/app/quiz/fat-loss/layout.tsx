import type { Metadata } from "next";

export function generateMetadata(): Metadata {
  return {
    title: "你比較像哪一種動物？｜6題心理測驗",
    description: "6 題情境選擇，沒有標準答案。接著讓 AI 真正認識你。",
    openGraph: {
      title: "你比較像哪一種動物？",
      description: "6 題情境選擇。沒有標準答案，憑直覺就好。",
      locale: "zh_TW",
      siteName: "Baki GO",
    },
  };
}

export default function FatLossQuizLayout({ children }: LayoutProps<"/quiz/fat-loss">) {
  return children;
}
