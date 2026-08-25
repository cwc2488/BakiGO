"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  RECRUITMENT_AGE_RANGES,
  RECRUITMENT_MOTIVATIONS,
  RECRUITMENT_WEEKLY_AVAILABILITY,
  RECRUITMENT_WORK_STATUSES,
} from "@/lib/recruitment/recruitment-contract";
import {
  captureRecruitmentUtmFromSearch,
  readStoredRecruitmentUtm,
} from "@/lib/recruitment/recruitment-utm";
import { trackMetaLeadOnce } from "@/lib/meta/track-meta-lead";
import {
  listTaiwanDevelopmentCities,
  listTaiwanDevelopmentDistricts,
} from "@/lib/radar/semantics/taiwan-development-regions";

type ResolveState =
  | { status: "loading" }
  | { status: "invalid"; message: string }
  | { status: "ready"; shareCode: string; partnerLabel: string | null };

type FieldKey =
  | "name"
  | "ageRange"
  | "city"
  | "district"
  | "workStatus"
  | "motivations"
  | "weeklyAvailability"
  | "contact"
  | "consent";

const FIELD_BY_CODE: Record<string, FieldKey> = {
  name_required: "name",
  age_invalid: "ageRange",
  region_invalid: "city",
  work_invalid: "workStatus",
  motivations_required: "motivations",
  motivations_invalid: "motivations",
  availability_invalid: "weeklyAvailability",
  contact_required: "contact",
  consent_required: "consent",
};

const inputClass =
  "mt-2 w-full min-h-12 rounded-2xl border border-[#eadfd6] bg-white px-4 text-[0.9375rem] text-[#1d1d1f] outline-none focus:border-[#1d1d1f]";
const labelClass = "block text-[0.9375rem] font-semibold text-[#1d1d1f]";
const hintClass = "mt-1 text-[0.8125rem] leading-6 text-[#86868b]";
const errorClass = "mt-1.5 text-[0.8125rem] text-[#b42318]";

export function JoinRecruitmentPage({ code }: { code: string }) {
  const formId = useId();
  const formRef = useRef<HTMLElement | null>(null);
  const [resolve, setResolve] = useState<ResolveState>({ status: "loading" });
  const [name, setName] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [workStatus, setWorkStatus] = useState("");
  const [motivations, setMotivations] = useState<string[]>([]);
  const [weeklyAvailability, setWeeklyAvailability] = useState("");
  const [instagram, setInstagram] = useState("");
  const [lineId, setLineId] = useState("");
  const [phone, setPhone] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});

  useEffect(() => {
    captureRecruitmentUtmFromSearch(window.location.search);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/recruitment/public/resolve/${encodeURIComponent(code)}`);
        const payload = (await response.json()) as {
          ok?: boolean;
          shareCode?: string;
          partnerLabel?: string | null;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !payload.ok || !payload.shareCode) {
          setResolve({
            status: "invalid",
            message: payload.error ?? "這個招募連結無效或已停用。",
          });
          return;
        }
        setResolve({
          status: "ready",
          shareCode: payload.shareCode,
          partnerLabel: payload.partnerLabel ?? null,
        });
      } catch {
        if (!cancelled) {
          setResolve({ status: "invalid", message: "暫時無法開啟招募頁，請稍後再試。" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const districts = city ? listTaiwanDevelopmentDistricts(city) : [];

  const scrollToForm = useCallback(() => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const toggleMotivation = (value: string) => {
    setMotivations((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || submitted || resolve.status !== "ready") return;

    setBusy(true);
    setFormError(null);
    setFieldErrors({});

    captureRecruitmentUtmFromSearch(window.location.search);
    const attribution = readStoredRecruitmentUtm();

    try {
      const response = await fetch("/api/recruitment/public/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareCode: resolve.shareCode,
          name,
          ageRange,
          city,
          district,
          workStatus,
          motivations,
          weeklyAvailability,
          instagram: instagram.trim() || null,
          lineId: lineId.trim() || null,
          phone: phone.trim() || null,
          consentAccepted,
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
          utmContent: attribution.utmContent,
          utmTerm: attribution.utmTerm,
          landingPath: `${window.location.pathname}${window.location.search}`,
          referrer: document.referrer || null,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        leadId?: string;
        duplicateOfExisting?: boolean;
        error?: string;
        code?: string;
      };

      if (!response.ok || !payload.ok) {
        const message = payload.error ?? "送出失敗，請再試一次。";
        const field = payload.code ? FIELD_BY_CODE[payload.code] : undefined;
        if (field) {
          setFieldErrors({ [field]: message });
          if (field === "city") {
            setFieldErrors({ city: message, district: message });
          }
        }
        setFormError(message);
        return;
      }

      setSubmitted(true);
      if (!payload.duplicateOfExisting && payload.leadId) {
        trackMetaLeadOnce(payload.leadId);
      }
    } catch {
      setFormError("網路異常，請稍後再試。");
    } finally {
      setBusy(false);
    }
  };

  if (resolve.status === "loading") {
    return (
      <div className="min-h-dvh bg-[#faf6f1] px-5 py-16 text-[#1d1d1f]">
        <p className="mx-auto max-w-md text-[0.9375rem] text-[#86868b]">載入中…</p>
      </div>
    );
  }

  if (resolve.status === "invalid") {
    return (
      <div className="min-h-dvh bg-[#faf6f1] px-5 py-16 text-[#1d1d1f]">
        <div className="mx-auto max-w-md space-y-3">
          <h1 className="text-[1.5rem] font-semibold tracking-tight">連結無效</h1>
          <p className="text-[0.9375rem] leading-7 text-[#636366]">{resolve.message}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-dvh bg-[#faf6f1] px-5 py-16 text-[#1d1d1f]">
        <div className="mx-auto max-w-md space-y-4">
          <h1 className="text-[1.75rem] font-semibold tracking-tight">資料已收到！</h1>
          <p className="text-[0.9375rem] leading-7 text-[#636366]">
            我們會先了解你提供的資料，如果彼此方向適合，會再與你聯絡並進一步說明合作方式。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#faf6f1] text-[#1d1d1f]">
      <main className="mx-auto flex max-w-md flex-col gap-10 px-5 pb-16 pt-12">
        <section className="space-y-5">
          <p className="text-[0.8125rem] font-medium tracking-[0.08em] text-[#86868b]">
            運動教室｜擴大經營
          </p>
          <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">
            板橋・土城招募合作夥伴
          </h1>
          <p className="text-[1.0625rem] leading-7 text-[#636366]">
            健身 × 健康產業 × 個人事業發展
          </p>
          {resolve.partnerLabel ? (
            <p className="text-[0.875rem] text-[#86868b]">由 {resolve.partnerLabel} 邀請了解</p>
          ) : null}
          <ul className="space-y-2 text-[0.9375rem] leading-7 text-[#636366]">
            <li>無經驗也可以先了解</li>
            <li>提供培訓與團隊協作</li>
            <li>適合想發展健康／運動產業的人</li>
            <li>可從兼職方式開始了解</li>
            <li>發展自己的客戶與事業能力</li>
          </ul>
          <p className="rounded-2xl bg-[#fffdf9] px-4 py-3 text-[0.8125rem] leading-6 text-[#636366]">
            這是健康／營養相關的獨立事業合作機會，不是固定薪資的受僱職缺。
          </p>
          <button
            type="button"
            onClick={scrollToForm}
            className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] px-4 text-[0.9375rem] font-semibold text-white transition-transform active:scale-[0.98]"
          >
            我想了解合作方式
          </button>
        </section>

        <section ref={formRef} id="recruitment-form" className="space-y-6 scroll-mt-6">
          <div>
            <h2 className="text-[1.25rem] font-semibold tracking-tight">留下資料，我們再說明</h2>
            <p className={hintClass}>約 1 分鐘。資料只用於合作聯絡與後續說明。</p>
          </div>

          <form className="space-y-6" onSubmit={(event) => void onSubmit(event)} noValidate>
            <div>
              <label className={labelClass} htmlFor={`${formId}-name`}>
                1. 怎麼稱呼你？
              </label>
              <input
                id={`${formId}-name`}
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                maxLength={80}
                required
              />
              {fieldErrors.name ? <p className={errorClass}>{fieldErrors.name}</p> : null}
            </div>

            <fieldset>
              <legend className={labelClass}>2. 你的年齡區間？</legend>
              <div className="mt-3 flex flex-col gap-2">
                {RECRUITMENT_AGE_RANGES.map((option) => (
                  <label
                    key={option}
                    className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#eadfd6] bg-white px-4 text-[0.9375rem]"
                  >
                    <input
                      type="radio"
                      name="ageRange"
                      value={option}
                      checked={ageRange === option}
                      onChange={() => setAgeRange(option)}
                      className="size-4 accent-[#1d1d1f]"
                    />
                    {option}
                  </label>
                ))}
              </div>
              {fieldErrors.ageRange ? <p className={errorClass}>{fieldErrors.ageRange}</p> : null}
            </fieldset>

            <div>
              <p className={labelClass}>3. 你目前主要在哪個地區活動？</p>
              <div className="mt-2 grid grid-cols-1 gap-2">
                <select
                  className={inputClass}
                  value={city}
                  onChange={(event) => {
                    setCity(event.target.value);
                    setDistrict("");
                  }}
                  required
                >
                  <option value="">選擇縣市</option>
                  {listTaiwanDevelopmentCities().map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
                <select
                  className={inputClass}
                  value={district}
                  onChange={(event) => setDistrict(event.target.value)}
                  disabled={!city}
                  required
                >
                  <option value="">選擇行政區</option>
                  {districts.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              </div>
              {fieldErrors.city || fieldErrors.district ? (
                <p className={errorClass}>{fieldErrors.city || fieldErrors.district}</p>
              ) : null}
            </div>

            <fieldset>
              <legend className={labelClass}>4. 你目前的工作狀態？</legend>
              <div className="mt-3 flex flex-col gap-2">
                {RECRUITMENT_WORK_STATUSES.map((option) => (
                  <label
                    key={option}
                    className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#eadfd6] bg-white px-4 text-[0.9375rem]"
                  >
                    <input
                      type="radio"
                      name="workStatus"
                      value={option}
                      checked={workStatus === option}
                      onChange={() => setWorkStatus(option)}
                      className="size-4 accent-[#1d1d1f]"
                    />
                    {option}
                  </label>
                ))}
              </div>
              {fieldErrors.workStatus ? (
                <p className={errorClass}>{fieldErrors.workStatus}</p>
              ) : null}
            </fieldset>

            <fieldset>
              <legend className={labelClass}>5. 你現在最想改變的是什麼？</legend>
              <p className={hintClass}>可複選，至少一項。</p>
              <div className="mt-3 flex flex-col gap-2">
                {RECRUITMENT_MOTIVATIONS.map((option) => (
                  <label
                    key={option}
                    className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#eadfd6] bg-white px-4 text-[0.9375rem]"
                  >
                    <input
                      type="checkbox"
                      checked={motivations.includes(option)}
                      onChange={() => toggleMotivation(option)}
                      className="size-4 accent-[#1d1d1f]"
                    />
                    {option}
                  </label>
                ))}
              </div>
              {fieldErrors.motivations ? (
                <p className={errorClass}>{fieldErrors.motivations}</p>
              ) : null}
            </fieldset>

            <fieldset>
              <legend className={labelClass}>
                6. 如果有完整培訓與團隊協助，你每週大約願意投入多少時間？
              </legend>
              <div className="mt-3 flex flex-col gap-2">
                {RECRUITMENT_WEEKLY_AVAILABILITY.map((option) => (
                  <label
                    key={option}
                    className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#eadfd6] bg-white px-4 text-[0.9375rem]"
                  >
                    <input
                      type="radio"
                      name="weeklyAvailability"
                      value={option}
                      checked={weeklyAvailability === option}
                      onChange={() => setWeeklyAvailability(option)}
                      className="size-4 accent-[#1d1d1f]"
                    />
                    {option}
                  </label>
                ))}
              </div>
              {fieldErrors.weeklyAvailability ? (
                <p className={errorClass}>{fieldErrors.weeklyAvailability}</p>
              ) : null}
            </fieldset>

            <div>
              <p className={labelClass}>7. 方便我們怎麼聯絡你？</p>
              <p className={hintClass}>至少留下一種即可。</p>
              <div className="mt-2 space-y-2">
                <input
                  className={inputClass}
                  value={instagram}
                  onChange={(event) => setInstagram(event.target.value)}
                  placeholder="Instagram 帳號"
                  autoComplete="username"
                  maxLength={80}
                />
                <input
                  className={inputClass}
                  value={lineId}
                  onChange={(event) => setLineId(event.target.value)}
                  placeholder="LINE ID"
                  maxLength={80}
                />
                <input
                  className={inputClass}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="手機號碼"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={40}
                />
              </div>
              {fieldErrors.contact ? <p className={errorClass}>{fieldErrors.contact}</p> : null}
            </div>

            <div className="space-y-3 rounded-2xl border border-[#eadfd6] bg-[#fffdf9] p-4">
              <p className="text-[0.8125rem] leading-6 text-[#636366]">
                你提供的資料會用來聯絡本人、了解合作需求，以及後續合作說明。詳見{" "}
                <Link href="/privacy" className="underline underline-offset-2">
                  隱私權政策
                </Link>
                。
              </p>
              <label className="flex items-start gap-3 text-[0.875rem] leading-6 text-[#1d1d1f]">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(event) => setConsentAccepted(event.target.checked)}
                  className="mt-1 size-4 shrink-0 accent-[#1d1d1f]"
                />
                <span>我同意提供以上資料作為合作聯絡與後續說明使用。</span>
              </label>
              {fieldErrors.consent ? <p className={errorClass}>{fieldErrors.consent}</p> : null}
            </div>

            {formError ? <p className={errorClass}>{formError}</p> : null}

            <button
              type="submit"
              disabled={busy || submitted}
              className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] px-4 text-[0.9375rem] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? "送出中…" : "送出資料"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
