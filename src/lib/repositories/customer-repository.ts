import type {
  BodyCompositionRecord,
  BodyCompositionRecordCreateInput,
  Customer,
  CustomerCreateInput,
  CustomerProgressPhoto,
  CustomerProgressPhotoCreateInput,
  CustomerReceiptPhoto,
  CustomerReceiptPhotoCreateInput,
  CustomerUpdateInput,
} from "@/types/customer";
import type { EntityId } from "@/types";
import type { StorageAdapter } from "./storage-adapter";
import { STORAGE_KEYS } from "./storage-keys";
import { scheduleCustomerCloudPush } from "@/lib/cloud/customer-cloud-sync";
import {
  computeReceiptRetainUntil,
  isReceiptExpired,
} from "@/lib/customers/customer-receipt-retention";
import { todayISODate } from "@/lib/config/app-config";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `customer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseArray<T>(raw: string | null): T[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface CustomerRepository {
  getAllCustomers(): Customer[];
  getCustomersByOwner(ownerMemberId: EntityId): Customer[];
  getCustomerById(customerId: EntityId): Customer | undefined;
  getCustomerByPipelineLeadId(pipelineLeadId: EntityId): Customer | undefined;
  getCustomerByLinkedMemberId(memberId: EntityId): Customer | undefined;
  createCustomer(input: CustomerCreateInput): Customer;
  updateCustomer(customerId: EntityId, input: CustomerUpdateInput): Customer;
  deleteCustomer(customerId: EntityId): void;
  getAllBodyRecords(): BodyCompositionRecord[];
  getBodyRecordsByCustomer(customerId: EntityId): BodyCompositionRecord[];
  createBodyRecord(input: BodyCompositionRecordCreateInput): BodyCompositionRecord;
  deleteBodyRecord(recordId: EntityId): void;
  getAllProgressPhotos(): CustomerProgressPhoto[];
  getProgressPhotosByCustomer(customerId: EntityId): CustomerProgressPhoto[];
  createProgressPhoto(input: CustomerProgressPhotoCreateInput): CustomerProgressPhoto;
  deleteProgressPhoto(photoId: EntityId): void;
  getAllReceiptPhotos(): CustomerReceiptPhoto[];
  getReceiptPhotosByCustomer(customerId: EntityId): CustomerReceiptPhoto[];
  createReceiptPhoto(input: CustomerReceiptPhotoCreateInput): CustomerReceiptPhoto;
  deleteReceiptPhoto(receiptId: EntityId): void;
  purgeExpiredReceiptPhotos(referenceDate?: string): void;
}

export class LocalStorageCustomerRepository implements CustomerRepository {
  constructor(private readonly storage: StorageAdapter) {}

  getAllCustomers(): Customer[] {
    return parseArray<Customer>(this.storage.getItem(STORAGE_KEYS.customers));
  }

  getCustomersByOwner(ownerMemberId: EntityId): Customer[] {
    return this.getAllCustomers().filter((customer) => customer.ownerMemberId === ownerMemberId);
  }

  getCustomerById(customerId: EntityId): Customer | undefined {
    return this.getAllCustomers().find((customer) => customer.id === customerId);
  }

  getCustomerByPipelineLeadId(pipelineLeadId: EntityId): Customer | undefined {
    return this.getAllCustomers().find((customer) => customer.pipelineLeadId === pipelineLeadId);
  }

  getCustomerByLinkedMemberId(memberId: EntityId): Customer | undefined {
    return this.getAllCustomers().find((customer) => customer.linkedMemberId === memberId);
  }

  createCustomer(input: CustomerCreateInput): Customer {
    const now = new Date().toISOString();
    const customer: Customer = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      ownerMemberId: input.ownerMemberId,
      displayName: input.displayName.trim(),
      phone: input.phone?.trim() || undefined,
      lineId: input.lineId?.trim() || undefined,
      birthYear: input.birthYear,
      heightCm: input.heightCm,
      status: "active",
      pipelineLeadId: input.pipelineLeadId,
      note: input.note?.trim() || undefined,
    };

    const next = [...this.getAllCustomers(), customer];
    this.storage.setItem(STORAGE_KEYS.customers, JSON.stringify(next));
    scheduleCustomerCloudPush();
    return customer;
  }

  updateCustomer(customerId: EntityId, input: CustomerUpdateInput): Customer {
    const customers = this.getAllCustomers();
    const index = customers.findIndex((customer) => customer.id === customerId);
    if (index < 0) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    const now = new Date().toISOString();
    const current = customers[index];
    const updated: Customer = {
      ...current,
      displayName: input.displayName?.trim() ?? current.displayName,
      phone: input.phone === undefined ? current.phone : input.phone.trim() || undefined,
      lineId: input.lineId === undefined ? current.lineId : input.lineId.trim() || undefined,
      birthYear: input.birthYear === undefined ? current.birthYear : input.birthYear,
      heightCm: input.heightCm === undefined ? current.heightCm : input.heightCm,
      status: input.status ?? current.status,
      linkedMemberId:
        input.linkedMemberId === undefined ? current.linkedMemberId : input.linkedMemberId ?? undefined,
      note: input.note === undefined ? current.note : input.note.trim() || undefined,
      lastContactDate: input.lastContactDate === undefined ? current.lastContactDate : input.lastContactDate,
      nextFollowUpDate:
        input.nextFollowUpDate === undefined ? current.nextFollowUpDate : input.nextFollowUpDate,
      updatedAt: now,
    };

    const next = [...customers];
    next[index] = updated;
    this.storage.setItem(STORAGE_KEYS.customers, JSON.stringify(next));
    scheduleCustomerCloudPush();
    return updated;
  }

  deleteCustomer(customerId: EntityId): void {
    const nextCustomers = this.getAllCustomers().filter((customer) => customer.id !== customerId);
    this.storage.setItem(STORAGE_KEYS.customers, JSON.stringify(nextCustomers));

    const nextRecords = this.getAllBodyRecords().filter((record) => record.customerId !== customerId);
    this.storage.setItem(STORAGE_KEYS.customerBodyRecords, JSON.stringify(nextRecords));

    const nextPhotos = this.getAllProgressPhotos().filter((photo) => photo.customerId !== customerId);
    this.storage.setItem(STORAGE_KEYS.customerProgressPhotos, JSON.stringify(nextPhotos));

    const nextReceipts = this.getAllReceiptPhotos().filter((receipt) => receipt.customerId !== customerId);
    this.storage.setItem(STORAGE_KEYS.customerReceiptPhotos, JSON.stringify(nextReceipts));
    scheduleCustomerCloudPush();
  }

  getAllBodyRecords(): BodyCompositionRecord[] {
    return parseArray<BodyCompositionRecord>(this.storage.getItem(STORAGE_KEYS.customerBodyRecords));
  }

  getBodyRecordsByCustomer(customerId: EntityId): BodyCompositionRecord[] {
    return this.getAllBodyRecords()
      .filter((record) => record.customerId === customerId)
      .sort((left, right) => right.recordDate.localeCompare(left.recordDate));
  }

  createBodyRecord(input: BodyCompositionRecordCreateInput): BodyCompositionRecord {
    const now = new Date().toISOString();
    const record: BodyCompositionRecord = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      customerId: input.customerId,
      recordDate: input.recordDate,
      age: input.age ?? null,
      weightKg: input.weightKg ?? null,
      skeletalMuscleKg: input.skeletalMuscleKg ?? null,
      bodyFatKg: input.bodyFatKg ?? null,
      bmi: input.bmi ?? null,
      bodyFatPercent: input.bodyFatPercent ?? null,
      visceralFatLevel: input.visceralFatLevel ?? null,
      basalMetabolicRate: input.basalMetabolicRate ?? null,
      bodyAge: input.bodyAge ?? null,
      note: input.note?.trim() || undefined,
    };

    const next = [...this.getAllBodyRecords(), record];
    this.storage.setItem(STORAGE_KEYS.customerBodyRecords, JSON.stringify(next));
    scheduleCustomerCloudPush();
    return record;
  }

  deleteBodyRecord(recordId: EntityId): void {
    const next = this.getAllBodyRecords().filter((record) => record.id !== recordId);
    this.storage.setItem(STORAGE_KEYS.customerBodyRecords, JSON.stringify(next));
    scheduleCustomerCloudPush();
  }

  getAllProgressPhotos(): CustomerProgressPhoto[] {
    return parseArray<CustomerProgressPhoto>(this.storage.getItem(STORAGE_KEYS.customerProgressPhotos));
  }

  getProgressPhotosByCustomer(customerId: EntityId): CustomerProgressPhoto[] {
    return this.getAllProgressPhotos()
      .filter((photo) => photo.customerId === customerId)
      .sort((left, right) => right.photoDate.localeCompare(left.photoDate));
  }

  createProgressPhoto(input: CustomerProgressPhotoCreateInput): CustomerProgressPhoto {
    const now = new Date().toISOString();
    const photo: CustomerProgressPhoto = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      customerId: input.customerId,
      phase: input.phase,
      angle: input.angle,
      photoDate: input.photoDate,
      imageDataUrl: input.imageDataUrl ?? null,
      note: input.note?.trim() || undefined,
    };

    const next = [...this.getAllProgressPhotos(), photo];
    this.storage.setItem(STORAGE_KEYS.customerProgressPhotos, JSON.stringify(next));
    scheduleCustomerCloudPush();
    return photo;
  }

  deleteProgressPhoto(photoId: EntityId): void {
    const next = this.getAllProgressPhotos().filter((photo) => photo.id !== photoId);
    this.storage.setItem(STORAGE_KEYS.customerProgressPhotos, JSON.stringify(next));
    scheduleCustomerCloudPush();
  }

  getAllReceiptPhotos(): CustomerReceiptPhoto[] {
    return parseArray<CustomerReceiptPhoto>(this.storage.getItem(STORAGE_KEYS.customerReceiptPhotos));
  }

  purgeExpiredReceiptPhotos(referenceDate: string = todayISODate()): void {
    const current = this.getAllReceiptPhotos();
    const active = current.filter((receipt) => !isReceiptExpired(receipt, referenceDate));
    if (active.length !== current.length) {
      this.storage.setItem(STORAGE_KEYS.customerReceiptPhotos, JSON.stringify(active));
      scheduleCustomerCloudPush();
    }
  }

  getReceiptPhotosByCustomer(customerId: EntityId): CustomerReceiptPhoto[] {
    this.purgeExpiredReceiptPhotos();
    return this.getAllReceiptPhotos()
      .filter((receipt) => receipt.customerId === customerId)
      .sort((left, right) => right.receiptDate.localeCompare(left.receiptDate));
  }

  createReceiptPhoto(input: CustomerReceiptPhotoCreateInput): CustomerReceiptPhoto {
    const now = new Date().toISOString();
    const receipt: CustomerReceiptPhoto = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      customerId: input.customerId,
      receiptDate: input.receiptDate,
      imageDataUrl: input.imageDataUrl,
      note: input.note?.trim() || undefined,
      retainUntil: computeReceiptRetainUntil(input.receiptDate),
    };

    const next = [...this.getAllReceiptPhotos(), receipt];
    this.storage.setItem(STORAGE_KEYS.customerReceiptPhotos, JSON.stringify(next));
    scheduleCustomerCloudPush();
    return receipt;
  }

  deleteReceiptPhoto(receiptId: EntityId): void {
    const next = this.getAllReceiptPhotos().filter((receipt) => receipt.id !== receiptId);
    this.storage.setItem(STORAGE_KEYS.customerReceiptPhotos, JSON.stringify(next));
    scheduleCustomerCloudPush();
  }
}

export function createCustomerRepository(storage: StorageAdapter): CustomerRepository {
  return new LocalStorageCustomerRepository(storage);
}
