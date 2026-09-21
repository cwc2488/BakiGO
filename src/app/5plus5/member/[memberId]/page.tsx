import FivePlusFiveMemberDetailPage from "@/components/five-plus-five/FivePlusFiveMemberDetailPage";

type Props = { params: Promise<{ memberId: string }> };

export default async function Page({ params }: Props) {
  const { memberId } = await params;
  return <FivePlusFiveMemberDetailPage memberId={memberId} />;
}
