import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const signOffTrainingItemMock = vi.fn();
const getTrainingChecklistMock = vi.fn();

vi.mock("@/lib/supabase/member-auth", () => ({
  getMemberIdFromRequest: getMemberIdFromRequestMock,
}));

vi.mock("@/lib/supabase/service-client", () => ({
  isSupabaseServiceConfigured: isSupabaseServiceConfiguredMock,
}));

vi.mock("@/lib/training/training-service", () => ({
  signOffTrainingItem: signOffTrainingItemMock,
  getTrainingChecklist: getTrainingChecklistMock,
  TrainingServiceError: class TrainingServiceError extends Error {
    constructor(
      message: string,
      readonly status: number = 400,
      readonly code?: string,
    ) {
      super(message);
      this.name = "TrainingServiceError";
    }
  },
}));

describe("training API authorization", () => {
  beforeEach(() => {
    getMemberIdFromRequestMock.mockReset();
    isSupabaseServiceConfiguredMock.mockReset();
    signOffTrainingItemMock.mockReset();
    getTrainingChecklistMock.mockReset();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
  });

  it("signoff uses session member as signer and ignores client signerMemberId", async () => {
    getMemberIdFromRequestMock.mockResolvedValue("upline-1");
    signOffTrainingItemMock.mockResolvedValue({
      id: "s1",
      trainingItemId: "item-1",
      traineeMemberId: "down-1",
      signerMemberId: "upline-1",
      signerDisplayName: "Upline",
      signedAt: "2026-09-01T00:00:00.000Z",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });

    const { POST } = await import("@/app/api/training/signoff/route");
    const request = new Request("http://localhost/api/training/signoff", {
      method: "POST",
      body: JSON.stringify({
        traineeMemberId: "down-1",
        trainingItemId: "item-1",
        signerMemberId: "forged-signer",
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(signOffTrainingItemMock).toHaveBeenCalledWith({
      viewerMemberId: "upline-1",
      traineeMemberId: "down-1",
      trainingItemId: "item-1",
    });
  });

  it("rejects unauthenticated signoff", async () => {
    getMemberIdFromRequestMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/training/signoff/route");
    const request = new Request("http://localhost/api/training/signoff", {
      method: "POST",
      body: JSON.stringify({
        traineeMemberId: "down-1",
        trainingItemId: "item-1",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(signOffTrainingItemMock).not.toHaveBeenCalled();
  });

  it("checklist defaults to self when memberId omitted", async () => {
    getMemberIdFromRequestMock.mockResolvedValue("member-1");
    getTrainingChecklistMock.mockResolvedValue({
      traineeMemberId: "member-1",
      traineeDisplayName: "Me",
      viewerMemberId: "member-1",
      canSignOff: false,
      incomplete: [],
      completed: [],
    });

    const { GET } = await import("@/app/api/training/checklist/route");
    const request = new Request("http://localhost/api/training/checklist");
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(getTrainingChecklistMock).toHaveBeenCalledWith({
      viewerMemberId: "member-1",
      traineeMemberId: "member-1",
    });
  });
});
