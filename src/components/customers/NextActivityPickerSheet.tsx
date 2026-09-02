"use client";

import {
  MobileDismissibleSheet,
  MobileDismissibleSheetBody,
  MobileDismissibleSheetHandle,
} from "@/components/ui/MobileDismissibleSheet";
import {
  filterNextActivityItems,
  groupNextActivityItems,
  type NextActivityPickerItem,
  type NextActivitySourceFilter,
} from "@/lib/calendar/next-activity-picker";
import { CALENDAR_EVENT_SOURCE } from "@/types/calendar-event-participant";
import { useMemo, useState } from "react";

const FILTERS: Array<{ value: NextActivitySourceFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: CALENDAR_EVENT_SOURCE.PERSONAL, label: "我的行事曆" },
  { value: CALENDAR_EVENT_SOURCE.ALLIANCE_SHARED, label: "聯盟共用" },
];

type Props = {
  open: boolean;
  items: NextActivityPickerItem[];
  onClose: () => void;
  onSelect: (item: NextActivityPickerItem) => void;
};

export function NextActivityPickerSheet({ open, items, onClose, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<NextActivitySourceFilter>("all");

  const filtered = useMemo(
    () => filterNextActivityItems(items, { query: search, source }),
    [items, search, source],
  );
  const groups = useMemo(() => groupNextActivityItems(filtered), [filtered]);

  const emptyMessage =
    items.length === 0
      ? "目前沒有即將到來的活動"
      : search.trim()
        ? "找不到符合的活動"
        : source === "all"
          ? "目前沒有即將到來的活動"
          : source === "personal"
            ? "我的行事曆沒有可選活動"
            : "聯盟共用沒有可選活動";

  function handleClose() {
    setSearch("");
    setSource("all");
    onClose();
  }

  return (
    <MobileDismissibleSheet
      onClose={handleClose}
      open={open}
      overlayClassName="bg-black/60"
      panelClassName="flex h-[min(90dvh,100dvh)] w-full max-w-md flex-col overflow-hidden rounded-t-[1.5rem] bg-[#ffffff] pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-12px_40px_rgba(0,0,0,0.28)] sm:mb-0 sm:h-[min(86vh,40rem)] sm:rounded-[1.5rem] sm:pb-0"
      rootClassName="z-[140]"
    >
      <MobileDismissibleSheetHandle />

      <header className="shrink-0 border-b border-[#ebebec] bg-[#ffffff] px-5 pb-3 pt-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[1.125rem] font-semibold tracking-tight text-[#1d1d1f]">
              選擇下次活動
            </h2>
            <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">選擇行事曆中已建立的活動</p>
          </div>
          <button
            aria-label="關閉"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#1d1d1f] active:bg-[#f2f2f7]"
            onClick={handleClose}
            type="button"
          >
            <span className="text-[1.375rem] leading-none">×</span>
          </button>
        </div>

        <label className="relative mt-3 block">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8e8e93]">
            <SearchIcon />
          </span>
          <input
            className="w-full rounded-[0.875rem] border border-[#e5e5ea] bg-[#f2f2f7] py-3 pl-10 pr-10 text-[1rem] text-[#1d1d1f] outline-none placeholder:text-[#8e8e93] focus:border-[#c7c7cc] focus:bg-[#ffffff]"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜尋活動名稱、分類..."
            type="search"
            value={search}
          />
          {search ? (
            <button
              aria-label="清除搜尋"
              className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#8e8e93]"
              onClick={() => setSearch("")}
              type="button"
            >
              ×
            </button>
          ) : null}
        </label>

        <div className="mt-3 grid grid-cols-3 rounded-[0.75rem] bg-[#f2f2f7] p-0.5">
          {FILTERS.map((filter) => {
            const active = source === filter.value;
            return (
              <button
                className={`rounded-[0.625rem] px-1 py-2 text-[0.75rem] font-semibold ${
                  active ? "bg-[#ffffff] text-[#1d1d1f] shadow-sm" : "text-[#636366]"
                }`}
                key={filter.value}
                onClick={() => setSource(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </header>

      <MobileDismissibleSheetBody className="bg-[#ffffff] px-0">
        {groups.length === 0 ? (
          <p className="px-5 py-16 text-center text-[0.9375rem] text-[#86868b]">{emptyMessage}</p>
        ) : (
          groups.map((group) => (
            <section key={group.dateKey}>
              <p className="sticky top-0 z-10 bg-[#f8f8fa] px-5 py-1.5 text-[0.75rem] font-semibold tracking-wide text-[#86868b]">
                {group.heading}
              </p>
              <ul>
                {group.items.map((item, index) => (
                  <li key={`${item.eventSource}:${item.eventId}`}>
                    <button
                      className={`flex w-full items-start gap-3 bg-[#ffffff] px-5 py-3 text-left active:bg-[#f2f2f7] ${
                        index < group.items.length - 1 ? "border-b border-[#f2f2f7]" : ""
                      }`}
                      onClick={() => {
                        onSelect(item);
                        setSearch("");
                        setSource("all");
                      }}
                      type="button"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[1rem] font-semibold text-[#1d1d1f]">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block text-[0.8125rem] text-[#636366]">
                          {item.dateLabel} · {item.timeLabel}
                        </span>
                        <span className="mt-0.5 block text-[0.75rem] text-[#8e8e93]">
                          {item.categoryLabel}
                        </span>
                      </span>
                      <span
                        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${
                          item.eventSource === "alliance_shared"
                            ? "bg-[#eef6ee] text-[#3d8b40]"
                            : "bg-[#f2f2f7] text-[#636366]"
                        }`}
                      >
                        {item.sourceLabel}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </MobileDismissibleSheetBody>
    </MobileDismissibleSheet>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden fill="none" height="16" viewBox="0 0 16 16" width="16">
      <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11.5 14 14.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}
