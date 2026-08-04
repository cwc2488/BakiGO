"use client";

import type {
  MapUniverseLine,
  MapUniverseLineStatus,
  MapUniverseResult,
} from "@/lib/services/build-map-universe";
import { useState } from "react";
import { EmptyState } from "./states";
import { Card, SectionLabel } from "./ui";

const STATUS_STYLES: Record<
  MapUniverseLineStatus,
  { dot: string; ring: string; label: string }
> = {
  growing: {
    dot: "bg-[#30d158]",
    ring: "shadow-[0_0_0_4px_rgba(48,209,88,0.25)]",
    label: "正在成長",
  },
  needs_help: {
    dot: "bg-[#ffd60a]",
    ring: "shadow-[0_0_0_4px_rgba(255,214,10,0.25)]",
    label: "需要協助",
  },
  danger: {
    dot: "bg-[#ff375f]",
    ring: "shadow-[0_0_0_4px_rgba(255,55,95,0.25)]",
    label: "危險",
  },
  empty: {
    dot: "bg-[#d1d1d6]",
    ring: "",
    label: "尚未建立",
  },
};

function tierClassName(line: MapUniverseLine): string {
  switch (line.rankTier) {
    case "world_team":
      return "shadow-[0_0_16px_rgba(48,209,88,0.35)]";
    case "promotion_group":
      return "ring-2 ring-[#0071e3]/20";
    case "wealth_group":
      return "shadow-[0_0_16px_rgba(255,214,10,0.35)]";
    default:
      return "";
  }
}

function MapDot({
  line,
  isSelected,
  onSelect,
}: {
  line: MapUniverseLine;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const style = STATUS_STYLES[line.status];

  return (
    <button
      aria-label={line.displayName ?? `MAP ${line.lineIndex + 1}`}
      aria-pressed={isSelected}
      className={`relative flex aspect-square w-full items-center justify-center rounded-full transition-transform duration-200 active:scale-95 ${isSelected ? "scale-105" : "hover:scale-[1.03]"}`}
      onClick={onSelect}
      type="button"
    >
      <span
        className={`block h-[85%] w-[85%] rounded-full ${style.dot} ${style.ring} ${tierClassName(line)} ${isSelected ? "ring-4 ring-[#0071e3]/30" : ""}`}
      />
    </button>
  );
}

function DetailCard({ line }: { line: MapUniverseLine }) {
  const status = STATUS_STYLES[line.status];

  return (
    <article className="animate-expand mt-6 rounded-[1.25rem] bg-[#1d1d1f] p-5 text-white sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.8125rem] font-medium text-white/60">
            MAP {line.lineIndex + 1}
          </p>
          <h3 className="mt-1 text-[1.375rem] font-semibold tracking-tight sm:text-[1.5rem]">
            {line.displayName ?? "空線"}
          </h3>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-[0.75rem] font-medium">
          {status.label}
        </span>
      </div>

      {line.isEstablished ? (
        <dl className="mt-5 space-y-3.5 sm:mt-6 sm:space-y-4">
          <DetailRow label="目前 VP" value={line.vpTotal !== null ? `${line.vpTotal} VP` : "—"} />
          <DetailRow label="目前 Rank" value={line.rankName ?? "—"} />
          <DetailRow
            label="距離下一階"
            value={
              line.nextRankName
                ? `${line.nextRankName}${line.promotionProgressPercent !== null ? ` · ${line.promotionProgressPercent}%` : ""}`
                : (line.promotionDescription ?? "—")
            }
          />
          <DetailRow label="President AI 建議" value={line.presidentSuggestion ?? "—"} />
          <DetailRow label="最近成交" value={line.recentTransactionLabel ?? "—"} />
          <DetailRow
            label="本月 Active"
            value={line.monthlyActive === null ? "—" : line.monthlyActive ? "是" : "否"}
          />
          <DetailRow label="本月 Mission" value={line.monthlyMissionTitle ?? "—"} />
        </dl>
      ) : (
        <p className="mt-5 text-[0.9375rem] text-white/70 sm:mt-6">
          此 MAP 線尚未建立夥伴。邀請第一位夥伴加入，這顆圓點就會亮起來。
        </p>
      )}
    </article>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.75rem] font-medium uppercase tracking-wide text-white/50">
        {label}
      </dt>
      <dd className="mt-1 text-[0.9375rem] font-medium leading-relaxed sm:text-[1rem]">
        {value}
      </dd>
    </div>
  );
}

export function MapUniverseSection({ universe }: { universe: MapUniverseResult }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedLine =
    selectedIndex !== null ? (universe.lines[selectedIndex] ?? null) : null;
  const establishedCount = universe.lines.filter((line) => line.isEstablished).length;

  return (
    <Card>
      <SectionLabel>MAP Universe</SectionLabel>
      <p className="mt-2 text-[1.25rem] font-semibold tracking-tight text-[#1d1d1f] sm:text-[1.375rem]">
        {universe.layoutSlotCount} 條 MAP
      </p>

      {universe.isRuleMissing ? (
        <div className="mt-4">
          <EmptyState
            title="MAP 目標尚未設定"
            description="系統規則定義完成後，這裡會顯示你的 MAP 進度。"
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-4 gap-3 sm:grid-cols-7 sm:gap-4">
            {universe.lines.map((line) => (
              <MapDot
                key={line.lineIndex}
                isSelected={selectedIndex === line.lineIndex}
                line={line}
                onSelect={() =>
                  setSelectedIndex((current) =>
                    current === line.lineIndex ? null : line.lineIndex,
                  )
                }
              />
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[0.75rem] text-[#86868b]">
            {Object.entries(STATUS_STYLES).map(([key, style]) => (
              <span key={key} className="inline-flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                {style.label}
              </span>
            ))}
          </div>

          {establishedCount === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="還沒有 MAP 線"
                description="完成第一筆成交、建立第一條線，你的 MAP Universe 就會開始發光。"
              />
            </div>
          ) : null}

          {selectedLine ? <DetailCard line={selectedLine} /> : null}
        </>
      )}
    </Card>
  );
}
