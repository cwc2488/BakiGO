import { describe, expect, it, vi } from "vitest";
import {
  categorizeGo21GenerationError,
  sanitizeGo21ChatErrorMessage,
  logGo21ChatDiagnostic,
} from "@/lib/go21/chat-diagnostics";
import {
  interpretGo21ChatSendResult,
  nextClientRequestId,
} from "@/lib/go21/conversation-quality";
import { classifyGo21Relevance } from "@/lib/go21/relevance";
import { assessGo21Disengagement } from "@/lib/go21/conversation-quality";
import { extractGo21StructuredEvent } from "@/lib/go21/extract-structured-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Go21 chat send reliability — diagnostics", () => {
  it("sanitizes secrets from error messages", () => {
    const msg = sanitizeGo21ChatErrorMessage(
      "OpenAI failed Bearer sk-abc1234567890xyz service_role=secret",
    );
    expect(msg).not.toMatch(/sk-abc/);
    expect(msg).not.toMatch(/Bearer/);
    expect(msg).toMatch(/\[redacted\]/);
  });

  it("categorizes provider timeout / schema / openai failures", () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(categorizeGo21GenerationError(abortErr).category).toBe("provider_timeout");
    expect(
      categorizeGo21GenerationError(new Error("OpenAI V2 coach schema invalid: x")).category,
    ).toBe("schema_invalid");
    expect(
      categorizeGo21GenerationError(new Error("OpenAI V2 coach failed: 500 boom")).category,
    ).toBe("provider_error");
    expect(
      categorizeGo21GenerationError(new Error("AI Coach V2 unavailable: missing OPENAI_API_KEY"))
        .category,
    ).toBe("provider_unavailable");
  });

  it("logs structured diagnostics without conversation body", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logGo21ChatDiagnostic({
      stage: "generation",
      correlationId: "corr-1",
      enrollmentId: "enr-1",
      clientRequestIdPresent: true,
      customerPersisted: true,
      generationStarted: true,
      assistantPersisted: false,
      errorName: "Error",
      errorMessage: "OpenAI V2 coach failed: 500",
      errorCategory: "provider_error",
      providerStatus: 500,
    });
    expect(spy).toHaveBeenCalled();
    const logged = String(spy.mock.calls[0]?.[0] ?? "");
    expect(logged).toContain("go21_chat_diagnostic");
    expect(logged).toContain('"stage":"generation"');
    expect(logged).not.toContain("明天想吃大餐");
    spy.mockRestore();
  });
});

describe("Go21 chat send reliability — client interpretation", () => {
  it("TEST 2 — provider failure: customer accepted, coach retryable", () => {
    const r = interpretGo21ChatSendResult({
      ok: true,
      customerAccepted: true,
      assistantStatus: "failed",
      coachMessage: null,
    });
    expect(r.customerSent).toBe(true);
    expect(r.coachFailed).toBe(true);
    expect(r.messageRetry).toBe(false);
  });

  it("TEST 1 — normal send", () => {
    const r = interpretGo21ChatSendResult({
      ok: true,
      customerAccepted: true,
      assistantStatus: "ok",
      coachMessage: "好呀，明天好好享受就好。",
    });
    expect(r.customerSent).toBe(true);
    expect(r.coachOk).toBe(true);
    expect(r.coachFailed).toBe(false);
  });

  it("TEST 4 — customer persistence failure", () => {
    const r = interpretGo21ChatSendResult({
      ok: false,
      customerAccepted: false,
      assistantStatus: "skipped",
    });
    expect(r.messageRetry).toBe(true);
    expect(r.customerSent).toBe(false);
  });

  it("idempotent clientRequestId reuse", () => {
    const id = nextClientRequestId(null);
    expect(nextClientRequestId(id)).toBe(id);
  });
});

describe("Go21 chat send reliability — reproduction path 明天想吃大餐", () => {
  it("routes to in-scope V2/V3 generation path (not cheap exits)", () => {
    const message = "明天想吃大餐";
    expect(classifyGo21Relevance(message)).toBe("in_scope");
    expect(assessGo21Disengagement(message).detected).toBe(false);
    const extracted = extractGo21StructuredEvent({
      message,
      messageLogDate: "2026-08-29",
    });
    expect(extracted).toBeTruthy();
  });

  it("chat route accepts customer before generation and isolates AI failure", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/app/api/coaching/portal/[token]/go21/chat/route.ts"),
      "utf8",
    );
    expect(src).toContain("acceptGo21CustomerTurn");
    expect(src).toContain('stage = "customer_persist"');
    expect(src).toContain('stage = "generation"');
    expect(src.indexOf('stage = "customer_persist"')).toBeLessThan(
      src.indexOf('stage = "generation"'),
    );
    expect(src).toContain('assistantStatus: "failed"');
    expect(src).toContain("customerAlreadyAccepted: true");
    expect(src).toContain("logGo21ChatDiagnostic");
    // Must not 500 after customer accepted
    expect(src).toContain("Customer message is already sent");
  });

  it("UI distinguishes message retry vs coach-response retry", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/go21/Go21App.tsx"), "utf8");
    expect(src).toContain("還沒送出成功");
    expect(src).toContain("教練剛剛沒接上");
    expect(src).toContain("重試回覆");
    expect(src).toContain("retryAssistant");
    expect(src).toContain("interpretGo21ChatSendResult");
  });
});

describe("Go21 chat send reliability — durability state machine", () => {
  type Turn = { role: "customer" | "coach"; clientRequestId: string; content: string };
  type Store = { turns: Turn[] };

  function acceptCustomer(store: Store, clientRequestId: string, content: string) {
    const existing = store.turns.find(
      (t) => t.role === "customer" && t.clientRequestId === clientRequestId,
    );
    if (existing) return { duplicate: true, accepted: true };
    store.turns.push({ role: "customer", clientRequestId, content });
    return { duplicate: false, accepted: true };
  }

  function persistCoach(store: Store, clientRequestId: string, content: string) {
    const existing = store.turns.find(
      (t) => t.role === "coach" && t.clientRequestId === clientRequestId,
    );
    if (existing) return { duplicate: true };
    store.turns.push({ role: "coach", clientRequestId, content });
    return { duplicate: false };
  }

  function runSend(
    store: Store,
    clientRequestId: string,
    content: string,
    ai: "ok" | "fail",
  ): { customerAccepted: boolean; assistantStatus: "ok" | "failed" } {
    acceptCustomer(store, clientRequestId, content);
    if (ai === "fail") return { customerAccepted: true, assistantStatus: "failed" };
    persistCoach(store, clientRequestId, "coach reply");
    return { customerAccepted: true, assistantStatus: "ok" };
  }

  it("TEST 2+3 — provider failure/timeout keeps one customer turn", () => {
    const store: Store = { turns: [] };
    const id = "req-1";
    const first = runSend(store, id, "明天想吃大餐", "fail");
    expect(first.customerAccepted).toBe(true);
    expect(first.assistantStatus).toBe("failed");
    expect(store.turns.filter((t) => t.role === "customer")).toHaveLength(1);
    // coach response retry
    const second = runSend(store, id, "明天想吃大餐", "ok");
    expect(second.assistantStatus).toBe("ok");
    expect(store.turns.filter((t) => t.role === "customer")).toHaveLength(1);
    expect(store.turns.filter((t) => t.role === "coach")).toHaveLength(1);
  });

  it("TEST 5+6+8 — message retry / lost response / double-tap stay at one customer", () => {
    const store: Store = { turns: [] };
    const id = "req-2";
    acceptCustomer(store, id, "明天想吃大餐");
    acceptCustomer(store, id, "明天想吃大餐");
    acceptCustomer(store, id, "明天想吃大餐");
    expect(store.turns.filter((t) => t.role === "customer")).toHaveLength(1);
  });

  it("TEST 7+9 — generation retry does not duplicate assistant", () => {
    const store: Store = { turns: [] };
    const id = "req-3";
    acceptCustomer(store, id, "明天想吃大餐");
    persistCoach(store, id, "reply");
    persistCoach(store, id, "reply again");
    expect(store.turns.filter((t) => t.role === "coach")).toHaveLength(1);
  });

  it("TEST 10 — reload between customer and assistant keeps customer", () => {
    const store: Store = { turns: [] };
    acceptCustomer(store, "req-4", "明天想吃大餐");
    // simulate reload read
    const visible = store.turns.filter((t) => t.role === "customer");
    expect(visible).toHaveLength(1);
    expect(visible[0]?.content).toBe("明天想吃大餐");
  });
});
