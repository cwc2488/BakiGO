import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateFastAuthRestore } from "@/lib/auth/auth-service";
import type { AuthSession } from "@/types/auth";
import type { Member } from "@/types/member";

function src(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    memberId: "member-a",
    memberNumber: "A00001",
    herbalifeMemberId: "A00001",
    email: "a@example.com",
    signedInAt: "2026-09-22T00:00:00.000Z",
    ...overrides,
  };
}

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-a",
    herbalifeMemberId: "A00001",
    name: "Alice",
    email: "a@example.com",
    role: "Member",
    currentLevel: "Member",
    ...overrides,
  } as Member;
}

describe("evaluateFastAuthRestore — cold-start decision", () => {
  it("A — matching Supabase + local session/member → fast", () => {
    expect(
      evaluateFastAuthRestore({
        supabaseEmail: "A@Example.com",
        localSession: session(),
        localMember: member(),
      }),
    ).toBe("fast");
  });

  it("C — Supabase B + local A → email_mismatch (must not render A)", () => {
    expect(
      evaluateFastAuthRestore({
        supabaseEmail: "b@example.com",
        localSession: session({ email: "a@example.com", memberId: "member-a" }),
        localMember: member({ id: "member-a", email: "a@example.com" }),
      }),
    ).toBe("email_mismatch");
  });

  it("D — no Supabase session → signed_out (stale local must not login)", () => {
    expect(
      evaluateFastAuthRestore({
        supabaseEmail: null,
        localSession: session(),
        localMember: member(),
      }),
    ).toBe("signed_out");
    expect(
      evaluateFastAuthRestore({
        supabaseEmail: "   ",
        localSession: session(),
        localMember: member(),
      }),
    ).toBe("signed_out");
  });

  it("E — Supabase A + local session but member missing → needs_full", () => {
    expect(
      evaluateFastAuthRestore({
        supabaseEmail: "a@example.com",
        localSession: session(),
        localMember: null,
      }),
    ).toBe("needs_full");
  });

  it("memberId mismatch between session and member → needs_full", () => {
    expect(
      evaluateFastAuthRestore({
        supabaseEmail: "a@example.com",
        localSession: session({ memberId: "member-a" }),
        localMember: member({ id: "member-other" }),
      }),
    ).toBe("needs_full");
  });
});

describe("AuthProvider fast restore architecture", () => {
  const authCtx = src("src/lib/auth/auth-context.tsx");
  const authSvc = src("src/lib/auth/auth-service.ts");

  it("A — critical path uses restoreCloudSessionFast before full restore", () => {
    expect(authSvc).toContain("export async function restoreCloudSessionFast");
    expect(authSvc).toContain("evaluateFastAuthRestore");
    // Fast function body must not call members network fetch
    const start = authSvc.indexOf("export async function restoreCloudSessionFast");
    const end = authSvc.indexOf("export async function logoutAccount", start);
    const fastBody = authSvc.slice(start, end);
    expect(fastBody).not.toContain("await fetchCloudMemberByEmail");
    expect(authCtx).toContain("restoreCloudSessionFast");
    // Fast paint then background full restore
    expect(authCtx).toContain('fast.path === "fast"');
    expect(authCtx).toContain("setIsLoading(false)");
    expect(authCtx).toContain("restoreCloudSession(storage)");
  });

  it("B — background reconcile updates session/member/cloudSyncVersion", () => {
    expect(authCtx).toContain("getCloudBackgroundSyncVersion");
    expect(authCtx).toContain("setCloudSyncVersion");
    expect(authCtx).toContain("setMember(getCurrentMember(storage))");
  });

  it("C — email mismatch clears sensitive cache before full restore", () => {
    expect(authCtx).toContain('fast.reason === "email_mismatch"');
    expect(authCtx).toContain("clearSensitiveResourceCache");
    expect(authSvc).toContain('reason: "email_mismatch"');
    expect(authSvc).toContain("writeSession(null)");
  });

  it("D — signed_out clears local auth + sensitive cache (no stale local login)", () => {
    expect(authCtx).toContain('fast.path === "signed_out"');
    expect(authSvc).toMatch(
      /if \(error \|\| !supabaseEmailRaw\)[\s\S]*writeSession\(null\)/,
    );
  });

  it("F/G — authGenerationRef blocks stale background apply after logout/switch", () => {
    expect(authCtx).toContain("authGenerationRef");
    expect(authCtx).toContain("authGenerationRef.current += 1");
    expect(authCtx).toContain("stillCurrent");
    expect(authCtx).toContain("normalizeEmail(restored.email) !== expectedEmail");
  });

  it("H — login/register still use credential + cloud member fetch", () => {
    expect(authSvc).toContain("signInWithPassword");
    expect(authSvc).toContain("signUp");
    expect(authSvc).toMatch(/loginAccount[\s\S]*fetchCloudMemberByEmail/);
    expect(authSvc).toMatch(/registerAccount[\s\S]*insertCloudMember/);
  });

  it("I — cache owner bound only after identity confirmed (fast path order)", () => {
    const fastBlock = authCtx.slice(
      authCtx.indexOf('fast.path === "fast"'),
      authCtx.indexOf("Background full reconcile"),
    );
    expect(fastBlock.indexOf("ensureResourceCacheOwner")).toBeLessThan(
      fastBlock.indexOf("setSession(fast.session)"),
    );
    expect(fastBlock.indexOf("ensureResourceCacheOwner")).toBeLessThan(
      fastBlock.indexOf("setIsLoading(false)"),
    );
  });

  it("first paint must not await org/retail/app-data sync on restore", () => {
    expect(authSvc).toContain("awaitSync: false");
    expect(authCtx).not.toContain("await syncCloudAuthData");
    expect(authCtx).not.toContain("fetchCloudOrganizationData");
  });
});
