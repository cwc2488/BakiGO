export const THREADS_OAUTH_SCOPES = [
  "threads_basic",
  "threads_profile_discovery",
  "threads_keyword_search",
] as const;

export const META_REVIEW_SESSION_COOKIE = "baki_meta_review_session";
export const META_REVIEW_OAUTH_STATE_COOKIE = "baki_meta_review_oauth_state";

export function getThreadsGraphApiOrigin(): string {
  return process.env.THREADS_GRAPH_API_ORIGIN?.replace(/\/$/, "") ?? "https://graph.threads.net";
}

export function getThreadsApiBaseUrl(): string {
  return `${getThreadsGraphApiOrigin()}/v1.0`;
}

export function getThreadsOAuthAuthorizeUrl(): string {
  return process.env.THREADS_OAUTH_AUTHORIZE_URL ?? "https://threads.net/oauth/authorize";
}

export function getThreadsOAuthTokenUrl(): string {
  return `${getThreadsGraphApiOrigin()}/oauth/access_token`;
}

export const PRODUCTION_META_REVIEW_REDIRECT_URI =
  "https://bakigo.tw/api/meta-review/auth/callback";

function isLocalDevOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function getMetaReviewRedirectUri(origin: string): string {
  if (isLocalDevOrigin(origin)) {
    return `${origin.replace(/\/$/, "")}/api/meta-review/auth/callback`;
  }
  return PRODUCTION_META_REVIEW_REDIRECT_URI;
}

export function isMetaReviewConfigured(): boolean {
  return Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET);
}

export function requireMetaReviewConfig(): { appId: string; appSecret: string } {
  const appId = process.env.THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Meta Review demo is not configured. Set THREADS_APP_ID and THREADS_APP_SECRET.");
  }
  return { appId, appSecret };
}
