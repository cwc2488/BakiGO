import { describe, expect, it } from "vitest";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";

describe("toCoachingApiErrorMessage", () => {
  it("scrubs ON CONFLICT / Postgres diagnostics for customers", () => {
    expect(
      toCoachingApiErrorMessage(
        new Error("there is no unique or exclusion constraint matching the ON CONFLICT specification"),
        "資料儲存失敗，請稍後再試。",
      ),
    ).toBe("資料儲存失敗，請稍後再試。");
  });

  it("keeps intentional user-facing messages", () => {
    expect(toCoachingApiErrorMessage(new Error("連結無效或已過期"), "資料儲存失敗，請稍後再試。")).toBe(
      "連結無效或已過期",
    );
  });

  it("uses fallback when error has no message", () => {
    expect(toCoachingApiErrorMessage({}, "資料儲存失敗，請稍後再試。")).toBe("資料儲存失敗，請稍後再試。");
  });
});
