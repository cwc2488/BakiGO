"use client";

import { useMemo } from "react";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { ConsultationSessionRecord } from "@/types/consultation";
import type { BodyCompositionRecord, Customer } from "@/types/customer";

export function useConsultationCustomerData(record: ConsultationSessionRecord): {
  customer: Customer | undefined;
  bodyRecord: BodyCompositionRecord | undefined;
} {
  const customerId = record.session.customerId;
  const bodyCompositionRecordId = record.session.bodyCompositionRecordId;

  return useMemo(() => {
    const storage = createLocalStorageAdapter();
    const repo = createCustomerRepository(storage);
    const customer = repo.getCustomerById(customerId);
    const bodyRecord = bodyCompositionRecordId
      ? repo
          .getBodyRecordsByCustomer(customerId)
          .find((item) => item.id === bodyCompositionRecordId)
      : undefined;
    return { customer, bodyRecord };
  }, [customerId, bodyCompositionRecordId]);
}
