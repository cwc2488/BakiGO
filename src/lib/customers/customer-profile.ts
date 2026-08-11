import type { Customer } from "@/types/customer";
import type { EntityId } from "@/types";

export function normalizeCustomerPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function findCustomerByPhoneForOwner(
  customers: Customer[],
  ownerMemberId: EntityId,
  phone: string,
): Customer | undefined {
  const normalized = normalizeCustomerPhone(phone);
  if (!normalized) {
    return undefined;
  }

  return customers.find((customer) => {
    if (customer.ownerMemberId !== ownerMemberId || !customer.phone) {
      return false;
    }
    return normalizeCustomerPhone(customer.phone) === normalized;
  });
}

export function birthYearFromBirthDate(birthDate: string): number | undefined {
  const year = Number(birthDate.slice(0, 4));
  return Number.isFinite(year) ? year : undefined;
}

export function resolveCustomerBirthYear(customer: {
  birthDate?: string;
  birthYear?: number;
}): number | undefined {
  if (customer.birthDate) {
    return birthYearFromBirthDate(customer.birthDate);
  }
  return customer.birthYear;
}
