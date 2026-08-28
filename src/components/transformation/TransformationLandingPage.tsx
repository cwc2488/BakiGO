"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  TRANSFORMATION_GOALS,
  TRANSFORMATION_LANDING_PAGE_VERSION,
  TRANSFORMATION_PAIN_POINTS,
} from "@/lib/transformation/transformation-contract";
import {
  captureTransformationAttributionFromSearch,
  readStoredTransformationAttribution,
} from "@/lib/transformation/transformation-utm";
import {
  trackTransformationFormStartOnce,
  trackTransformationLeadOnce,
  trackTransformationViewContent,
} from "@/lib/meta/track-transformation-meta";

type ResolveState =
  | { status: "loading" }
  | { status: "invalid"; message: string }
  | { status: "ready"; shareCode: string };

type FieldKey =
  | "name"
  | "phone"
  | "goal"
  | "targetAreaOrProblem"
  | "painPoint"
  | "consent";

const FIELD_BY_CODE: Record<string, FieldKey> = {
  name_required: "name",
  phone_invalid: "phone",
  goal_invalid: "goal",
  target_required: "targetAreaOrProblem",
  pain_invalid: "painPoint",
  consent_required: "consent",
};

function YellowCtaButton({
  children,
  type = "button",
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="flex w-full min-h-14 items-center justify-between rounded-full bg-[#FFD700] px-5 text-left text-[1.0625rem] font-bold text-black transition active:scale-[0.99] disabled:opacity-60"
    >
      <span>{children}</span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EE0000] text-white">
        ›
      </span>
    </button>
  );
}

function RedCircleIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#EE0000] text-white">
      {children}
    </span>
  );
}

export function TransformationLandingPage({ code }: { code: string }) {
  const formId = useId();
  const formRef = useRef<HTMLElement | null>(null);
  const viewContentTracked = useRef(false);
  const [resolve, setResolve] = useState<ResolveState>({ status: "loading" });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [socialContact, setSocialContact] = useState("");
  const [goal, setGoal] = useState("");
  const [targetAreaOrProblem, setTargetAreaOrProblem] = useState("");
  const [painPoint, setPainPoint] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});

  useEffect(() => {
    captureTransformationAttributionFromSearch(window.location.search);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/transformation/public/resolve/${encodeURIComponent(code)}`);
        const payload = (await response.json()) as {
          ok?: boolean;
          shareCode?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !payload.ok || !payload.shareCode) {
          setResolve({
            status: "invalid",
            message: payload.error ?? "這個連結無效或已停用。",
          });
          return;
        }
        setResolve({ status: "ready", shareCode: payload.shareCode });
      } catch {
        if (!cancelled) {
          setResolve({ status: "invalid", message: "暫時無法開啟頁面，請稍後再試。" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (resolve.status !== "ready" || viewContentTracked.current) return;
    viewContentTracked.current = true;
    trackTransformationViewContent({
      landingPageVersion: TRANSFORMATION_LANDING_PAGE_VERSION,
      shareCode: resolve.shareCode,
    });
  }, [resolve]);

  const scrollToForm = useCallback(() => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleFormInteraction = () => {
    trackTransformationFormStartOnce();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (resolve.status !== "ready" || busy) return;
    setBusy(true);
    setFormError(null);
    setFieldErrors({});

    const attribution = readStoredTransformationAttribution();
    try {
      const response = await fetch("/api/transformation/public/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareCode: resolve.shareCode,
          name,
          phone,
          socialContact: socialContact || null,
          goal,
          targetAreaOrProblem,
          painPoint,
          consentAccepted,
          landingPageVersion: TRANSFORMATION_LANDING_PAGE_VERSION,
          landingPath: window.location.pathname,
          referrer: document.referrer || null,
          source: "meta",
          ...attribution,
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
          utmContent: attribution.utmContent,
          utmTerm: attribution.utmTerm,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        leadId?: string;
        duplicateOfExisting?: boolean;
        error?: string;
        code?: string;
      };
      if (!response.ok || !payload.ok || !payload.leadId) {
        const codeKey = payload.code ?? "";
        const field = FIELD_BY_CODE[codeKey];
        if (field) {
          setFieldErrors({ [field]: payload.error ?? "請檢查此欄位。" });
        } else {
          setFormError(payload.error ?? "送出失敗，請稍後再試。");
        }
        return;
      }
      if (!payload.duplicateOfExisting) {
        trackTransformationLeadOnce(payload.leadId);
      }
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setFormError("送出失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  };

  if (resolve.status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-black text-white">
        <p className="text-sm text-white/70">載入中…</p>
      </div>
    );
  }

  if (resolve.status === "invalid") {
    return (
      <div className="min-h-dvh bg-black px-5 py-16 text-white">
        <div className="mx-auto max-w-md space-y-3">
          <h1 className="text-[1.5rem] font-bold tracking-tight">連結無效</h1>
          <p className="text-[0.9375rem] leading-7 text-white/70">{resolve.message}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-dvh bg-black px-5 py-16 text-white">
        <div className="mx-auto max-w-md space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFD700] text-3xl font-bold text-black">
            ✓
          </div>
          <h1 className="text-[1.75rem] font-bold">申請成功！</h1>
          <p className="text-[0.9375rem] leading-7 text-white/80">
            我們已收到你的資料，
            <br />
            工作人員會與你聯絡了解你的需求與體態目標。
          </p>
          <p className="text-[0.875rem] leading-6 text-[#FFD700]">
            請留意電話、LINE 或 IG 訊息。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black text-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-black px-4 pb-8 pt-6">
        <div
          className="pointer-events-none absolute -right-8 top-24 h-64 w-64 rotate-12 bg-[#FFD700]/30 blur-2xl"
          aria-hidden
        />
        <div className="relative mx-auto max-w-lg">
          <span className="inline-flex items-center gap-1 rounded-md bg-[#FFD700] px-2.5 py-1 text-[0.75rem] font-bold text-black">
            📍 板橋・土城限定
          </span>

          <div className="mt-6 flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-[0.9375rem] font-medium text-white/90">運動教室 擴大經營</p>
              <h1 className="mt-2 text-[1.75rem] font-black leading-tight">
                徵求{" "}
                <span className="text-[2.5rem] text-[#EE0000]">5</span>
                位
              </h1>
              <p className="text-[1.5rem] font-black leading-tight">體態改造模特兒</p>
              <p className="mt-2 text-[1.25rem] font-bold text-[#FFD700]">減重・減脂・雕塑</p>
              <p className="mt-3 text-[0.875rem] text-white/80">找 5 位願意一起改變的你！</p>
            </div>
            <div className="flex h-28 w-24 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-[#333] to-[#111]">
              <div className="h-10 w-10 rounded-full bg-[#555]" />
              <div className="mt-1 h-8 w-8 rounded-full bg-[#555]" />
            </div>
          </div>

          <div className="absolute right-4 top-32 flex h-20 w-20 flex-col items-center justify-center rounded-full bg-[#FFD700] text-center text-[0.625rem] font-bold leading-tight text-black">
            名額僅有
            <span className="text-[1.25rem] text-[#EE0000]">5</span>位
          </div>

          <div className="mt-8 grid grid-cols-4 gap-2 text-center">
            {[
              { icon: "🏋", label: "專業教練指導" },
              { icon: "📋", label: "客製化體態計畫" },
              { icon: "📊", label: "定期評估與回饋" },
              { icon: "📷", label: "紀錄每一步進步" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-1">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 text-lg">
                  {item.icon}
                </span>
                <span className="text-[0.625rem] leading-tight text-white/80">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <YellowCtaButton onClick={scrollToForm}>看看我適不適合</YellowCtaButton>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-white px-4 py-10 text-black">
        <h2 className="text-center text-[1.375rem] font-black">你會獲得</h2>
        <div className="mx-auto mt-8 grid max-w-lg grid-cols-2 gap-6">
          {[
            { title: "教練指導", desc: "專業教練全程指導與陪伴" },
            { title: "個人化計畫", desc: "客製化體態計畫，依實際狀況調整" },
            { title: "定期評估", desc: "定期評估身體狀況與計畫執行進度" },
            { title: "紀錄進步", desc: "紀錄每一步改變，看見自己的進步" },
          ].map((item, index) => (
            <div key={item.title} className="flex flex-col items-center text-center">
              <RedCircleIcon>
                <span className="text-lg">{["🏋", "📋", "📊", "📷"][index]}</span>
              </RedCircleIcon>
              <h3 className="mt-3 text-[0.9375rem] font-bold">{item.title}</h3>
              <p className="mt-1 text-[0.75rem] leading-5 text-[#636366]">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who we want */}
      <section className="bg-[#f5f0ea] px-4 py-10 text-black">
        <div className="mx-auto flex max-w-lg flex-col gap-6 sm:flex-row sm:items-start">
          <div className="mx-auto h-48 w-36 shrink-0 rounded-2xl bg-gradient-to-b from-[#ccc] to-[#999] sm:mx-0" />
          <div className="flex-1">
            <h2 className="text-[1.25rem] font-black">我們正在找這樣的你</h2>
            <ul className="mt-4 space-y-3">
              {[
                "年滿 18 歲",
                "有減重、減脂、雕塑等體態改善需求",
                "對改變有決心，願意認真執行",
                "願意配合計畫與紀錄",
                "板橋・土城地區，方便參與實體服務",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[0.875rem] leading-6">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EE0000] text-[0.625rem] text-white">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-6 flex max-w-lg items-center gap-3 rounded-lg bg-[#EE0000] px-4 py-3 text-white">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#EE0000] font-bold">
            !
          </span>
          <p className="text-[0.8125rem] font-semibold leading-5">
            這不是抽獎活動，我們希望找到真的想改變的人！
          </p>
        </div>
      </section>

      {/* Process */}
      <section className="bg-[#f8f8f8] px-4 py-10 text-black">
        <h2 className="text-center text-[1.375rem] font-black">計畫進行流程</h2>
        <div className="mx-auto mt-8 grid max-w-lg grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { step: "1", title: "填寫申請", desc: "留下基本資料進行申請" },
            { step: "2", title: "工作人員聯絡", desc: "由真人聯絡了解你的需求" },
            { step: "3", title: "了解目標", desc: "深入了解你的目標與目前狀況" },
            { step: "4", title: "安排體驗／到店", desc: "安排體驗或到店諮詢，開始你的改變之旅" },
          ].map((item) => (
            <div key={item.step} className="flex flex-col items-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFD700] text-[1.125rem] font-black text-black">
                {item.step}
              </span>
              <h3 className="mt-2 text-[0.8125rem] font-bold">{item.title}</h3>
              <p className="mt-1 text-[0.6875rem] leading-4 text-[#636366]">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Form */}
      <section ref={formRef} id="application" className="bg-[#6b1a1a] px-4 py-10">
        <div className="mx-auto max-w-lg">
          <h2 className="text-[1.5rem] font-black leading-tight text-[#FFD700]">
            想知道自己
            <br />
            適不適合？
          </h2>
          <p className="mt-3 text-[0.875rem] leading-6 text-white/90">
            先留下簡單資料，
            <br />
            我們會由真人與你聯絡，
            <br />
            了解你的需求並安排諮詢。
          </p>

          <div className="mt-4 rounded-xl bg-black/40 px-4 py-3">
            <p className="text-[0.8125rem] font-semibold text-[#FFD700]">
              ★ 優秀成果有機會參與後續成果分享／合作
            </p>
          </div>

          <form
            id={formId}
            className="mt-6 space-y-4"
            onSubmit={handleSubmit}
            onFocus={handleFormInteraction}
            onChange={handleFormInteraction}
          >
            <label className="block">
              <span className="text-[0.875rem] font-semibold text-white">
                姓名／稱呼 <span className="text-[#EE0000]">*</span>
              </span>
              <input
                className="mt-1.5 w-full min-h-12 rounded-xl border-0 bg-white px-4 text-[0.9375rem] text-black outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
              {fieldErrors.name ? <p className="mt-1 text-[0.8125rem] text-[#FFD700]">{fieldErrors.name}</p> : null}
            </label>

            <label className="block">
              <span className="text-[0.875rem] font-semibold text-white">
                手機號碼 <span className="text-[#EE0000]">*</span>
              </span>
              <input
                className="mt-1.5 w-full min-h-12 rounded-xl border-0 bg-white px-4 text-[0.9375rem] text-black outline-none"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="0912345678"
                required
              />
              {fieldErrors.phone ? <p className="mt-1 text-[0.8125rem] text-[#FFD700]">{fieldErrors.phone}</p> : null}
            </label>

            <label className="block">
              <span className="text-[0.875rem] font-semibold text-white">LINE ID / IG（擇一填寫）</span>
              <input
                className="mt-1.5 w-full min-h-12 rounded-xl border-0 bg-white px-4 text-[0.9375rem] text-black outline-none"
                value={socialContact}
                onChange={(e) => setSocialContact(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-[0.875rem] font-semibold text-white">
                希望改善什麼？ <span className="text-[#EE0000]">*</span>
              </span>
              <select
                className="mt-1.5 w-full min-h-12 rounded-xl border-0 bg-white px-4 text-[0.9375rem] text-black outline-none"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                required
              >
                <option value="">請選擇</option>
                {TRANSFORMATION_GOALS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {fieldErrors.goal ? <p className="mt-1 text-[0.8125rem] text-[#FFD700]">{fieldErrors.goal}</p> : null}
            </label>

            <label className="block">
              <span className="text-[0.875rem] font-semibold text-white">
                最想改善的部位或問題是？ <span className="text-[#EE0000]">*</span>
              </span>
              <textarea
                className="mt-1.5 w-full min-h-24 rounded-xl border-0 bg-white px-4 py-3 text-[0.9375rem] text-black outline-none"
                value={targetAreaOrProblem}
                onChange={(e) => setTargetAreaOrProblem(e.target.value)}
                placeholder="例如：腹部、大腿、整體體態…"
                required
              />
              {fieldErrors.targetAreaOrProblem ? (
                <p className="mt-1 text-[0.8125rem] text-[#FFD700]">{fieldErrors.targetAreaOrProblem}</p>
              ) : null}
            </label>

            <label className="block">
              <span className="text-[0.875rem] font-semibold text-white">
                目前最困擾你的原因是？ <span className="text-[#EE0000]">*</span>
              </span>
              <select
                className="mt-1.5 w-full min-h-12 rounded-xl border-0 bg-white px-4 text-[0.9375rem] text-black outline-none"
                value={painPoint}
                onChange={(e) => setPainPoint(e.target.value)}
                required
              >
                <option value="">請選擇</option>
                {TRANSFORMATION_PAIN_POINTS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {fieldErrors.painPoint ? (
                <p className="mt-1 text-[0.8125rem] text-[#FFD700]">{fieldErrors.painPoint}</p>
              ) : null}
            </label>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 rounded border-white/30"
                checked={consentAccepted}
                onChange={(e) => setConsentAccepted(e.target.checked)}
                required
              />
              <span className="text-[0.8125rem] leading-5 text-white/90">
                我同意提供以上資料供工作人員聯絡及安排體態改造計畫相關諮詢。
              </span>
            </label>
            {fieldErrors.consent ? (
              <p className="text-[0.8125rem] text-[#FFD700]">{fieldErrors.consent}</p>
            ) : null}

            {formError ? <p className="text-[0.875rem] text-[#FFD700]">{formError}</p> : null}

            <YellowCtaButton type="submit" disabled={busy}>
              {busy ? "送出中…" : "申請體態改造計畫"}
            </YellowCtaButton>

            <p className="text-center text-[0.6875rem] leading-4 text-white/50">
              點擊送出即表示您同意
              <Link href="/privacy" className="underline">
                《隱私權政策》
              </Link>
              並同意我們與您聯絡。
            </p>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black px-4 py-6 text-center">
        <p className="text-[0.8125rem] text-white/70">IG : Omtcsh</p>
      </footer>
    </div>
  );
}
