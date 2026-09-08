"use client";

import { useEffect, useState } from "react";

export function DrawRevealOverlay({
  open,
  names,
  winnerName,
  subtitle = "恭喜中獎",
  onDone,
}: {
  open: boolean;
  names: string[];
  winnerName: string | null;
  subtitle?: string;
  onDone?: () => void;
}) {
  const [phase, setPhase] = useState<"spin" | "reveal">("spin");
  const [display, setDisplay] = useState("…");

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setPhase("spin");
        setDisplay("…");
      });
      return;
    }
    if (!winnerName) return;

    const pool = names.length > 0 ? names : [winnerName];
    let tick = 0;
    let delay = 40;
    let timer: number | undefined;

    const step = () => {
      setDisplay(pool[tick % pool.length]!);
      tick += 1;
      if (delay < 220) {
        delay += tick % 4 === 0 ? 12 : 6;
        timer = window.setTimeout(step, delay);
      } else {
        setDisplay(winnerName);
        setPhase("reveal");
        window.setTimeout(() => onDone?.(), 1800);
      }
    };
    timer = window.setTimeout(step, delay);
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [open, winnerName, names, onDone]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#141210]/95 px-6 text-center text-[#f5f0e8]">
      {phase === "reveal"
        ? Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="pointer-events-none absolute h-2 w-2 animate-bounce rounded-full bg-[#c4a35a] opacity-70"
              style={{
                left: `${8 + ((i * 17) % 84)}%`,
                top: `${12 + ((i * 29) % 70)}%`,
                animationDelay: `${i * 40}ms`,
              }}
            />
          ))
        : null}
      <div className="relative z-10 space-y-4">
        {phase === "reveal" ? <p className="text-[2rem]">🎉</p> : null}
        <p
          className={`font-semibold tracking-wide transition-all duration-300 ${
            phase === "reveal" ? "scale-110 text-[2.75rem]" : "text-[2rem]"
          }`}
        >
          {display}
        </p>
        {phase === "reveal" ? (
          <p className="text-[1rem] text-[#c4a35a]">{subtitle}</p>
        ) : (
          <p className="text-[0.875rem] text-[#a39e94]">抽獎中…</p>
        )}
      </div>
    </div>
  );
}
