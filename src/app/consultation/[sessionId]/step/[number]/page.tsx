import { notFound } from "next/navigation";
import { ConsultationStepPage } from "@/components/consultation/ConsultationStepPage";
import { isValidConsultationStep } from "@/lib/consultation/consultation-flow-engine";

type PageProps = {
  params: Promise<{ sessionId: string; number: string }>;
};

export default async function ConsultationStepRoute({ params }: PageProps) {
  const { sessionId, number } = await params;
  const stepNumber = Number(number);
  if (!Number.isInteger(stepNumber) || !isValidConsultationStep(stepNumber)) {
    notFound();
  }

  return <ConsultationStepPage sessionId={sessionId} stepNumber={stepNumber} />;
}
