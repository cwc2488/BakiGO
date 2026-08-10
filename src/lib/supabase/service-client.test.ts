import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
  SupabaseServiceConfigError,
} from "./service-client";

const VALID_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QifQ.signature";

describe("service-client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects non-ASCII service role keys before creating a client", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "Supabase Dashboard → Settings");

    expect(isSupabaseServiceConfigured()).toBe(false);
    expect(() => createSupabaseServiceClient()).toThrow(SupabaseServiceConfigError);
  });

  it("accepts legacy JWT service role keys", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", VALID_JWT);

    expect(isSupabaseServiceConfigured()).toBe(true);
    expect(() => createSupabaseServiceClient()).not.toThrow();
  });
});
