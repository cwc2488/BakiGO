import { APP_IDS } from "@/lib/config/app-config";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createAuthRepository } from "@/lib/repositories/auth-repository";
import { createMemberRepository } from "@/lib/repositories/member-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import {
  AuthError,
  isValidHerbalifeMemberId,
  normalizeHerbalifeMemberId,
  type AuthSession,
  type LoginInput,
  type RegisterInput,
} from "@/types/auth";
import type { EntityId } from "@/types";
import type { Member } from "@/types/member";
import { getOrganizationId } from "./organization-access";
import {
  isValidRegistrationRankKey,
  resolveRegistrationRoleKey,
} from "./registration-ranks";

export function getCurrentMemberId(
  storage: StorageAdapter = createLocalStorageAdapter(),
): EntityId | null {
  return createAuthRepository(storage).readSession()?.memberId ?? null;
}

export function getCurrentSession(
  storage: StorageAdapter = createLocalStorageAdapter(),
): AuthSession | null {
  return createAuthRepository(storage).readSession();
}

export function resolveAuthenticatedMemberId(
  storage: StorageAdapter = createLocalStorageAdapter(),
): EntityId {
  return getCurrentMemberId(storage) ?? APP_IDS.currentMemberId;
}

export function getCurrentMember(
  storage: StorageAdapter = createLocalStorageAdapter(),
): Member | null {
  const memberId = getCurrentMemberId(storage);
  if (!memberId) {
    return null;
  }
  return createMemberRepository(storage).getById(memberId) ?? null;
}

export async function registerAccount(
  input: RegisterInput,
  storage: StorageAdapter = createLocalStorageAdapter(),
): Promise<AuthSession> {
  const herbalifeMemberId = normalizeHerbalifeMemberId(input.herbalifeMemberId);
  const sponsorHerbalifeMemberId = normalizeHerbalifeMemberId(input.sponsorHerbalifeMemberId);

  if (!isValidHerbalifeMemberId(herbalifeMemberId)) {
    throw new AuthError("invalid_credentials", "請輸入會員編號");
  }

  if (herbalifeMemberId === APP_IDS.virtualUplineHerbalifeMemberId) {
    throw new AuthError("duplicate_herbalife_member_id", "此會員編號為系統保留");
  }

  if (!isValidHerbalifeMemberId(sponsorHerbalifeMemberId)) {
    throw new AuthError("sponsor_not_found", "請輸入推薦人會員編號");
  }

  const memberRepository = createMemberRepository(storage);
  const authRepository = createAuthRepository(storage);

  if (memberRepository.getByHerbalifeMemberId(herbalifeMemberId)) {
    throw new AuthError("duplicate_herbalife_member_id", "此會員編號已被使用");
  }

  if (authRepository.getAccountByHerbalifeMemberId(herbalifeMemberId)) {
    throw new AuthError("duplicate_herbalife_member_id", "此會員編號已被使用");
  }

  const sponsor = memberRepository.getByHerbalifeMemberId(sponsorHerbalifeMemberId);
  if (!sponsor) {
    throw new AuthError("sponsor_not_found", "推薦人會員編號不存在，無法建立帳號");
  }

  if (!isValidRegistrationRankKey(input.rankKey)) {
    throw new AuthError("invalid_credentials", "請選擇有效的位階");
  }

  const member = memberRepository.create({
    organizationId: getOrganizationId(),
    herbalifeMemberId,
    displayName: input.displayName.trim(),
    email: input.email.trim(),
    joinedAt: input.joinedAt,
    sponsorMemberId: sponsor.id,
    status: "active",
    tags: [],
    rankKey: input.rankKey,
    roleKey: resolveRegistrationRoleKey(input.rankKey),
  });

  const passwordHash = await hashPassword(input.password);
  authRepository.createAccount({
    herbalifeMemberId,
    passwordHash,
    memberId: member.id,
    createdAt: new Date().toISOString(),
  });

  const session: AuthSession = {
    memberId: member.id,
    herbalifeMemberId,
    signedInAt: new Date().toISOString(),
  };
  authRepository.writeSession(session);
  return session;
}

export async function loginAccount(
  input: LoginInput,
  storage: StorageAdapter = createLocalStorageAdapter(),
): Promise<AuthSession> {
  const herbalifeMemberId = normalizeHerbalifeMemberId(input.herbalifeMemberId);
  const authRepository = createAuthRepository(storage);
  const account = authRepository.getAccountByHerbalifeMemberId(herbalifeMemberId);

  if (!account) {
    throw new AuthError("invalid_credentials", "會員編號或密碼錯誤");
  }

  const valid = await verifyPassword(input.password, account.passwordHash);
  if (!valid) {
    throw new AuthError("invalid_credentials", "會員編號或密碼錯誤");
  }

  const member = createMemberRepository(storage).getById(account.memberId);
  if (!member) {
    throw new AuthError("member_not_found", "找不到對應的會員資料");
  }

  const session: AuthSession = {
    memberId: member.id,
    herbalifeMemberId: member.herbalifeMemberId,
    signedInAt: new Date().toISOString(),
  };
  authRepository.writeSession(session);
  return session;
}

export async function ensureBootstrapPresidentAccount(
  storage: StorageAdapter = createLocalStorageAdapter(),
): Promise<void> {
  const authRepository = createAuthRepository(storage);
  if (authRepository.getAccountByHerbalifeMemberId("ROOT00001")) {
    return;
  }

  const member = createMemberRepository(storage).getByHerbalifeMemberId("ROOT00001");
  if (!member) {
    return;
  }

  authRepository.createAccount({
    herbalifeMemberId: "ROOT00001",
    passwordHash: await hashPassword("President123"),
    memberId: member.id,
    createdAt: new Date().toISOString(),
  });
}

export function logoutAccount(
  storage: StorageAdapter = createLocalStorageAdapter(),
): void {
  createAuthRepository(storage).writeSession(null);
}
