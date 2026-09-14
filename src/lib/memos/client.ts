import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type { Memo, MemoUpsertInput } from "@/lib/memos/types";

export async function fetchHomeMemos(): Promise<{ memos: Memo[]; hasMore: boolean }> {
  const res = await fetchWithMemberAuth("/api/memos?incompleteOnly=1&limit=4");
  if (!res.ok) {
    throw new Error("暫時無法載入備忘錄");
  }
  const data = (await res.json()) as { memos: Memo[] };
  const all = data.memos ?? [];
  return {
    memos: all.slice(0, 3),
    hasMore: all.length > 3,
  };
}

export async function fetchAllMemos(): Promise<Memo[]> {
  const res = await fetchWithMemberAuth("/api/memos?limit=100");
  if (!res.ok) {
    throw new Error("無法載入備忘錄");
  }
  const data = (await res.json()) as { memos: Memo[] };
  return data.memos ?? [];
}

export async function createMemo(input: MemoUpsertInput): Promise<Memo> {
  const res = await fetchWithMemberAuth("/api/memos", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "新增失敗");
  }
  const data = (await res.json()) as { memo: Memo };
  return data.memo;
}

export async function updateMemo(
  id: string,
  input: Partial<MemoUpsertInput> & { completed?: boolean },
): Promise<Memo> {
  const res = await fetchWithMemberAuth(`/api/memos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "更新失敗");
  }
  const data = (await res.json()) as { memo: Memo };
  return data.memo;
}

export async function deleteMemo(id: string): Promise<void> {
  const res = await fetchWithMemberAuth(`/api/memos/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "刪除失敗");
  }
}
