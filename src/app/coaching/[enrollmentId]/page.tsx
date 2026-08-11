import CoachingDetailPage from "@/components/coaching/CoachingDetailPage";

export default async function CoachingDetailRoute({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  return <CoachingDetailPage enrollmentId={enrollmentId} />;
}
