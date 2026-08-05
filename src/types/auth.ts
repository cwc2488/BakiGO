import type { EntityId } from "./common";

export interface AuthSession {
  memberId: EntityId;
  /** Herbalife member number */
  memberNumber: string;
  /** @deprecated Use memberNumber — kept for existing call sites */
  herbalifeMemberId: string;
  email: string;
  signedInAt: string;
}

export interface AuthAccount {
  herbalifeMemberId: string;
  passwordHash: string;
  memberId: EntityId;
  createdAt: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  memberNumber: string;
  sponsorMemberNumber?: string;
  currentLevel: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export type AuthErrorCode =
  | "duplicate_member_number"
  | "duplicate_email"
  | "sponsor_not_found"
  | "invalid_credentials"
  | "member_not_found"
  | "supabase_not_configured"
  | "cloud_sync_failed";

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function normalizeMemberNumber(value: string): string {
  return value.trim();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** @deprecated Use normalizeMemberNumber */
export function normalizeHerbalifeMemberId(value: string): string {
  return normalizeMemberNumber(value);
}

export function isValidMemberNumber(value: string): boolean {
  return normalizeMemberNumber(value).length > 0;
}

/** @deprecated Use isValidMemberNumber */
export function isValidHerbalifeMemberId(value: string): boolean {
  return isValidMemberNumber(value);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}
