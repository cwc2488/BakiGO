import QuestionnaireLeadDetailPage from "@/components/questionnaire/QuestionnaireLeadDetailPage";

type PageProps = {
  params: Promise<{ leadId: string }>;
};

export default async function QuestionnaireLeadDetailRoute({ params }: PageProps) {
  const { leadId } = await params;
  return <QuestionnaireLeadDetailPage leadId={leadId} />;
}
