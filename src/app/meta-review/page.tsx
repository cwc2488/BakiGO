import type { Metadata } from "next";
import { MetaReviewDemoPage } from "@/components/meta-review/MetaReviewDemoPage";

export const metadata: Metadata = {
  title: "Meta Threads API Review Demo",
  description:
    "Meta App Review demonstration page for Baki GO Threads OAuth, threads_basic, threads_profile_discovery, and threads_keyword_search.",
  robots: {
    index: false,
    follow: false,
  },
};

type PageProps = {
  searchParams: Promise<{
    error?: string;
    connected?: string;
  }>;
};

export default async function MetaReviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialError = params.error ? decodeURIComponent(params.error) : undefined;
  const initialConnected = params.connected === "1";

  return (
    <MetaReviewDemoPage initialConnected={initialConnected} initialError={initialError} />
  );
}
