import { Experience21dStartPage } from "@/components/quiz/Experience21dStartPage";

export default async function Quiz21dStartRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  return <Experience21dStartPage initialCustomerId={query.customerId ?? null} mode={{ kind: "interest", interestId: id }} />;
}
