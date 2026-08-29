"use client";

import { FormEvent, useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { Go21ProgressMilestone } from "@/types/go21";
import { GO21_PRIMARY_DIRECTION_LABELS, GO21_PRIMARY_DIRECTIONS } from "@/types/go21";
import {
  GO21_CHAT_FOLLOW_RETRY_MS,
  computeScrollTopForLatest,
  programmaticScrollLockMs,
  resolveChatScrollStickState,
  resolveGo21ShellViewportHeightPx,
  shouldFollowOnAssistantArrival,
} from "@/lib/go21/chat-scroll";
import { nextClientRequestId, interpretGo21ChatSendResult, type Go21SendStatus } from "@/lib/go21/conversation-quality";
import "./go21.css";

type Go21Turn = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  channel?: string | null;
  photoUrl?: string | null;
  mealSlotUnresolved?: boolean;
};

type Go21ContextPayload = {
  brandName: string;
  brandSubtitle: string;
  isGo21: boolean;
  go21StartedAt: string | null;
  dayNumber: number | null;
  dayTotal: number;
  milestones: Go21ProgressMilestone[];
  customerProfile: {
    displayName: string;
    sex: string | null;
    birthDate: string | null;
    birthYear: number | null;
    heightCm: number | null;
  };
  latestBody: {
    weightKg: number | null;
    bodyFatPercent: number | null;
    skeletalMuscleKg: number | null;
    visceralFatLevel: number | null;
    basalMetabolicRate: number | null;
  } | null;
  needsBaseline: boolean;
  needsGoal: boolean;
  goal: {
    primaryDirection: string;
    primaryDirectionLabel: string;
    personalGoal: string;
    targetWeightKg: number | null;
    originalPersonalGoal: string | null;
    wasRefined: boolean;
    setAt: string;
  } | null;
  turns: Go21Turn[];
  pendingCoachReply?: {
    customerTurnId: string;
    clientRequestId: string;
    content: string;
    logDate: string;
  } | null;
  reminders: Array<{ id: string; kind: string; message: string; dueAt: string }>;
};

export function Go21App({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<Go21ContextPayload | null>(null);
  const [view, setView] = useState<"baseline" | "goal" | "start" | "chat" | "progress">("chat");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendStatus, setSendStatus] = useState<Go21SendStatus>("idle");
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [sendLock, setSendLock] = useState(false);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const threadContentRef = useRef<HTMLDivElement>(null);
  const latestAnchorRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const stickToBottomRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const programmaticScrollTimerRef = useRef<number | null>(null);
  const followTimersRef = useRef<number[]>([]);
  const followGenRef = useRef(0);
  const inFlightRequestIdRef = useRef<string | null>(null);
  const failedPayloadRef = useRef<{
    text: string;
    photoFile: File | null;
    clientRequestId: string;
    photoUploaded: boolean;
    mealSlotHint: "breakfast" | "lunch" | "dinner" | null;
    logDate: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  const reload = useCallback(async () => {
    setError(null);
    const response = await fetch(`/api/coaching/portal/${encodeURIComponent(token)}/go21/context`);
    const payload = (await response.json()) as { ok?: boolean; go21?: Go21ContextPayload; error?: string };
    if (!response.ok || !payload.ok || !payload.go21) {
      throw new Error(payload.error ?? "無法載入");
    }
    setCtx(payload.go21);
    if (payload.go21.needsBaseline && !payload.go21.go21StartedAt) {
      setView("baseline");
    } else if (payload.go21.needsGoal) {
      setView("goal");
    } else if (!payload.go21.go21StartedAt) {
      setView("start");
    } else {
      setView("chat");
    }
    return payload.go21;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await reload();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "無法載入");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // Recover coach-response retry after reload when customer turn is durable but unanswered.
  useEffect(() => {
    if (loading || busy) return;
    if (sendStatus === "sending" || sendStatus === "customer_sent" || sendStatus === "failed") {
      return;
    }
    const pending = ctx?.pendingCoachReply;
    if (pending?.clientRequestId) {
      failedPayloadRef.current = {
        text: pending.content,
        photoFile: null,
        clientRequestId: pending.clientRequestId,
        photoUploaded: true,
        mealSlotHint: null,
        logDate: pending.logDate || resolveGo21ClientLogDate(pending.content),
      };
      inFlightRequestIdRef.current = pending.clientRequestId;
      if (sendStatus !== "coach_failed") setSendStatus("coach_failed");
      return;
    }
    if (sendStatus === "coach_failed") {
      setSendStatus("idle");
      failedPayloadRef.current = null;
    }
  }, [ctx?.pendingCoachReply, loading, busy, sendStatus]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    if (!stickToBottomRef.current) {
      setShowJumpLatest(true);
      return;
    }
    // auto is more reliable than smooth on iPhone after content/layout changes
    schedulePinToLatest("auto");
    setShowJumpLatest(false);
  }, [ctx?.turns.length, pendingUser, busy, sendStatus, photoPreview]);

  useEffect(() => {
    const content = threadContentRef.current;
    const composer = composerRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;

    const onLayoutChange = () => {
      if (!stickToBottomRef.current) return;
      scrollThreadToLatest("auto");
    };

    const ro = new ResizeObserver(onLayoutChange);
    ro.observe(content);
    if (composer) ro.observe(composer);

    // Photo decode changes height after first paint — catch bubble <img> loads.
    const onLoadCapture = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      if (!content.contains(target) && !(composer && composer.contains(target))) return;
      onLayoutChange();
    };
    content.addEventListener("load", onLoadCapture, true);
    composer?.addEventListener("load", onLoadCapture, true);

    return () => {
      ro.disconnect();
      content.removeEventListener("load", onLoadCapture, true);
      composer?.removeEventListener("load", onLoadCapture, true);
    };
  }, [view, ctx?.turns.length, pendingUser, photoPreview]);

  // Keep shell height inside the real iPhone visual viewport (keyboard / browser chrome).
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof window === "undefined") return;

    const apply = () => {
      const px = resolveGo21ShellViewportHeightPx({
        visualViewportHeight: window.visualViewport?.height ?? null,
        windowInnerHeight: window.innerHeight,
      });
      shell.style.setProperty("--go21-vvh", `${px}px`);
      if (stickToBottomRef.current) {
        scrollThreadToLatest("auto");
      }
    };

    apply();
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("scroll", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("scroll", apply);
    };
  }, [view]);

  useEffect(() => {
    return () => {
      if (programmaticScrollTimerRef.current != null) {
        window.clearTimeout(programmaticScrollTimerRef.current);
      }
      clearFollowTimers();
    };
  }, []);

  function clearFollowTimers() {
    for (const id of followTimersRef.current) window.clearTimeout(id);
    followTimersRef.current = [];
  }

  function markProgrammaticScroll(durationMs: number) {
    programmaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current != null) {
      window.clearTimeout(programmaticScrollTimerRef.current);
    }
    programmaticScrollTimerRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false;
      programmaticScrollTimerRef.current = null;
    }, durationMs);
  }

  function scrollThreadToLatest(_behavior: ScrollBehavior = "auto") {
    const el = threadRef.current;
    if (!el) return;
    // Never use scrollIntoView — on iOS it can scroll the document and tuck
    // the newest bubble under the composer.
    markProgrammaticScroll(programmaticScrollLockMs("auto"));
    const top = computeScrollTopForLatest({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
    el.scrollTop = top;
  }

  /** Re-pin while stick is true — does not re-engage after intentional upward scroll. */
  function schedulePinToLatest(_behavior: ScrollBehavior = "auto") {
    if (!stickToBottomRef.current) return;
    const gen = ++followGenRef.current;
    clearFollowTimers();

    const run = () => {
      if (followGenRef.current !== gen) return;
      if (!stickToBottomRef.current) return;
      scrollThreadToLatest("auto");
    };

    run();
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });

    for (const delay of GO21_CHAT_FOLLOW_RETRY_MS) {
      if (delay === 0) continue;
      const id = window.setTimeout(run, delay);
      followTimersRef.current.push(id);
    }
  }

  /** Customer send: always re-engage follow so the new bubble is visible. */
  function followLatestConversation() {
    stickToBottomRef.current = true;
    setShowJumpLatest(false);
    schedulePinToLatest("auto");
  }

  function onThreadScroll() {
    const el = threadRef.current;
    if (!el) return;
    const next = resolveChatScrollStickState({
      programmatic: programmaticScrollRef.current,
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      thresholdPx: 120,
    });
    if (!next) return;
    stickToBottomRef.current = next.stick;
    setShowJumpLatest(next.showJump);
  }

  function jumpToLatest() {
    followLatestConversation();
  }

  useEffect(() => {
    // Inject Go21-scoped manifest for installable customer experience
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = `/c/${encodeURIComponent(token)}/go21/manifest.webmanifest`;
    link.dataset.go21 = "1";
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, [token]);

  async function saveBaseline(form: {
    sex: string;
    birthYear: string;
    heightCm: string;
    weightKg: string;
    bodyFatPercent: string;
    skeletalMuscleKg: string;
    visceralFatLevel: string;
    basalMetabolicRate: string;
    skipOptional: boolean;
  }) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/coaching/portal/${encodeURIComponent(token)}/go21/baseline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sex: form.sex,
          birthYear: form.birthYear ? Number(form.birthYear) : null,
          heightCm: Number(form.heightCm),
          weightKg: Number(form.weightKg),
          bodyFatPercent: form.bodyFatPercent ? Number(form.bodyFatPercent) : null,
          skeletalMuscleKg: form.skeletalMuscleKg ? Number(form.skeletalMuscleKg) : null,
          visceralFatLevel: form.visceralFatLevel ? Number(form.visceralFatLevel) : null,
          basalMetabolicRate: form.basalMetabolicRate ? Number(form.basalMetabolicRate) : null,
          skipOptional: form.skipOptional,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "儲存失敗");
      await reload();
      // After baseline, goal screen if needed (reload sets view)
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  async function saveGoal(form: {
    primaryDirection: string;
    personalGoal: string;
    targetWeightKg: string;
  }) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/coaching/portal/${encodeURIComponent(token)}/go21/goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryDirection: form.primaryDirection,
          personalGoal: form.personalGoal,
          targetWeightKg: form.targetWeightKg ? Number(form.targetWeightKg) : null,
          source: "onboarding",
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        safety?: { message?: string | null; caution?: boolean };
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? payload.safety?.message ?? "儲存失敗");
      }
      await reload();
      if (!ctx?.go21StartedAt) setView("start");
      else setView("chat");
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  async function startExperience() {
    if (sendLock) return;
    setSendLock(true);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/coaching/portal/${encodeURIComponent(token)}/go21/start`, {
        method: "POST",
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "無法開始");
      await reload();
      setView("chat");
    } catch (e) {
      setError(e instanceof Error ? e.message : "無法開始");
    } finally {
      setBusy(false);
      setSendLock(false);
    }
  }

  async function sendMessage(options?: { retry?: boolean; retryAssistant?: boolean }) {
    if (sendLock || busy) return;

    const retryingMessage = Boolean(options?.retry && failedPayloadRef.current && sendStatus === "failed");
    const retryingAssistant = Boolean(
      options?.retryAssistant && failedPayloadRef.current && sendStatus === "coach_failed",
    );
    const retrying = retryingMessage || retryingAssistant;
    const failed = failedPayloadRef.current;

    const text = retrying ? failed!.text : draft.trim();
    const activePhoto = retrying ? failed!.photoFile : photoFile;
    if (!text && !activePhoto) return;

    const mealSlotHint = retrying
      ? failed!.mealSlotHint
      : /午餐|中餐|中午/.test(text)
        ? ("lunch" as const)
        : /早餐|早上/.test(text)
          ? ("breakfast" as const)
          : /晚餐|晚上/.test(text)
            ? ("dinner" as const)
            : null;
    const logDate = retrying ? failed!.logDate : resolveGo21ClientLogDate(text);
    const clientRequestId = nextClientRequestId(
      retrying ? failed!.clientRequestId : inFlightRequestIdRef.current,
    );
    inFlightRequestIdRef.current = clientRequestId;

    setSendLock(true);
    setBusy(true);
    setSendStatus(retryingAssistant ? "customer_sent" : "sending");
    setError(null);
    setPendingUser(text || (activePhoto ? "📷 照片" : null));
    // Actively chatting → pin to latest so send + reply don't require manual scroll.
    followLatestConversation();
    // Keep draft until authoritative acceptance — restore certainty for the user.
    if (!retrying) setDraft("");

    let photoUploaded = retrying ? failed!.photoUploaded : false;
    try {
      if (activePhoto && !photoUploaded) {
        const uploadSlot = mealSlotHint ?? "snacks";
        const form = new FormData();
        form.append("photo", activePhoto);
        form.append("logDate", logDate);
        const upload = await fetch(
          `/api/coaching/portal/${encodeURIComponent(token)}/meals/${uploadSlot}/photo`,
          { method: "POST", body: form },
        );
        photoUploaded = upload.ok;
        if (!upload.ok) {
          throw new Error("照片上傳失敗，請重試");
        }
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 45000);
      let response: Response;
      try {
        response = await fetch(`/api/coaching/portal/${encodeURIComponent(token)}/go21/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message: text || undefined,
            hasPhoto: Boolean(activePhoto),
            photoUploaded,
            mealSlotHint,
            logDate,
            clientRequestId,
            retryAssistant: retryingAssistant || undefined,
          }),
        });
      } finally {
        window.clearTimeout(timeout);
      }

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        coachMessage?: string | null;
        customerAccepted?: boolean;
        assistantStatus?: string | null;
        assistantError?: { message?: string; retryable?: boolean };
      };

      const interpreted = interpretGo21ChatSendResult(payload);

      if (interpreted.customerSent) {
        // Customer message is durably accepted — clear composer certainty.
        failedPayloadRef.current = interpreted.coachFailed
          ? {
              text,
              photoFile: activePhoto,
              clientRequestId,
              photoUploaded,
              mealSlotHint,
              logDate,
            }
          : null;
        if (!interpreted.coachFailed) {
          inFlightRequestIdRef.current = null;
        }
        setPhotoFile(null);
        if (photoPreview) URL.revokeObjectURL(photoPreview);
        setPhotoPreview(null);
        setPhotoMenuOpen(false);
        setDraft("");
        // If user scrolled up while waiting, do not yank them back on AI arrival.
        if (shouldFollowOnAssistantArrival(stickToBottomRef.current)) {
          schedulePinToLatest("auto");
        }
        await reload();
        startTransition(() => {
          setPendingUser(null);
          if (interpreted.coachFailed) {
            setSendStatus("coach_failed");
            setError(null);
          } else {
            setSendStatus("idle");
            setError(null);
          }
        });
        return;
      }

      if (!response.ok || !payload.ok || interpreted.messageRetry) {
        throw new Error(payload.error ?? "送出失敗");
      }

      failedPayloadRef.current = null;
      inFlightRequestIdRef.current = null;
      setPhotoFile(null);
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
      setPhotoMenuOpen(false);
      setDraft("");
      if (shouldFollowOnAssistantArrival(stickToBottomRef.current)) {
        schedulePinToLatest("auto");
      }
      await reload();
      startTransition(() => {
        setPendingUser(null);
        setSendStatus("idle");
      });
    } catch (e) {
      const message =
        e instanceof Error
          ? e.name === "AbortError"
            ? "連線逾時，請重試"
            : e.message
          : "送出失敗";
      failedPayloadRef.current = {
        text,
        photoFile: activePhoto,
        clientRequestId,
        photoUploaded,
        mealSlotHint,
        logDate,
      };
      setError(message);
      setDraft(text);
      setSendStatus("failed");
      // Keep pending bubble so the user sees what they tried to send.
    } finally {
      setBusy(false);
      setSendLock(false);
    }
  }

  function onPickPhoto(file: File | null) {
    setPhotoFile(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
    setPhotoMenuOpen(false);
    if (sendStatus === "failed") {
      setSendStatus("idle");
      setError(null);
      failedPayloadRef.current = null;
      inFlightRequestIdRef.current = null;
    }
  }

  if (loading) {
    return (
      <div ref={shellRef} className="go21-shell">
        <p className="go21-muted">載入中…</p>
      </div>
    );
  }

  if (!ctx) {
    return (
      <div ref={shellRef} className="go21-shell">
        <p className="go21-error">{error ?? "無法開啟連結"}</p>
      </div>
    );
  }

  return (
    <div ref={shellRef} className="go21-shell">
      <header className="go21-header">
        <div>
          <p className="go21-brand">{ctx.brandName}</p>
          <p className="go21-sub">{ctx.brandSubtitle}</p>
        </div>
        <div className="go21-day">
          Day {ctx.dayNumber ?? "—"} / {ctx.dayTotal}
        </div>
        <button type="button" className="go21-linkish" onClick={() => setView(view === "progress" ? "chat" : "progress")}>
          {view === "progress" ? "回到對話" : "進度"}
        </button>
      </header>

      {error ? <p className="go21-error">{error}</p> : null}

      {view === "baseline" ? (
        <BaselineForm
          busy={busy}
          profile={ctx.customerProfile}
          latest={ctx.latestBody}
          onSubmit={saveBaseline}
        />
      ) : null}

      {view === "goal" ? (
        <GoalForm
          busy={busy}
          currentWeightKg={ctx.latestBody?.weightKg ?? null}
          existing={ctx.goal}
          onSubmit={saveGoal}
        />
      ) : null}

      {view === "start" ? (
        <div className="go21-start">
          <p className="go21-brand" style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
            Baki Go 21
          </p>
          <div className="go21-teach">
            <p>
              接下來 21 天，我會陪你一起把飲食慢慢調整好。
              不用記熱量，也不用每天填一堆表格。
            </p>
            <p>吃了什麼、遇到什麼狀況，直接跟我說就好。</p>
          </div>
          <button
            type="button"
            className="go21-cta"
            disabled={busy || sendLock}
            onClick={() => void startExperience()}
          >
            開始 Day 1
          </button>
        </div>
      ) : null}

      {view === "progress" ? (
        <div className="go21-progress">
          <h2>我的進度</h2>
          <ul>
            {ctx.milestones.map((m) => (
              <li key={m.day} className={m.completed ? "is-done" : m.reached ? "is-now" : ""}>
                Day {m.day} — {m.label}
                {m.optional ? "（選用）" : ""}
                {m.completed ? " ✓" : ""}
              </li>
            ))}
          </ul>
          {ctx.goal ? (
            <div className="go21-data" style={{ marginTop: "1rem" }}>
              <h3>我的 21 天方向</h3>
              <p>{ctx.goal.primaryDirectionLabel}</p>
              <p>{ctx.goal.personalGoal}</p>
              {ctx.goal.targetWeightKg != null ? (
                <p>
                  目標體重：{ctx.goal.targetWeightKg} kg
                  {ctx.latestBody?.weightKg != null
                    ? `（目前 ${ctx.latestBody.weightKg} kg）`
                    : ""}
                </p>
              ) : null}
              <button
                type="button"
                className="go21-linkish"
                style={{ marginTop: "0.5rem" }}
                onClick={() => setView("goal")}
              >
                調整方向
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {view === "chat" ? (
        <div className="go21-chat-panel">
          {ctx.reminders.length > 0 ? (
            <div className="go21-reminder">
              {ctx.reminders[0]!.message}
            </div>
          ) : null}
          <div ref={threadRef} className="go21-thread" onScroll={onThreadScroll}>
            <div ref={threadContentRef} className="go21-thread-content">
              {ctx.turns.map((turn) => (
                <div
                  key={turn.id}
                  className={turn.role === "customer" ? "go21-bubble go21-user" : "go21-bubble go21-ai"}
                >
                  {turn.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="go21-turn-photo" src={turn.photoUrl} alt="餐點照片" />
                  ) : null}
                  {turn.content}
                </div>
              ))}
              {pendingUser && sendStatus === "sending" ? (
                <div className="go21-bubble go21-user">
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="go21-turn-photo" src={photoPreview} alt="" />
                  ) : null}
                  {pendingUser}
                </div>
              ) : null}
              {sendStatus === "sending" ||
              sendStatus === "customer_sent" ||
              (busy && sendStatus !== "failed" && sendStatus !== "coach_failed") ? (
                <div className="go21-thinking">教練正在回覆…</div>
              ) : null}
              {sendStatus === "failed" ? (
                <div className="go21-send-failed">
                  <p>還沒送出成功</p>
                  <button type="button" onClick={() => void sendMessage({ retry: true })}>
                    重試
                  </button>
                </div>
              ) : null}
              {sendStatus === "coach_failed" ? (
                <div className="go21-coach-failed">
                  <p>教練剛剛沒接上</p>
                  <button type="button" onClick={() => void sendMessage({ retryAssistant: true })}>
                    重試回覆
                  </button>
                </div>
              ) : null}
              <div ref={latestAnchorRef} className="go21-thread-anchor" aria-hidden />
            </div>
          </div>
          {showJumpLatest ? (
            <button type="button" className="go21-jump-latest" onClick={jumpToLatest}>
              最新訊息 ↓
            </button>
          ) : null}
          <form
            ref={composerRef}
            className="go21-composer"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            {photoPreview ? (
              <div className="go21-photo-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="即將送出的照片" />
                <button type="button" onClick={() => onPickPhoto(null)}>
                  移除
                </button>
              </div>
            ) : null}
            <div className="go21-composer-bar">
              <div className="go21-attach-wrap">
                <button
                  type="button"
                  className="go21-attach"
                  aria-label="附加照片"
                  aria-expanded={photoMenuOpen}
                  onClick={() => setPhotoMenuOpen((open) => !open)}
                >
                  📷
                </button>
                {photoMenuOpen ? (
                  <div className="go21-photo-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => cameraRef.current?.click()}
                    >
                      拍照
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => libraryRef.current?.click()}
                    >
                      從相簿選擇
                    </button>
                  </div>
                ) : null}
              </div>
              {/* Camera capture — does not remove library option */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
              />
              {/* Photo library / files — no capture attribute */}
              <input
                ref={libraryRef}
                type="file"
                accept="image/*,image/jpeg,image/png,image/webp,image/heic"
                hidden
                onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
              />
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={1}
                placeholder="跟我說說今天吃了什麼…"
                disabled={busy}
                enterKeyHint="send"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              <button type="submit" disabled={busy || sendLock || (!draft.trim() && !photoFile)}>
                送出
              </button>
            </div>
          </form>
        </div>
      ) : null}

    </div>
  );
}

/** Taipei calendar date for upload/chat — mirrors server relative-date extract lightly. */
function resolveGo21ClientLogDate(text: string): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const shift = (days: number) => {
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  };
  if (/前天/.test(text)) return shift(-2);
  if (/昨天|昨日/.test(text)) return shift(-1);
  return today;
}

function GoalForm({
  busy,
  currentWeightKg,
  existing,
  onSubmit,
}: {
  busy: boolean;
  currentWeightKg: number | null;
  existing: Go21ContextPayload["goal"];
  onSubmit: (form: {
    primaryDirection: string;
    personalGoal: string;
    targetWeightKg: string;
  }) => void;
}) {
  const [primaryDirection, setPrimaryDirection] = useState(
    existing?.primaryDirection ?? "",
  );
  const [personalGoal, setPersonalGoal] = useState(existing?.personalGoal ?? "");
  const [targetWeightKg, setTargetWeightKg] = useState(
    existing?.targetWeightKg != null ? String(existing.targetWeightKg) : "",
  );
  const [showTarget, setShowTarget] = useState(existing?.targetWeightKg != null);

  return (
    <form
      className="go21-start go21-goal"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          primaryDirection,
          personalGoal,
          targetWeightKg: showTarget ? targetWeightKg : "",
        });
      }}
    >
      <h2 className="go21-goal-hero">這 21 天，你最想改變什麼？</h2>
      <p className="go21-muted" style={{ marginTop: 0 }}>
        選一個方向就好，之後還可以調整。
      </p>
      <div className="go21-goal-options" role="radiogroup" aria-label="主要方向">
        {GO21_PRIMARY_DIRECTIONS.map((key) => (
          <button
            key={key}
            type="button"
            className={
              primaryDirection === key ? "go21-goal-option is-selected" : "go21-goal-option"
            }
            onClick={() => setPrimaryDirection(key)}
          >
            {GO21_PRIMARY_DIRECTION_LABELS[key]}
          </button>
        ))}
      </div>
      <label className="go21-field">
        <span>21 天後，你最希望自己有什麼改變？</span>
        <textarea
          required
          rows={3}
          value={personalGoal}
          onChange={(e) => setPersonalGoal(e.target.value)}
          placeholder="例如：希望晚餐不要再一直失控"
          maxLength={400}
        />
      </label>
      {!showTarget ? (
        <button
          type="button"
          className="go21-linkish"
          style={{ width: "100%", marginBottom: "0.75rem" }}
          onClick={() => setShowTarget(true)}
        >
          想加一個體重目標？（選填）
        </button>
      ) : (
        <label className="go21-field">
          <span>
            目標體重 kg（選填）
            {currentWeightKg != null ? ` · 目前 ${currentWeightKg}` : ""}
          </span>
          <input
            inputMode="decimal"
            value={targetWeightKg}
            onChange={(e) => setTargetWeightKg(e.target.value)}
            placeholder="例如 68"
          />
        </label>
      )}
      <button
        type="submit"
        className="go21-cta"
        disabled={busy || !primaryDirection || personalGoal.trim().length < 2}
      >
        接著開始
      </button>
    </form>
  );
}

function BaselineForm({
  busy,
  profile,
  latest,
  onSubmit,
}: {
  busy: boolean;
  profile: Go21ContextPayload["customerProfile"];
  latest: Go21ContextPayload["latestBody"];
  onSubmit: (form: {
    sex: string;
    birthYear: string;
    heightCm: string;
    weightKg: string;
    bodyFatPercent: string;
    skeletalMuscleKg: string;
    visceralFatLevel: string;
    basalMetabolicRate: string;
    skipOptional: boolean;
  }) => void;
}) {
  const [sex, setSex] = useState(profile.sex ?? "");
  const [birthYear, setBirthYear] = useState(
    profile.birthYear ? String(profile.birthYear) : profile.birthDate?.slice(0, 4) ?? "",
  );
  const [heightCm, setHeightCm] = useState(profile.heightCm != null ? String(profile.heightCm) : "");
  const [weightKg, setWeightKg] = useState(latest?.weightKg != null ? String(latest.weightKg) : "");
  const [bodyFatPercent, setBodyFatPercent] = useState(
    latest?.bodyFatPercent != null ? String(latest.bodyFatPercent) : "",
  );
  const [skeletalMuscleKg, setSkeletalMuscleKg] = useState(
    latest?.skeletalMuscleKg != null ? String(latest.skeletalMuscleKg) : "",
  );
  const [visceralFatLevel, setVisceralFatLevel] = useState(
    latest?.visceralFatLevel != null ? String(latest.visceralFatLevel) : "",
  );
  const [basalMetabolicRate, setBasalMetabolicRate] = useState(
    latest?.basalMetabolicRate != null ? String(latest.basalMetabolicRate) : "",
  );

  return (
    <form
      className="go21-start"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          sex,
          birthYear,
          heightCm,
          weightKg,
          bodyFatPercent,
          skeletalMuscleKg,
          visceralFatLevel,
          basalMetabolicRate,
          skipOptional: false,
        });
      }}
    >
      <h2 style={{ marginTop: 0 }}>初始身體資料</h2>
      <p style={{ color: "#636366", fontSize: "0.9rem" }}>
        這不是醫療評估，只是讓教練更了解你的起點。有資料的欄位已幫你帶入。
      </p>
      <label className="go21-field">
        <span>生理性別</span>
        <select required value={sex} onChange={(e) => setSex(e.target.value)}>
          <option value="">請選擇</option>
          <option value="female">女性</option>
          <option value="male">男性</option>
          <option value="other">其他</option>
          <option value="prefer_not_to_say">不想說</option>
        </select>
      </label>
      <label className="go21-field">
        <span>出生年（可選）</span>
        <input inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="例如 1990" />
      </label>
      <label className="go21-field">
        <span>身高 (cm)</span>
        <input required inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
      </label>
      <label className="go21-field">
        <span>體重 (kg)</span>
        <input required inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
      </label>
      <p style={{ fontWeight: 600, marginBottom: 0 }}>選填身體組成</p>
      <label className="go21-field">
        <span>體脂 %</span>
        <input inputMode="decimal" value={bodyFatPercent} onChange={(e) => setBodyFatPercent(e.target.value)} />
      </label>
      <label className="go21-field">
        <span>肌肉量 kg</span>
        <input inputMode="decimal" value={skeletalMuscleKg} onChange={(e) => setSkeletalMuscleKg(e.target.value)} />
      </label>
      <label className="go21-field">
        <span>內臟脂肪</span>
        <input inputMode="decimal" value={visceralFatLevel} onChange={(e) => setVisceralFatLevel(e.target.value)} />
      </label>
      <label className="go21-field">
        <span>基礎代謝 BMR</span>
        <input inputMode="numeric" value={basalMetabolicRate} onChange={(e) => setBasalMetabolicRate(e.target.value)} />
      </label>
      <button type="submit" className="go21-cta" disabled={busy}>
        儲存並繼續
      </button>
      <button
        type="button"
        className="go21-linkish"
        style={{ marginTop: "0.75rem", width: "100%" }}
        disabled={busy}
        onClick={() =>
          onSubmit({
            sex,
            birthYear,
            heightCm,
            weightKg,
            bodyFatPercent: "",
            skeletalMuscleKg: "",
            visceralFatLevel: "",
            basalMetabolicRate: "",
            skipOptional: true,
          })
        }
      >
        選填稍後再量，先存基本資料
      </button>
    </form>
  );
}
