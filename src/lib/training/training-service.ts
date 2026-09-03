import { getLearningResourceById } from "@/lib/learning-resources/catalog";
import {
  canSignOffTrainingMember,
  canViewTrainingMember,
  listTrainingDownlineMembers,
  loadTrainingOrgAuthContext,
  type TrainingOrgAuthContext,
} from "@/lib/training/training-organization-access";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import type {
  TrainingChecklistEntry,
  TrainingChecklistView,
  TrainingItem,
  TrainingLearningLink,
  TrainingOrgListView,
  TrainingOrgMemberSummary,
  TrainingSignoff,
} from "@/types/training-checklist";

export class TrainingServiceError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code?: string,
  ) {
    super(message);
    this.name = "TrainingServiceError";
  }
}

type TrainingItemRow = {
  id: string;
  item_key: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type LearningLinkRow = {
  id: string;
  training_item_id: string;
  learning_resource_id: string;
  created_at: string;
};

type SignoffRow = {
  id: string;
  training_item_id: string;
  trainee_member_id: string;
  signer_member_id: string;
  signed_at: string;
  created_at: string;
  updated_at: string;
};

function mapItem(row: TrainingItemRow): TrainingItem {
  return {
    id: row.id,
    itemKey: row.item_key,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLearningLink(row: LearningLinkRow): TrainingLearningLink {
  const resource = getLearningResourceById(row.learning_resource_id);
  return {
    id: row.id,
    trainingItemId: row.training_item_id,
    learningResourceId: row.learning_resource_id,
    learningResourceTitle: resource?.title ?? null,
    learningResourceYoutubeUrl: resource?.youtubeUrl ?? null,
    createdAt: row.created_at,
  };
}

function mapSignoff(
  row: SignoffRow,
  signerNameById: Map<string, string>,
): TrainingSignoff {
  return {
    id: row.id,
    trainingItemId: row.training_item_id,
    traineeMemberId: row.trainee_member_id,
    signerMemberId: row.signer_member_id,
    signerDisplayName: signerNameById.get(row.signer_member_id) ?? "上線",
    signedAt: row.signed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTrainingItems(opts?: {
  includeInactive?: boolean;
}): Promise<TrainingItem[]> {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("training_items")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!opts?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new TrainingServiceError(error.message, 500);
  }
  return (data ?? []).map((row) => mapItem(row as TrainingItemRow));
}

export async function createTrainingItem(input: {
  itemKey: string;
  name: string;
  sortOrder?: number;
}): Promise<TrainingItem> {
  const itemKey = input.itemKey.trim().toLowerCase();
  const name = input.name.trim();
  if (!/^[a-z0-9_]{2,64}$/.test(itemKey)) {
    throw new TrainingServiceError("item_key 格式無效。", 400, "invalid_key");
  }
  if (!name || name.length > 80) {
    throw new TrainingServiceError("名稱長度需為 1–80 字。", 400, "invalid_name");
  }

  const supabase = createSupabaseServiceClient();
  const sortOrder =
    input.sortOrder ??
    ((await listTrainingItems({ includeInactive: true })).reduce(
      (max, item) => Math.max(max, item.sortOrder),
      0,
    ) + 1);

  const { data, error } = await supabase
    .from("training_items")
    .insert({
      item_key: itemKey,
      name,
      sort_order: sortOrder,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new TrainingServiceError("item_key 已存在。", 409, "duplicate_key");
    }
    throw new TrainingServiceError(error.message, 500);
  }
  return mapItem(data as TrainingItemRow);
}

export async function updateTrainingItem(
  itemId: string,
  patch: {
    name?: string;
    sortOrder?: number;
    isActive?: boolean;
  },
): Promise<TrainingItem> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name || name.length > 80) {
      throw new TrainingServiceError("名稱長度需為 1–80 字。", 400, "invalid_name");
    }
    updates.name = name;
  }
  if (patch.sortOrder !== undefined) {
    if (!Number.isFinite(patch.sortOrder)) {
      throw new TrainingServiceError("排序無效。", 400, "invalid_sort");
    }
    updates.sort_order = Math.trunc(patch.sortOrder);
  }
  if (patch.isActive !== undefined) {
    updates.is_active = Boolean(patch.isActive);
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("training_items")
    .update(updates)
    .eq("id", itemId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new TrainingServiceError(error.message, 500);
  }
  if (!data) {
    throw new TrainingServiceError("找不到培訓項目。", 404, "not_found");
  }
  return mapItem(data as TrainingItemRow);
}

export async function listLearningLinksForItems(
  itemIds: string[],
): Promise<Map<string, TrainingLearningLink[]>> {
  const result = new Map<string, TrainingLearningLink[]>();
  if (itemIds.length === 0) {
    return result;
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("training_item_learning_links")
    .select("*")
    .in("training_item_id", itemIds);

  if (error) {
    throw new TrainingServiceError(error.message, 500);
  }

  for (const row of data ?? []) {
    const link = mapLearningLink(row as LearningLinkRow);
    // Drop stale catalog ids silently — never invent mappings.
    if (!link.learningResourceYoutubeUrl) {
      continue;
    }
    const list = result.get(link.trainingItemId) ?? [];
    list.push(link);
    result.set(link.trainingItemId, list);
  }
  return result;
}

export async function listLearningLinksForItem(
  itemId: string,
): Promise<TrainingLearningLink[]> {
  const map = await listLearningLinksForItems([itemId]);
  return map.get(itemId) ?? [];
}

export async function addLearningLink(input: {
  trainingItemId: string;
  learningResourceId: string;
}): Promise<TrainingLearningLink> {
  const learningResourceId = input.learningResourceId.trim();
  const resource = getLearningResourceById(learningResourceId);
  if (!resource) {
    throw new TrainingServiceError("找不到對應的學習庫教材。", 400, "unknown_resource");
  }

  const supabase = createSupabaseServiceClient();
  const { data: item, error: itemError } = await supabase
    .from("training_items")
    .select("id, item_key")
    .eq("id", input.trainingItemId)
    .maybeSingle();

  if (itemError) {
    throw new TrainingServiceError(itemError.message, 500);
  }
  if (!item) {
    throw new TrainingServiceError("找不到培訓項目。", 404, "not_found");
  }
  if ((item as { item_key: string }).item_key === "xpro_deep_nutrition") {
    throw new TrainingServiceError(
      "XPRO 深度營養培訓不建立學習庫對應。",
      400,
      "xpro_no_mapping",
    );
  }

  const { data, error } = await supabase
    .from("training_item_learning_links")
    .insert({
      training_item_id: input.trainingItemId,
      learning_resource_id: learningResourceId,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new TrainingServiceError("此教材連結已存在。", 409, "duplicate_link");
    }
    throw new TrainingServiceError(error.message, 500);
  }
  return mapLearningLink(data as LearningLinkRow);
}

export async function removeLearningLink(linkId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("training_item_learning_links")
    .delete()
    .eq("id", linkId);

  if (error) {
    throw new TrainingServiceError(error.message, 500);
  }
}

export async function getTrainingChecklist(input: {
  viewerMemberId: string;
  traineeMemberId: string;
  orgCtx?: TrainingOrgAuthContext;
}): Promise<TrainingChecklistView> {
  const orgCtx = input.orgCtx ?? (await loadTrainingOrgAuthContext());
  if (!canViewTrainingMember(input.viewerMemberId, input.traineeMemberId, orgCtx)) {
    throw new TrainingServiceError("無權限查看此培訓檢核。", 403, "forbidden");
  }

  const trainee = orgCtx.membersById.get(input.traineeMemberId);
  if (!trainee) {
    throw new TrainingServiceError("找不到夥伴。", 404, "not_found");
  }

  const supabase = createSupabaseServiceClient();
  const [itemsResult, signoffsResult] = await Promise.all([
    supabase
      .from("training_items")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("training_signoffs")
      .select("*")
      .eq("trainee_member_id", input.traineeMemberId),
  ]);

  if (itemsResult.error) {
    throw new TrainingServiceError(itemsResult.error.message, 500);
  }
  if (signoffsResult.error) {
    throw new TrainingServiceError(signoffsResult.error.message, 500);
  }

  const items = (itemsResult.data ?? []).map((row) => mapItem(row as TrainingItemRow));
  const signoffs = (signoffsResult.data ?? []) as SignoffRow[];
  const signoffByItemId = new Map(signoffs.map((row) => [row.training_item_id, row]));

  const signerIds = Array.from(new Set(signoffs.map((row) => row.signer_member_id)));
  const signerNameById = new Map<string, string>();
  for (const signerId of signerIds) {
    const signer = orgCtx.membersById.get(signerId);
    if (signer) {
      signerNameById.set(signerId, signer.name);
    }
  }

  const relevantItemIds = items
    .filter((item) => item.isActive || signoffByItemId.has(item.id))
    .map((item) => item.id);
  const linksByItem = await listLearningLinksForItems(relevantItemIds);

  const incomplete: TrainingChecklistEntry[] = [];
  const completed: TrainingChecklistEntry[] = [];

  for (const item of items) {
    const signoffRow = signoffByItemId.get(item.id) ?? null;
    if (!item.isActive && !signoffRow) {
      // Inactive + never completed → hide from new incomplete lists.
      continue;
    }
    const signoff = signoffRow ? mapSignoff(signoffRow, signerNameById) : null;
    const entry: TrainingChecklistEntry = {
      item,
      status: signoff ? "completed" : "incomplete",
      signoff,
      learningLinks: linksByItem.get(item.id) ?? [],
    };
    if (signoff) {
      completed.push(entry);
    } else {
      incomplete.push(entry);
    }
  }

  completed.sort(
    (a, b) =>
      new Date(b.signoff?.signedAt ?? 0).getTime() -
      new Date(a.signoff?.signedAt ?? 0).getTime(),
  );

  return {
    traineeMemberId: trainee.id,
    traineeDisplayName: trainee.name,
    viewerMemberId: input.viewerMemberId,
    canSignOff: canSignOffTrainingMember(
      input.viewerMemberId,
      input.traineeMemberId,
      orgCtx,
    ),
    incomplete,
    completed,
  };
}

export async function listTrainingOrganizationSummaries(input: {
  viewerMemberId: string;
  query?: string;
}): Promise<TrainingOrgListView> {
  const orgCtx = await loadTrainingOrgAuthContext();
  const downline = listTrainingDownlineMembers(input.viewerMemberId, orgCtx);
  const query = input.query?.trim().toLowerCase() ?? "";
  const filtered = query
    ? downline.filter((member) => member.name.toLowerCase().includes(query))
    : downline;

  if (filtered.length === 0) {
    return { viewerMemberId: input.viewerMemberId, members: [] };
  }

  const supabase = createSupabaseServiceClient();
  const [{ data: activeItems, error: itemsError }, { data: signoffs, error: signoffsError }] =
    await Promise.all([
      supabase.from("training_items").select("id").eq("is_active", true),
      supabase
        .from("training_signoffs")
        .select("trainee_member_id, training_item_id")
        .in(
          "trainee_member_id",
          filtered.map((member) => member.id),
        ),
    ]);

  if (itemsError) {
    throw new TrainingServiceError(itemsError.message, 500);
  }
  if (signoffsError) {
    throw new TrainingServiceError(signoffsError.message, 500);
  }

  const activeItemIds = new Set((activeItems ?? []).map((row) => String((row as { id: string }).id)));
  const activeCount = activeItemIds.size;
  const completedActiveByTrainee = new Map<string, Set<string>>();

  for (const row of signoffs ?? []) {
    const typed = row as { trainee_member_id: string; training_item_id: string };
    if (!activeItemIds.has(typed.training_item_id)) {
      continue;
    }
    const set = completedActiveByTrainee.get(typed.trainee_member_id) ?? new Set<string>();
    set.add(typed.training_item_id);
    completedActiveByTrainee.set(typed.trainee_member_id, set);
  }

  const members: TrainingOrgMemberSummary[] = filtered.map((member) => {
    const completed = completedActiveByTrainee.get(member.id)?.size ?? 0;
    return {
      memberId: member.id,
      displayName: member.name,
      incompleteCount: Math.max(0, activeCount - completed),
    };
  });

  // Incomplete first, then name.
  members.sort((a, b) => {
    if (a.incompleteCount !== b.incompleteCount) {
      return b.incompleteCount - a.incompleteCount;
    }
    return a.displayName.localeCompare(b.displayName, "zh-Hant");
  });

  return { viewerMemberId: input.viewerMemberId, members };
}

export async function signOffTrainingItem(input: {
  viewerMemberId: string;
  traineeMemberId: string;
  trainingItemId: string;
}): Promise<TrainingSignoff> {
  if (input.viewerMemberId === input.traineeMemberId) {
    throw new TrainingServiceError("不能替自己簽核。", 403, "self_signoff");
  }

  const orgCtx = await loadTrainingOrgAuthContext();
  if (!canSignOffTrainingMember(input.viewerMemberId, input.traineeMemberId, orgCtx)) {
    throw new TrainingServiceError("無權限替此夥伴簽核。", 403, "forbidden");
  }

  if (!orgCtx.membersById.has(input.traineeMemberId)) {
    throw new TrainingServiceError("找不到夥伴。", 404, "not_found");
  }

  const supabase = createSupabaseServiceClient();
  const { data: item, error: itemError } = await supabase
    .from("training_items")
    .select("*")
    .eq("id", input.trainingItemId)
    .maybeSingle();

  if (itemError) {
    throw new TrainingServiceError(itemError.message, 500);
  }
  if (!item) {
    throw new TrainingServiceError("找不到培訓項目。", 404, "item_not_found");
  }
  if (!(item as TrainingItemRow).is_active) {
    throw new TrainingServiceError("此培訓項目已停用，無法簽核。", 400, "inactive_item");
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("training_signoffs")
    .insert({
      training_item_id: input.trainingItemId,
      trainee_member_id: input.traineeMemberId,
      signer_member_id: input.viewerMemberId,
      signed_at: now,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new TrainingServiceError("此項目已簽核完成。", 409, "already_signed");
    }
    if (error.code === "23514") {
      throw new TrainingServiceError("不能替自己簽核。", 403, "self_signoff");
    }
    throw new TrainingServiceError(error.message, 500);
  }

  const signer = orgCtx.membersById.get(input.viewerMemberId);
  return mapSignoff(data as SignoffRow, new Map([[input.viewerMemberId, signer?.name ?? "上線"]]));
}
