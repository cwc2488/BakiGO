"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/ui/PageShell";
import { LEARNING_RESOURCE_CATALOG } from "@/lib/learning-resources/catalog";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type { TrainingItem, TrainingLearningLink } from "@/types/training-checklist";

type AdminTrainingItem = TrainingItem & {
  learningLinks: TrainingLearningLink[];
};

export function AdminTrainingPage() {
  const [items, setItems] = useState<AdminTrainingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSort, setEditSort] = useState(0);
  const [linkItemId, setLinkItemId] = useState<string | null>(null);
  const [linkResourceId, setLinkResourceId] = useState("");

  const catalogOptions = useMemo(
    () =>
      LEARNING_RESOURCE_CATALOG.map((resource) => ({
        id: resource.id,
        title: resource.title,
      })),
    [],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithMemberAuth("/api/admin/training/items");
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: AdminTrainingItem[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "無法載入培訓項目");
      }
      setItems(payload.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法載入培訓項目");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createItem() {
    setFeedback(null);
    setError(null);
    const response = await fetchWithMemberAuth("/api/admin/training/items", {
      method: "POST",
      body: JSON.stringify({ itemKey: newKey, name: newName }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "新增失敗");
      return;
    }
    setNewKey("");
    setNewName("");
    setFeedback("已新增培訓項目");
    await reload();
  }

  async function saveEdit(itemId: string) {
    setFeedback(null);
    setError(null);
    const response = await fetchWithMemberAuth(`/api/admin/training/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: editName, sortOrder: editSort }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "更新失敗");
      return;
    }
    setEditingId(null);
    setFeedback("已更新");
    await reload();
  }

  async function toggleActive(item: AdminTrainingItem) {
    setFeedback(null);
    setError(null);
    const response = await fetchWithMemberAuth(`/api/admin/training/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "更新失敗");
      return;
    }
    setFeedback(item.isActive ? "已停用項目（歷史簽核保留）" : "已重新啟用");
    await reload();
  }

  async function addLink() {
    if (!linkItemId || !linkResourceId) return;
    setFeedback(null);
    setError(null);
    const response = await fetchWithMemberAuth("/api/admin/training/learning-links", {
      method: "POST",
      body: JSON.stringify({
        trainingItemId: linkItemId,
        learningResourceId: linkResourceId,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "連結失敗");
      return;
    }
    setLinkResourceId("");
    setFeedback("已連結學習庫教材");
    await reload();
  }

  async function removeLink(linkId: string) {
    setFeedback(null);
    setError(null);
    const response = await fetchWithMemberAuth(
      `/api/admin/training/learning-links?linkId=${encodeURIComponent(linkId)}`,
      { method: "DELETE" },
    );
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "移除失敗");
      return;
    }
    setFeedback("已移除教材連結");
    await reload();
  }

  return (
    <PageShell
      backHref="/admin"
      backLabel="返回管理中心"
      subtitle="維護培訓 Master List 與學習庫對應。停用不會刪除歷史簽核。"
      title="培訓檢核管理"
    >
      {feedback ? (
        <p className="rounded-[1rem] border border-[#b7f0c2] bg-[#e8f9ec] px-3.5 py-2.5 text-[0.875rem] font-medium text-[#248a3d]">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-[1rem] border border-[#ffd0d0] bg-[#fff5f5] px-3.5 py-2.5 text-[0.875rem] text-[#c62828]">
          {error}
        </p>
      ) : null}

      <section className="space-y-3 rounded-[1.25rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-4">
        <h2 className="text-[1.0625rem] font-semibold text-[var(--brand-text)]">新增項目</h2>
        <input
          className="min-h-11 w-full rounded-[0.875rem] border border-[var(--brand-border)] px-3.5"
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="item_key（英文底線）"
          value={newKey}
        />
        <input
          className="min-h-11 w-full rounded-[0.875rem] border border-[var(--brand-border)] px-3.5"
          onChange={(e) => setNewName(e.target.value)}
          placeholder="顯示名稱"
          value={newName}
        />
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-[0.875rem] bg-[var(--brand-primary)] px-4 font-semibold text-white"
          onClick={() => void createItem()}
          type="button"
        >
          新增
        </button>
      </section>

      {loading ? (
        <p className="text-[0.9375rem] text-[var(--brand-text-muted)]">載入中…</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-[1.25rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-[1.0rem] font-semibold text-[var(--brand-text)]">
                    {item.sortOrder}. {item.name}
                  </p>
                  <p className="mt-1 text-[0.75rem] text-[var(--brand-text-muted)]">
                    {item.itemKey}
                    {item.isActive ? "" : " · 已停用"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="min-h-10 rounded-[0.75rem] border border-[var(--brand-border)] px-3 text-[0.8125rem]"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditName(item.name);
                      setEditSort(item.sortOrder);
                    }}
                    type="button"
                  >
                    編輯
                  </button>
                  <button
                    className="min-h-10 rounded-[0.75rem] border border-[var(--brand-border)] px-3 text-[0.8125rem]"
                    onClick={() => void toggleActive(item)}
                    type="button"
                  >
                    {item.isActive ? "停用" : "啟用"}
                  </button>
                  {item.itemKey !== "xpro_deep_nutrition" ? (
                    <button
                      className="min-h-10 rounded-[0.75rem] border border-[var(--brand-border)] px-3 text-[0.8125rem]"
                      onClick={() => {
                        setLinkItemId(item.id);
                        setLinkResourceId("");
                      }}
                      type="button"
                    >
                      連結教材
                    </button>
                  ) : (
                    <span className="self-center text-[0.75rem] text-[var(--brand-text-muted)]">
                      不建立教材對應
                    </span>
                  )}
                </div>
              </div>

              {editingId === item.id ? (
                <div className="mt-3 space-y-2 border-t border-[var(--brand-border)] pt-3">
                  <input
                    className="min-h-11 w-full rounded-[0.875rem] border border-[var(--brand-border)] px-3.5"
                    onChange={(e) => setEditName(e.target.value)}
                    value={editName}
                  />
                  <input
                    className="min-h-11 w-full rounded-[0.875rem] border border-[var(--brand-border)] px-3.5"
                    onChange={(e) => setEditSort(Number(e.target.value) || 0)}
                    type="number"
                    value={editSort}
                  />
                  <div className="flex gap-2">
                    <button
                      className="min-h-10 rounded-[0.75rem] bg-[var(--brand-primary)] px-3 text-[0.8125rem] font-semibold text-white"
                      onClick={() => void saveEdit(item.id)}
                      type="button"
                    >
                      儲存
                    </button>
                    <button
                      className="min-h-10 rounded-[0.75rem] border border-[var(--brand-border)] px-3 text-[0.8125rem]"
                      onClick={() => setEditingId(null)}
                      type="button"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : null}

              {linkItemId === item.id ? (
                <div className="mt-3 space-y-2 border-t border-[var(--brand-border)] pt-3">
                  <select
                    className="min-h-11 w-full rounded-[0.875rem] border border-[var(--brand-border)] px-3.5"
                    onChange={(e) => setLinkResourceId(e.target.value)}
                    value={linkResourceId}
                  >
                    <option value="">選擇學習庫教材</option>
                    {catalogOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.title}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      className="min-h-10 rounded-[0.75rem] bg-[var(--brand-primary)] px-3 text-[0.8125rem] font-semibold text-white"
                      onClick={() => void addLink()}
                      type="button"
                    >
                      新增連結
                    </button>
                    <button
                      className="min-h-10 rounded-[0.75rem] border border-[var(--brand-border)] px-3 text-[0.8125rem]"
                      onClick={() => setLinkItemId(null)}
                      type="button"
                    >
                      關閉
                    </button>
                  </div>
                </div>
              ) : null}

              {item.learningLinks.length > 0 ? (
                <ul className="mt-3 space-y-1.5 border-t border-[var(--brand-border)] pt-3">
                  {item.learningLinks.map((link) => (
                    <li
                      key={link.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-[0.8125rem]"
                    >
                      <span className="break-words text-[var(--brand-text-muted)]">
                        {link.learningResourceTitle ?? link.learningResourceId}
                      </span>
                      <button
                        className="min-h-9 rounded-[0.75rem] border border-[var(--brand-border)] px-2.5"
                        onClick={() => void removeLink(link.id)}
                        type="button"
                      >
                        移除
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
