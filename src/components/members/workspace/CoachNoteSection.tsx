"use client";

import { formatShortDate } from "@/lib/mission-control/format";
import type { CoachNote } from "@/types/member-workspace";
import { COACH_NOTE_CATEGORIES } from "@/types/member-workspace";
import { useState } from "react";
import { CrmButton, CrmCard, CrmInput, CrmSectionTitle, CrmSelect, CrmTextarea } from "../ui";

export interface CoachNoteFormValues {
  noteDate: string;
  category: string;
  content: string;
  followUpItems: string;
}

function emptyForm(today: string): CoachNoteFormValues {
  return {
    noteDate: today,
    category: COACH_NOTE_CATEGORIES[0],
    content: "",
    followUpItems: "",
  };
}

function toFormValues(note: CoachNote): CoachNoteFormValues {
  return {
    noteDate: note.noteDate,
    category: note.category,
    content: note.content,
    followUpItems: note.followUpItems.join("\n"),
  };
}

function parseFollowUpItems(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function CoachNoteSection({
  notes,
  today,
  onCreate,
  onUpdate,
}: {
  notes: CoachNote[];
  today: string;
  onCreate: (values: CoachNoteFormValues) => void;
  onUpdate: (noteId: string, values: CoachNoteFormValues) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CoachNoteFormValues>(() => emptyForm(today));
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setForm(emptyForm(today));
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (editingId) {
      onUpdate(editingId, form);
    } else {
      onCreate(form);
    }
    resetForm();
  };

  const startEdit = (note: CoachNote) => {
    setEditingId(note.id);
    setForm(toFormValues(note));
    setShowForm(true);
  };

  const updateField = (field: keyof CoachNoteFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <CrmCard>
      <div className="flex items-center justify-between gap-4">
        <CrmSectionTitle>教練筆記</CrmSectionTitle>
        <button
          className="text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
          onClick={() => {
            if (showForm && !editingId) {
              resetForm();
            } else {
              setEditingId(null);
              setForm(emptyForm(today));
              setShowForm(true);
            }
          }}
          type="button"
        >
          {showForm && !editingId ? "取消" : "新增諮詢"}
        </button>
      </div>

      {showForm ? (
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <CrmInput
            label="日期"
            required
            type="date"
            value={form.noteDate}
            onChange={(event) => updateField("noteDate", event.target.value)}
          />
          <CrmSelect
            label="分類"
            value={form.category}
            onChange={(event) => updateField("category", event.target.value)}
          >
            {COACH_NOTE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </CrmSelect>
          <CrmTextarea
            label="內容"
            required
            value={form.content}
            onChange={(event) => updateField("content", event.target.value)}
          />
          <CrmTextarea
            label="待追蹤事項（每行一項）"
            value={form.followUpItems}
            onChange={(event) => updateField("followUpItems", event.target.value)}
          />
          <div className="flex gap-3">
            <CrmButton className="flex-1" type="submit">
              {editingId ? "更新教練筆記" : "儲存教練筆記"}
            </CrmButton>
            {editingId ? (
              <CrmButton className="flex-1" type="button" variant="secondary" onClick={resetForm}>
                取消編輯
              </CrmButton>
            ) : null}
          </div>
        </form>
      ) : null}

      <div className="mt-4 space-y-4">
        {notes.length > 0 ? (
          notes.map((note) => (
            <article key={note.id} className="rounded-2xl bg-[var(--brand-bg)] px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
                    {note.category}
                  </p>
                  <time className="text-[0.8125rem] text-[#86868b]">
                    {formatShortDate(note.noteDate)}
                  </time>
                </div>
                <button
                  className="text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]"
                  onClick={() => startEdit(note)}
                  type="button"
                >
                  編輯
                </button>
              </div>
              <p className="mt-2 text-[0.875rem] text-[#1d1d1f]">{note.content}</p>
              {note.followUpItems.length > 0 ? (
                <ul className="mt-3 space-y-1 text-[0.8125rem] text-[#86868b]">
                  {note.followUpItems.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))
        ) : (
          <p className="text-[0.9375rem] text-[#86868b]">尚無教練筆記</p>
        )}
      </div>
    </CrmCard>
  );
}

export { parseFollowUpItems };
