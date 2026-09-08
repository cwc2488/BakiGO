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
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
      window.setTimeout(() => setState("idle"), 1500);
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = url;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setState("copied");
        window.setTimeout(() => setState("idle"), 1500);
      } catch {
        setState("failed");
        window.setTimeout(() => setState("idle"), 2000);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={!url}
      className={`inline-flex min-h-10 items-center justify-center rounded-full px-4 text-[0.875rem] font-semibold transition duration-150 active:scale-[0.97] disabled:opacity-40 ${
        state === "copied"
          ? "bg-[#e8f8ee] text-[#248a3d]"
          : state === "failed"
            ? "bg-[#fff2f2] text-[#d70015]"
            : "bg-[#1d1d1f] text-white hover:bg-[#333]"
      } ${className}`}
    >
      {state === "copied" ? "✓ 已複製" : state === "failed" ? "複製失敗" : label}
    </button>
  );
}
