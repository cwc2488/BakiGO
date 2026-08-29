"use client";

import { FormEvent, useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { Go21ProgressMilestone } from "@/types/go21";
import "./go21.css";

type Go21Turn = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  channel?: string | null;
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
  turns: Go21Turn[];
  reminders: Array<{ id: string; kind: string; message: string; dueAt: string }>;
};

export function Go21App({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<Go21ContextPayload | null>(null);
  const [view, setView] = useState<"baseline" | "start" | "chat" | "progress">("chat");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sendLock, setSendLock] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
    } else if (!payload.go21.go21StartedAt) {
      setView("start");
    } else {
      setView("chat");
    }
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

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [ctx?.turns.length, pendingUser, busy]);

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
      setView("start");
      await reload();
      setView("start");
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

  async function sendMessage() {
    if (sendLock || busy) return;
    const text = draft.trim();
    if (!text && !photoFile) return;
    setSendLock(true);
    setBusy(true);
    setError(null);
    setPendingUser(text || (photoFile ? "📷 照片" : null));
    setDraft("");
    let photoUploaded = false;
    try {
      let mealSlotHint: "breakfast" | "lunch" | "dinner" | null = null;
      if (/午餐|中餐|中午/.test(text)) mealSlotHint = "lunch";
      else if (/早餐|早上/.test(text)) mealSlotHint = "breakfast";
      else if (/晚餐|晚上/.test(text)) mealSlotHint = "dinner";

      if (photoFile && mealSlotHint) {
        const form = new FormData();
        form.append("photo", photoFile);
        form.append("logDate", new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }));
        const upload = await fetch(
          `/api/coaching/portal/${encodeURIComponent(token)}/meals/${mealSlotHint}/photo`,
          { method: "POST", body: form },
        );
        photoUploaded = upload.ok;
        if (!upload.ok) {
          throw new Error("照片上傳失敗，請重試");
        }
      }

      const response = await fetch(`/api/coaching/portal/${encodeURIComponent(token)}/go21/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text || undefined,
          hasPhoto: Boolean(photoFile),
          photoUploaded,
          mealSlotHint,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; coachMessage?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "送出失敗");
      setPhotoFile(null);
      setPhotoPreview(null);
      startTransition(() => {
        void reload();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "送出失敗");
      setDraft(text);
    } finally {
      setPendingUser(null);
      setBusy(false);
      setSendLock(false);
    }
  }

  function onPickPhoto(file: File | null) {
    setPhotoFile(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  if (loading) {
    return (
      <div className="go21-shell">
        <p className="go21-muted">載入中…</p>
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="go21-shell">
        <p className="go21-error">{error ?? "無法開啟連結"}</p>
      </div>
    );
  }

  return (
    <div className="go21-shell">
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

      {view === "start" ? (
        <div className="go21-start">
          <div className="go21-teach">
            <p>📷 傳照片</p>
            <p>💬 像聊天一樣告訴我</p>
            <p>🤖 AI 幫你整理</p>
          </div>
          <button type="button" className="go21-cta" disabled={busy || sendLock} onClick={() => void startExperience()}>
            開始我的 21 天陪跑
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
          {ctx.latestBody ? (
            <div className="go21-data">
              <h3>我的數據</h3>
              <p>體重：{ctx.latestBody.weightKg ?? "—"} kg</p>
              <p>體脂：{ctx.latestBody.bodyFatPercent ?? "—"} %</p>
              <p>肌肉：{ctx.latestBody.skeletalMuscleKg ?? "—"} kg</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {view === "chat" ? (
        <>
          {ctx.reminders.length > 0 ? (
            <div className="go21-reminder">
              {ctx.reminders[0]!.message}
            </div>
          ) : null}
          <div ref={threadRef} className="go21-thread">
            {ctx.turns.map((turn) => (
              <div
                key={turn.id}
                className={turn.role === "customer" ? "go21-bubble go21-user" : "go21-bubble go21-ai"}
              >
                {turn.content}
              </div>
            ))}
            {pendingUser ? <div className="go21-bubble go21-user">{pendingUser}</div> : null}
            {busy ? <div className="go21-thinking">教練正在回覆…</div> : null}
          </div>
          <form
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
              <button
                type="button"
                className="go21-attach"
                aria-label="附加照片"
                onClick={() => fileRef.current?.click()}
              >
                📷
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
              />
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={1}
                placeholder="跟我說午餐、或傳照片…"
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
        </>
      ) : null}

    </div>
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
