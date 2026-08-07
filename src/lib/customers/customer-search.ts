import type { Customer } from "@/types/customer";

export function searchCustomers<T extends Customer>(customers: T[], query: string): T[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return customers;
  }

  return customers.filter((customer) => {
    const haystack = [
      customer.displayName,
      customer.phone,
      customer.lineId,
      customer.note,
      customer.status === "converted" ? "已加入夥伴" : null,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(trimmed);
  });
}
