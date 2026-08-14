import { after } from "next/server";
import { enqueueDailyCoachGenerationFast } from "@/lib/coaching/ai/enqueue-daily-coach-generation-fast";
import { drainCoachingGenerationQueueWithRetry } from "@/lib/coaching/ai/kick-coaching-generation-worker";

/**
 * Schedule minimal AI enqueue + delayed drain AFTER the customer HTTP response.
 * Never awaits context building / OpenAI on the customer request.
 *
 * Ownership: this is the primary drain attempt for this submit.
 * Backup: external /jobs/process. Safety: stale pending recovery on reopen.
 */
export function schedulePostSubmitEnqueueAndDrain(input: {
  enrollmentId: string;
  ownerMemberId: string;
  customerId: string;
  logDate: string;
  submittedAt: string;
}): void {
  const run = async () => {
    try {
      const enqueueResult = await enqueueDailyCoachGenerationFast({
        enrollmentId: input.enrollmentId,
        ownerMemberId: input.ownerMemberId,
        customerId: input.customerId,
        logDate: input.logDate,
        submittedAt: input.submittedAt,
      });

      console.info(
        JSON.stringify({
          type: "coaching_job_enqueued_after_response",
          enrollmentId: input.enrollmentId,
          logDate: input.logDate,
          submitted_at: input.submittedAt,
          action: enqueueResult.action,
          reason: enqueueResult.reason,
          job_id: enqueueResult.action === "enqueued" ? enqueueResult.jobId : null,
          output_id: enqueueResult.action === "enqueued" ? enqueueResult.outputId : null,
          provisional: enqueueResult.action === "enqueued",
        }),
      );

      if (enqueueResult.action === "enqueued") {
        await drainCoachingGenerationQueueWithRetry({
          limit: 2,
          concurrency: 1,
          source: "post_submit_after",
          preferJobId: enqueueResult.jobId,
        });
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          type: "coaching_ai_job_lifecycle",
          stage: "job_failed",
          enrollment_id: input.enrollmentId,
          log_date: input.logDate,
          error_class: "post_submit_enqueue_drain",
          reason: "after_handler_threw",
        }),
      );
      console.error("[coaching] post-submit enqueue/drain failed", error);
    }
  };

  try {
    after(() => {
      void run();
    });
  } catch {
    void run();
  }
}
