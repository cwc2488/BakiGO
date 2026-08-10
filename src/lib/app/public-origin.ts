export const PRODUCTION_APP_ORIGIN = "https://bakigo.tw";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, "");
}

function getConfiguredOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) {
    return null;
  }
  return normalizeOrigin(configured);
}

export function isLocalDevOrigin(origin: string): boolean {
  try {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function isVercelPreviewOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    if (!hostname.endsWith(".vercel.app")) {
      return false;
    }
    return hostname !== "baki-go.vercel.app";
  } catch {
    return false;
  }
}

export function getPublicAppOrigin(requestOrigin?: string | null): string {
  const configured = getConfiguredOrigin();
  if (configured) {
    return configured;
  }

  if (requestOrigin) {
    const normalized = normalizeOrigin(requestOrigin);
    if (isLocalDevOrigin(normalized)) {
      return normalized;
    }
    if (isVercelPreviewOrigin(normalized)) {
      return normalized;
    }
  }

  if (process.env.VERCEL_ENV === "preview" && requestOrigin) {
    return normalizeOrigin(requestOrigin);
  }

  if (process.env.VERCEL_ENV === "development" || !process.env.VERCEL) {
    return requestOrigin ? normalizeOrigin(requestOrigin) : "http://localhost:3000";
  }

  return PRODUCTION_APP_ORIGIN;
}

export function getPublicShareOrigin(currentOrigin: string): string {
  return getPublicAppOrigin(currentOrigin);
}

export function buildPublicShareUrl(path: string, currentOrigin?: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const origin =
    typeof window !== "undefined"
      ? getPublicShareOrigin(window.location.origin)
      : getPublicAppOrigin(currentOrigin ?? null);
  return `${origin}${normalizedPath}`;
}
