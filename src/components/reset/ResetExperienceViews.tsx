"use client";

import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { ResetAnimalVisual, ResetQuizCue } from "@/components/reset/ResetAnimalVisual";
import { ResetRichText } from "@/components/reset/ResetRichText";
import { ResetShell } from "@/components/reset/ResetShell";
import {
  RESET_ANIMAL_PERSONALITY,
  RESET_COMPOSER_PLACEHOLDER,
  RESET_CONVERSATION_CTA,
  RESET_QUIZ_SUPPORT,
  RESET_REVEAL_BRIDGE,
  RESET_REVEAL_UNLOCK_TITLE,
  RESET_THINKING_LINES,
} from "@/lib/analysis/reset/reset-animals";
import { firstVisibleSentence } from "@/lib/analysis/reset/reset-emphasis";
import { RESET_OPENING } from "@/lib/analysis/reset/reset-path";
import { RESET_REPORT_TITLES } from "@/lib/analysis/reset/reset-report";
import type { ResetAnimalCopy } from "@/lib/analysis/reset/reset-animals";
import type { PersonalityType } from "@/lib/quiz/fat-loss/types";
import type { ResetPublicView, ResetTurn } from "@/lib/analysis/reset/reset-contract";
import { ResetResultShareBar } from "@/components/reset/ResetResultShareBar";
import {
  EXPERIENCE_21D_SUCCESS_BODY,
  EXPERIENCE_21D_SUCCESS_NOTE,
  EXPERIENCE_21D_SUCCESS_TITLE,
} from "@/lib/analysis/handoff/experience-21d-path";
import {
  EXPERIENCE_21D_CONSUMER_CHANNELS,
  type Experience21dConsumerChannel,
} from "@/lib/analysis/handoff/experience-21d-contact";

function interpretationAfterPersonality(animal: ResetAnimalCopy): string {
  const line = RESET_ANIMAL_PERSONALITY[animal.type];
  const text = animal.shortInterpretation.trim();
  if (text.startsWith(line)) return text.slice(line.length).trim();
  return text;
}

function supportingAfterHero(full: string, hero: string): string {
  const plain = full.replace(/\*\*/g, "").trim();
  if (!plain.startsWith(hero)) return "";
  return plain.slice(hero.length).trim();
}

export function ResetLandingView({
  starting,
  error,
  onStart,
}: {
  starting: boolean;
  error: string | null;
  onStart: () => void;
}) {
  return (
    <ResetShell act="landing" shot="landing">
      <div className="rx-landing">
        <div className="rx-kv">
          <img
            className="rx-kv-img"
            src="/reset/landing-final.png"
            alt="Baki GO 心理測驗角色系列"
            width={1024}
            height={1536}
            draggable={false}
          />
          <button
            type="button"
            className={starting ? "rx-kv-hit is-starting" : "rx-kv-hit"}
            aria-label={starting ? "準備測驗中…" : "開始測驗"}
            aria-busy={starting || undefined}
            disabled={starting}
            onClick={onStart}
          >
            {starting ? (
              <span className="rx-kv-hit-busy">
                <span className="rx-kv-hit-dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span className="rx-kv-hit-label">準備測驗中…</span>
              </span>
            ) : null}
          </button>
        </div>
        {error ? <p className="rx-error">{error}</p> : null}
      </div>
    </ResetShell>
  );
}

export function ResetQuizView({
  current,
  total,
  question,
  selectedId,
  busy,
  error,
  onChoose,
}: {
  current: number;
  total: number;
  question: { id: string; text: string; support?: string; options: Array<{ id: string; label: string }> };
  selectedId: string | null;
  busy: boolean;
  error: string | null;
  onChoose: (optionId: string) => void;
}) {
  const progress = Math.max(0, Math.min(1, current / total));
  return (
    <ResetShell act="quiz" shot={`quiz-q${current}${selectedId ? "-selected" : ""}`}>
      <div key={question.id} className="rx-in rx-in-play">
        <div className="rx-quiz-head">
          <p className="rx-progress">
            {String(current).padStart(2, "0")}
            <span> / {String(total).padStart(2, "0")}</span>
          </p>
          <div className="rx-progress-track" aria-hidden>
            <div className="rx-progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <h1 className="rx-scene">{question.text}</h1>
        <p className="rx-support">{question.support ?? RESET_QUIZ_SUPPORT}</p>
        <div className="rx-choices">
          {question.options.map((option, index) => {
            const selected = selectedId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={selected ? "rx-choice is-selected" : "rx-choice"}
                disabled={busy}
                onClick={() => onChoose(option.id)}
              >
                <ResetQuizCue index={index} selected={selected} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
        {error ? <p className="rx-error">{error}</p> : null}
      </div>
    </ResetShell>
  );
}

export function ResetRevealView({
  animal,
  busy,
  error,
  onContinue,
}: {
  animal: NonNullable<ResetPublicView["animal"]>;
  busy: boolean;
  error: string | null;
  onContinue: () => void;
}) {
  return (
    <ResetShell act="reveal" shot="reveal" animalType={animal.type}>
      <div className="rx-reveal rx-in rx-in-delight">
        <p className="rx-kicker">你比較像——</p>
        <div className="rx-reveal-art">
          <ResetAnimalVisual animal={animal} />
        </div>
        <h1 className="rx-animal-name">{animal.animalName}</h1>
        <p className="rx-personality">{RESET_ANIMAL_PERSONALITY[animal.type]}</p>
        {interpretationAfterPersonality(animal)
          .split(/\n\n+/)
          .map((para) => (
            <p key={para.slice(0, 24)} className="rx-body">
              {para}
            </p>
          ))}
        <section className="rx-unlock" aria-label={RESET_REVEAL_UNLOCK_TITLE}>
          <h2 className="rx-unlock-title">
            解鎖<span className="rx-unlock-free">免費</span> AI 深度分析
          </h2>
          <div className="rx-bridge">
            {RESET_REVEAL_BRIDGE.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <button type="button" className="rx-cta" disabled={busy} onClick={onContinue}>
            {RESET_CONVERSATION_CTA}
          </button>
        </section>
        {error ? <p className="rx-error">{error}</p> : null}
      </div>
    </ResetShell>
  );
}

function conversationTurns(turns: ResetTurn[]): ResetTurn[] {
  if (turns.some((turn) => turn.role === "assistant")) return turns;
  return [
    {
      id: "a_open_visible",
      role: "assistant",
      text: RESET_OPENING,
      createdAt: new Date().toISOString(),
    },
    ...turns,
  ];
}

export function ResetThinkingMark({ line }: { line: string }) {
  return (
    <div className="rx-think" role="status" aria-live="polite">
      <span className="rx-think-dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span>{line}</span>
    </div>
  );
}

export function ResetConversationView({
  animalName,
  animalType,
  turns,
  pendingUser,
  busy,
  draft,
  error,
  thinkingLine,
  onDraftChange,
  onSubmit,
}: {
  animalName: string | null;
  animalType?: PersonalityType | null;
  turns: ResetTurn[];
  pendingUser: string | null;
  busy: boolean;
  draft: string;
  error: string | null;
  thinkingLine: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const threadRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const visibleTurns = conversationTurns(turns);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [visibleTurns.length, pendingUser, busy]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  const canSend = Boolean(draft.trim()) && !busy;

  return (
    <ResetShell act="conversation" shot="conversation" animalType={animalType}>
      <header className="rx-chat-head" aria-label={animalName ? `Baki GO · ${animalName}` : "Baki GO"}>
        <button type="button" className="rx-back" onClick={() => window.history.back()} aria-label="返回">
          <span aria-hidden>‹</span>
        </button>
        <p className="rx-chat-brand">Baki GO</p>
      </header>
      <div ref={threadRef} className="rx-thread">
        {visibleTurns.map((turn) =>
          turn.role === "user" ? (
            <div key={turn.id} className="rx-bubble rx-bubble-user rx-in rx-in-quiet">
              {turn.text}
            </div>
          ) : (
            <div key={turn.id} className="rx-bubble rx-bubble-ai rx-in rx-in-quiet">
              <ResetRichText text={turn.text} className="rx-ai-copy" />
            </div>
          ),
        )}
        {pendingUser ? <div className="rx-bubble rx-bubble-user rx-in rx-in-quiet">{pendingUser}</div> : null}
        {busy ? <ResetThinkingMark line={thinkingLine} /> : null}
      </div>
      <form className="rx-composer" onSubmit={handleSubmit}>
        <div className={canSend ? "rx-composer-bar is-ready" : "rx-composer-bar"}>
          <textarea
            ref={areaRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={handleKey}
            maxLength={400}
            rows={1}
            disabled={busy}
            placeholder={RESET_COMPOSER_PLACEHOLDER}
            enterKeyHint="send"
            autoComplete="off"
            aria-label="跟 AI 說"
          />
          <button type="submit" className="rx-send" disabled={!canSend} aria-label="送出">
            送出
          </button>
        </div>
        {error ? <p className="rx-error">{error}</p> : null}
      </form>
    </ResetShell>
  );
}

export function ResetReportView({
  animal,
  report,
  safetyGuidance,
  generating,
  handoff,
  handoffUi = "offer",
  contactName = "",
  contactChannel = "line",
  contactValue = "",
  busy = false,
  error = null,
  sessionToken = null,
  onPrimary,
  onSecondary,
  onContactName,
  onContactChannel,
  onContactValue,
  onSubmitContact,
}: {
  animal: ResetPublicView["animal"];
  report: ResetPublicView["report"];
  safetyGuidance: string | null;
  generating: boolean;
  handoff?: ResetPublicView["handoff"];
  handoffUi?: "offer" | "contact" | "success" | "hidden";
  contactName?: string;
  contactChannel?: Experience21dConsumerChannel;
  contactValue?: string;
  busy?: boolean;
  error?: string | null;
  sessionToken?: string | null;
  onPrimary?: () => void;
  onSecondary?: () => void;
  onContactName?: (value: string) => void;
  onContactChannel?: (value: Experience21dConsumerChannel) => void;
  onContactValue?: (value: string) => void;
  onSubmitContact?: () => void;
}) {
  const sections = report ? [report.why_now, report.bottleneck, report.first_change] : [];
  const hero = report ? firstVisibleSentence(report.why_now) : "正在整理你的洞察…";
  const support = report ? supportingAfterHero(report.why_now, hero) : "";

  return (
    <ResetShell act="report" shot="report" animalType={animal?.type}>
      <div className="rx-report rx-in rx-in-editorial">
        {animal ? (
          <div className="rx-report-animal">
            <ResetAnimalVisual animal={animal} size="chip" />
            <p className="rx-whisper">
              {animal.animalName}
              <span> · 情境傾向，不是結論</span>
            </p>
          </div>
        ) : null}
        <p className="rx-kicker">聊完之後，我真正看到的是——</p>
        <p className="rx-hero">{hero}</p>
        {support ? <p className="rx-hero-support">{support}</p> : null}
        {safetyGuidance ? <p className="rx-whisper">{safetyGuidance}</p> : null}
        {report ? (
          <div className="rx-report-grid">
            {sections.map((text, index) => (
              <article key={RESET_REPORT_TITLES[index]} className="rx-section">
                <p className="rx-index">{String(index + 1).padStart(2, "0")}</p>
                <h2 className="rx-card-title">{RESET_REPORT_TITLES[index]}</h2>
                <ResetRichText text={text} className="rx-ai-copy" />
              </article>
            ))}
          </div>
        ) : generating ? (
          <ResetThinkingMark line={RESET_THINKING_LINES[1]} />
        ) : null}
        {report && sessionToken && animal ? (
          <ResetResultShareBar token={sessionToken} animalType={animal.type} />
        ) : null}
        {report && handoff && handoffUi !== "hidden" ? (
          <section className="rx-21d" aria-label={handoff.invitation.heading}>
            <p className="rx-index">下一步</p>
            <h2 className="rx-card-title">{handoff.invitation.heading}</h2>
            {handoffUi === "success" || handoff.interest.state === "created" ? (
              <div className="rx-21d-success">
                <p className="rx-ai-copy">{EXPERIENCE_21D_SUCCESS_TITLE}</p>
                <p className="rx-body">{EXPERIENCE_21D_SUCCESS_BODY}</p>
                <p className="rx-whisper">{EXPERIENCE_21D_SUCCESS_NOTE}</p>
              </div>
            ) : (
              <>
                <ResetRichText text={handoff.invitation.bridge} className="rx-ai-copy" />
                <p className="rx-21d-title">{handoff.invitation.title}</p>
                <ul className="rx-21d-includes">
                  {handoff.invitation.includes.map((item) => (
                    <li key={item.id}>{item.label}</li>
                  ))}
                </ul>
                <p className="rx-whisper">{handoff.invitation.footer}</p>
                {handoffUi === "contact" ? (
                  <form
                    className="rx-21d-contact"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onSubmitContact?.();
                    }}
                  >
                    <label>
                      怎麼稱呼你
                      <input
                        value={contactName}
                        onChange={(event) => onContactName?.(event.target.value)}
                        maxLength={20}
                        autoComplete="name"
                      />
                    </label>
                    <fieldset>
                      <legend>一個聯絡方式</legend>
                      {EXPERIENCE_21D_CONSUMER_CHANNELS.map((option) => (
                        <label key={option.id} className="rx-21d-channel">
                          <input
                            type="radio"
                            name="rx-21d-channel"
                            checked={contactChannel === option.id}
                            onChange={() => onContactChannel?.(option.id)}
                          />
                          {option.label}
                        </label>
                      ))}
                    </fieldset>
                    <label>
                      {EXPERIENCE_21D_CONSUMER_CHANNELS.find((option) => option.id === contactChannel)?.label}
                      <input
                        value={contactValue}
                        onChange={(event) => onContactValue?.(event.target.value)}
                        placeholder={
                          EXPERIENCE_21D_CONSUMER_CHANNELS.find((option) => option.id === contactChannel)?.placeholder
                        }
                        inputMode={contactChannel === "phone" ? "tel" : "text"}
                        autoComplete={contactChannel === "phone" ? "tel" : "off"}
                      />
                    </label>
                    <button type="submit" className="rx-cta" disabled={busy}>
                      {handoff.invitation.primaryCta}
                    </button>
                  </form>
                ) : (
                  <div className="rx-21d-actions">
                    <button type="button" className="rx-cta" disabled={busy} onClick={onPrimary}>
                      {handoff.invitation.primaryCta}
                    </button>
                    <button type="button" className="rx-21d-secondary" disabled={busy} onClick={onSecondary}>
                      {handoff.invitation.secondaryCta}
                    </button>
                  </div>
                )}
              </>
            )}
            {error ? <p className="rx-error">{error}</p> : null}
          </section>
        ) : null}
      </div>
    </ResetShell>
  );
}
