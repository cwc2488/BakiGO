import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const resolveIsSuperAdminMock = vi.fn();

vi.mock("@/lib/supabase/member-auth", () => ({
  getMemberIdFromRequest: getMemberIdFromRequestMock,
}));

vi.mock("@/lib/supabase/service-client", () => ({
  isSupabaseServiceConfigured: isSupabaseServiceConfiguredMock,
}));

vi.mock("@/lib/auth/super-admin", () => ({
  resolveIsSuperAdmin: resolveIsSuperAdminMock,
}));

describe("GET /api/admin/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
  });

  it("denies unauthenticated users", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/me"));
    expect(response.status).toBe(401);
    expect(resolveIsSuperAdminMock).not.toHaveBeenCalled();
  });

  it("denies a normal partner", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("partner-1");
    resolveIsSuperAdminMock.mockResolvedValueOnce(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/me"));
    expect(response.status).toBe(403);
    expect(resolveIsSuperAdminMock).toHaveBeenCalledWith("partner-1");
  });

  it("allows Super Admin", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("admin-1");
    resolveIsSuperAdminMock.mockResolvedValueOnce(true);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/me"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
