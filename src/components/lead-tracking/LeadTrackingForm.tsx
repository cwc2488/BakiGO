"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type { LeadTracking } from "@/lib/lead-tracking/types";

function buildFollowUpIso(date: string, time: string): string | null {
  const d = date.trim();
  if (!d) return null;
  const t = (time.trim() || "09:00").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) {
    return null;
  }
  return `${d}T${t}:00+08:00`;
}

function splitFollowUp(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  // Expect ...T HH:mm with +08:00 or Z — display in Taipei wall via offset parse
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return { date: "", time: "" };
  // If stored as UTC Z, convert to Taipei (+8)
  if (iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso)) {
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) {
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const parts = Object.fromEntries(
        fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
      );
      return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`,
      };
    }
  }
  return { date: match[1], time: `${match[2]}:${match[3]}` };
}

export type LeadTrackingFormValues = {
  name: string;
  phone: string;
  contactChannel: string;
  notes: string;
  currentStatus: string;
  followUpDate: string;
  followUpTime: string;
  reminderEnabled: boolean;
};

export function leadToFormValues(lead?: LeadTracking | null): LeadTrackingFormValues {
  const follow = splitFollowUp(lead?.nextFollowUpAt);
  return {
    name: lead?.name ?? "",
    phone: lead?.phone ?? "",
    contactChannel: lead?.contactChannel ?? "",
    notes: lead?.notes ?? "",
    currentStatus: lead?.currentStatus ?? "",
    followUpDate: follow.date,
    followUpTime: follow.time,
    reminderEnabled: lead?.reminderEnabled ?? false,
  };
}

export function LeadTrackingForm({
  mode,
  leadId,
  initial,
}: {
  mode: "create" | "edit";
  leadId?: string;
  initial?: LeadTrackingFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<LeadTrackingFormValues>(initial ?? leadToFormValues());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof LeadTrackingFormValues>(key: K, value: LeadTrackingFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const nextFollowUpAt = buildFollowUpIso(values.followUpDate, values.followUpTime);
    const payload = {
      name: values.name.trim(),
      phone: values.phone.trim() || null,
      contactChannel: values.contactChannel.trim() || null,
      notes: values.notes.trim() || null,
      currentStatus: values.currentStatus.trim() || null,
      nextFollowUpAt,
      reminderEnabled: Boolean(values.reminderEnabled && nextFollowUpAt),
    };

    try {
      if (!payload.name) {
        throw new Error("請填寫姓名");
      }

      if (mode === "create") {
        const res = await fetchWithMemberAuth("/api/lead-tracking", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "儲存失敗");
        }
        const data = (await res.json()) as { lead: LeadTracking };
        router.replace(`/lead-tracking/${data.lead.id}`);
        return;
      }

      if (!leadId) {
        throw new Error("缺少名單 ID");
      }
      const res = await fetchWithMemberAuth(`/api/lead-tracking/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "儲存失敗");
      }
      router.replace(`/lead-tracking/${leadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "mt-1.5 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2.5 text-[0.9375rem] text-[var(--brand-text)] outline-none focus:border-[var(--brand-primary)]";
  const labelClass = "block text-[0.8125rem] font-semibold text-[var(--brand-text-muted)]";

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className={labelClass}>
        姓名
        <input
          className={fieldClass}
          onChange={(e) => update("name", e.target.value)}
          required
          value={values.name}
        />
      </label>
      <label className={labelClass}>
        電話
        <input
          className={fieldClass}
          inputMode="tel"
          onChange={(e) => update("phone", e.target.value)}
          value={values.phone}
        />
      </label>
      <label className={labelClass}>
        LINE / IG / 聯絡方式
        <input
          className={fieldClass}
          onChange={(e) => update("contactChannel", e.target.value)}
          value={values.contactChannel}
        />
      </label>
      <label className={labelClass}>
        基本資料 / 備註
        <textarea
          className={`${fieldClass} min-h-[5rem] resize-y`}
          onChange={(e) => update("notes", e.target.value)}
          value={values.notes}
        />
      </label>
      <label className={labelClass}>
        目前狀況
        <textarea
          className={`${fieldClass} min-h-[5rem] resize-y`}
          onChange={(e) => update("currentStatus", e.target.value)}
          placeholder="例如：說月底領薪後再聊"
          value={values.currentStatus}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          下次追蹤日期
          <input
            className={fieldClass}
            onChange={(e) => update("followUpDate", e.target.value)}
            type="date"
            value={values.followUpDate}
          />
        </label>
        <label className={labelClass}>
          時間
          <input
            className={fieldClass}
            onChange={(e) => update("followUpTime", e.target.value)}
            type="time"
            value={values.followUpTime}
          />
        </label>
      </div>
      <label className="flex items-center gap-3 text-[0.9375rem] font-semibold text-[var(--brand-text)]">
        <input
          checked={values.reminderEnabled}
          className="h-4 w-4 accent-[var(--brand-primary)]"
          onChange={(e) => update("reminderEnabled", e.target.checked)}
          type="checkbox"
        />
        到期時推播提醒
      </label>

      {error ? <p className="text-[0.8125rem] text-[#b42318]">{error}</p> : null}

      <button
        className="w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3.5 text-[1rem] font-semibold text-white disabled:opacity-50"
        disabled={busy}
        type="submit"
      >
        {busy ? "儲存中…" : "儲存"}
      </button>
    </form>
  );
}

export default function LeadTrackingNewPage() {
  return (
    <PageShell
      backHref="/lead-tracking"
      backLabel="返回名單"
      subtitle="記下一位想追蹤的人"
      title="新增名單"
      variant="plain"
    >
      <LeadTrackingForm mode="create" />
    </PageShell>
  );
}
