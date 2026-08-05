import { APP_IDS } from "@/lib/config/app-config";
import { countLinkedDownline } from "@/lib/promotions/promotion-selectors";
import { loadAllMembers } from "@/lib/members/member-service";
import type {
  PromotionCampaign,
  PromotionCampaignCreateInput,
} from "@/types/promotion-campaign";
import type { EntityId } from "@/types";
import type { StorageAdapter } from "./storage-adapter";
import { STORAGE_KEYS } from "./storage-keys";

export interface PromotionRepository {
  getAll(): PromotionCampaign[];
  create(input: PromotionCampaignCreateInput): PromotionCampaign;
  delete(campaignId: EntityId): void;
}

function parseCampaigns(raw: string | null): PromotionCampaign[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as PromotionCampaign[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((campaign) => ({
      ...campaign,
      linkedDownlineCount: campaign.linkedDownlineCount ?? 0,
    }));
  } catch {
    return [];
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `promo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class LocalStoragePromotionRepository implements PromotionRepository {
  constructor(private readonly storage: StorageAdapter) {}

  getAll(): PromotionCampaign[] {
    return parseCampaigns(this.storage.getItem(STORAGE_KEYS.promotionCampaigns)).sort((left, right) =>
      String(right.createdAt).localeCompare(String(left.createdAt)),
    );
  }

  create(input: PromotionCampaignCreateInput): PromotionCampaign {
    const now = new Date().toISOString();
    const members = loadAllMembers(this.storage);
    const linkedDownlineCount = countLinkedDownline(input.createdByMemberId, members);

    const campaign: PromotionCampaign = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      organizationId: input.organizationId,
      createdByMemberId: input.createdByMemberId,
      linkedDownlineCount,
      title: input.title.trim(),
      description: input.description?.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      tiers: input.tiers.map((tier, index) => ({
        ...tier,
        tierLevel: tier.tierLevel || index + 1,
      })),
      status: "active",
    };

    const next = [...this.getAll(), campaign];
    this.storage.setItem(STORAGE_KEYS.promotionCampaigns, JSON.stringify(next));
    return campaign;
  }

  delete(campaignId: EntityId): void {
    const next = this.getAll().filter((campaign) => campaign.id !== campaignId);
    this.storage.setItem(STORAGE_KEYS.promotionCampaigns, JSON.stringify(next));
  }
}

export function createPromotionRepository(storage: StorageAdapter): PromotionRepository {
  return new LocalStoragePromotionRepository(storage);
}

export function loadOrganizationPromotions(storage: StorageAdapter): PromotionCampaign[] {
  return createPromotionRepository(storage)
    .getAll()
    .filter((campaign) => campaign.organizationId === APP_IDS.organizationId);
}
