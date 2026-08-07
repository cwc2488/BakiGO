import { isCloudDatabaseMemberId } from "@/lib/cloud/cloud-member-ids";
import { createAuthRepository } from "@/lib/repositories/auth-repository";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import { LocalStorageAdapter } from "@/lib/repositories/local-storage-adapter";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { setCloudSyncPaused } from "@/lib/repositories/syncing-storage-adapter";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type {
  BodyCompositionRecord,
  Customer,
  CustomerPortalToken,
  CustomerProgressPhoto,
} from "@/types/customer";
import type { EntityId } from "@/types";

interface CustomerDbRow {
  id: string;
  owner_member_id: string;
  display_name: string;
  phone: string | null;
  line_id: string | null;
  birth_year: number | null;
  height_cm: number | null;
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

function mapCustomer(row: CustomerDbRow): Customer {
  return {
    id: row.id,
    ownerMemberId: row.owner_member_id,
    displayName: row.display_name,
    phone: row.phone ?? undefined,
    lineId: row.line_id ?? undefined,
    birthYear: row.birth_year ?? undefined,
    heightCm: row.height_cm ?? undefined,
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

function customerToDbRow(customer: Customer): CustomerDbRow {
  return {
    id: customer.id,
    owner_member_id: customer.ownerMemberId,
    display_name: customer.displayName,
    phone: customer.phone ?? null,
    line_id: customer.lineId ?? null,
    birth_year: customer.birthYear ?? null,
    height_cm: customer.heightCm ?? null,
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

export async function pushCustomersToCloud(
  ownerMemberId: EntityId,
  customers: Customer[],
  records: BodyCompositionRecord[],
  photos: CustomerProgressPhoto[] = [],
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
  return (
    Boolean(customers && customers !== "[]") ||
    Boolean(records && records !== "[]") ||
    Boolean(photos && photos !== "[]")
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
    const cloudCustomers = await fetchCloudCustomers(ownerMemberId);
    const cloudHasData = cloudCustomers.length > 0;
    const localHasData = localHasCustomerData(storage);

    if (!cloudHasData && localHasData) {
      await pushCustomersToCloud(
        ownerMemberId,
        repo.getAllCustomers(),
        repo.getAllBodyRecords(),
        repo.getAllProgressPhotos(),
      );
      return;
    }

    if (cloudHasData) {
      const localCustomers = repo.getCustomersByOwner(ownerMemberId);
      const mergedCustomers = mergeById(localCustomers, cloudCustomers);
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

      if (localHasData) {
        await pushCustomersToCloud(ownerMemberId, mergedCustomers, mergedRecords, mergedPhotos);
      }
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

  const repo = createCustomerRepository(storage);
  await pushCustomersToCloud(
    memberId,
    repo.getAllCustomers(),
    repo.getAllBodyRecords(),
    repo.getAllProgressPhotos(),
  );
}

export async function ensureCustomerPortalToken(customerId: EntityId): Promise<CustomerPortalToken | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createSupabaseBrowserClient();
  const { data: existing, error: fetchError } = await supabase
    .from("customer_portal_tokens")
    .select("*")
    .eq("customer_id", customerId)
    .is("revoked_at", null)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (existing) {
    return {
      id: existing.id,
      customerId: existing.customer_id,
      token: existing.token,
      expiresAt: existing.expires_at ?? undefined,
      revokedAt: existing.revoked_at ?? undefined,
      createdAt: existing.created_at,
      updatedAt: existing.created_at,
    };
  }

  const { data: created, error: createError } = await supabase
    .from("customer_portal_tokens")
    .insert({ customer_id: customerId })
    .select("*")
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  return {
    id: created.id,
    customerId: created.customer_id,
    token: created.token,
    expiresAt: created.expires_at ?? undefined,
    createdAt: created.created_at,
    updatedAt: created.created_at,
  };
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
