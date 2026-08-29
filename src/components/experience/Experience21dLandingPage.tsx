"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
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

const REASSURE_ICONS = ["chat", "phone", "heart"] as const;
const SUITABLE_ICONS = ["chat", "lock", "clock", "home"] as const;
const SUITABLE_TAGS = [
  ["文字也可以", "語音也可以"],
  ["僅教練可見", "不會公開分享"],
  ["慢慢來", "不必急著回覆"],
  ["在你熟悉的地方", "用你舒服的方式"],
] as const;

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Icon({ name }: { name: (typeof REASSURE_ICONS)[number] | (typeof SUITABLE_ICONS)[number] | "leaf" | "spark" }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "chat") {
    return (
      <svg {...common}>
        <path d="M4 12a7 7 0 0 1 7-7h2a7 7 0 0 1 0 14h-1l-4 3v-3a7 7 0 0 1-4-7Z" />
        <path d="M9 11h6M9 14h4" />
      </svg>
    );
  }
  if (name === "phone") {
    return (
      <svg {...common}>
        <path d="M7 3.5h3.2l1.1 3.2-1.8 1.2a11 11 0 0 0 5.6 5.6l1.2-1.8 3.2 1.1V16a2.5 2.5 0 0 1-2.5 2.5A13.5 13.5 0 0 1 4.5 6 2.5 2.5 0 0 1 7 3.5Z" />
      </svg>
    );
  }
  if (name === "heart") {
    return (
      <svg {...common}>
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
      </svg>
    );
  }
  if (name === "lock") {
    return (
      <svg {...common}>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
    );
  }
  if (name === "clock") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.5 2.5" />
      </svg>
    );
  }
  if (name === "home") {
    return (
      <svg {...common}>
        <path d="M4 11.5 12 4l8 7.5" />
        <path d="M7 10.5V20h10v-9.5" />
      </svg>
    );
  }
  if (name === "spark") {
    return (
      <svg {...common} width={16} height={16}>
        <path d="M12 3.5 13.4 8.6 18.5 10 13.4 11.4 12 16.5 10.6 11.4 5.5 10 10.6 8.6Z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M7 15c2-5 4-8 5-11 1 3 3 6 5 11" />
      <path d="M6 15h12" />
      <path d="M9 15c.4 2.4 1.4 4 3 5 1.6-1 2.6-2.6 3-5" />
    </svg>
  );
}

function ScrollCue({ targetId, label }: { targetId: string; label: string }) {
  return (
    <button type="button" className="e21d-scroll-bar" onClick={() => scrollToId(targetId)}>
      <span className="e21d-scroll-arrow" aria-hidden>
        ↓
      </span>
      <span>{label}</span>
    </button>
  );
}

function SoftCard({
  children,
  className = "",
  role,
}: {
  children: ReactNode;
  className?: string;
  role?: string;
}) {
  return (
    <div className={`e21d-soft-card ${className}`.trim()} role={role}>
      {children}
    </div>
  );
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
        <div className="e21d-hero-stage">
          <div className="e21d-hero-copy">
            <p className="e21d-eyebrow">
              <Icon name="leaf" />
              <span>{copy.hero.eyebrow}</span>
            </p>
            <h1 id="e21d-hero-title" className="e21d-hero-title">
              <span className="block">不需要逼自己變外向，</span>
              <span className="block">
                <em className="e21d-em-21">21 天</em>，
              </span>
              <span className="block">
                也可以用你<em className="e21d-em">舒服</em>的方式開始。
              </span>
            </h1>
            <p className="e21d-lead e21d-hero-lead">
              我們用 AI 理解你的狀況，
              <br />
              每天陪你一點點調整，
              <br />
              在你熟悉的生活裡，
              <br />
              <span className="e21d-underline-soft">慢慢變好。</span>
            </p>
          </div>
          <div className="e21d-hero-visual">
            <Image
              src="/experience/21d/art-hero-portrait.jpg"
              alt=""
              width={334}
              height={358}
              className="e21d-hero-photo"
              priority
            />
            <p className="e21d-whisper-note">改變不用很大，每天比昨天的自己好一點點。</p>
          </div>
        </div>

        <SoftCard className="e21d-reassure-panel">
          <ul className="e21d-reassure-grid">
            {copy.hero.reassurances.map((item, index) => (
              <li key={item.title} className="e21d-reassure-item">
                <span className="e21d-icon-bubble">
                  <Icon name={REASSURE_ICONS[index] ?? "heart"} />
                </span>
                <h2 className="e21d-card-title">{item.title}</h2>
                <p className="e21d-card-body">{item.body}</p>
              </li>
            ))}
          </ul>
        </SoftCard>

        <SoftCard className="e21d-teaser">
          <div className="e21d-teaser-copy">
            <p className="e21d-teaser-title">準備好開始你的 21 天體驗了嗎？</p>
            <p className="e21d-card-body">
              先申請<span className="e21d-underline-soft">諮詢</span>，了解 21 天體驗適不適合你，再決定下一步。
            </p>
          </div>
          <button type="button" className="e21d-btn-primary" onClick={() => scrollToId("e21d-consult")}>
            {copy.hero.earlyCta}
          </button>
        </SoftCard>

        <ScrollCue targetId="e21d-support" label={copy.hero.scrollCue} />
      </section>

      {/* Section 2 — Support */}
      <section id="e21d-support" className="e21d-section" aria-labelledby="e21d-support-title">
        <h2 id="e21d-support-title" className="e21d-section-title">
          這 <em className="e21d-em-21">21</em> 天，我們會這樣陪你
          <span className="e21d-inline-heart" aria-hidden>
            ♡
          </span>
        </h2>
        <p className="e21d-lead">{copy.support.lead}</p>
        <ol className="e21d-timeline">
          {copy.support.items.map((item, index) => (
            <li key={item.title} className="e21d-timeline-item">
              <span className="e21d-timeline-num" aria-hidden>
                {index + 1}
              </span>
              <SoftCard>
                <h3 className="e21d-card-title">{item.title}</h3>
                <p className="e21d-card-body">{item.body}</p>
              </SoftCard>
            </li>
          ))}
        </ol>
        <p className="e21d-quote">不用完美，只要比昨天的自己更好一點點。</p>
        <ScrollCue targetId="e21d-flow" label="下一步：看看 21 天體驗流程" />
      </section>

      {/* Section 3 — Flow */}
      <section id="e21d-flow" className="e21d-section" aria-labelledby="e21d-flow-title">
        <h2 id="e21d-flow-title" className="e21d-section-title e21d-title-with-spark">
          <Icon name="spark" />
          <span>{copy.flow.heading}</span>
          <Icon name="spark" />
        </h2>
        <p className="e21d-subheading">{copy.flow.subheading}</p>
        <ol className="e21d-timeline e21d-flow-timeline">
          {copy.flow.stages.map((stage) => (
            <li key={stage.day} className="e21d-timeline-item">
              <span className="e21d-timeline-dot" aria-hidden />
              <SoftCard>
                <p className="e21d-day">{stage.day}</p>
                <h3 className="e21d-card-title">{stage.title}</h3>
                <ul className="e21d-bullets">
                  {stage.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </SoftCard>
            </li>
          ))}
        </ol>
        <p className="e21d-quote">
          不用追求完美，
          <br />
          只要每天比昨天的自己好一點點。
        </p>
        <ScrollCue targetId="e21d-suitable" label={copy.hero.scrollCue} />
      </section>

      {/* Section 4 — Suitable */}
      <section id="e21d-suitable" className="e21d-section" aria-labelledby="e21d-suitable-title">
        <h2 id="e21d-suitable-title" className="e21d-section-title">
          {copy.suitable.headingLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
          <span className="e21d-inline-heart" aria-hidden>
            ♡
          </span>
        </h2>
        <p className="e21d-subheading">{copy.suitable.subheading}</p>
        <ul className="e21d-suitable-stack">
          {copy.suitable.cards.map((card, index) => (
            <li key={card.title}>
              <SoftCard className="e21d-suitable-card">
                <span className="e21d-icon-bubble">
                  <Icon name={SUITABLE_ICONS[index] ?? "heart"} />
                </span>
                <div className="e21d-suitable-body">
                  <h3 className="e21d-card-title">{card.title}</h3>
                  <p className="e21d-card-body">{card.body}</p>
                  <div className="e21d-tag-row">
                    {(SUITABLE_TAGS[index] ?? []).map((tag) => (
                      <span key={tag} className="e21d-pill">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </SoftCard>
            </li>
          ))}
        </ul>
        <div className="e21d-closing-band">
          <div>
            <p className="e21d-quote e21d-quote-plain">
              {copy.suitable.closingLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
          </div>
          <Image
            src="/experience/21d/art-suitable-illust.jpg"
            alt=""
            width={165}
            height={163}
            className="e21d-closing-illust"
          />
        </div>
        <ScrollCue targetId="e21d-consult" label={copy.hero.scrollCue} />
      </section>

      {/* Section 5 — Consultation */}
      <section id="e21d-consult" className="e21d-section e21d-consult" aria-labelledby="e21d-consult-title">
        <div className="e21d-consult-hero">
          <div>
            <p className="e21d-eyebrow">多種諮詢方式，選擇最舒服的陪伴</p>
            <h2 id="e21d-consult-title" className="e21d-section-title">
              {copy.consult.heading}
            </h2>
            <p className="e21d-lead">{copy.consult.lead}</p>
          </div>
          <Image
            src="/experience/21d/art-consult-portrait.jpg"
            alt=""
            width={316}
            height={266}
            className="e21d-consult-photo"
          />
        </div>

        {submitted ? (
          <SoftCard className="e21d-success" role="status">
            <h3 className="e21d-card-title">{copy.consult.successTitle}</h3>
            <p className="e21d-card-body">{copy.consult.successBody}</p>
            <p className="e21d-whisper">{copy.consult.successNote}</p>
            <Link href={`/analysis/${encodeURIComponent(token)}`} className="e21d-btn-secondary mt-4 inline-flex">
              回到分析報告
            </Link>
          </SoftCard>
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
