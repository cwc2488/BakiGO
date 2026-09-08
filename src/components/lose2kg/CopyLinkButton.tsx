"use client";

import { useState } from "react";

export function CopyLinkButton({
  url,
  label = "複製網址",
  className = "",
}: {
  url: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "copied" | "failed">("idle");

  async function copy() {
    if (!url || state === "loading") return;
    setState("loading");
    const started = Date.now();
    try {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const el = document.createElement("textarea");
        el.value = url;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(el);
        if (!ok) throw new Error("copy failed");
      }
      const wait = Math.max(0, 280 - (Date.now() - started));
      await new Promise((r) => window.setTimeout(r, wait));
      setState("copied");
      window.setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("failed");
      window.setTimeout(() => setState("idle"), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={!url || state === "loading"}
      className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-[0.875rem] font-semibold shadow-sm transition duration-150 active:scale-[0.97] disabled:opacity-40 ${
        state === "copied"
          ? "bg-[#e8f8ee] text-[#248a3d]"
          : state === "failed"
            ? "bg-[#fff2f2] text-[#d70015]"
            : state === "loading"
              ? "bg-[#1d1d1f] text-white opacity-80"
              : "bg-[#1d1d1f] text-white hover:bg-[#333]"
      } ${className}`}
    >
      {state === "loading" ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
      ) : state === "copied" ? (
        "✓ 已複製"
      ) : state === "failed" ? (
        "複製失敗"
      ) : (
        label
      )}
    </button>
  );
}

/** Full URL text + copy — truncated on mobile, expandable. */
export function PersistentShareUrl({
  title,
  url,
}: {
  title: string;
  url: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-2">
      <h3 className="text-[0.9375rem] font-semibold text-[#1d1d1f]">{title}</h3>
      {url ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={`block w-full break-all rounded-lg border border-[#e8e4dc] bg-white px-3 py-2.5 text-left font-mono text-[0.75rem] text-[#1d1d1f] transition active:scale-[0.99] md:text-[0.8125rem] ${
              expanded ? "" : "truncate md:whitespace-normal md:overflow-visible"
            }`}
            title={url}
          >
            {url}
          </button>
          <CopyLinkButton url={url} />
        </>
      ) : (
        <p className="text-[0.8125rem] text-[#86868b]">
          尚無常駐網址。請按「重設網址」一次以啟用（之後將永久顯示）。
        </p>
      )}
    </div>
  );
}
