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

const V2_SCREENS = {
  hero: "/transform/v2/screen-1-hero.jpg",
  benefits: "/transform/v2/screen-2-benefits.jpg",
  who: "/transform/v2/screen-3-who.jpg",
  process: "/transform/v2/screen-4-process.jpg",
} as const;

/** Screen 4 bottom edge — form section background. */
const FORM_PAGE_BG = "#fbf7f4";

function VisualScreen({
  src,
  alt,
  children,
}: {
  src: string;
  alt: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="block h-auto w-full m-0 p-0 align-top"
        decoding="async"
      />
      {children}
    </div>
  );
}

function FormFieldIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-4 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-[#EE0000]">
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
    const visualPreview =
      process.env.NODE_ENV === "development" &&
      new URLSearchParams(window.location.search).get("visual") === "1";
    if (visualPreview) {
      setResolve({ status: "ready", shareCode: code.toUpperCase() });
      return;
    }
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
    const lineHref = "https://line.me/ti/p/rqkTMnEK8J";
    const instagramHref = "https://www.instagram.com/Omtcsh/";

    return (
      <div className="min-h-dvh px-5 py-10" style={{ backgroundColor: FORM_PAGE_BG }}>
        <div className="mx-auto max-w-md space-y-6 text-center text-black">
          <div className="space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EE0000] text-2xl font-bold text-white">
              ✓
            </div>
            <h1 className="text-[1.625rem] font-bold tracking-tight">申請完成！</h1>
          </div>

          <div className="space-y-3 text-left">
            <h2 className="text-center text-[1.125rem] font-semibold">最後一步：主動聯絡我們</h2>
            <p className="text-[0.9375rem] leading-7 text-[#636366]">
              為避免 LINE／Instagram 的陌生訊息限制，請選擇一種方式主動傳訊息給我們，方便工作人員與你聯絡。
            </p>
            <p className="rounded-2xl bg-white px-4 py-3 text-[0.875rem] leading-6 text-[#636366] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              提示：傳訊息時可以告訴我們：「我剛完成體態改造申請」
            </p>
          </div>

          <div className="space-y-3">
            <a
              href={lineHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[3.25rem] w-full items-center justify-center rounded-2xl bg-[#06C755] px-4 text-[1rem] font-semibold text-white shadow-[0_4px_12px_rgba(6,199,85,0.25)]"
            >
              用 LINE 聯絡我
            </a>
            <a
              href={instagramHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[3.25rem] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] px-4 text-[1rem] font-semibold text-white shadow-[0_4px_12px_rgba(221,42,123,0.2)]"
            >
              用 Instagram 聯絡我
            </a>
          </div>

          <p className="text-[0.8125rem] leading-6 text-[#86868b]">
            LINE ID：weichi.kinneas · IG：Omtcsh
          </p>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full min-h-[3.25rem] rounded-2xl border border-[#e8e2da] bg-white pl-12 pr-4 text-[0.9375rem] text-black shadow-[0_2px_8px_rgba(0,0,0,0.04)] outline-none focus:border-[#EE0000]/40";
  const textareaClass =
    "w-full min-h-[6.5rem] rounded-2xl border border-[#e8e2da] bg-white pl-12 pr-4 py-3 text-[0.9375rem] text-black shadow-[0_2px_8px_rgba(0,0,0,0.04)] outline-none focus:border-[#EE0000]/40";

  return (
    <div className="overflow-x-hidden text-black" style={{ backgroundColor: FORM_PAGE_BG }}>
      <div className="mx-auto w-full max-w-[473px] text-[0] leading-[0] [&>div+div]:-mt-px">
        {/* Screen 1 — Hero */}
        <VisualScreen src={V2_SCREENS.hero} alt="徵求 5 位體態改造模特兒">
          <button
            type="button"
            onClick={scrollToForm}
            className="absolute bottom-[4.5%] left-[6%] right-[6%] z-10 h-[9%] cursor-pointer border-0 bg-transparent p-0 text-transparent shadow-none"
            aria-label="看看我適不適合"
          />
        </VisualScreen>

        {/* Screen 2 — 你會獲得 */}
        <VisualScreen src={V2_SCREENS.benefits} alt="你會獲得 4 大專屬好處" />

        {/* Screen 3 — 我們正在找這樣的你 */}
        <VisualScreen src={V2_SCREENS.who} alt="我們正在找這樣的你" />

        {/* Screen 4 — 計畫進行流程 */}
        <VisualScreen src={V2_SCREENS.process} alt="計畫進行流程">
          <button
            type="button"
            onClick={scrollToForm}
            className="absolute bottom-[18%] left-[5%] right-[5%] z-10 h-[12%] cursor-pointer border-0 bg-transparent p-0 text-transparent shadow-none"
            aria-label="想知道自己適不適合？立即填寫申請表"
          />
        </VisualScreen>
      </div>

      {/* Screen 5 — 真實 HTML 申請表單 */}
      <section
        ref={formRef}
        id="application"
        className="px-4 pb-10 pt-4"
        style={{ backgroundColor: FORM_PAGE_BG }}
      >
        <div className="mx-auto max-w-lg">
          <p className="text-center text-[0.875rem] font-semibold text-black/70">
            <span className="text-[#FFD700]">—</span> 想知道自己適不適合？{" "}
            <span className="text-[#FFD700]">—</span>
          </p>
          <h2 className="mt-3 text-center text-[1.625rem] font-black leading-tight">
            立即申請
            <span className="text-[#EE0000]">體態改造計畫</span>
          </h2>
          <p className="mt-2 text-center text-[0.875rem] font-semibold text-black/75">
            名額有限，先申請先保留！
          </p>

          <form
            id={formId}
            className="mt-6 space-y-4"
            onSubmit={handleSubmit}
            onFocus={handleFormInteraction}
            onChange={handleFormInteraction}
          >
            <label className="block">
              <span className="text-[0.875rem] font-bold text-black">
                姓名 <span className="text-[#EE0000]">*</span>
              </span>
              <div className="relative mt-1.5">
                <FormFieldIcon>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M5 20c1.5-3.5 3.8-5 7-5s5.5 1.5 7 5" />
                  </svg>
                </FormFieldIcon>
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="請輸入您的姓名"
                  required
                />
              </div>
              {fieldErrors.name ? <p className="mt-1 text-[0.8125rem] text-[#EE0000]">{fieldErrors.name}</p> : null}
            </label>

            <label className="block">
              <span className="text-[0.875rem] font-bold text-black">
                手機號碼 <span className="text-[#EE0000]">*</span>
              </span>
              <div className="relative mt-1.5">
                <FormFieldIcon>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M6.5 4h11l1 3v13l-1 1h-11l-1-1V7z" />
                    <circle cx="12" cy="17" r="1" />
                  </svg>
                </FormFieldIcon>
                <input
                  className={inputClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="09XXXXXXXX"
                  required
                />
              </div>
              {fieldErrors.phone ? <p className="mt-1 text-[0.8125rem] text-[#EE0000]">{fieldErrors.phone}</p> : null}
            </label>

            <label className="block">
              <span className="text-[0.875rem] font-bold text-black">LINE ID / IG（擇一填寫）</span>
              <div className="relative mt-1.5">
                <FormFieldIcon>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M5 9.5c0-2.5 3-4.5 7-4.5s7 2 7 4.5c0 2.2-2.2 4-5 4.6L12 19l-2-5.9C7.2 13.5 5 11.7 5 9.5z" />
                  </svg>
                </FormFieldIcon>
                <input
                  className={inputClass}
                  value={socialContact}
                  onChange={(e) => setSocialContact(e.target.value)}
                  placeholder="請輸入您的 LINE ID 或 IG 帳號"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-[0.875rem] font-bold text-black">
                希望改善什麼？ <span className="text-[#EE0000]">*</span>
              </span>
              <div className="relative mt-1.5">
                <FormFieldIcon>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <rect x="4" y="5" width="16" height="16" rx="2" />
                    <path d="M8 3v4M16 3v4M4 10h16" />
                  </svg>
                </FormFieldIcon>
                <select
                  className={`${inputClass} appearance-none`}
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
              </div>
              {fieldErrors.goal ? <p className="mt-1 text-[0.8125rem] text-[#EE0000]">{fieldErrors.goal}</p> : null}
            </label>

            <label className="block">
              <span className="text-[0.875rem] font-bold text-black">
                目前最想改善的部位或問題？ <span className="text-[#EE0000]">*</span>
              </span>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-4 top-4 flex h-5 w-5 items-center justify-center text-[#EE0000]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M4 20l7-7 3 3 6-8" />
                    <path d="M14 6h6v6" />
                  </svg>
                </span>
                <textarea
                  className={textareaClass}
                  value={targetAreaOrProblem}
                  onChange={(e) => setTargetAreaOrProblem(e.target.value)}
                  placeholder="例如：腹部、大腿、手臂、腰圍、體脂肪…"
                  required
                />
                <p className="mt-1 text-right text-[0.75rem] text-black/45">
                  {targetAreaOrProblem.length}/500
                </p>
              </div>
              {fieldErrors.targetAreaOrProblem ? (
                <p className="mt-1 text-[0.8125rem] text-[#EE0000]">{fieldErrors.targetAreaOrProblem}</p>
              ) : null}
            </label>

            <label className="block">
              <span className="text-[0.875rem] font-bold text-black">
                目前最困擾你的原因是？ <span className="text-[#EE0000]">*</span>
              </span>
              <div className="relative mt-1.5">
                <FormFieldIcon>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M12 20s-6.5-4.5-6.5-9a6.5 6.5 0 1 1 13 0c0 4.5-6.5 9-6.5 9z" />
                  </svg>
                </FormFieldIcon>
                <select
                  className={`${inputClass} appearance-none`}
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
              </div>
              {fieldErrors.painPoint ? (
                <p className="mt-1 text-[0.8125rem] text-[#EE0000]">{fieldErrors.painPoint}</p>
              ) : null}
            </label>

            <div className="rounded-2xl border border-[#f0e4b8] bg-[#fff9e8] px-4 py-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#d4c89a] accent-[#EE0000]"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  required
                />
                <span className="text-[0.8125rem] leading-5 text-black/85">
                  我同意提供以上資料供工作人員聯絡及安排體態改造計畫相關諮詢，了解並同意
                  <Link href="/privacy" className="font-semibold text-[#EE0000] underline">
                    隱私政策
                  </Link>
                  。
                </span>
              </label>
              {fieldErrors.consent ? (
                <p className="mt-2 text-[0.8125rem] text-[#EE0000]">{fieldErrors.consent}</p>
              ) : null}
            </div>

            <p className="flex items-start gap-2 text-[0.75rem] leading-5 text-black/55">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-[#EE0000]" fill="currentColor" aria-hidden>
                <path d="M12 2l2.4 4.8L20 8l-4 3.9.9 5.6L12 15.8 7.1 17.5 8 11.9 4 8l5.6-1.2z" />
              </svg>
              您的資料將被妥善保護，僅用於聯絡與協助安排體驗。
            </p>

            {formError ? <p className="text-[0.875rem] text-[#EE0000]">{formError}</p> : null}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full min-h-14 items-center justify-center gap-2 rounded-full bg-[#EE0000] px-5 text-[1.0625rem] font-bold text-white shadow-[0_6px_20px_rgba(238,0,0,0.35)] transition active:scale-[0.99] disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12l16-7-7 16-2-7z" />
              </svg>
              {busy ? "送出中…" : "送出申請，保留名額"}
            </button>

            <p className="flex items-center justify-center gap-1.5 text-center text-[0.75rem] text-black/50">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 1 1 8 0v3" />
              </svg>
              提交後將有專人與您聯繫
            </p>
          </form>
        </div>
      </section>

      <footer className="bg-black px-4 py-6 text-center">
        <p className="text-[0.8125rem] text-white/70">IG : Omtcsh</p>
      </footer>
    </div>
  );
}
