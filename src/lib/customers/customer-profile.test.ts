import { describe, expect, it } from "vitest";
import type { Customer } from "@/types/customer";
import {
  birthYearFromBirthDate,
  findCustomerByPhoneForOwner,
  normalizeCustomerPhone,
  resolveCustomerBirthYear,
} from "./customer-profile";

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "c1",
    ownerMemberId: "m1",
    displayName: "測試客戶",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("customer-profile", () => {
  it("normalizes phone digits only", () => {
    expect(normalizeCustomerPhone("0912-345-678")).toBe("0912345678");
    expect(normalizeCustomerPhone("  ")).toBe("");
  });

  it("finds customer by phone within owner scope", () => {
    const customers = [
      customer({ id: "c1", ownerMemberId: "m1", phone: "0912-345-678" }),
      customer({ id: "c2", ownerMemberId: "m2", phone: "0912345678" }),
      customer({ id: "c3", ownerMemberId: "m1", phone: "0987654321" }),
    ];

    expect(findCustomerByPhoneForOwner(customers, "m1", "0912345678")?.id).toBe("c1");
    expect(findCustomerByPhoneForOwner(customers, "m1", "0987654321")?.id).toBe("c3");
    expect(findCustomerByPhoneForOwner(customers, "m1", "0900000000")).toBeUndefined();
    expect(findCustomerByPhoneForOwner(customers, "m1", "")).toBeUndefined();
  });

  it("derives birth year from birth date when present", () => {
    expect(birthYearFromBirthDate("1990-05-12")).toBe(1990);
    expect(resolveCustomerBirthYear({ birthDate: "1990-05-12", birthYear: 1985 })).toBe(1990);
    expect(resolveCustomerBirthYear({ birthYear: 1985 })).toBe(1985);
  });
});
