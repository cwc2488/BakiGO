"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  EXPERIENCE_21D_CONSUMER_CHANNELS,
  type Experience21dConsumerChannel,
} from "@/lib/analysis/handoff/experience-21d-contact";
import {
  EXPERIENCE_21D_LANDING,
  EXPERIENCE_21D_LANDING_VERSION,
  type Experience21dConsultationPreference,
} from "@/lib/experience/experience-21d-landing-copy";
import type { Experience21dLandingContext } from "@/lib/experience/experience-21d-landing-service";
import {
  trackExperience21dFormStartOnce,
  trackExperience21dLandingViewOnce,
  trackExperience21dLeadOnce,
  trackExperience21dMethodSelectedOnce,
} from "@/lib/meta/track-experience-21d-meta";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; context: Experience21dLandingContext };

const copy = EXPERIENCE_21D_LANDING;

/** Full original 21D artworks — primary visual experience (transform-style). */
const ARTWORKS = {
  hero: "/images/experience-21d/01-hero.png",
  support: "/images/experience-21d/02-support.png",
  journey: "/images/experience-21d/03-journey.png",
  lowPressure: "/images/experience-21d/04-low-pressure.png",
  consultation: "/images/experience-21d/05-consultation.png",
} as const;

/** Intrinsic pixel size of the production PNGs (941×1672). */
const ARTWORK_WIDTH = 941;
const ARTWORK_HEIGHT = 1672;

/** Matches cream field at the bottom edge of the consultation artwork. */
const PAGE_BG = "#f7f3ea";

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function VisualScreen({
  src,
  alt,
  priority = false,
  children,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- serve exact local PNGs without optimizer derivatives */}
      <img
        src={src}
        alt={alt}
        width={ARTWORK_WIDTH}
        height={ARTWORK_HEIGHT}
        className="m-0 block h-auto w-full p-0 align-top"
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : "auto"}
      />
      {children}
    </div>
  );
}

export function Experience21dLandingPage({ token }: { token: string }) {
  const formId = useId();
  const formRef = useRef<HTMLElement | null>(null);
  const viewTracked = useRef(false);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [preference, setPreference] = useState<Experience21dConsultationPreference>("text");
  const [displayName, setDisplayName] = useState("");
  const [channel, setChannel] = useState<Experience21dConsumerChannel>("line");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const visualPreview =
      process.env.NODE_ENV === "development" &&
      new URLSearchParams(window.location.search).get("visual") === "1";
    if (visualPreview) {
      setLoad({
        status: "ready",
        context: {
          token,
          reportReady: true,
          animalType: null,
          bridge: null,
          interestState: "none",
          needsContact: true,
          displayName: null,
          contactChannel: null,
          consultationPreference: null,
          landingPageVersion: EXPERIENCE_21D_LANDING_VERSION,
        },
      });
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/experience/21d/${encodeURIComponent(token)}`);
        const body = (await res.json()) as Experience21dLandingContext & {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !body.ok) {
          if (!cancelled) {
            setLoad({
              status: "error",
              message: body.error ?? "無法載入此頁面，請回到分析報告再試一次。",
            });
          }
          return;
        }
        if (!cancelled) {
          setLoad({ status: "ready", context: body });
          if (body.displayName) setDisplayName(body.displayName);
          if (body.contactChannel === "phone" || body.contactChannel === "line" || body.contactChannel === "instagram") {
            setChannel(body.contactChannel);
          }
          if (body.consultationPreference) setPreference(body.consultationPreference);
          if (body.interestState === "created" && body.consultationPreference) {
            setSubmitted(true);
          }
        }
      } catch {
        if (!cancelled) {
          setLoad({ status: "error", message: "無法載入此頁面，請稍後再試。" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (load.status !== "ready" || viewTracked.current) return;
    viewTracked.current = true;
    trackExperience21dLandingViewOnce({ landingPageVersion: EXPERIENCE_21D_LANDING_VERSION });
  }, [load]);

  const scrollToForm = useCallback(() => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const onSelectPreference = useCallback((next: Experience21dConsultationPreference) => {
    setPreference(next);
    trackExperience21dMethodSelectedOnce(next);
    trackExperience21dFormStartOnce();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    setBusy(true);
    trackExperience21dFormStartOnce();
    try {
      const res = await fetch(`/api/experience/21d/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consultationPreference: preference,
          displayName: displayName.trim() || undefined,
          channel,
          value: value.trim() || undefined,
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        interestState?: string;
        duplicate?: boolean;
        created?: boolean;
      };
      if (!res.ok || !body.ok) {
        setFormError(body.error ?? "申請送出失敗，請稍後再試。");
        return;
      }
      if (body.interestState === "needs_contact") {
        setFormError("請留下一個聯絡方式，方便教練與你聯繫。");
        scrollToId("e21d-apply");
        return;
      }
      setSubmitted(true);
      trackExperience21dLeadOnce(`${token}:${preference}`);
      scrollToId("e21d-consult");
    } catch {
      setFormError("申請送出失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  if (load.status === "loading") {
    return (
      <main className="e21d-page flex min-h-[70vh] items-center justify-center px-4">
        <p className="text-[0.9375rem] text-[#5c6b62]">載入中…</p>
      </main>
    );
  }

  if (load.status === "error") {
    return (
      <main className="e21d-page flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="max-w-sm text-[0.9375rem] text-[#5c6b62]">{load.message}</p>
        <Link href={`/analysis/${encodeURIComponent(token)}`} className="e21d-btn-secondary">
          回到分析報告
        </Link>
      </main>
    );
  }

  const needsContact = load.context.needsContact && !submitted;

  return (
    <main className="e21d-page overflow-x-hidden" style={{ backgroundColor: PAGE_BG }}>
      {/* Artwork stack — natural aspect, phone-column on desktop (transform philosophy) */}
      <div className="mx-auto w-full max-w-[473px] text-[0] leading-[0] [&>div+div]:-mt-px">
        <VisualScreen src={ARTWORKS.hero} alt="不需要逼自己變外向，21 天也可以用你舒服的方式開始" priority>
          <button
            type="button"
            onClick={scrollToForm}
            className="absolute bottom-[11%] left-[8%] right-[8%] z-10 h-[7%] cursor-pointer border-0 bg-transparent p-0 text-transparent shadow-none"
            aria-label={copy.hero.earlyCta}
          />
        </VisualScreen>

        <div id="e21d-support">
          <VisualScreen src={ARTWORKS.support} alt="這 21 天，我們會這樣陪你" />
        </div>

        <div id="e21d-flow">
          <VisualScreen src={ARTWORKS.journey} alt="21 天體驗流程" />
        </div>

        <div id="e21d-suitable">
          <VisualScreen src={ARTWORKS.lowPressure} alt="為什麼這很適合不喜歡接觸人群的你" />
        </div>

        <div id="e21d-consult">
          <VisualScreen src={ARTWORKS.consultation} alt="選擇你最舒服的諮詢方式">
            <button
              type="button"
              onClick={scrollToForm}
              className="absolute bottom-[14%] left-[8%] right-[8%] z-10 h-[8%] cursor-pointer border-0 bg-transparent p-0 text-transparent shadow-none"
              aria-label={copy.consult.primaryCta}
            />
          </VisualScreen>
        </div>
      </div>

      {/* Minimal real interactive layer under artwork 05 */}
      <section
        ref={formRef}
        id="e21d-apply"
        className="e21d-interact mx-auto w-full max-w-[473px] px-4 pb-10 pt-3"
        aria-labelledby="e21d-consult-title"
      >
        <h2 id="e21d-consult-title" className="sr-only">
          {copy.consult.heading}
        </h2>

        {submitted ? (
          <div className="e21d-success" role="status">
            <h3 className="e21d-interact-title">{copy.consult.successTitle}</h3>
            <p className="e21d-interact-body">{copy.consult.successBody}</p>
            <p className="e21d-whisper">{copy.consult.successNote}</p>
            <Link href={`/analysis/${encodeURIComponent(token)}`} className="e21d-btn-secondary mt-4 inline-flex">
              回到分析報告
            </Link>
          </div>
        ) : (
          <form id={formId} className="e21d-apply" onSubmit={onSubmit} noValidate>
            <fieldset className="e21d-options">
              <legend className="e21d-legend">諮詢方式</legend>
              {copy.consult.options.map((option) => {
                const selected = preference === option.id;
                return (
                  <label
                    key={option.id}
                    className={`e21d-option ${option.recommended ? "is-recommended" : ""} ${selected ? "is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="consultationPreference"
                      value={option.id}
                      checked={selected}
                      onChange={() => onSelectPreference(option.id)}
                      className="sr-only"
                    />
                    <span className="e21d-option-title">{option.title}</span>
                    <span className="e21d-option-sub">{option.subtitle}</span>
                  </label>
                );
              })}
            </fieldset>

            <div className="e21d-contact-block">
              {needsContact ? (
                <>
                  <label className="e21d-field">
                    <span>怎麼稱呼你</span>
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      maxLength={20}
                      autoComplete="name"
                      required
                    />
                  </label>
                  <fieldset className="e21d-channels">
                    <legend>一個聯絡方式</legend>
                    <div className="e21d-channel-row">
                      {EXPERIENCE_21D_CONSUMER_CHANNELS.map((option) => (
                        <label key={option.id} className="e21d-channel">
                          <input
                            type="radio"
                            name="contactChannel"
                            checked={channel === option.id}
                            onChange={() => {
                              setChannel(option.id);
                              setValue("");
                            }}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="e21d-field">
                    <span>
                      {EXPERIENCE_21D_CONSUMER_CHANNELS.find((option) => option.id === channel)?.label}
                    </span>
                    <input
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                      placeholder={
                        EXPERIENCE_21D_CONSUMER_CHANNELS.find((option) => option.id === channel)?.placeholder
                      }
                      inputMode={channel === "phone" ? "tel" : "text"}
                      autoComplete={channel === "phone" ? "tel" : "off"}
                      required
                    />
                  </label>
                </>
              ) : (
                <p className="e21d-whisper">
                  已沿用你在分析中留下的聯絡方式
                  {load.context.displayName ? `（${load.context.displayName}）` : ""}。
                </p>
              )}
            </div>

            {formError ? <p className="e21d-error">{formError}</p> : null}

            <button type="submit" className="e21d-btn-primary w-full" disabled={busy}>
              {busy ? "送出中…" : copy.consult.primaryCta}
            </button>
            <p className="e21d-reassure-note">{copy.consult.reassurance}</p>
          </form>
        )}

        <footer className="e21d-footer">
          <p>Baki Go</p>
          <Link href="/privacy">隱私政策</Link>
        </footer>
      </section>
    </main>
  );
}
