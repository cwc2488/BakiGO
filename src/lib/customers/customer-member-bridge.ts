import { isDownlineMember } from "@/lib/auth/organization-access";
import { getCurrentMember, resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { getMemberDisplayName, loadAllMembers } from "@/lib/members/member-service";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId } from "@/types";
import type { Customer } from "@/types/customer";
import type { Member } from "@/types/member";

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function getCustomerLinkedToMember(
  memberId: EntityId,
  storage: StorageAdapter,
): Customer | undefined {
  return createCustomerRepository(storage)
    .getAllCustomers()
    .find((customer) => customer.linkedMemberId === memberId);
}

export function findSuggestedMembersForCustomer(
  customer: Customer,
  candidates: Member[],
): Member[] {
  const customerName = normalize(customer.displayName);
  const customerPhone = normalize(customer.phone);

  return candidates.filter((member) => {
    const memberName = normalize(getMemberDisplayName(member));
    const memberPhone = normalize(member.phone);

    if (customerName && memberName === customerName) {
      return true;
    }
    if (customerPhone && memberPhone && customerPhone === memberPhone) {
      return true;
    }
    return false;
  });
}

export function findLinkableDownlineMembers(
  customer: Customer,
  viewer: Member,
  storage: StorageAdapter,
): Member[] {
  const allMembers = loadAllMembers(storage);
  const repo = createCustomerRepository(storage);
  const linkedMemberIds = new Set(
    repo.getAllCustomers().flatMap((item) => (item.linkedMemberId ? [item.linkedMemberId] : [])),
  );

  const downline = allMembers.filter(
    (member) =>
      member.id !== viewer.id &&
      isDownlineMember(viewer.id, member.id, allMembers) &&
      !linkedMemberIds.has(member.id),
  );

  const suggested = findSuggestedMembersForCustomer(customer, downline);
  const suggestedIds = new Set(suggested.map((member) => member.id));
  const rest = downline.filter((member) => !suggestedIds.has(member.id));

  return [...suggested, ...rest.sort((left, right) =>
    getMemberDisplayName(left).localeCompare(getMemberDisplayName(right), "zh-Hant"),
  )];
}

export function linkCustomerToMember(
  customerId: EntityId,
  memberId: EntityId,
  storage: StorageAdapter,
): Customer {
  const ownerMemberId = resolveAuthenticatedMemberId(storage);
  if (!ownerMemberId) {
    throw new Error("請先登入");
  }

  const allMembers = loadAllMembers(storage);
  const viewer = allMembers.find((member) => member.id === ownerMemberId);
  if (!viewer || !isDownlineMember(viewer.id, memberId, allMembers)) {
    throw new Error("只能關聯你的下線夥伴");
  }

  const repo = createCustomerRepository(storage);
  const existing = repo.getAllCustomers().find((item) => item.linkedMemberId === memberId);
  if (existing && existing.id !== customerId) {
    throw new Error("此夥伴已關聯其他顧客檔案");
  }

  return repo.updateCustomer(customerId, {
    linkedMemberId: memberId,
    status: "converted",
  });
}

export function unlinkCustomerFromMember(customerId: EntityId, storage: StorageAdapter): Customer {
  return createCustomerRepository(storage).updateCustomer(customerId, {
    linkedMemberId: null,
    status: "active",
  });
}

export function tryAutoLinkCustomerOnMemberJoin(
  member: Member,
  storage: StorageAdapter,
): Customer | null {
  const sponsorId = member.sponsorMemberId;
  if (!sponsorId) {
    return null;
  }

  const repo = createCustomerRepository(storage);
  const candidates = repo.getCustomersByOwner(sponsorId).filter((customer) => !customer.linkedMemberId);

  const memberName = normalize(getMemberDisplayName(member));
  const memberPhone = normalize(member.phone);

  const match = candidates.find((customer) => {
    const customerName = normalize(customer.displayName);
    const customerPhone = normalize(customer.phone);
    return (
      (customerName && memberName === customerName) ||
      (customerPhone && memberPhone && customerPhone === memberPhone)
    );
  });

  if (!match) {
    return null;
  }

  return repo.updateCustomer(match.id, {
    linkedMemberId: member.id,
    status: "converted",
  });
}
