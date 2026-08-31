import { isValidCloudMemberLevel, resolveCloudMemberRole } from "@/lib/cloud/member-levels";
import { isReservedCloudMemberNumber } from "@/lib/cloud/reserved-member-numbers";
import {
  fetchCloudMemberByEmail,
  fetchCloudMemberByMemberNumber,
  insertCloudMember,
  insertCloudOrganizationRelationship,
} from "@/lib/cloud/cloud-member-service";
import {
  clearCloudMembersMode,
} from "@/lib/cloud/sync-cloud-members-to-local";
import { syncCloudAuthData, startCloudAuthBackgroundSync } from "@/lib/auth/cloud-sync";
import { APP_IDS } from "@/lib/config/app-config";
import { createAuthRepository } from "@/lib/repositories/auth-repository";
import { createMemberRepository } from "@/lib/repositories/member-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { flushPendingCloudSync } from "@/lib/repositories/syncing-storage-adapter";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  AuthError,
  isValidEmail,
  isValidMemberNumber,
  normalizeEmail,
  normalizeMemberNumber,
  type AuthSession,
  type LoginInput,
  type RegisterInput,
} from "@/types/auth";
import type { EntityId } from "@/types";
import type { Member } from "@/types/member";

function assertSupabaseConfigured(): void {
  if (!isSupabaseConfigured()) {
    throw new AuthError(
      "supabase_not_configured",
      "雲端資料庫尚未設定，請設定 Supabase 環境變數",
    );
  }
}

function writeLocalSession(
  storage: StorageAdapter,
  member: { id: EntityId; memberNumber: string; email: string },
): AuthSession {
  const session: AuthSession = {
    memberId: member.id,
    memberNumber: member.memberNumber,
    herbalifeMemberId: member.memberNumber,
    email: member.email,
    signedInAt: new Date().toISOString(),
  };
  createAuthRepository(storage).writeSession(session);
  return session;
}

async function finalizeCloudAuth(
  storage: StorageAdapter,
  member: { id: EntityId; memberNumber: string; email: string },
  options?: { awaitSync?: boolean },
): Promise<AuthSession> {
  const session = writeLocalSession(storage, member);

  if (options?.awaitSync === false) {
    void startCloudAuthBackgroundSync(storage, member);
    return session;
  }

  await syncCloudAuthData(storage, member);
  return session;
}

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
  assertSupabaseConfigured();

  const memberNumber = normalizeMemberNumber(input.memberNumber);
  const email = normalizeEmail(input.email);
  const sponsorMemberNumber = input.sponsorMemberNumber
    ? normalizeMemberNumber(input.sponsorMemberNumber)
    : "";

  if (!isValidMemberNumber(memberNumber)) {
    throw new AuthError("invalid_credentials", "請輸入賀寶芙會員編號");
  }

  if (isReservedCloudMemberNumber(memberNumber)) {
    throw new AuthError("invalid_credentials", "此會員編號為系統保留，無法註冊");
  }

  if (!isValidEmail(email)) {
    throw new AuthError("invalid_credentials", "請輸入有效的 Email");
  }

  if (!isValidCloudMemberLevel(input.currentLevel)) {
    throw new AuthError("invalid_credentials", "請選擇目前資格");
  }

  if (input.password.length < 6) {
    throw new AuthError("invalid_credentials", "密碼至少需要 6 個字元");
  }

  const supabase = createSupabaseBrowserClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: input.password,
  });

  if (signUpError) {
    if (signUpError.message.toLowerCase().includes("already")) {
      throw new AuthError("duplicate_email", "此 Email 已被使用");
    }
    throw new AuthError("invalid_credentials", signUpError.message);
  }

  if (!signUpData.session) {
    throw new AuthError(
      "invalid_credentials",
      "註冊成功但尚未完成 Email 驗證，請至信箱確認後再登入",
    );
  }

  const existingNumber = await fetchCloudMemberByMemberNumber(memberNumber);
  if (existingNumber) {
    await supabase.auth.signOut();
    throw new AuthError("duplicate_member_number", "此賀寶芙會員編號已被使用");
  }

  const existingEmail = await fetchCloudMemberByEmail(email);
  if (existingEmail) {
    await supabase.auth.signOut();
    throw new AuthError("duplicate_email", "此 Email 已被使用");
  }

  if (sponsorMemberNumber) {
    const sponsor = await fetchCloudMemberByMemberNumber(sponsorMemberNumber);
    if (!sponsor) {
      await supabase.auth.signOut();
      throw new AuthError(
        "sponsor_not_found",
        sponsorMemberNumber === "00000"
          ? "虛擬上線 00000 尚未建立，請聯絡管理員在 Supabase 執行初始化 SQL"
          : "推薦人會員編號不存在",
      );
    }
  }

  let cloudMember;
  try {
    cloudMember = await insertCloudMember({
      memberNumber,
      name: input.name.trim(),
      email,
      role: resolveCloudMemberRole(input.currentLevel),
      currentLevel: input.currentLevel,
      sponsorMemberNumber: sponsorMemberNumber || null,
    });

    if (sponsorMemberNumber) {
      await insertCloudOrganizationRelationship({
        parentMemberNumber: sponsorMemberNumber,
        childMemberNumber: memberNumber,
      });
    }
  } catch (error) {
    await supabase.auth.signOut();
    throw new AuthError(
      "cloud_sync_failed",
      error instanceof Error ? error.message : "無法建立雲端會員資料",
    );
  }

  return finalizeCloudAuth(storage, {
    id: cloudMember.id,
    memberNumber: cloudMember.memberNumber,
    email: cloudMember.email,
  });
}

export async function loginAccount(
  input: LoginInput,
  storage: StorageAdapter = createLocalStorageAdapter(),
): Promise<AuthSession> {
  assertSupabaseConfigured();

  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    throw new AuthError("invalid_credentials", "請輸入有效的 Email");
  }

  const supabase = createSupabaseBrowserClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });

  if (signInError) {
    throw new AuthError("invalid_credentials", "Email 或密碼錯誤");
  }

  const cloudMember = await fetchCloudMemberByEmail(email);
  if (!cloudMember) {
    await supabase.auth.signOut();
    throw new AuthError("member_not_found", "找不到對應的會員資料，請先完成註冊");
  }

  return finalizeCloudAuth(storage, {
    id: cloudMember.id,
    memberNumber: cloudMember.memberNumber,
    email: cloudMember.email,
  });
}

export async function restoreCloudSession(
  storage: StorageAdapter = createLocalStorageAdapter(),
): Promise<AuthSession | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user.email) {
    return null;
  }

  const cloudMember = await fetchCloudMemberByEmail(data.session.user.email);
  if (!cloudMember) {
    return null;
  }

  return finalizeCloudAuth(storage, {
    id: cloudMember.id,
    memberNumber: cloudMember.memberNumber,
    email: cloudMember.email,
  }, { awaitSync: false });
}

export async function logoutAccount(
  storage: StorageAdapter = createLocalStorageAdapter(),
): Promise<void> {
  flushPendingCloudSync();

  if (isSupabaseConfigured()) {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
  }

  createAuthRepository(storage).writeSession(null);
  clearCloudMembersMode(storage);
}

/** Legacy bootstrap — skipped when Supabase cloud mode is active. */
export async function ensureBootstrapPresidentAccount(
  storage: StorageAdapter = createLocalStorageAdapter(),
): Promise<void> {
  if (isSupabaseConfigured()) {
    return;
  }

  const authRepository = createAuthRepository(storage);
  if (authRepository.getAccountByHerbalifeMemberId("ROOT00001")) {
    return;
  }

  const member = createMemberRepository(storage).getByHerbalifeMemberId("ROOT00001");
  if (!member) {
    return;
  }

  const { hashPassword } = await import("@/lib/auth/password");
  authRepository.createAccount({
    herbalifeMemberId: "ROOT00001",
    passwordHash: await hashPassword("President123"),
    memberId: member.id,
    createdAt: new Date().toISOString(),
  });
}
