import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ENABLE_STAGE_LABEL,
  PushClientError,
  withTimeout,
} from "@/lib/push/subscription-client";

describe("push client timeouts", () => {
  it("resolves when the promise finishes in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000, "x", "timeout")).resolves.toBe("ok");
  });

  it("rejects with PushClientError when the promise hangs", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<string>(() => undefined), 50, "sw_ready_timeout", "SW 逾時");
    const assertion = expect(pending).rejects.toMatchObject({
      name: "PushClientError",
      code: "sw_ready_timeout",
      message: "SW 逾時",
    });
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
    vi.useRealTimers();
  });

  it("propagates underlying rejection before timeout", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 1000, "x", "timeout"),
    ).rejects.toThrow("boom");
  });

  it("PushClientError carries stable codes", () => {
    const error = new PushClientError("subscribe_timeout", "建立推播訂閱逾時");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("subscribe_timeout");
  });

  it("exposes Chinese stage labels for UI", () => {
    expect(ENABLE_STAGE_LABEL.permission).toContain("權限");
    expect(ENABLE_STAGE_LABEL.service_worker).toContain("Service Worker");
    expect(ENABLE_STAGE_LABEL.subscribe).toContain("訂閱");
    expect(ENABLE_STAGE_LABEL.sync).toContain("同步");
  });
});

describe("iOS enable-flow gesture ordering", () => {
  it("starts permission before setBusy / SW work in ProfileNotificationSection", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/profile/ProfileNotificationSection.tsx"),
      "utf8",
    );
    expect(src).toContain("requestNotificationPermissionFromGesture()");
    expect(src).toContain("completeWebPushEnableAfterGranted");

    const enableFn = src.slice(src.indexOf("async function onEnableClick"));
    const permissionIdx = enableFn.indexOf("requestNotificationPermissionFromGesture()");
    const setBusyIdx = enableFn.indexOf("setBusy(true)");
    const completeIdx = enableFn.indexOf("completeWebPushEnableAfterGranted");
    expect(permissionIdx).toBeGreaterThan(-1);
    expect(setBusyIdx).toBeGreaterThan(permissionIdx);
    expect(completeIdx).toBeGreaterThan(setBusyIdx);
  });

  it("subscription client keeps requestPermission as first await in enableWebPush", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/push/subscription-client.ts"),
      "utf8",
    );
    const enableFn = src.slice(src.indexOf("export async function enableWebPush"));
    const end = enableFn.indexOf("export async function resyncWebPush");
    const body = enableFn.slice(0, end);
    expect(body.indexOf("requestNotificationPermissionFromGesture")).toBeLessThan(
      body.indexOf("completeWebPushEnableAfterGranted"),
    );
    expect(src).toContain("permission_timeout");
    expect(src).toContain("sw_ready_timeout");
    expect(src).toContain("subscribe_timeout");
    expect(src).toContain("sync_timeout");
  });
});
