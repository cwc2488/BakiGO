"use client";

import { formatShortDate } from "@/lib/mission-control/format";
import { BodyCompositionTrendCharts } from "@/components/customers/BodyCompositionTrendCharts";
import { buildPortalTrendSeries } from "@/lib/customers/body-composition-trends";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { PageShell } from "@/components/ui/PageShell";
import { useEffect, useState } from "react";

interface PortalRecord {
  recordDate: string;
  weightKg: number | null;
  bodyFatPercent: number | null;
  visceralFatLevel: number | null;
  bodyAge: number | null;
  basalMetabolicRate: number | null;
}

interface PortalData {
  displayName: string;
  records: PortalRecord[];
}

function buildEncouragement(records: PortalRecord[]): string {
  if (records.length < 2) {
    return "謝謝你持續關心自己的身體，我們一起慢慢進步。";
  }

  const current = records[0];
  const previous = records[1];
  if (
    current.weightKg !== null &&
    previous.weightKg !== null &&
    current.weightKg < previous.weightKg - 0.3
  ) {
    return "比上次有進步！記得保持規律作息，我們約下次再量一次看看。";
  }
  return "每一次量測都是在照顧自己，有任何問題都可以跟教練說。";
}

export default function CustomerPortalPage({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!isSupabaseConfigured()) {
        setError("連結暫時無法使用，請聯絡你的教練。");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { data: payload, error: rpcError } = await supabase.rpc("get_customer_portal_by_token", {
        portal_token: token,
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      if (!payload) {
        setError("連結已失效或不存在，請向教練索取新連結。");
        return;
      }

      setData(payload as PortalData);
    }

    void load();
  }, [token]);

  if (error) {
    return (
      <PageShell showBack={false} title="我的紀錄" variant="plain">
        <p className="text-[0.9375rem] text-[#86868b]">{error}</p>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell showBack={false} title="我的紀錄" variant="plain">
        <p className="text-[0.9375rem] text-[#86868b]">載入中…</p>
      </PageShell>
    );
  }

  const trendSeries = buildPortalTrendSeries(data.records);

  return (
    <PageShell showBack={false} subtitle="你的體組成紀錄（唯讀）" title={`${data.displayName} 的紀錄`} variant="plain">
      <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-primary-muted)] p-5">
        <p className="text-[0.9375rem] leading-relaxed text-[#1d1d1f]">
          {buildEncouragement(data.records)}
        </p>
      </section>

      <BodyCompositionTrendCharts seriesList={trendSeries} />

      <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
          量測紀錄
        </p>
        <div className="mt-4 space-y-3">
          {data.records.length > 0 ? (
            data.records.map((record) => (
              <article className="rounded-2xl bg-[var(--brand-bg)] px-4 py-4" key={record.recordDate}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
                    {record.weightKg !== null ? `${record.weightKg} kg` : "體組成紀錄"}
                    {record.bodyFatPercent !== null ? ` · 體脂 ${record.bodyFatPercent}%` : ""}
                  </p>
                  <time className="text-[0.8125rem] text-[#86868b]">
                    {formatShortDate(record.recordDate)}
                  </time>
                </div>
              </article>
            ))
          ) : (
            <p className="text-[0.9375rem] text-[#86868b]">尚無紀錄</p>
          )}
        </div>
      </section>
    </PageShell>
  );
}
