import { TrainingMemberChecklistPage } from "@/components/training/TrainingMemberChecklistPage";

export default async function TrainingMemberRoutePage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  return <TrainingMemberChecklistPage memberId={memberId} />;
}
