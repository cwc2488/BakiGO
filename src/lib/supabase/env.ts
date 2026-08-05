declare global {
  interface Window {
    __BAKI_SUPABASE__?: {
      url?: string;
      anonKey?: string;
    };
  }
}

export function readSupabaseEnv(): { url: string; anonKey: string } {
  if (typeof window !== "undefined") {
    const runtime = window.__BAKI_SUPABASE__;
    if (runtime?.url && runtime?.anonKey) {
      return { url: runtime.url, anonKey: runtime.anonKey };
    }
  }

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = readSupabaseEnv();
  return Boolean(url && anonKey);
}

export function getSupabaseEnvScript(): string {
  const payload = JSON.stringify({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  });
  return `window.__BAKI_SUPABASE__=${payload};`;
}
