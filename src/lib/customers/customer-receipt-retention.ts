import type { ISODateString } from "@/types/common";
import type { CustomerReceiptPhoto } from "@/types/customer";

export const CUSTOMER_RECEIPT_RETENTION_YEARS = 2;

export function computeReceiptRetainUntil(receiptDate: ISODateString): ISODateString {
  const [year, month, day] = receiptDate.split("-").map(Number);
  return `${year + CUSTOMER_RECEIPT_RETENTION_YEARS}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isReceiptExpired(
  receipt: Pick<CustomerReceiptPhoto, "retainUntil">,
  today: ISODateString,
): boolean {
  return receipt.retainUntil < today;
}
