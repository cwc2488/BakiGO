"use client";

import type {
  MapUniverseLine,
  MapUniverseLineStatus,
  MapUniverseResult,
} from "@/lib/services/build-map-universe";
import { APP_EMOJI } from "@/lib/ui/app-emojis";
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
    label: "活躍督導",
  },
  needs_help: {
    dot: "bg-[#ffd60a]",
    ring: "shadow-[0_0_0_4px_rgba(255,214,10,0.25)]",
    label: "培育中",
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
      return "ring-2 ring-[var(--brand-primary)]/20";
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
      aria-label={line.displayName ?? `活躍督導線 ${line.lineIndex + 1}`}
      aria-pressed={isSelected}
      className={`relative flex aspect-square w-full items-center justify-center rounded-full transition-transform duration-200 active:scale-95 ${isSelected ? "scale-105" : "hover:scale-[1.03]"}`}
      onClick={onSelect}
      type="button"
    >
      <span
        className={`block h-[85%] w-[85%] rounded-full ${style.dot} ${style.ring} ${tierClassName(line)} ${isSelected ? "ring-4 ring-[var(--brand-primary)]/30" : ""}`}
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
            活躍督導線 {line.lineIndex + 1}
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
          <DetailRow label="目前職級" value={line.rankName ?? "—"} />
          {line.nextRankName ? (
            <div>
              <DetailRow label="距離下一階" value={line.nextRankName} />
              {line.promotionProgressPercent !== null ? (
                <div className="mt-2">
                  <div className="h-2 overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full rounded-full bg-[#77b539] transition-all duration-250 ease-out"
                      style={{ width: `${line.promotionProgressPercent}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[0.75rem] font-medium text-white/70">
                    {line.promotionProgressPercent}%
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <DetailRow label="距離下一階" value={line.promotionDescription ?? "—"} />
          )}
          <DetailRow label="總裁 AI 建議" value={line.presidentSuggestion ?? "—"} />
          <DetailRow label="最近成交" value={line.recentTransactionLabel ?? "—"} />
          <DetailRow
            label="活躍督導"
            value={line.monthlyActive === null ? "—" : line.monthlyActive ? "已達成" : "尚未達成"}
          />
          <DetailRow label="本月任務" value={line.monthlyMissionTitle ?? "—"} />
        </dl>
      ) : (
        <p className="mt-5 text-[0.9375rem] text-white/70 sm:mt-6">
          此線尚未有第一代夥伴。招募下線並協助達成活躍督導，這顆圓點就會亮起來。
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
      <SectionLabel emoji={APP_EMOJI.section.mapUniverse}>活躍督導宇宙</SectionLabel>
      <p className="mt-2 text-[1.25rem] font-semibold tracking-tight text-[#1d1d1f] sm:text-[1.375rem]">
        {establishedCount} 位第一代夥伴
      </p>

      {universe.lines.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            emoji={APP_EMOJI.mood.empty}
            title="尚無第一代夥伴"
            description="招募下線後，這裡會顯示各條線的培育進度。"
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
                emoji={APP_EMOJI.section.mapUniverse}
                title="還沒有活躍督導線"
                description="第一代下線達成活躍督導後，對應的圓點會亮起來。"
              />
            </div>
          ) : null}

          {selectedLine ? <DetailCard line={selectedLine} /> : null}
        </>
      )}
    </Card>
  );
}
