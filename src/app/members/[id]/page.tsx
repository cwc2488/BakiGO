import MemberDetailPage from "@/components/members/MemberDetailPage";

export default async function MemberDetailRoute({
  params,
}: PageProps<"/members/[id]">) {
  const { id } = await params;
  return <MemberDetailPage memberId={id} />;
}
