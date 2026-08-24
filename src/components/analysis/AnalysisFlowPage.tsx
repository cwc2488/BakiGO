"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AnalysisInsightCard,
  AnalysisReportHeader,
  AnalysisReportSections,
} from "@/components/analysis/consumer/AnalysisReportViews";
import { AiMark } from "@/components/analysis/experience/AiMark";
import { QuizExploreDots } from "@/components/analysis/experience/QuizExploreDots";
import {
  looksLikeUserCorrection,
  quizExploreKicker,
  quizThinkCopy,
} from "@/components/analysis/experience/experience-copy";
import { quizStepFromQuestionId } from "@/components/analysis/experience/experience-progress";
import {
  QuizOptionButton,
  QuizPrimaryButton,
  QuizWarmShell,
} from "@/components/quiz/QuizWarmShell";
import { interviewWaitCopy } from "@/lib/analysis/interview/interview-wait-copy";
import { interviewActivePresentation } from "@/lib/analysis/interview/interview-reasoner";

type FlowQuestion = {
  id: string;
  type: string;
  prompt: string;
  helpText?: string;
  options?: Array<{ id: string; label: string }>;
  scaleMin?: number;
  scaleMax?: number;
  scaleLabels?: { min: string; max: string };
  numberFields?: Array<{ key: string; label: string; min: number; max: number; unit: string }>;
  maxLength?: number;
};

type Layer1 = {
  version?: string;
  sections: {
    coreStuck?: string;
    changeState?: string | null;
    progress?: string;
    primaryGoal?: string;
    whyNow?: string;
    mainStuckPoint?: string;
    pastExperience?: string;
    lifestyleSummary?: string;
    commitment?: string;
    nextStatus?: string;
  };
  safety: { flagged: boolean; guidance: string | null };
  facts: { animalName: string };
};

type AiReport = {
  section1_personality: string;
  section2_why_change: string;
  section3_why_failed: string;
  section4_lifestyle: string;
  section5_one_change: string;
  section6_next_step: string;
};

type FlowView = {
  analysisState: string;
  quizSummary: {
    respondentName: string;
    animalName: string;
    tagline: string;
    headline: string;
    coreInsight: string;
    entryKind?: "native_seed" | "personality_quiz";
    animalPayoffUnverified?: boolean;
  };
  progress: { current: number; total: number } | null;
  currentQuestion: FlowQuestion | null;
  reflection: { kicker: string; text: string } | null;
  interviewMode?: boolean;
  phase?: "quiz" | "interview" | "report";
  assistantResponse?: string | null;
  singleUtterance?: boolean;
  conversationRuntime?: "insight_v1" | "chatgpt" | "native" | "legacy";
  layer1: Layer1 | null;
  aiReport:
    | AiReport
    | {
        version?: string;
        stuck_pattern: string;
        why_methods_failed: string;
        first_change: string;
      }
    | null;
  progressStages: Array<{ id: string; label: string; done: boolean; active: boolean }>;
  canLeaveMessage: string;
};

const MIN_QUIZ_HOLD_MS = 900;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function AnalysisFlowPage({ token }: { token: string }) {
  const [flow, setFlow] = useState<FlowView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null);
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [waitMs, setWaitMs] = useState(0);
  const [quizToInterviewGate, setQuizToInterviewGate] = useState(false);
  const [revealHold, setRevealHold] = useState(false);
  const [reconsiderPulse, setReconsiderPulse] = useState(false);
  const inFlight = useRef(false);
  const phaseRef = useRef<FlowView["phase"]>(undefined);
  const interviewSeenRef = useRef(false);
  const nativeStartedRef = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/analysis/sessions/${encodeURIComponent(token)}/flow`);
    const data = (await res.json()) as { ok?: boolean; flow?: FlowView; error?: string };
    if (!res.ok || !data.flow) throw new Error(data.error ?? "無法載入分析");
    setFlow(data.flow);
    setFreeText("");
    setHeight("");
    setWeight("");
    setMultiSelected([]);
    if (data.flow.phase === "interview" || data.flow.interviewMode) {
      interviewSeenRef.current = true;
    }
  }, [token]);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "無法載入"));
  }, [load]);

  useEffect(() => {
    if (!flow || flow.analysisState !== "shell") return;
    if (flow.quizSummary.entryKind !== "native_seed" && flow.quizSummary.animalName) return;
    if (nativeStartedRef.current || inFlight.current) return;
    nativeStartedRef.current = true;
    void postAction({ action: "start" });
    // native seed should never sit on the personality intro
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow?.analysisState, flow?.quizSummary.entryKind]);

  useEffect(() => {
    if (!flow) return;
    if (flow.analysisState !== "ai_generating" && flow.analysisState !== "basic_report_ready") return;
    const id = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(id);
  }, [flow?.analysisState, load]);

  useEffect(() => {
    if (!busy || !pendingAnswer) {
      setWaitMs(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => setWaitMs(Date.now() - started), 200);
    return () => window.clearInterval(id);
  }, [busy, pendingAnswer]);

  useEffect(() => {
    if (!flow) return;
    const prev = phaseRef.current;
    phaseRef.current = flow.phase;
    if (prev === "interview" && (flow.phase === "report" || !flow.currentQuestion) && !flow.aiReport) {
      setRevealHold(true);
    }
  }, [flow]);

  useEffect(() => {
    if (!revealHold) return;
    if (flow?.aiReport) {
      const id = window.setTimeout(() => setRevealHold(false), 1600);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setRevealHold(false), 4200);
    return () => window.clearTimeout(id);
  }, [revealHold, flow?.aiReport]);

  async function postAction(body: Record<string, unknown>, displayText?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const started = Date.now();
    const fromPhase = flow?.phase;
    const display =
      displayText ?? (typeof body.value === "string" ? body.value : null);
    if (display) {
      setPendingAnswer(display);
    }
    try {
      const res = await fetch(`/api/analysis/sessions/${encodeURIComponent(token)}/flow`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; flow?: FlowView; error?: string };
      if (!res.ok || !data.flow) throw new Error(data.error ?? "儲存失敗");
      const elapsed = Date.now() - started;
      if (fromPhase === "quiz") {
        const remain = MIN_QUIZ_HOLD_MS - elapsed;
        if (remain > 0) await wait(remain);
      }
      if (
        fromPhase === "quiz" &&
        (data.flow.phase === "interview" || data.flow.interviewMode) &&
        !interviewSeenRef.current
      ) {
        setQuizToInterviewGate(true);
      }
      if (fromPhase === "interview" && looksLikeUserCorrection(String(body.value ?? ""))) {
        setReconsiderPulse(true);
        window.setTimeout(() => setReconsiderPulse(false), 1400);
      }
      setFlow(data.flow);
      setFreeText("");
      setHeight("");
      setWeight("");
      setMultiSelected([]);
      setPendingAnswer(null);
      setPendingOptionId(null);
      if (data.flow.phase === "interview" || data.flow.interviewMode) {
        interviewSeenRef.current = true;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const shell = (children: ReactNode) => (
    <QuizWarmShell tone="night" footer="Baki GO · 減脂卡關分析">
      {children}
    </QuizWarmShell>
  );

  if (error && !flow) {
    return shell(<div className="py-16 text-center text-[var(--qc-text-secondary)]">{error}</div>);
  }

  if (!flow) {
    return shell(<div className="py-16 text-center text-[var(--qc-text-muted)]">正在更了解你</div>);
  }

  const quiz = flow.quizSummary;

  if (flow.analysisState === "shell") {
    const nativeEntry = flow.quizSummary.entryKind === "native_seed" || !quiz.animalName;
    if (nativeEntry) {
      return shell(
        <div className="py-16 text-center text-[var(--qc-text-muted)]">正在更了解你</div>,
      );
    }
    return shell(
      <div className="qc-enter flex flex-col gap-7 pb-8 pt-4">
        <div className="space-y-3">
          <p className="ax-kicker">
            <AiMark />
            正在更了解你
          </p>
          <h1 className="qc-display text-[1.7rem]">
            {quiz.respondentName}，你是「{quiz.animalName}」
          </h1>
          <p className="qc-body">{quiz.tagline}</p>
        </div>
        <section className="qc-card space-y-3 p-6">
          <h2 className="qc-subheading">剛才的心理測驗結果</h2>
          <p className="qc-body font-medium text-[var(--qc-text)]">{quiz.headline}</p>
          <p className="qc-body">{quiz.coreInsight}</p>
        </section>
        <section className="qc-surface-soft space-y-3 px-6 py-5">
          <h2 className="qc-subheading">接下來會做什麼？</h2>
          <p className="qc-body">
            接下來會先用選擇題更了解你，再像顧問一樣聊。不是固定問卷，下一題會跟著你的答案走。
          </p>
          <ul className="qc-body space-y-2">
            <li>約 5 分鐘</li>
            <li>不用登入</li>
            <li>不需要留下聯絡方式</li>
          </ul>
        </section>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <QuizPrimaryButton disabled={busy} onClick={() => void postAction({ action: "start" })}>
          {busy ? "準備中…" : "開始深入分析"}
        </QuizPrimaryButton>
      </div>,
    );
  }

  if (quizToInterviewGate) {
    return shell(
      <div className="ax-gate qc-enter">
        <AiMark pulse />
        <h1>
          我大概看懂你的模式了。
          <br />
          不過有幾件事，
          <br />
          我不想只靠選項猜。
        </h1>
        <p className="qc-body text-[1.05rem]">
          接下來我想直接跟你聊幾句。
          <br />
          你不用想標準答案，照你真正的感覺回答就好。
        </p>
        {quiz.animalName ? (
          <div className="qc-card space-y-2 p-5" data-animal-payoff="unverified">
            <p className="qc-caption">根據目前回答的 AI 解讀</p>
            <h2 className="qc-display text-[1.45rem]">你現在比較像「{quiz.animalName}」</h2>
            {quiz.tagline ? <p className="qc-body">{quiz.tagline}</p> : null}
            <p className="qc-caption">這是根據目前回答形成的 AI 解讀，不是固定人格標籤。</p>
          </div>
        ) : null}
        <QuizPrimaryButton onClick={() => setQuizToInterviewGate(false)}>讓 AI 再了解我一點</QuizPrimaryButton>
        <p className="qc-caption text-center">大約 2–4 分鐘</p>
      </div>,
    );
  }

  if (flow.currentQuestion) {
    const q = flow.currentQuestion;
    const interview = Boolean(flow.interviewMode);
    const quizPhase = flow.phase === "quiz" && !interview;
    const quizThinking = Boolean(quizPhase && busy && pendingAnswer);
    const interviewThinking = Boolean(interview && busy && pendingAnswer);
    const single = Boolean(flow.singleUtterance);
    const utterance = (flow.assistantResponse || "").trim();
    const extraPrompt = (q.prompt || "").trim();
    const primaryUtterance = utterance || extraPrompt;
    const safetyOrProgramPrompt = Boolean(utterance && extraPrompt && extraPrompt !== utterance);
    const active = single
      ? { reflection: null, question: primaryUtterance }
      : interviewActivePresentation({
          response: flow.assistantResponse || flow.reflection?.text || "",
          question: q.prompt,
        });
    const step = quizStepFromQuestionId(q.id);
    const quizKicker = quizExploreKicker(step);
    const thinkLine = quizThinkCopy(waitMs, step);

    return shell(
      <div
        className="qc-enter flex flex-col gap-5 pb-8 pt-4"
        data-insight-runtime={flow.conversationRuntime === "insight_v1" ? "analysis_interview_insight_v1" : undefined}
      >
        {interview || quizPhase ? (
          <div>
            <p className="ax-kicker">
              <AiMark pulse={quizThinking || interviewThinking} reconsider={reconsiderPulse} />
              {interview ? "深入了解" : quizThinking ? "正在更了解你" : quizKicker}
            </p>
            {quizPhase ? <QuizExploreDots step={step} /> : null}
            {interview ? (
              <p className="qc-caption mt-2">剛才的答案只是線索，我會以你現在親口說的為準。</p>
            ) : (
              <p className="qc-caption mt-2">AI 探索中</p>
            )}
          </div>
        ) : (
          <section className="space-y-2" aria-label="分析進度">
            {flow.progressStages.map((stage) => (
              <div key={stage.id} className="qc-caption flex items-start gap-2">
                <span aria-hidden>{stage.done ? "✓" : stage.active ? "●" : "○"}</span>
                <span className={stage.active ? "font-medium text-[var(--qc-text)]" : undefined}>
                  {stage.label}
                </span>
              </div>
            ))}
          </section>
        )}

        {interview && !single && !busy && active.reflection ? (
          <section className="qc-surface-soft space-y-2 px-5 py-4" aria-label="剛才聽到的">
            <p className="qc-caption">剛才聽到的</p>
            <p className="qc-body text-[0.98rem] leading-7 text-[var(--qc-text)]">{active.reflection}</p>
          </section>
        ) : null}
        {!interview && flow.reflection ? (
          <section className="qc-card space-y-2 p-5" aria-label="我聽到的">
            <p className="qc-caption font-medium tracking-[0.06em] text-[var(--qc-accent-rose)]">
              {flow.reflection.kicker}
            </p>
            <p className="qc-body text-[0.98rem] leading-7 text-[var(--qc-text)]">{flow.reflection.text}</p>
          </section>
        ) : null}

        {quizThinking ? null : interview && busy && pendingAnswer ? null : single && primaryUtterance ? (
          <h1 className="ax-msg" data-interview-single-utterance="true">
            {primaryUtterance}
          </h1>
        ) : interview && busy && pendingAnswer ? null : active.question ? (
          <h1 className="ax-msg" data-interview-active-question="true">
            {active.question}
          </h1>
        ) : interview && !active.reflection ? (
          <p className="qc-body text-[0.98rem] leading-7 text-[var(--qc-text)]" data-interview-reflection-only="true">
            用你自己的話繼續說就好。
          </p>
        ) : interview ? null : (
          <h1 className="ax-msg">{q.prompt}</h1>
        )}
        {single && safetyOrProgramPrompt && !(busy && pendingAnswer) ? (
          <p className="qc-body text-[0.98rem] leading-7 text-[var(--qc-text)]" data-interview-safety-prompt="true">
            {extraPrompt}
          </p>
        ) : null}
        {interview && !(busy && pendingAnswer) ? (
          <p className="qc-caption">
            {single || active.question ? "用你自己的話回答就好。不一定要選下面的選項。" : "用你自己的話繼續說就好。"}
          </p>
        ) : !interview && q.helpText ? (
          <p className="qc-caption">{q.helpText}</p>
        ) : !interview && q.type === "free_text" ? (
          <p className="qc-caption">不用想得太完整，照你現在想到的寫就好。</p>
        ) : null}

        {interview ? (
          <div className="space-y-4">
            {pendingAnswer ? (
              <section className="ax-user-said" aria-label="你剛說的">
                {pendingAnswer}
              </section>
            ) : (
              <div className="ax-composer">
                <p className="qc-caption mb-2">直接跟我說就好。</p>
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  maxLength={q.maxLength ?? 400}
                  rows={4}
                  disabled={busy}
                  placeholder="用你自己的話說"
                  className="min-h-[5.5rem] w-full"
                />
                <div className="mt-3">
                  <QuizPrimaryButton
                    disabled={busy || (!pendingAnswer && !freeText.trim())}
                    onClick={() =>
                      void postAction({
                        action: "answer",
                        questionId: q.id,
                        value: pendingAnswer ?? freeText,
                      })
                    }
                  >
                    {busy ? "繼續" : error && pendingAnswer ? "再試一次" : "送出"}
                  </QuizPrimaryButton>
                </div>
              </div>
            )}
            <div className="flex min-h-[2.75rem] items-center" aria-live="polite">
              {busy && pendingAnswer ? (
                <p className="qc-caption analysis-wait-copy ax-think-line">
                  {interviewWaitCopy(waitMs).text ?? (
                    <span className="analysis-wait-dot" aria-hidden>
                      ·
                    </span>
                  )}
                </p>
              ) : null}
            </div>
            {pendingAnswer ? (
              <QuizPrimaryButton
                disabled={busy || (!pendingAnswer && !freeText.trim())}
                onClick={() =>
                  void postAction({
                    action: "answer",
                    questionId: q.id,
                    value: pendingAnswer ?? freeText,
                  })
                }
              >
                {busy ? "繼續" : error && pendingAnswer ? "再試一次" : "繼續"}
              </QuizPrimaryButton>
            ) : null}
            {q.options && q.options.length > 0 && !busy ? (
              <div className="space-y-3 pt-2">
                <p className="qc-caption">不知道怎麼說？可以選一個比較接近的</p>
                {q.options.map((opt) => (
                  <QuizOptionButton
                    key={opt.id}
                    selected={false}
                    onClick={() => {
                      if (!busy) void postAction({ action: "answer", questionId: q.id, value: opt.label });
                    }}
                  >
                    {opt.label}
                  </QuizOptionButton>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {!interview && (q.type === "single" || q.type === "yes_no" || q.type === "single_choice") ? (
          <div className="space-y-3">
            {quizThinking && pendingAnswer ? (
              <div className="space-y-3">
                <QuizOptionButton selected onClick={() => undefined}>
                  {pendingAnswer}
                </QuizOptionButton>
                <div className="ax-think" aria-live="polite" aria-label="等待動畫，不是真實完成百分比">
                  {waitMs >= 800 ? (
                    <p className="ax-think-line">{thinkLine || "正在理解你的選擇"}</p>
                  ) : null}
                </div>
              </div>
            ) : (
              (q.type === "yes_no"
                ? [
                    { id: "yes", label: "有" },
                    { id: "no", label: "沒有" },
                  ]
                : q.options ?? []
              ).map((opt) => (
                <QuizOptionButton
                  key={opt.id}
                  selected={pendingOptionId === opt.id}
                  onClick={() => {
                    if (busy) return;
                    setPendingOptionId(opt.id);
                    void postAction(
                      { action: "answer", questionId: q.id, value: opt.id },
                      opt.label,
                    );
                  }}
                >
                  {opt.label}
                </QuizOptionButton>
              ))
            )}
          </div>
        ) : null}

        {!interview && (q.type === "multi" || q.type === "multi_select") ? (
          <div className="space-y-3">
            {(q.options ?? []).map((opt) => (
              <QuizOptionButton
                key={opt.id}
                selected={multiSelected.includes(opt.id)}
                onClick={() => {
                  setMultiSelected((prev) =>
                    prev.includes(opt.id) ? prev.filter((id) => id !== opt.id) : [...prev, opt.id],
                  );
                }}
              >
                {opt.label}
              </QuizOptionButton>
            ))}
            <QuizPrimaryButton
              disabled={busy || multiSelected.length === 0}
              onClick={() => void postAction({ action: "answer", questionId: q.id, value: multiSelected })}
            >
              {busy ? "正在更了解你" : "繼續"}
            </QuizPrimaryButton>
          </div>
        ) : null}

        {!interview && q.type === "scale" ? (
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: (q.scaleMax ?? 5) - (q.scaleMin ?? 1) + 1 }, (_, i) => {
              const value = (q.scaleMin ?? 1) + i;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={busy}
                  onClick={() => void postAction({ action: "answer", questionId: q.id, value })}
                  className="rounded-[1rem] border border-[var(--qc-border)] bg-[var(--qc-surface)] py-4 text-lg font-semibold text-[var(--qc-text)] disabled:opacity-50"
                >
                  {value}
                </button>
              );
            })}
            <p className="col-span-5 mt-2 flex justify-between text-xs text-[var(--qc-text-muted)]">
              <span>{q.scaleLabels?.min}</span>
              <span>{q.scaleLabels?.max}</span>
            </p>
          </div>
        ) : null}

        {!interview && q.type === "free_text" ? (
          <div className="space-y-4">
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              maxLength={q.maxLength ?? 200}
              rows={4}
              placeholder="用一句話寫下就好"
              className="min-h-[7rem] w-full rounded-[1.25rem] border border-[var(--qc-border)] bg-[var(--qc-surface)] px-4 py-4 text-base leading-7 text-[var(--qc-text)] outline-none"
            />
            <QuizPrimaryButton
              disabled={busy || !freeText.trim()}
              onClick={() => void postAction({ action: "answer", questionId: q.id, value: freeText })}
            >
              {busy ? "正在更了解你" : "繼續"}
            </QuizPrimaryButton>
          </div>
        ) : null}

        {!interview && q.type === "number_pair" ? (
          <div className="space-y-4">
            <label className="block">
              <span className="qc-caption mb-2 block">身高（大約即可）</span>
              <input
                inputMode="decimal"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="min-h-[44px] w-full rounded-[1.25rem] border border-[var(--qc-border)] bg-[var(--qc-surface)] px-4 py-4 text-base"
                aria-label="身高公分"
              />
            </label>
            <label className="block">
              <span className="qc-caption mb-2 block">體重（大約即可）</span>
              <input
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="min-h-[44px] w-full rounded-[1.25rem] border border-[var(--qc-border)] bg-[var(--qc-surface)] px-4 py-4 text-base"
                aria-label="體重公斤"
              />
            </label>
            <QuizPrimaryButton
              disabled={busy || !height || !weight}
              onClick={() =>
                void postAction({
                  action: "answer",
                  questionId: q.id,
                  value: { height_cm: Number(height), weight_kg: Number(weight) },
                })
              }
            >
              {busy ? "正在更了解你" : "繼續"}
            </QuizPrimaryButton>
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </div>,
    );
  }

  const layer1 = flow.layer1;
  const ai = flow.aiReport;
  const generating =
    flow.analysisState === "ai_generating" ||
    flow.analysisState === "basic_report_ready" ||
    (!ai && flow.analysisState !== "ai_failed" && flow.analysisState !== "ai_ready");

  if (revealHold || (generating && !ai && !layer1)) {
    return shell(
      <div className="ax-synth qc-enter">
        <AiMark pulse />
        <h1>好了。</h1>
        <p className="qc-body text-[1.05rem]">
          前面的測驗讓我看到一些線索，
          <br />
          但剛剛你親口說的內容，
          <br />
          讓結果有些地方改變了。
        </p>
        <p className="ax-think-line">正在整理你的分析…</p>
      </div>,
    );
  }

  return shell(
    <div className="qc-enter flex flex-col gap-7 pb-10 pt-4">
      <div className="space-y-2">
        <p className="ax-kicker">
          <AiMark />
          你的減脂卡關分析
        </p>
        <h1 className="qc-display text-[1.65rem]">{quiz.respondentName}的個人整理</h1>
        <p className="qc-caption">{flow.canLeaveMessage}</p>
      </div>

      {flow.singleUtterance && (flow.assistantResponse || "").trim() ? (
        <section className="qc-surface-soft space-y-2 px-5 py-4" data-interview-last-utterance="true">
          <p className="qc-body text-[0.98rem] leading-7 text-[var(--qc-text)]">{flow.assistantResponse}</p>
        </section>
      ) : null}

      {generating && !ai ? (
        <section className="ax-think" aria-live="polite">
          <p className="ax-think-line">正在整理你的分析…</p>
        </section>
      ) : null}

      {layer1?.safety.flagged && layer1.safety.guidance ? (
        <section className="qc-card px-5 py-4 text-[0.95rem] leading-7 text-[var(--qc-text-secondary)]">
          {layer1.safety.guidance}
        </section>
      ) : null}

      {layer1 && !ai ? (
        <AnalysisInsightCard
          coreStuck={
            layer1.sections.coreStuck ?? layer1.sections.mainStuckPoint ?? "我們已收到你的回答。"
          }
          changeState={layer1.sections.changeState}
          showGenerating={generating}
          progressCopy={
            layer1.sections.progress ??
            "正在整理你的個人分析。你可以先離開，完成後再回來看。"
          }
        />
      ) : null}

      {ai ? (
        <div className="space-y-5">
          <AnalysisReportHeader
            respondentName={quiz.respondentName}
            animalName={quiz.animalName}
            tagline={quiz.tagline}
            summary={quiz.headline}
            coreInsight={quiz.coreInsight}
          />
          <AnalysisReportSections report={ai} />
        </div>
      ) : flow.analysisState === "ai_failed" ? (
        <section className="qc-surface-soft px-5 py-4 text-[0.95rem] leading-7 text-[var(--qc-text-secondary)]">
          個人化分析這次沒有完成，但上面的即時整理會一直保留。你可以稍後再開這個連結。
        </section>
      ) : (
        <section className="qc-caption px-1">
          你可以先看上面的即時整理。完整個人分析完成後會自動更新；也可以先離開，稍後再回來。
        </section>
      )}

      {ai && flow.analysisState === "ai_ready" ? (
        <div
          data-analysis-cta-slot="p3"
          data-p3-ready="false"
          data-p3-conversion="post-report"
          aria-hidden="true"
          className="min-h-0"
        />
      ) : null}
    </div>,
  );
}
