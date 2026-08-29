import { Go21App } from "@/components/go21/Go21App";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Baki Go 21",
    description: "你的 21 天 AI 飲食教練",
    applicationName: "Baki Go 21",
    appleWebApp: {
      capable: true,
      title: "Baki Go 21",
      statusBarStyle: "default",
    },
    other: {
      "mobile-web-app-capable": "yes",
    },
  };
}

export default async function Go21Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <Go21App token={token} />;
}
