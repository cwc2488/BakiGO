import { beforeEach, describe, expect, it, vi } from "vitest";

const isSupabaseServiceConfiguredMock = vi.fn();
const allowRecognitionPublicSubmissionMock = vi.fn();
const getRecognitionClientIpMock = vi.fn();
const prepareRecognitionPublicSubmissionContextMock = vi.fn();
const finalizeRecognitionPublicSubmissionMock = vi.fn();
const uploadMock = vi.fn();
const removeMock = vi.fn();

vi.mock("@/lib/supabase/service-client", () => ({
  isSupabaseServiceConfigured: isSupabaseServiceConfiguredMock,
  createSupabaseServiceClient: () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        remove: removeMock,
      }),
    },
  }),
}));

vi.mock("@/lib/recognition/recognition-service", () => ({
  RecognitionServiceError: class RecognitionServiceError extends Error {
    constructor(
      message: string,
      readonly status: number = 400,
    ) {
      super(message);
      this.name = "RecognitionServiceError";
    }
  },
  prepareRecognitionPublicSubmissionContext: prepareRecognitionPublicSubmissionContextMock,
  finalizeRecognitionPublicSubmission: finalizeRecognitionPublicSubmissionMock,
}));

vi.mock("@/lib/recognition/recognition-public-rate-limit", () => ({
  allowRecognitionPublicSubmission: allowRecognitionPublicSubmissionMock,
  getRecognitionClientIp: getRecognitionClientIpMock,
}));

describe("POST /api/recognition/public/[token]/submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
    allowRecognitionPublicSubmissionMock.mockReturnValue(true);
    getRecognitionClientIpMock.mockReturnValue("1.2.3.4");
    uploadMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });
  });

  it("does not reach Storage upload when pre-validation rejects the request", async () => {
    const scenarios = [
      "包含無效或已停用的表揚項目。",
      "收件已關閉。",
      "收件已過期。",
    ];

    const { POST } = await import("./route");

    for (const message of scenarios) {
      prepareRecognitionPublicSubmissionContextMock.mockRejectedValueOnce(new Error(message));

      const formData = new FormData();
      formData.set("submitterName", "王老師");
      formData.set("submitterOrganization", "A組");
      formData.set("entries", JSON.stringify([
        { submittedName: "王小明", eventAwardId: "bad-award", photoFieldKey: null },
      ]));

      const res = await POST(new Request("http://localhost/api/recognition/public/token/submissions", {
        method: "POST",
        body: formData,
      }), {
        params: Promise.resolve({ token: "token" }),
      });

      expect(res.status).toBe(500);
    }

    expect(uploadMock).not.toHaveBeenCalled();
    expect(finalizeRecognitionPublicSubmissionMock).not.toHaveBeenCalled();
  });
});
