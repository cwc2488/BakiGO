"use client";

import {
  getHomeDisplayMode,
  setHomeDisplayMode,
  type HomeDisplayMode,
} from "@/lib/ui/home-display-mode";
import { APP_ICON } from "@/lib/ui/app-icons";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { useMemo, useState } from "react";
import { ProfileCard, ProfileSectionTitle } from "./ui";

export function ProfileHomeDisplaySection() {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [mode, setMode] = useState<HomeDisplayMode>(() => getHomeDisplayMode(storage));

  function handleChange(nextMode: HomeDisplayMode) {
    setHomeDisplayMode(nextMode, storage);
    setMode(nextMode);
  }

  return (
    <ProfileCard>
      <ProfileSectionTitle icon={APP_ICON.nav.home}>首頁顯示</ProfileSectionTitle>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-[#86868b]">
        簡易模式只顯示今天要做的事和常用入口，字比較少。
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          className={`rounded-2xl px-4 py-3.5 text-[0.9375rem] font-semibold transition-colors ${
            mode === "simple"
              ? "bg-[#1d1d1f] text-white"
              : "border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[#1d1d1f]"
          }`}
          onClick={() => handleChange("simple")}
          type="button"
        >
          簡易
        </button>
        <button
          className={`rounded-2xl px-4 py-3.5 text-[0.9375rem] font-semibold transition-colors ${
            mode === "full"
              ? "bg-[#1d1d1f] text-white"
              : "border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[#1d1d1f]"
          }`}
          onClick={() => handleChange("full")}
          type="button"
        >
          完整
        </button>
      </div>
    </ProfileCard>
  );
}
