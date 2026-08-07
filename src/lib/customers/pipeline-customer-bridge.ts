import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import { createRetailLeadRepository } from "@/lib/repositories/retail-lead-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { Customer } from "@/types/customer";
import type { EntityId } from "@/types";

export function getCustomerForPipelineLead(
  pipelineLeadId: EntityId,
  storage: StorageAdapter,
): Customer | undefined {
  return createCustomerRepository(storage).getCustomerByPipelineLeadId(pipelineLeadId);
}

export function createCustomerFromPipelineLead(
  pipelineLeadId: EntityId,
  storage: StorageAdapter,
): Customer {
  const customerRepo = createCustomerRepository(storage);
  const existing = customerRepo.getCustomerByPipelineLeadId(pipelineLeadId);
  if (existing) {
    return existing;
  }

  const lead = createRetailLeadRepository(storage).getById(pipelineLeadId);
  if (!lead) {
    throw new Error("找不到名單");
  }

  const memberId = resolveAuthenticatedMemberId(storage);
  if (!memberId || lead.ownerMemberId !== memberId) {
    throw new Error("無權限建立此顧客");
  }

  return customerRepo.createCustomer({
    ownerMemberId: lead.ownerMemberId,
    displayName: lead.displayName,
    pipelineLeadId: lead.id,
    note: lead.note,
  });
}
