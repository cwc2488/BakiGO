import { AdminTransformationDetailPage } from "@/components/transformation/AdminTransformationDetailPage";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminTransformationDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return <AdminTransformationDetailPage leadId={id} />;
}
