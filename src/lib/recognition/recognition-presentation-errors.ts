export const RECOGNITION_PRESENTATION_FAILURE_STAGES = [
  "load_snapshot",
  "load_portraits",
  "render_pptx",
  "record_export",
  "unknown",
] as const;

export type RecognitionPresentationFailureStage =
  (typeof RECOGNITION_PRESENTATION_FAILURE_STAGES)[number];

export const RECOGNITION_PPTXGENJS_LOAD_CLIENT_MESSAGE =
  "表揚簡報產生器載入失敗。請稍後再試，或聯絡技術支援。";

export const RECOGNITION_PRESENTATION_GENERIC_CLIENT_MESSAGE =
  "無法產生表揚簡報。請稍後再試，或聯絡技術支援。";

export class RecognitionPresentationGenerationError extends Error {
  readonly eventId: string;
  readonly stage: RecognitionPresentationFailureStage;
  readonly causeError: Error;

  constructor(input: {
    eventId: string;
    stage: RecognitionPresentationFailureStage;
    cause: unknown;
  }) {
    const causeError = input.cause instanceof Error
      ? input.cause
      : new Error(String(input.cause));
    super(causeError.message);
    this.name = "RecognitionPresentationGenerationError";
    this.eventId = input.eventId;
    this.stage = input.stage;
    this.causeError = causeError;
  }
}

export function isPptxgenjsModuleLoadError(error: unknown): boolean {
  const err = error instanceof RecognitionPresentationGenerationError
    ? error.causeError
    : error instanceof Error
      ? error
      : null;
  const combined = err ? `${err.name} ${err.message}` : String(error);
  return /Cannot use import statement outside a module/i.test(combined)
    || /Failed to load the ES module/i.test(combined)
    || /pptxgen\.es\.js/i.test(combined);
}

export function recognitionPresentationFailureClientMessage(error: unknown): string {
  if (isPptxgenjsModuleLoadError(error)) {
    return RECOGNITION_PPTXGENJS_LOAD_CLIENT_MESSAGE;
  }
  return RECOGNITION_PRESENTATION_GENERIC_CLIENT_MESSAGE;
}

export function logRecognitionPresentationFailure(input: {
  eventId: string;
  stage: RecognitionPresentationFailureStage;
  error: unknown;
}): { clientMessage: string } {
  const wrapped = input.error instanceof RecognitionPresentationGenerationError
    ? input.error
    : null;
  const err = wrapped?.causeError
    ?? (input.error instanceof Error ? input.error : new Error(String(input.error)));
  console.error(JSON.stringify({
    scope: "recognition_presentation",
    event_id: wrapped?.eventId ?? input.eventId,
    stage: wrapped?.stage ?? input.stage,
    error_class: err.name || "Error",
    error_message: err.message,
  }));
  return {
    clientMessage: recognitionPresentationFailureClientMessage(input.error),
  };
}
