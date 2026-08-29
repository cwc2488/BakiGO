"use client";

import Image from "next/image";
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

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Experience21dLandingPage({ token }: { token: string }) {
  const formId = useId();
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
    <main className="e21d-page">
      <header className="e21d-topbar">
        <Link href="/" className="e21d-brand" aria-label="Baki Go 首頁">
          <Image src="/icon.svg" alt="" width={28} height={28} className="h-7 w-7" />
          <span>Baki Go</span>
        </Link>
        <p className="e21d-top-badge">{copy.badge}</p>
      </header>

      {/* Section 1 — Hero */}
      <section className="e21d-section e21d-hero" aria-labelledby="e21d-hero-title">
        <p className="e21d-eyebrow">{copy.hero.eyebrow}</p>
        <h1 id="e21d-hero-title" className="e21d-hero-title">
          {copy.hero.headlineLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>
        <p className="e21d-lead">{copy.hero.support}</p>
        <ul className="e21d-reassure-grid">
          {copy.hero.reassurances.map((item) => (
            <li key={item.title} className="e21d-card">
              <h2 className="e21d-card-title">{item.title}</h2>
              <p className="e21d-card-body">{item.body}</p>
            </li>
          ))}
        </ul>
        <button type="button" className="e21d-btn-primary mt-8" onClick={() => scrollToId("e21d-consult")}>
          {copy.hero.earlyCta}
        </button>
        <button type="button" className="e21d-scroll-cue" onClick={() => scrollToId("e21d-support")}>
          {copy.hero.scrollCue}
        </button>
      </section>

      {/* Section 2 — Support */}
      <section id="e21d-support" className="e21d-section" aria-labelledby="e21d-support-title">
        <h2 id="e21d-support-title" className="e21d-section-title">
          {copy.support.heading}
        </h2>
        <p className="e21d-lead">{copy.support.lead}</p>
        <ol className="e21d-timeline">
          {copy.support.items.map((item, index) => (
            <li key={item.title} className="e21d-timeline-item">
              <span className="e21d-timeline-num" aria-hidden>
                {index + 1}
              </span>
              <div className="e21d-card">
                <h3 className="e21d-card-title">{item.title}</h3>
                <p className="e21d-card-body">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Section 3 — Flow */}
      <section id="e21d-flow" className="e21d-section" aria-labelledby="e21d-flow-title">
        <h2 id="e21d-flow-title" className="e21d-section-title">
          {copy.flow.heading}
        </h2>
        <p className="e21d-subheading">{copy.flow.subheading}</p>
        <ol className="e21d-timeline">
          {copy.flow.stages.map((stage) => (
            <li key={stage.day} className="e21d-timeline-item">
              <span className="e21d-timeline-dot" aria-hidden />
              <article className="e21d-card">
                <p className="e21d-day">{stage.day}</p>
                <h3 className="e21d-card-title">{stage.title}</h3>
                <ul className="e21d-bullets">
                  {stage.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ol>
        <p className="e21d-quote">{copy.flow.closing}</p>
      </section>

      {/* Section 4 — Suitable */}
      <section id="e21d-suitable" className="e21d-section" aria-labelledby="e21d-suitable-title">
        <h2 id="e21d-suitable-title" className="e21d-section-title">
          {copy.suitable.headingLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h2>
        <p className="e21d-subheading">{copy.suitable.subheading}</p>
        <ul className="e21d-stack">
          {copy.suitable.cards.map((card) => (
            <li key={card.title} className="e21d-card">
              <h3 className="e21d-card-title">{card.title}</h3>
              <p className="e21d-card-body">{card.body}</p>
            </li>
          ))}
        </ul>
        <p className="e21d-quote">
          {copy.suitable.closingLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
      </section>

      {/* Section 5 — Consultation */}
      <section id="e21d-consult" className="e21d-section e21d-consult" aria-labelledby="e21d-consult-title">
        <h2 id="e21d-consult-title" className="e21d-section-title">
          {copy.consult.heading}
        </h2>
        <p className="e21d-lead">{copy.consult.lead}</p>

        {submitted ? (
          <div className="e21d-card e21d-success" role="status">
            <h3 className="e21d-card-title">{copy.consult.successTitle}</h3>
            <p className="e21d-card-body">{copy.consult.successBody}</p>
            <p className="e21d-whisper">{copy.consult.successNote}</p>
            <Link href={`/analysis/${encodeURIComponent(token)}`} className="e21d-btn-secondary mt-4 inline-flex">
              回到分析報告
            </Link>
          </div>
        ) : (
          <form id={formId} className="e21d-apply" onSubmit={onSubmit} noValidate>
            <fieldset className="e21d-options">
              <legend className="sr-only">諮詢方式</legend>
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
                    <div className="e21d-option-badges">
                      <span className="e21d-pill">{option.badge}</span>
                      {option.recommended ? <span className="e21d-pill e21d-pill-accent">首選推薦</span> : null}
                    </div>
                    <span className="e21d-card-title">{option.title}</span>
                    <span className="e21d-card-body">{option.subtitle}</span>
                    <ul className="e21d-bullets">
                      {option.benefits.map((benefit) => (
                        <li key={benefit}>{benefit}</li>
                      ))}
                    </ul>
                  </label>
                );
              })}
            </fieldset>

            <div id="e21d-apply" className="e21d-contact-block">
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
      </section>

      <footer className="e21d-footer">
        <p>Baki Go</p>
        <Link href="/privacy">隱私政策</Link>
      </footer>
    </main>
  );
}
