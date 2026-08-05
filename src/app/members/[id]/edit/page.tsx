import MemberFormPage from "@/components/members/MemberFormPage";

export default async function EditMemberPage({
  params,
}: PageProps<"/members/[id]/edit">) {
  const { id } = await params;
  return <MemberFormPage memberId={id} mode="edit" />;
}
