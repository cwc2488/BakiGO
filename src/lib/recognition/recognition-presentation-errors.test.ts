import { describe, expect, it, vi } from "vitest";
import {
  isPptxgenjsModuleLoadError,
  logRecognitionPresentationFailure,
  RecognitionPresentationGenerationError,
  recognitionPresentationFailureClientMessage,
  RECOGNITION_PPTXGENJS_LOAD_CLIENT_MESSAGE,
} from "@/lib/recognition/recognition-presentation-errors";

describe("Recognition presentation failure mapping", () => {
  it("maps pptxgen.es.js CJS load failures to an admin-safe message", () => {
    const error = new SyntaxError("Cannot use import statement outside a module");
    expect(isPptxgenjsModuleLoadError(error)).toBe(true);
    expect(recognitionPresentationFailureClientMessage(error)).toBe(
      RECOGNITION_PPTXGENJS_LOAD_CLIENT_MESSAGE,
    );
    expect(recognitionPresentationFailureClientMessage(error)).not.toContain("import statement");
    expect(recognitionPresentationFailureClientMessage(error)).not.toContain("pptxgen.es.js");
  });

  it("logs event_id, stage, error class, and message without a stack", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapped = new RecognitionPresentationGenerationError({
      eventId: "evt-prod",
      stage: "render_pptx",
      cause: new SyntaxError("Cannot use import statement outside a module"),
    });
    const result = logRecognitionPresentationFailure({
      eventId: "evt-prod",
      stage: "render_pptx",
      error: wrapped,
    });
    expect(result.clientMessage).toBe(RECOGNITION_PPTXGENJS_LOAD_CLIENT_MESSAGE);
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(payload).toMatchObject({
      scope: "recognition_presentation",
      event_id: "evt-prod",
      stage: "render_pptx",
      error_class: "SyntaxError",
      error_message: "Cannot use import statement outside a module",
    });
    expect(payload.stack).toBeUndefined();
    spy.mockRestore();
  });
});
