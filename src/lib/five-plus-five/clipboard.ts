/** Safe clipboard helper for iOS / PWA — never throws to callers. */

export type ClipboardResult = { ok: true } | { ok: false; error: string };

export async function copyTextToClipboard(text: string): Promise<ClipboardResult> {
  if (typeof window === "undefined") {
    return { ok: false, error: "unavailable" };
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    }
  } catch {
    // fall through to execCommand
  }

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    el.style.top = "0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    if (!ok) {
      return { ok: false, error: "copy_failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "copy_failed" };
  }
}
