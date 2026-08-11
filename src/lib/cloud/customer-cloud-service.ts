import { isCloudDatabaseMemberId } from "@/lib/cloud/cloud-member-ids";
import { createAuthRepository } from "@/lib/repositories/auth-repository";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import { LocalStorageAdapter } from "@/lib/repositories/local-storage-adapter";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { setCloudSyncPaused } from "@/lib/repositories/syncing-storage-adapter";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import { isReceiptExpired } from "@/lib/customers/customer-receipt-retention";
import {
  clearCustomerDeletionTombstones,
  readCustomerDeletionTombstones,
  readCustomerDeletionTombstoneIds,
} from "@/lib/customers/customer-deletion-tombstones";
import { todayISODate } from "@/lib/config/app-config";
import type {
  BodyCompositionRecord,
  Customer,
  CustomerPortalToken,
  CustomerProgressPhoto,
  CustomerReceiptPhoto,
} from "@/types/customer";
import type { EntityId } from "@/types";

interface CustomerDbRow {
  id: string;
  owner_member_id: string;
  display_name: string;
  phone: string | null;
  line_id: string | null;
  birth_year: number | null;
  birth_date: string | null;
  height_cm: number | null;
  region: string | null;
  occupation: string | null;
  status: Customer["status"];
  pipeline_lead_id: string | null;
  linked_member_id: string | null;
  note: string | null;
  last_contact_date: string | null;
  next_follow_up_date: string | null;
  created_at: string;
  updated_at: string;
}

interface BodyRecordDbRow {
  id: string;
  customer_id: string;
  record_date: string;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  skeletal_muscle_kg: number | null;
  body_fat_kg: number | null;
  bmi: number | null;
  body_fat_percent: number | null;
  visceral_fat_level: number | null;
  basal_metabolic_rate: number | null;
  body_age: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface ProgressPhotoDbRow {
  id: string;
  customer_id: string;
  phase: CustomerProgressPhoto["phase"];
  angle: CustomerProgressPhoto["angle"];
  photo_date: string;
  image_data_url: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface ReceiptPhotoDbRow {
  id: string;
  customer_id: string;
  receipt_date: string;
  image_data_url: string;
  note: string | null;
  retain_until: string;
  created_at: string;
  updated_at: string;
}

function mapCustomer(row: CustomerDbRow): Customer {
  return {
    id: row.id,
    ownerMemberId: row.owner_member_id,
    displayName: row.display_name,
    phone: row.phone ?? undefined,
    lineId: row.line_id ?? undefined,
    birthYear: row.birth_year ?? undefined,
    birthDate: row.birth_date ?? undefined,
    heightCm: row.height_cm ?? undefined,
    region: row.region ?? undefined,
    occupation: row.occupation ?? undefined,
    status: row.status,
    pipelineLeadId: row.pipeline_lead_id ?? undefined,
    linkedMemberId: row.linked_member_id ?? undefined,
    note: row.note ?? undefined,
    lastContactDate: row.last_contact_date ?? undefined,
    nextFollowUpDate: row.next_follow_up_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBodyRecord(row: BodyRecordDbRow): BodyCompositionRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    recordDate: row.record_date,
    age: row.age,
    weightKg: row.weight_kg,
    skeletalMuscleKg: row.skeletal_muscle_kg,
    bodyFatKg: row.body_fat_kg,
    bmi: row.bmi,
    bodyFatPercent: row.body_fat_percent,
    visceralFatLevel: row.visceral_fat_level,
    basalMetabolicRate: row.basal_metabolic_rate,
    bodyAge: row.body_age,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProgressPhoto(row: ProgressPhotoDbRow): CustomerProgressPhoto {
  return {
    id: row.id,
    customerId: row.customer_id,
    phase: row.phase,
    angle: row.angle,
    photoDate: row.photo_date,
    imageDataUrl: row.image_data_url,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReceiptPhoto(row: ReceiptPhotoDbRow): CustomerReceiptPhoto {
  return {
    id: row.id,
    customerId: row.customer_id,
    receiptDate: row.receipt_date,
    imageDataUrl: row.image_data_url,
    note: row.note ?? undefined,
    retainUntil: row.retain_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function customerToDbRow(customer: Customer): CustomerDbRow {
  return {
    id: customer.id,
    owner_member_id: customer.ownerMemberId,
    display_name: customer.displayName,
    phone: customer.phone ?? null,
    line_id: customer.lineId ?? null,
    birth_year: customer.birthYear ?? null,
    birth_date: customer.birthDate ?? null,
    height_cm: customer.heightCm ?? null,
    region: customer.region ?? null,
    occupation: customer.occupation ?? null,
    status: customer.status,
    pipeline_lead_id: customer.pipelineLeadId ?? null,
    linked_member_id: customer.linkedMemberId ?? null,
    note: customer.note ?? null,
    last_contact_date: customer.lastContactDate ?? null,
    next_follow_up_date: customer.nextFollowUpDate ?? null,
    created_at:
      typeof customer.createdAt === "string" ? customer.createdAt : customer.createdAt.toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function bodyRecordToDbRow(record: BodyCompositionRecord): BodyRecordDbRow {
  return {
    id: record.id,
    customer_id: record.customerId,
    record_date: record.recordDate,
    age: record.age,
    height_cm: null,
    weight_kg: record.weightKg,
    skeletal_muscle_kg: record.skeletalMuscleKg,
    body_fat_kg: record.bodyFatKg,
    bmi: record.bmi,
    body_fat_percent: record.bodyFatPercent,
    visceral_fat_level: record.visceralFatLevel,
    basal_metabolic_rate: record.basalMetabolicRate,
    body_age: record.bodyAge,
    note: record.note ?? null,
    created_at:
      typeof record.createdAt === "string" ? record.createdAt : record.createdAt.toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function progressPhotoToDbRow(photo: CustomerProgressPhoto): ProgressPhotoDbRow {
  return {
    id: photo.id,
    customer_id: photo.customerId,
    phase: photo.phase,
    angle: photo.angle,
    photo_date: photo.photoDate,
    image_data_url: photo.imageDataUrl,
    note: photo.note ?? null,
    created_at:
      typeof photo.createdAt === "string" ? photo.createdAt : photo.createdAt.toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function receiptPhotoToDbRow(receipt: CustomerReceiptPhoto): ReceiptPhotoDbRow {
  return {
    id: receipt.id,
    customer_id: receipt.customerId,
    receipt_date: receipt.receiptDate,
    image_data_url: receipt.imageDataUrl,
    note: receipt.note ?? null,
    retain_until: receipt.retainUntil,
    created_at:
      typeof receipt.createdAt === "string" ? receipt.createdAt : receipt.createdAt.toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function fetchCloudCustomers(ownerMemberId: EntityId): Promise<Customer[]> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(ownerMemberId)) {
    return [];
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("owner_member_id", ownerMemberId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapCustomer(row as CustomerDbRow));
}

export async function fetchCloudBodyRecords(customerIds: EntityId[]): Promise<BodyCompositionRecord[]> {
  if (!isSupabaseConfigured() || customerIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("body_composition_records")
    .select("*")
    .in("customer_id", customerIds)
    .order("record_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapBodyRecord(row as BodyRecordDbRow));
}

export async function fetchCloudProgressPhotos(
  customerIds: EntityId[],
): Promise<CustomerProgressPhoto[]> {
  if (!isSupabaseConfigured() || customerIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("customer_progress_photos")
    .select("*")
    .in("customer_id", customerIds)
    .order("photo_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapProgressPhoto(row as ProgressPhotoDbRow));
}

export async function fetchCloudReceiptPhotos(
  customerIds: EntityId[],
): Promise<CustomerReceiptPhoto[]> {
  if (!isSupabaseConfigured() || customerIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("customer_receipt_photos")
    .select("*")
    .in("customer_id", customerIds)
    .order("receipt_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapReceiptPhoto(row as ReceiptPhotoDbRow));
}

export async function deleteCustomersFromCloud(
  ownerMemberId: EntityId,
  customerIds: EntityId[],
): Promise<void> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(ownerMemberId) || customerIds.length === 0) {
    return;
  }

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("owner_member_id", ownerMemberId)
    .in("id", customerIds);

  if (error) {
    throw new Error(error.message);
  }
}

async function pushPendingCustomerDeletionsToCloud(
  storage: StorageAdapter,
  ownerMemberId: EntityId,
): Promise<void> {
  const tombstones = readCustomerDeletionTombstones(storage);
  if (tombstones.length === 0) {
    return;
  }

  const customerIds = tombstones.map((tombstone) => tombstone.customerId);
  await deleteCustomersFromCloud(ownerMemberId, customerIds);
  clearCustomerDeletionTombstones(storage, customerIds);
}

export async function pushCustomersToCloud(
  ownerMemberId: EntityId,
  customers: Customer[],
  records: BodyCompositionRecord[],
  photos: CustomerProgressPhoto[] = [],
  receipts: CustomerReceiptPhoto[] = [],
): Promise<void> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(ownerMemberId)) {
    return;
  }

  const supabase = createSupabaseBrowserClient();
  const ownedCustomers = customers.filter((customer) => customer.ownerMemberId === ownerMemberId);

  if (ownedCustomers.length > 0) {
    const { error: customerError } = await supabase
      .from("customers")
      .upsert(ownedCustomers.map(customerToDbRow), { onConflict: "id" });

    if (customerError) {
      throw new Error(customerError.message);
    }
  }

  const ownedCustomerIds = new Set(ownedCustomers.map((customer) => customer.id));
  const ownedRecords = records.filter((record) => ownedCustomerIds.has(record.customerId));

  if (ownedRecords.length > 0) {
    const { error: recordError } = await supabase
      .from("body_composition_records")
      .upsert(ownedRecords.map(bodyRecordToDbRow), { onConflict: "id" });

    if (recordError) {
      throw new Error(recordError.message);
    }
  }

  const ownedPhotos = photos.filter((photo) => ownedCustomerIds.has(photo.customerId));
  if (ownedPhotos.length > 0) {
    const { error: photoError } = await supabase
      .from("customer_progress_photos")
      .upsert(ownedPhotos.map(progressPhotoToDbRow), { onConflict: "id" });

    if (photoError) {
      throw new Error(photoError.message);
    }
  }

  const ownedReceipts = receipts.filter(
    (receipt) =>
      ownedCustomerIds.has(receipt.customerId) && !isReceiptExpired(receipt, todayISODate()),
  );
  if (ownedReceipts.length > 0) {
    const { error: receiptError } = await supabase
      .from("customer_receipt_photos")
      .upsert(ownedReceipts.map(receiptPhotoToDbRow), { onConflict: "id" });

    if (receiptError) {
      throw new Error(receiptError.message);
    }
  }
}

function mergeById<T extends { id: EntityId; updatedAt: string | Date }>(
  localItems: T[],
  cloudItems: T[],
): T[] {
  const merged = new Map<string, T>();

  for (const item of localItems) {
    merged.set(item.id, item);
  }

  for (const cloudItem of cloudItems) {
    const existing = merged.get(cloudItem.id);
    if (!existing) {
      merged.set(cloudItem.id, cloudItem);
      continue;
    }

    const localUpdated = new Date(existing.updatedAt).getTime();
    const cloudUpdated = new Date(cloudItem.updatedAt).getTime();
    if (cloudUpdated >= localUpdated) {
      merged.set(cloudItem.id, cloudItem);
    }
  }

  return [...merged.values()];
}

function localHasCustomerData(storage: StorageAdapter): boolean {
  const customers = storage.getItem(STORAGE_KEYS.customers);
  const records = storage.getItem(STORAGE_KEYS.customerBodyRecords);
  const photos = storage.getItem(STORAGE_KEYS.customerProgressPhotos);
  const receipts = storage.getItem(STORAGE_KEYS.customerReceiptPhotos);
  return (
    Boolean(customers && customers !== "[]") ||
    Boolean(records && records !== "[]") ||
    Boolean(photos && photos !== "[]") ||
    Boolean(receipts && receipts !== "[]")
  );
}

/** Pull coach customer CRM from dedicated tables (not member_app_data). */
export async function syncCustomersOnLogin(
  storage: StorageAdapter,
  ownerMemberId: EntityId,
): Promise<void> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(ownerMemberId)) {
    return;
  }

  setCloudSyncPaused(true);
  try {
    const repo = createCustomerRepository(storage);
    await pushPendingCustomerDeletionsToCloud(storage, ownerMemberId);

    const cloudCustomers = await fetchCloudCustomers(ownerMemberId);
    const cloudHasData = cloudCustomers.length > 0;
    const localHasData = localHasCustomerData(storage);

    if (!cloudHasData && localHasData) {
      await pushCustomersToCloud(
        ownerMemberId,
        repo.getAllCustomers(),
        repo.getAllBodyRecords(),
        repo.getAllProgressPhotos(),
        repo.getAllReceiptPhotos(),
      );
      return;
    }

    if (cloudHasData) {
      const localCustomers = repo.getCustomersByOwner(ownerMemberId);
      const tombstoneIds = readCustomerDeletionTombstoneIds(storage);
      const filteredCloudCustomers = cloudCustomers.filter((customer) => !tombstoneIds.has(customer.id));
      const mergedCustomers = mergeById(localCustomers, filteredCloudCustomers);
      storage.setItem(STORAGE_KEYS.customers, JSON.stringify(mergedCustomers));

      const customerIds = mergedCustomers.map((customer) => customer.id);
      const cloudRecords = await fetchCloudBodyRecords(customerIds);
      const localRecords = repo
        .getAllBodyRecords()
        .filter((record) => customerIds.includes(record.customerId));
      const mergedRecords = mergeById(localRecords, cloudRecords);
      storage.setItem(STORAGE_KEYS.customerBodyRecords, JSON.stringify(mergedRecords));

      const cloudPhotos = await fetchCloudProgressPhotos(customerIds);
      const localPhotos = repo
        .getAllProgressPhotos()
        .filter((photo) => customerIds.includes(photo.customerId));
      const mergedPhotos = mergeById(localPhotos, cloudPhotos);
      storage.setItem(STORAGE_KEYS.customerProgressPhotos, JSON.stringify(mergedPhotos));

      const cloudReceipts = await fetchCloudReceiptPhotos(customerIds);
      const localReceipts = repo
        .getAllReceiptPhotos()
        .filter((receipt) => customerIds.includes(receipt.customerId));
      const mergedReceipts = mergeById(localReceipts, cloudReceipts);
      storage.setItem(STORAGE_KEYS.customerReceiptPhotos, JSON.stringify(mergedReceipts));

      if (localHasData) {
        await pushCustomersToCloud(
          ownerMemberId,
          mergedCustomers,
          mergedRecords,
          mergedPhotos,
          mergedReceipts,
        );
      }

      repo.purgeExpiredReceiptPhotos();
    }
  } finally {
    setCloudSyncPaused(false);
  }
}

export async function pushLocalCustomersToCloud(storage: StorageAdapter): Promise<void> {
  const memberId = createAuthRepository(storage).readSession()?.memberId;
  if (!memberId) {
    return;
  }

  await pushPendingCustomerDeletionsToCloud(storage, memberId);

  const repo = createCustomerRepository(storage);
  await pushCustomersToCloud(
    memberId,
    repo.getAllCustomers(),
    repo.getAllBodyRecords(),
    repo.getAllProgressPhotos(),
    repo.getAllReceiptPhotos(),
  );
}

export async function fetchCustomerPortalToken(
  customerId: EntityId,
): Promise<CustomerPortalToken | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("customer_portal_tokens")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    customerId: data.customer_id,
    token: data.token,
    expiresAt: data.expires_at ?? undefined,
    revokedAt: data.revoked_at ?? undefined,
    createdAt: data.created_at,
    updatedAt: data.created_at,
  };
}

function isPortalTokenActive(token: CustomerPortalToken): boolean {
  if (token.revokedAt) {
    return false;
  }
  if (token.expiresAt && new Date(token.expiresAt) <= new Date()) {
    return false;
  }
  return true;
}

export async function revokeCustomerPortalToken(customerId: EntityId): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from("customer_portal_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("customer_id", customerId)
    .is("revoked_at", null);

  if (error) {
    throw new Error(error.message);
  }
}

export async function renewCustomerPortalToken(
  customerId: EntityId,
  expiresAt?: string | null,
): Promise<CustomerPortalToken | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createSupabaseBrowserClient();
  const newToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  const { data: existing } = await supabase
    .from("customer_portal_tokens")
    .select("id")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("customer_portal_tokens")
      .update({
        token: newToken,
        revoked_at: null,
        expires_at: expiresAt ?? null,
      })
      .eq("customer_id", customerId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return {
      id: data.id,
      customerId: data.customer_id,
      token: data.token,
      expiresAt: data.expires_at ?? undefined,
      revokedAt: data.revoked_at ?? undefined,
      createdAt: data.created_at,
      updatedAt: data.created_at,
    };
  }

  const { data, error } = await supabase
    .from("customer_portal_tokens")
    .insert({
      customer_id: customerId,
      token: newToken,
      expires_at: expiresAt ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    id: data.id,
    customerId: data.customer_id,
    token: data.token,
    expiresAt: data.expires_at ?? undefined,
    revokedAt: data.revoked_at ?? undefined,
    createdAt: data.created_at,
    updatedAt: data.created_at,
  };
}

export async function updateCustomerPortalTokenExpiry(
  customerId: EntityId,
  expiresAt: string | null,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from("customer_portal_tokens")
    .update({ expires_at: expiresAt })
    .eq("customer_id", customerId)
    .is("revoked_at", null);

  if (error) {
    throw new Error(error.message);
  }
}

export async function ensureCustomerPortalToken(customerId: EntityId): Promise<CustomerPortalToken | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const existing = await fetchCustomerPortalToken(customerId);
  if (existing && isPortalTokenActive(existing)) {
    return existing;
  }

  return renewCustomerPortalToken(customerId, existing?.expiresAt ?? null);
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushStorage: StorageAdapter | null = null;

const PUSH_DEBOUNCE_MS = 1500;

export function scheduleCustomerCloudPush(storage?: StorageAdapter): void {
  if (!isSupabaseConfigured()) {
    return;
  }

  pushStorage = storage ?? pushStorage ?? new LocalStorageAdapter();

  if (pushTimer) {
    clearTimeout(pushTimer);
  }

  pushTimer = setTimeout(() => {
    pushTimer = null;
    const targetStorage = pushStorage ?? createLocalStorageAdapter();
    void pushLocalCustomersToCloud(targetStorage).catch((error) => {
      console.error("Customer cloud sync push failed:", error);
    });
  }, PUSH_DEBOUNCE_MS);
}

export function flushCustomerCloudPush(storage?: StorageAdapter): void {
  if (!isSupabaseConfigured()) {
    return;
  }

  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }

  pushStorage = storage ?? pushStorage ?? new LocalStorageAdapter();
  const targetStorage = pushStorage ?? createLocalStorageAdapter();
  void pushLocalCustomersToCloud(targetStorage).catch((error) => {
    console.error("Customer cloud sync push failed:", error);
  });
}
