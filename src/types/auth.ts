import type { EntityId, ISODateString } from "./common";

export interface AuthSession {
  memberId: EntityId;
  herbalifeMemberId: string;
  signedInAt: string;
}

export interface AuthAccount {
  herbalifeMemberId: string;
  passwordHash: string;
  memberId: EntityId;
  createdAt: string;
}

export interface RegisterInput {
  displayName: string;
  herbalifeMemberId: string;
  sponsorHerbalifeMemberId: string;
  email: string;
  password: string;
  joinedAt: ISODateString;
  rankKey: string;
}

export interface LoginInput {
  herbalifeMemberId: string;
  password: string;
}

export type AuthErrorCode =
  | "duplicate_herbalife_member_id"
  | "sponsor_not_found"
  | "invalid_credentials"
  | "member_not_found";

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function normalizeHerbalifeMemberId(value: string): string {
  return value.trim();
}

export function isValidHerbalifeMemberId(value: string): boolean {
  return normalizeHerbalifeMemberId(value).length > 0;
}
