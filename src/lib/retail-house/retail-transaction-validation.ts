import { getEventTypeDefinition } from "@/lib/event-center/event-types";
import {
  buildGregorianDate,
  validateGregorianDateParts,
  type GregorianDateParts,
} from "@/lib/retail-house/retail-house-gregorian-date";
import { isCustomerTransactionType } from "@/lib/retail-house/resolve-transaction-points";
import type { ISODateString } from "@/types";

export interface RetailTransactionMutationInput {
  eventTypeKey: string;
  dateParts: GregorianDateParts;
  customerName: string;
  customerPhone?: string;
  /** 成交金額（NTD）或會員 VP，依類型而定。 */
  value: number;
  /**
   * 顧客成交的零售 VP（使用者自行輸入）。
   * 不可從金額推算，也不是排行榜／遊戲化積分。
   * 教練課等服務成交允許 0。
   */
  retailVp?: number;
  note?: string;
}

/**
 * Pure validation — referenceDate required to avoid auth/app-config cycles in tests.
 */
export function validateRetailTransactionMutation(
  input: RetailTransactionMutationInput,
  referenceDate: ISODateString,
): { eventDate: ISODateString } | { error: string } {
  const dateError = validateGregorianDateParts(input.dateParts, referenceDate);
  if (dateError) {
    return { error: dateError };
  }

  const definition = getEventTypeDefinition(input.eventTypeKey);
  if (!definition || definition.category !== "transaction") {
    return { error: "請選擇有效的成交類型。" };
  }

  if (!input.customerName.trim()) {
    return { error: "請輸入姓名。" };
  }

  if (!Number.isFinite(input.value) || input.value <= 0) {
    return {
      error: isCustomerTransactionType(input.eventTypeKey)
        ? "請輸入有效的成交金額。"
        : "請輸入有效的 VP。",
    };
  }

  if (isCustomerTransactionType(input.eventTypeKey)) {
    // Product VP may be 0 (e.g. 教練課 with revenue but no product VP).
    // Reject only missing / non-finite / negative — never require VP > 0.
    if (input.retailVp === undefined || !Number.isFinite(input.retailVp) || input.retailVp < 0) {
      return { error: "請輸入有效的 VP（可為 0；由成交自行填寫，不可自動推算）。" };
    }
  }

  return { eventDate: buildGregorianDate(input.dateParts) };
}
