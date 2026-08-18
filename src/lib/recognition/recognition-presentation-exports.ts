import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { RecognitionServiceError } from "@/lib/recognition/recognition-service";

export type RecognitionPresentationExportInsert = {
  eventId: string;
  generatedByMemberId: string;
  approvedCandidateCount: number;
  slideCount: number;
  themeId: string;
  themeVersion: string;
};

/**
 * Insert only after a PPTX buffer has been fully rendered.
 * Failed generations must not create a success row. The PPTX itself is not stored.
 */
export async function insertRecognitionPresentationExportSuccess(
  input: RecognitionPresentationExportInsert,
): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from("recognition_presentation_exports").insert({
    event_id: input.eventId,
    generated_by_member_id: input.generatedByMemberId,
    approved_candidate_count: input.approvedCandidateCount,
    slide_count: input.slideCount,
    theme_id: input.themeId,
    theme_version: input.themeVersion,
    status: "success",
  });
  if (error) {
    throw new RecognitionServiceError(
      `Presentation generated but export audit failed: ${error.message}`,
      500,
    );
  }
}
