import type { AuthAccount, AuthSession } from "@/types/auth";
import { normalizeHerbalifeMemberId } from "@/types/auth";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";

function parseAccounts(raw: string | null): AuthAccount[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as AuthAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface AuthRepository {
  getAllAccounts(): AuthAccount[];
  getAccountByHerbalifeMemberId(herbalifeMemberId: string): AuthAccount | undefined;
  createAccount(account: AuthAccount): AuthAccount;
  readSession(): AuthSession | null;
  writeSession(session: AuthSession | null): void;
}

export class LocalStorageAuthRepository implements AuthRepository {
  constructor(private readonly storage: StorageAdapter) {}

  getAllAccounts(): AuthAccount[] {
    return parseAccounts(this.storage.getItem(STORAGE_KEYS.authAccounts));
  }

  getAccountByHerbalifeMemberId(herbalifeMemberId: string): AuthAccount | undefined {
    const normalized = normalizeHerbalifeMemberId(herbalifeMemberId);
    return this.getAllAccounts().find(
      (account) => account.herbalifeMemberId === normalized,
    );
  }

  createAccount(account: AuthAccount): AuthAccount {
    const next = [...this.getAllAccounts(), account];
    this.storage.setItem(STORAGE_KEYS.authAccounts, JSON.stringify(next));
    return account;
  }

  readSession(): AuthSession | null {
    const raw = this.storage.getItem(STORAGE_KEYS.authSession);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthSession;
    } catch {
      return null;
    }
  }

  writeSession(session: AuthSession | null): void {
    if (!session) {
      this.storage.removeItem(STORAGE_KEYS.authSession);
      return;
    }
    this.storage.setItem(STORAGE_KEYS.authSession, JSON.stringify(session));
  }
}

export function createAuthRepository(storage: StorageAdapter): AuthRepository {
  return new LocalStorageAuthRepository(storage);
}
