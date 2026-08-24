"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";

type RegionPayload = {
  ok?: boolean;
  error?: string;
  current_city?: string | null;
  current_district?: string | null;
  pending_city?: string | null;
  pending_district?: string | null;
  pending_effective_date?: string | null;
  effective_city?: string | null;
  effective_district?: string | null;
  cities?: Array<{ city: string; districts: string[] }>;
};

function label(city: string | null | undefined, district: string | null | undefined): string {
  if (!city) return "尚未設定";
  return district ? `${city}${district}` : city;
}

export function RadarRegionPreference() {
  const [payload, setPayload] = useState<RegionPayload | null>(null);
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetchWithMemberAuth("/api/radar/region");
    const body = (await response.json()) as RegionPayload;
    if (!response.ok || !body.ok) {
      throw new Error(body.error ?? "讀不到開發地區");
    }
    setPayload(body);
    setCity(body.pending_city ?? body.current_city ?? "");
    setDistrict(body.pending_district ?? body.current_district ?? "");
  }, []);

  useEffect(() => {
    void load().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "讀不到開發地區");
    });
  }, [load]);

  const districts = payload?.cities?.find((entry) => entry.city === city)?.districts ?? [];

  const onSave = async () => {
    if (!city) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetchWithMemberAuth("/api/radar/region", {
        method: "PUT",
        body: JSON.stringify({ city, district: district || null }),
      });
      const body = (await response.json()) as RegionPayload;
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "儲存失敗");
      }
      setPayload(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="home-section space-y-3">
      <p className="text-[1.0625rem] font-semibold text-[#1d1d1f]">我的開發地區</p>
      <p className="text-[0.875rem] leading-6 text-[#636366]">
        越近的合格人選會排前面。不會用附近較弱的人取代更值得開發的人。今天已產生的名單不會因為改地區而重抽。
      </p>
      <p className="text-[0.8125rem] text-[#86868b]">
        目前生效：{label(payload?.effective_city, payload?.effective_district)}
        {payload?.pending_city
          ? `　明天起改為 ${label(payload.pending_city, payload.pending_district)}`
          : null}
      </p>
      <div className="grid grid-cols-1 gap-2">
        <select
          className="min-h-11 rounded-2xl border border-[var(--brand-border)] bg-white px-3 text-[0.9375rem]"
          value={city}
          onChange={(event) => {
            setCity(event.target.value);
            setDistrict("");
          }}
        >
          <option value="">選擇縣市</option>
          {(payload?.cities ?? []).map((entry) => (
            <option key={entry.city} value={entry.city}>
              {entry.city}
            </option>
          ))}
        </select>
        <select
          className="min-h-11 rounded-2xl border border-[var(--brand-border)] bg-white px-3 text-[0.9375rem]"
          value={district}
          onChange={(event) => setDistrict(event.target.value)}
          disabled={!city}
        >
          <option value="">全縣市（不指定區）</option>
          {districts.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={saving || !city}
          onClick={() => void onSave()}
          className="flex min-h-11 items-center justify-center rounded-2xl bg-[#1d1d1f] px-3 text-[0.9375rem] font-semibold text-white disabled:opacity-50"
        >
          儲存開發地區
        </button>
      </div>
      {error ? <p className="text-[0.875rem] text-[#c41e3a]">{error}</p> : null}
    </section>
  );
}
