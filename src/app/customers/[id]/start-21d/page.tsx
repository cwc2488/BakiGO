import { Experience21dStartPage } from "@/components/quiz/Experience21dStartPage";

export default async function CustomerStart21dRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Experience21dStartPage mode={{ kind: "customer", customerId: id }} />;
}
