"use client";

import { formatShortDate } from "@/lib/mission-control/format";
import { BodyCompositionTrendCharts } from "@/components/customers/BodyCompositionTrendCharts";
import { CustomerPhotoCompareSection } from "@/components/customers/CustomerPhotoCompareSection";
import { buildPortalTrendSeries } from "@/lib/customers/body-composition-trends";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { PageShell } from "@/components/ui/PageShell";
import type { CustomerPhotoAngle, CustomerPhotoPhase, CustomerProgressPhoto } from "@/types/customer";
import { useEffect, useMemo, useState } from "react";

interface PortalRecord {
  recordDate: string;
  weightKg: number | null;
  bodyFatPercent: number | null;
  visceralFatLevel: number | null;
  bodyAge: number | null;
  basalMetabolicRate: number | null;
  bmi: number | null;
  skeletalMuscleKg: number | null;
}

interface PortalPhoto {
  phase: CustomerPhotoPhase;
  angle: CustomerPhotoAngle;
  photoDate: string;
  imageDataUrl: string;
}

interface PortalData {
  displayName: string;
  heightCm: number | null;
  records: PortalRecord[];
  photos: PortalPhoto[];
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

function mapPortalPhotos(photos: PortalPhoto[]): CustomerProgressPhoto[] {
  return photos.map((photo, index) => ({
    id: `portal-${photo.phase}-${photo.angle}-${index}`,
    customerId: "portal",
    phase: photo.phase,
    angle: photo.angle,
    photoDate: photo.photoDate,
    imageDataUrl: photo.imageDataUrl,
    createdAt: photo.photoDate,
    updatedAt: photo.photoDate,
  }));
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

      const parsed = payload as PortalData;
      setData({
        ...parsed,
        photos: parsed.photos ?? [],
      });
    }

    void load();
  }, [token]);

  const portalPhotos = useMemo(
    () => (data ? mapPortalPhotos(data.photos) : []),
    [data],
  );

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
        {data.heightCm ? (
          <p className="mt-2 text-[0.8125rem] text-[#86868b]">身高 {data.heightCm} cm</p>
        ) : null}
      </section>

      <CustomerPhotoCompareSection
        customerName={data.displayName}
        photos={portalPhotos}
        readOnly
      />

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
                    {record.skeletalMuscleKg !== null
                      ? ` · 肌肉量 ${record.skeletalMuscleKg} kg`
                      : ""}
                    {record.bmi !== null ? ` · BMI ${record.bmi}` : ""}
                  </p>
                  <time className="text-[0.8125rem] text-[#86868b]">
                    {formatShortDate(record.recordDate)}
                  </time>
                </div>
                {record.basalMetabolicRate !== null || record.visceralFatLevel !== null || record.bodyAge !== null ? (
                  <p className="mt-2 text-[0.8125rem] text-[#636366]">
                    {[
                      record.basalMetabolicRate !== null
                        ? `基礎代謝 ${record.basalMetabolicRate}`
                        : null,
                      record.visceralFatLevel !== null
                        ? `內臟脂肪 ${record.visceralFatLevel}`
                        : null,
                      record.bodyAge !== null ? `身體年齡 ${record.bodyAge}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
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
