"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnalysisFlowPage } from "@/components/analysis/AnalysisFlowPage";
import {
  ResetConversationView,
  ResetQuizView,
  ResetReportView,
  ResetRevealView,
} from "@/components/reset/ResetExperienceViews";
import { ResetShell } from "@/components/reset/ResetShell";
import { takeResetBootExperience } from "@/lib/analysis/reset/reset-boot-cache";
import { RESET_THINKING_LINES } from "@/lib/analysis/reset/reset-animals";
import type { Experience21dConsumerChannel } from "@/lib/analysis/handoff/experience-21d-contact";
import type { ResetPublicView } from "@/lib/analysis/reset/reset-contract";

export function AnalysisExperienceSwitch({ token }: { token: string }) {
  const [mode, setMode] = useState<"loading" | "reset" | "legacy">("loading");
  const [experience, setExperience] = useState<ResetPublicView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/analysis/reset/${encodeURIComponent(token)}`);
    if (res.status === 404) {
      setMode("legacy");
      return;
    }
    const data = (await res.json()) as { ok?: boolean; kind?: string; experience?: ResetPublicView; error?: string };
    if (!res.ok) throw new Error(data.error ?? "無法載入");
    if (data.kind === "legacy") {
      setMode("legacy");
      return;
    }
    if (!data.experience) throw new Error("無法載入");
    setExperience(data.experience);
    setMode("reset");
  }, [token]);

  // Boot from create-session stash before paint; only network-load when stash miss.
  useLayoutEffect(() => {
    let cancelled = false;
    const boot = takeResetBootExperience(token);
    if (boot) {
      setExperience(boot);
      setMode("reset");
      return () => {
        cancelled = true;
      };
    }
    void load()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "無法載入");
      });
    return () => {
      cancelled = true;
    };
  }, [token, load]);

  if (error) {
    return (
      <ResetShell act="quiz">
        <p className="rx-body py-16 text-center">{error}</p>
      </ResetShell>
    );
  }
  if (mode === "loading") {
    return (
      <ResetShell act="quiz">
        <p className="rx-whisper py-16 text-center">載入中…</p>
      </ResetShell>
    );
  }
  if (mode === "legacy" || !experience) {
    return <AnalysisFlowPage token={token} />;
  }
  return <ResetExperiencePage token={token} initial={experience} onReload={load} />;
}

function ResetExperiencePage({
  token,
  initial,
  onReload,
}: {
  token: string;
  initial: ResetPublicView;
  onReload: () => Promise<void>;
}) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thinkIndex, setThinkIndex] = useState(0);
  const [contactName, setContactName] = useState("");
  const [contactChannel, setContactChannel] = useState<Experience21dConsumerChannel>("line");
  const [contactValue, setContactValue] = useState("");

  useEffect(() => {
    if (!busy) {
      setThinkIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setThinkIndex((index) => (index + 1) % RESET_THINKING_LINES.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function post(body: Record<string, unknown>, display?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (display) {
      setPendingUser(display);
      setDraft("");
    }
    try {
      const res = await fetch(`/api/analysis/reset/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; experience?: ResetPublicView; error?: string };
      if (!res.ok || !data.experience) throw new Error(data.error ?? "儲存失敗");
      setView(data.experience);
      setPendingUser(null);
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
      if (view.act === "conversation") await onReload().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  if (view.act === "quiz" && view.quiz.question) {
    const q = view.quiz.question;
    return (
      <ResetQuizView
        current={view.quiz.current}
        total={view.quiz.total}
        question={q}
        selectedId={selectedId}
        busy={busy}
        error={error}
        onChoose={(optionId) => {
          setSelectedId(optionId);
          void post({ action: "quiz_answer", questionId: q.id, optionId });
        }}
      />
    );
  }

  if (view.act === "reveal" && view.animal) {
    return (
      <ResetRevealView
        animal={view.animal}
        busy={busy}
        error={error}
        onContinue={() => void post({ action: "start_conversation" })}
      />
    );
  }

  if (view.act === "conversation") {
    return (
      <ResetConversationView
        animalName={view.animal?.animalName ?? null}
        animalType={view.animal?.type ?? null}
        turns={view.conversation.turns}
        pendingUser={pendingUser}
        busy={busy}
        draft={draft}
        error={error}
        thinkingLine={RESET_THINKING_LINES[thinkIndex] ?? RESET_THINKING_LINES[0]}
        onDraftChange={setDraft}
        onSubmit={() => {
          const value = draft.trim();
          if (!value) return;
          void post({ action: "chat", value }, value);
        }}
      />
    );
  }

  return (
    <ResetReportView
      animal={view.animal}
      report={view.report}
      safetyGuidance={view.safetyGuidance}
      generating={!view.report}
      sessionToken={token}
      handoff={view.handoff}
      handoffUi={
        view.handoff?.interest.state === "created"
          ? "success"
          : view.handoff?.interest.state === "needs_contact"
            ? "contact"
            : "offer"
      }
      contactName={contactName}
      contactChannel={contactChannel}
      contactValue={contactValue}
      busy={busy}
      error={error}
      onPrimary={() => {
        router.push(`/experience/21d/${encodeURIComponent(token)}`);
      }}
      onSecondary={() => document.querySelector(".rx-report-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      onContactName={setContactName}
      onContactChannel={(channel) => {
        setContactChannel(channel);
        setContactValue("");
      }}
      onContactValue={setContactValue}
      onSubmitContact={() => {
        router.push(`/experience/21d/${encodeURIComponent(token)}`);
      }}
    />
  );
}
