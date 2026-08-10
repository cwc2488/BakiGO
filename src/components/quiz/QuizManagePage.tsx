"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import { CrmButton } from "@/components/members/ui";

type ShareLink = {
  shareCode: string;
  createdAt: string;
  isActive: boolean;
};

export function QuizManagePage() {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [latestUrl, setLatestUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithMemberAuth("/api/quiz/share-links");
      const payload = (await response.json()) as { ok?: boolean; links?: ShareLink[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "無法載入分享連結");
      }
      setLinks(payload.links ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入分享連結");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  async function createShareLink() {
    setCreating(true);
    setError(null);
    try {
      const response = await fetchWithMemberAuth("/api/quiz/leads", { method: "POST" });
      const payload = (await response.json()) as {
        ok?: boolean;
        shareCode?: string;
        url?: string;
        error?: string;
      };
      if (!response.ok || !payload.shareCode) {
        throw new Error(payload.error ?? "無法建立分享連結");
      }
      const absoluteUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}${payload.url ?? `/q/${payload.shareCode}`}`
          : payload.url ?? `/q/${payload.shareCode}`;
      setLatestUrl(absoluteUrl);
      await loadLinks();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "無法建立分享連結");
    } finally {
      setCreating(false);
    }
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(url);
    window.setTimeout(() => setCopied(null), 2000);
  }

  return (
    <PageShell
      title="心理測驗分享"
      subtitle="產生專屬連結，讓潛在名單完成測驗後自動歸屬到你名下。"
    >
      <BrandCard>
        <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">減脂破冰測驗</h2>
        <p className="mt-2 text-[0.9375rem] leading-7 text-[#86868b]">
          《你是哪一種瘦不下來的人？》12 題人格測驗，適合陌生開發前的破冰互動。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <CrmButton disabled={creating} onClick={() => void createShareLink()}>
            {creating ? "建立中…" : "產生新分享連結"}
          </CrmButton>
          <Link
            href="/quiz/leads"
            className="inline-flex items-center rounded-full border border-[var(--brand-border)] px-4 py-2 text-sm font-medium text-[var(--brand-primary-dark)]"
          >
            查看測驗名單
          </Link>
        </div>
        {latestUrl ? (
          <div className="mt-4 rounded-2xl bg-[var(--brand-primary-muted)] px-4 py-3">
            <p className="text-xs text-[#86868b]">最新分享連結</p>
            <p className="mt-1 break-all text-sm font-medium text-[#1d1d1f]">{latestUrl}</p>
            <button
              type="button"
              className="mt-2 text-sm font-medium text-[var(--brand-primary-dark)]"
              onClick={() => void copyUrl(latestUrl)}
            >
              {copied === latestUrl ? "已複製" : "複製連結"}
            </button>
          </div>
        ) : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </BrandCard>

      <BrandCard>
        <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">已建立的分享碼</h2>
        {loading ? (
          <p className="mt-4 text-sm text-[#86868b]">載入中…</p>
        ) : links.length === 0 ? (
          <p className="mt-4 text-sm text-[#86868b]">尚未建立分享連結。</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {links.map((link) => {
              const url =
                typeof window !== "undefined"
                  ? `${window.location.origin}/q/${link.shareCode}`
                  : `/q/${link.shareCode}`;
              return (
                <li
                  key={link.shareCode}
                  className="rounded-2xl border border-[var(--brand-border)] px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#1d1d1f]">{link.shareCode}</p>
                      <p className="mt-1 break-all text-xs text-[#86868b]">{url}</p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-sm font-medium text-[var(--brand-primary-dark)]"
                      onClick={() => void copyUrl(url)}
                    >
                      {copied === url ? "已複製" : "複製"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </BrandCard>
    </PageShell>
  );
}
