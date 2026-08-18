import { resolveIsSuperAdmin } from "@/lib/auth/super-admin";

export class SuperAdminAccessError extends Error {
  constructor(
    message: string,
    readonly status: number = 403,
  ) {
    super(message);
    this.name = "SuperAdminAccessError";
  }
}

export async function assertSuperAdmin(memberId: string): Promise<void> {
  let isAdmin = false;
  try {
    isAdmin = await resolveIsSuperAdmin(memberId);
  } catch (error) {
    throw new SuperAdminAccessError(
      error instanceof Error ? error.message : "Failed to resolve Super Admin access.",
      500,
    );
  }
  if (!isAdmin) {
    throw new SuperAdminAccessError("Super Admin access required.", 403);
  }
}
