/** Integer-cent money helpers for Baki Life. Never use float arithmetic for money. */

export function yuanToCents(yuan: number | string): number {
  if (typeof yuan === "string") {
    const trimmed = yuan.trim().replace(/,/g, "");
    if (!trimmed) throw new Error("金額不可為空");
    if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
      throw new Error("金額格式不正確");
    }
    const negative = trimmed.startsWith("-");
    const abs = negative ? trimmed.slice(1) : trimmed;
    const [whole, frac = ""] = abs.split(".");
    const cents =
      BigInt(whole || "0") * BigInt(100) + BigInt((frac + "00").slice(0, 2));
    const n = Number(negative ? -cents : cents);
    if (!Number.isSafeInteger(n)) throw new Error("金額過大");
    return n;
  }
  if (!Number.isFinite(yuan)) throw new Error("金額無效");
  const n = Math.round(yuan * 100);
  if (!Number.isSafeInteger(n)) throw new Error("金額過大");
  return n;
}

export function centsToYuanNumber(cents: number): number {
  if (!Number.isSafeInteger(cents)) throw new Error("金額無效");
  return cents / 100;
}

export function formatTwdFromCents(cents: number, opts?: { signed?: boolean }): string {
  if (!Number.isSafeInteger(cents)) return "—";
  const sign = cents < 0 ? "-" : opts?.signed && cents > 0 ? "+" : "";
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const frac = abs % 100;
  const yuanStr = yuan.toLocaleString("zh-TW");
  if (frac === 0) return `${sign}$${yuanStr}`;
  return `${sign}$${yuanStr}.${String(frac).padStart(2, "0")}`;
}

export function assertPositiveCents(cents: number): number {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error("金額必須大於 0");
  }
  return cents;
}

export function assertNonNegativeCents(cents: number): number {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error("金額不可為負");
  }
  return cents;
}
