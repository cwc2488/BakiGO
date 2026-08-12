import CoachingDetailPage from "@/components/coaching/CoachingDetailPage";

export default async function CoachingDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ enrollmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { enrollmentId } = await params;
  const query = await searchParams;
  const tabRaw = typeof query.tab === "string" ? query.tab : "overview";
  const tab = tabRaw === "timeline" ? "timeline" : "overview";
  const focusDates =
    typeof query.focusDates === "string"
      ? query.focusDates.split(",").map((part) => part.trim()).filter(Boolean)
      : [];
  const reasonCodes =
    typeof query.reasonCodes === "string"
      ? query.reasonCodes.split(",").map((part) => part.trim()).filter(Boolean)
      : [];

  return (
    <CoachingDetailPage
      enrollmentId={enrollmentId}
      initialTab={tab}
      focusDates={focusDates}
      reasonCodes={reasonCodes}
    />
  );
}
