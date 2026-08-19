import { describe, expect, it, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ANALYSIS_SESSION_TTL_DAYS,
  resolveAnalysisAttribution,
} from "@/lib/analysis/analysis-attribution";
import {
  assertAnalysisSessionHasNoPii,
  AnalysisSessionError,
} from "@/lib/analysis/analysis-session-service";
import {
  generateAnalysisSessionToken,
  hashAnalysisSessionToken,
  isPlausibleAnalysisSessionToken,
} from "@/lib/analysis/analysis-session-token";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const QUIZ_RESULT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GROWTH_SHARE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEMBER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("QUIZ-AI-21 P1 — anonymous analysis foundation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("P1-01 — anonymous session create inserts hash-only token + shell state", async () => {
    const insertPayload: Record<string, unknown>[] = [];
    const plaintext = generateAnalysisSessionToken();
    vi.doMock("@/lib/analysis/analysis-session-token", () => ({
      generateAnalysisSessionToken: () => plaintext,
      hashAnalysisSessionToken,
      isPlausibleAnalysisSessionToken,
    }));
    vi.doMock("@/lib/analysis/resolve-growth-share", () => ({
      resolveValidatedGrowthShareId: async () => null,
    }));
    vi.doMock("@/lib/supabase/service-client", () => ({
      isSupabaseServiceConfigured: () => true,
      createSupabaseServiceClient: () => ({
        from: (table: string) => {
          if (table === "quiz_results") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: QUIZ_RESULT_ID,
                      primary_type: "A",
                      quiz_responses: {
                        id: "resp-1",
                        respondent_name: "小安",
                        referrer_member_id: null,
                        share_code: null,
                        growth_share_id: null,
                        completed_at: new Date().toISOString(),
                      },
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "analysis_sessions") {
            return {
              select: () => ({
                eq: () => ({
                  gte: () => ({
                    // count head for rate limit
                    then: undefined,
                  }),
                }),
              }),
              insert: (row: Record<string, unknown>) => {
                insertPayload.push(row);
                return {
                  select: () => ({
                    single: async () => ({
                      data: {
                        id: "session-1",
                        ...row,
                      },
                      error: null,
                    }),
                  }),
                };
              },
            };
          }
          throw new Error(`unexpected table ${table}`);
        },
      }),
    }));

    // Rebuild rate-limit chain: .select().eq().gte() returning { count, error }
    vi.doMock("@/lib/supabase/service-client", () => ({
      isSupabaseServiceConfigured: () => true,
      createSupabaseServiceClient: () => ({
        from: (table: string) => {
          if (table === "quiz_results") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: QUIZ_RESULT_ID,
                      primary_type: "A",
                      quiz_responses: {
                        id: "resp-1",
                        respondent_name: "小安",
                        referrer_member_id: null,
                        share_code: null,
                        growth_share_id: null,
                        completed_at: new Date().toISOString(),
                      },
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "analysis_sessions") {
            return {
              select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
                if (opts?.head) {
                  return {
                    eq: () => ({
                      gte: async () => ({ count: 0, error: null }),
                    }),
                  };
                }
                return {
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                };
              },
              insert: (row: Record<string, unknown>) => {
                insertPayload.push(row);
                return {
                  select: () => ({
                    single: async () => ({
                      data: { id: "session-1", ...row },
                      error: null,
                    }),
                  }),
                };
              },
            };
          }
          throw new Error(`unexpected table ${table}`);
        },
      }),
    }));

    const { createAnalysisSession } = await import("@/lib/analysis/analysis-session-service");
    const created = await createAnalysisSession({ quizResultId: QUIZ_RESULT_ID });
    expect(created.plaintextToken).toBe(plaintext);
    expect(created.session.analysisState).toBe("shell");
    expect(created.session.sourceType).toBe("direct");
    expect(insertPayload[0]?.token_hash).toBe(hashAnalysisSessionToken(plaintext));
    expect(JSON.stringify(insertPayload[0])).not.toContain(plaintext);
    const expires = new Date(String(insertPayload[0]?.expires_at)).getTime();
    const createdAt = new Date(String(insertPayload[0]?.created_at)).getTime();
    expect(expires - createdAt).toBeGreaterThanOrEqual(
      (ANALYSIS_SESSION_TTL_DAYS - 0.01) * 24 * 60 * 60 * 1000,
    );
  });

  it("P1-02 / P1-03 — opaque token read; invalid token rejected", async () => {
    const token = generateAnalysisSessionToken();
    const tokenHash = hashAnalysisSessionToken(token);
    vi.doMock("@/lib/supabase/service-client", () => ({
      isSupabaseServiceConfigured: () => true,
      createSupabaseServiceClient: () => ({
        from: (table: string) => {
          if (table === "analysis_sessions") {
            return {
              select: () => ({
                eq: (_col: string, value: string) => ({
                  maybeSingle: async () => {
                    if (value === tokenHash) {
                      return {
                        data: {
                          id: "session-1",
                          token_hash: tokenHash,
                          quiz_result_id: QUIZ_RESULT_ID,
                          source_type: "direct",
                          growth_share_id: null,
                          quiz_share_code: null,
                          referrer_member_id: null,
                          radar_candidate_id: null,
                          radar_source_meta: {},
                          status: "active",
                          analysis_state: "shell",
                          report_id: null,
                          created_at: new Date().toISOString(),
                          expires_at: new Date(Date.now() + 86400000).toISOString(),
                          last_activity_at: new Date().toISOString(),
                        },
                        error: null,
                      };
                    }
                    return { data: null, error: null };
                  },
                }),
              }),
              update: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          }
          if (table === "quiz_results") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: QUIZ_RESULT_ID,
                      primary_type: "B",
                      quiz_responses: {
                        id: "resp-1",
                        respondent_name: "小安",
                        referrer_member_id: null,
                        share_code: null,
                        growth_share_id: null,
                        completed_at: new Date().toISOString(),
                      },
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          throw new Error(table);
        },
      }),
    }));

    const { getAnalysisSessionByToken } = await import("@/lib/analysis/analysis-session-service");
    const view = await getAnalysisSessionByToken(token, { touchActivity: false });
    expect(view.tokenPresent).toBe(true);
    expect(view.quizSummary.animalName).toBeTruthy();
    expect(view.status).toBe("active");

    await expect(getAnalysisSessionByToken("not-a-valid-token!!")).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  it("P1-04 — expired token rejected on read (expires_at authority)", async () => {
    const token = generateAnalysisSessionToken();
    const tokenHash = hashAnalysisSessionToken(token);
    vi.doMock("@/lib/supabase/service-client", () => ({
      isSupabaseServiceConfigured: () => true,
      createSupabaseServiceClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "session-1",
                  token_hash: tokenHash,
                  quiz_result_id: QUIZ_RESULT_ID,
                  source_type: "direct",
                  growth_share_id: null,
                  quiz_share_code: null,
                  referrer_member_id: null,
                  radar_candidate_id: null,
                  radar_source_meta: {},
                  status: "active",
                  analysis_state: "shell",
                  report_id: null,
                  created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
                  expires_at: new Date(Date.now() - 1000).toISOString(),
                  last_activity_at: new Date(Date.now() - 40 * 86400000).toISOString(),
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }));
    const { getAnalysisSessionByToken } = await import("@/lib/analysis/analysis-session-service");
    await expect(getAnalysisSessionByToken(token, { touchActivity: false })).rejects.toMatchObject({
      code: "expired",
      status: 410,
    });
  });

  it("P1-05 / P1-06 — migration denies direct anon DB read/write", () => {
    const migration = readSrc("supabase/migrations/046_quiz_v2_production_recovery.sql");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.analysis_sessions from anon, authenticated");
    expect(migration).toContain("grant all on table public.analysis_sessions to service_role");
    expect(migration).toMatch(/No policies|no policies/i);
    expect(migration).not.toMatch(/create policy[\s\S]*analysis_sessions/i);
  });

  it("P1-07 / P1-08 — quiz result must exist+complete; forged id rejected", async () => {
    vi.doMock("@/lib/analysis/resolve-growth-share", () => ({
      resolveValidatedGrowthShareId: async () => null,
    }));
    vi.doMock("@/lib/supabase/service-client", () => ({
      isSupabaseServiceConfigured: () => true,
      createSupabaseServiceClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              gte: async () => ({ count: 0, error: null }),
            }),
          }),
        }),
      }),
    }));
    const { createAnalysisSession } = await import("@/lib/analysis/analysis-session-service");
    await expect(createAnalysisSession({ quizResultId: "not-a-uuid" })).rejects.toMatchObject({
      code: "invalid_quiz_result",
    });
    await expect(createAnalysisSession({ quizResultId: QUIZ_RESULT_ID })).rejects.toMatchObject({
      code: "quiz_result_not_found",
    });
  });

  it("P1-09 — session record has no PII-shaped fields", () => {
    assertAnalysisSessionHasNoPii({
      id: "session-1",
      quizResultId: QUIZ_RESULT_ID,
      sourceType: "direct",
      growthShareId: null,
      quizShareCode: null,
      referrerMemberId: null,
      radarCandidateId: null,
      radarSourceMeta: {},
      resultShareId: null,
      status: "active",
      analysisState: "shell",
      reportId: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      answersJson: {},
      currentQuestionId: null,
      layer1Json: null,
      questionsCompletedAt: null,
      layer1ReadyAt: null,
    });
    const migration = readSrc("supabase/migrations/046_quiz_v2_production_recovery.sql");
    const p1Table = migration.slice(
      migration.indexOf("create table if not exists public.analysis_sessions"),
      migration.indexOf("comment on table public.analysis_sessions"),
    );
    expect(p1Table).not.toMatch(/\b(phone|line_id|email|full_name)\b/);
    expect(migration).toContain("No PII");
  });

  it("P1-11 — /r attribution preserved when growth_share_id present", () => {
    const resolved = resolveAnalysisAttribution({
      growthShareId: GROWTH_SHARE_ID,
      quizShareCode: "QCODE1",
      referrerMemberId: MEMBER_ID,
    });
    expect(resolved.sourceType).toBe("referral_share");
    expect(resolved.growthShareId).toBe(GROWTH_SHARE_ID);
  });

  it("P1-12 — /q cannot overwrite /r authority in resolver", () => {
    const resolved = resolveAnalysisAttribution({
      growthShareId: GROWTH_SHARE_ID,
      quizShareCode: "OVERRIDE",
      referrerMemberId: MEMBER_ID,
    });
    expect(resolved.sourceType).toBe("referral_share");
    expect(resolved.growthShareId).toBe(GROWTH_SHARE_ID);
  });

  it("P1-14 — future Radar nullable / no product dependency", () => {
    const migration = readSrc("supabase/migrations/046_quiz_v2_production_recovery.sql");
    expect(migration).toContain("radar_candidate_id uuid");
    expect(migration).toMatch(/No FK \/ no product unlock/i);
    const service = readSrc("src/lib/analysis/analysis-session-service.ts");
    expect(service).toContain("radarCandidateId");
    expect(service).not.toMatch(/unlockRadar|requireRadar|RADAR_REQUIRED/);
  });

  it("P1-15 — Guided Consultation remains experimental_hidden / locked out of funnel", () => {
    const db = readSrc("docs/DATABASE.md");
    const business = readSrc("docs/BUSINESS_RULES.md");
    expect(db).toContain("experimental_hidden");
    expect(business).toContain("experimental_hidden");
    const resultPage = readSrc("src/components/quiz/FatLossQuizResultPage.tsx");
    expect(resultPage).toContain("幫我深入分析");
    expect(resultPage).toContain("/api/analysis/sessions");
    expect(resultPage).not.toContain("/consultation");
    const shell = readSrc("src/app/analysis/[token]/page.tsx");
    expect(shell).not.toContain("/consultation");
    const flow = readSrc("src/components/analysis/AnalysisFlowPage.tsx");
    expect(flow).not.toContain("/consultation");
    const homeLinks = readSrc("src/components/home/home-core-work-entries.test.ts");
    expect(homeLinks).toContain("/consultation/new");
  });

  it("P1-16 — Radar remains locked (no nav unlock; nullable architecture only)", () => {
    const home = readSrc("src/components/home/home-core-work-entries.test.ts");
    expect(home).toContain("/radar");
    const resultPage = readSrc("src/components/quiz/FatLossQuizResultPage.tsx");
    expect(resultPage).not.toContain("/radar");
    const shell = readSrc("src/app/analysis/[token]/page.tsx");
    expect(shell).not.toContain("/radar");
  });

  it("P1-17 — existing Quiz routes/CTA regression anchors", () => {
    expect(readSrc("src/app/quiz/page.tsx")).toContain("/quiz/fat-loss");
    expect(readSrc("src/components/quiz/FatLossQuizResultPage.tsx")).toContain("幫我深入分析");
    // P2.1: result CTA no longer links next-step (duplicate of deep analysis). Route may still exist.
    expect(readSrc("src/components/quiz/FatLossQuizResultPage.tsx")).not.toContain(
      `/quiz/fat-loss/next-step/`,
    );
    expect(existsSync(resolve(process.cwd(), "src/app/quiz/fat-loss/next-step/[resultId]/page.tsx"))).toBe(
      true,
    );
    expect(readSrc("src/app/q/[code]/page.tsx")).toContain("/quiz/fat-loss");
    expect(readSrc("src/app/q/[code]/page.tsx")).not.toContain("/quiz/fat-loss/start");
  });

  it("P1-18 — existing Referral /r regression anchors + quiz bridge", () => {
    const sharePage = readSrc("src/components/referral/PublicSharePage.tsx");
    expect(sharePage).toContain("/api/r/");
    expect(sharePage).toContain("/quiz/fat-loss?gs=");
    expect(readSrc("src/lib/auth/public-paths.ts")).toContain('/r/');
    expect(readSrc("docs/DATABASE.md")).toContain("growth_shares");
    expect(readSrc("docs/DATABASE.md")).toContain("growth_referral_attributions");
  });

  it("API rejects client-claimed growthShareId ownership", () => {
    const route = readSrc("src/app/api/analysis/sessions/route.ts");
    expect(route).toContain("forged_share_id");
    expect(route).toContain("growthShareId");
    const start = readSrc("src/app/api/quiz/responses/start/route.ts");
    expect(start).toContain("forged_share_id");
  });

  it("shell CTA opens intake — no fake conversation", () => {
    const flow = readSrc("src/components/analysis/AnalysisFlowPage.tsx");
    expect(flow).toContain("開始深入分析");
    expect(flow).toMatch(/不用登入|不需要登入/);
    expect(flow).not.toMatch(/openai|chat completion|fake.?conversation/i);
    expect(flow).toContain("/api/analysis/sessions/");
  });

  it("AnalysisSessionError is typed for HTTP mapping", () => {
    const err = new AnalysisSessionError("gone", 410, "expired");
    expect(err.status).toBe(410);
    expect(err.code).toBe("expired");
  });
});
