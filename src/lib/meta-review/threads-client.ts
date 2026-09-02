import {
  getMetaReviewRedirectUri,
  getThreadsApiBaseUrl,
  getThreadsOAuthAuthorizeUrl,
  getThreadsOAuthTokenUrl,
  requireMetaReviewConfig,
} from "./config";
import { parseThreadsGraphError, sanitizeErrorMessage } from "./sanitize-error";
import type { MetaReviewSession } from "./session";

type TokenExchangeResponse = {
  access_token?: string;
  user_id?: string | number;
  expires_in?: number;
};

type ThreadsMeResponse = {
  id?: string;
  username?: string;
  name?: string;
  threads_profile_picture_url?: string;
  threads_biography?: string;
  is_verified?: boolean;
};

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(sanitizeErrorMessage(text.slice(0, 240)));
  }
}

const CAPTURED_META_HEADERS = [
  "x-app-usage",
  "x-business-use-case-usage",
  "x-ad-account-usage",
  "retry-after",
] as const;

export function captureMetaUsageHeaders(headers: Headers): Record<string, string> {
  const captured: Record<string, string> = {};
  for (const name of CAPTURED_META_HEADERS) {
    const value = headers.get(name);
    if (value) captured[name] = value;
  }
  return captured;
}

async function threadsGetResult<T>(
  path: string,
  accessToken: string,
  params: Record<string, string | number | undefined>,
): Promise<{ payload: T; http_status: number; headers: Record<string, string> }> {
  const url = new URL(`${getThreadsApiBaseUrl()}${path}`);
  url.searchParams.set("access_token", accessToken);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });
  const payload = await parseJsonResponse(response);
  const headers = captureMetaUsageHeaders(response.headers);
  if (!response.ok) {
    const error = new Error(parseThreadsGraphError(payload));
    (error as Error & { http_status?: number }).http_status = response.status;
    throw error;
  }
  return { payload: payload as T, http_status: response.status, headers };
}

async function threadsGet<T>(
  path: string,
  accessToken: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const result = await threadsGetResult<T>(path, accessToken, params);
  return result.payload;
}

export async function exchangeAuthorizationCode(
  code: string,
  origin: string,
): Promise<{ accessToken: string; userId: string; expiresAt: number }> {
  const { appId, appSecret } = requireMetaReviewConfig();
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: getMetaReviewRedirectUri(origin),
    code,
  });

  const response = await fetch(getThreadsOAuthTokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  const payload = (await parseJsonResponse(response)) as TokenExchangeResponse;
  if (!response.ok) {
    throw new Error(parseThreadsGraphError(payload));
  }

  const accessToken = payload.access_token;
  const userId = payload.user_id ? String(payload.user_id) : "";
  if (!accessToken || !userId) {
    throw new Error("Threads OAuth succeeded but access token or user ID was missing.");
  }

  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  return {
    accessToken,
    userId,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

export async function fetchAuthenticatedProfile(accessToken: string): Promise<ThreadsMeResponse> {
  return threadsGet<ThreadsMeResponse>("/me", accessToken, {
    fields: "id,username,name,threads_profile_picture_url,threads_biography,is_verified",
  });
}

export async function buildSessionFromOAuth(
  code: string,
  origin: string,
): Promise<MetaReviewSession> {
  const token = await exchangeAuthorizationCode(code, origin);
  const profile = await fetchAuthenticatedProfile(token.accessToken);

  if (!profile.id || !profile.username) {
    throw new Error("Threads /me did not return id and username.");
  }

  return {
    accessToken: token.accessToken,
    userId: profile.id,
    username: profile.username,
    name: profile.name,
    profilePictureUrl: profile.threads_profile_picture_url,
    expiresAt: token.expiresAt,
  };
}

export async function fetchThreadsBasic(accessToken: string) {
  const profile = await fetchAuthenticatedProfile(accessToken);
  return {
    permission: "threads_basic",
    endpoint: "GET /v1.0/me",
    data: profile,
  };
}

export async function fetchProfileLookup(accessToken: string, username: string) {
  const normalized = username.trim().replace(/^@/, "");
  if (!normalized) {
    throw new Error("Public Threads username is required.");
  }

  const profile = await threadsGet<Record<string, unknown>>("/profile_lookup", accessToken, {
    username: normalized,
  });

  return {
    permission: "threads_profile_discovery",
    endpoint: "GET /v1.0/profile_lookup",
    username: normalized,
    profile,
  };
}

export async function fetchProfilePosts(accessToken: string, username: string) {
  const normalized = username.trim().replace(/^@/, "");
  if (!normalized) {
    throw new Error("Public Threads username is required.");
  }

  const posts = await threadsGet<{ data?: unknown[] }>("/profile_posts", accessToken, {
    username: normalized,
    fields: "id,text,media_type,permalink,username,timestamp",
    limit: 10,
  });

  return {
    permission: "threads_profile_discovery",
    endpoint: "GET /v1.0/profile_posts",
    username: normalized,
    posts,
  };
}

export async function fetchProfileDiscovery(accessToken: string, username: string) {
  const lookup = await fetchProfileLookup(accessToken, username);

  let posts: unknown = null;
  let postsError: string | null = null;
  try {
    const result = await fetchProfilePosts(accessToken, lookup.username);
    posts = result.posts;
  } catch (error) {
    postsError =
      error instanceof Error ? error.message : "profile_posts request failed.";
  }

  return {
    permission: "threads_profile_discovery",
    endpoints: ["GET /v1.0/profile_lookup", "GET /v1.0/profile_posts"],
    username: lookup.username,
    profile: lookup.profile,
    posts,
    postsError,
  };
}

const KEYWORD_SEARCH_FIELDS =
  "id,text,media_type,permalink,timestamp,username,has_replies,is_quote_post,is_reply";

export type ThreadsKeywordSearchPage = {
  permission: "threads_keyword_search";
  endpoint: "GET /v1.0/keyword_search";
  keyword: string;
  data: { data?: unknown[]; paging?: unknown };
  next_cursor: string | null;
  http_status: number;
  meta_headers: Record<string, string>;
};

/** One official keyword_search HTTP request. Callers must consume discovery budget first. */
export async function fetchKeywordSearchPage(
  accessToken: string,
  keyword: string,
  options?: { after?: string | null },
): Promise<ThreadsKeywordSearchPage> {
  const normalized = keyword.trim();
  if (!normalized) {
    throw new Error("Keyword is required.");
  }

  const result = await threadsGetResult<{ data?: unknown[]; paging?: unknown }>(
    "/keyword_search",
    accessToken,
    {
      q: normalized,
      search_type: "TOP",
      fields: KEYWORD_SEARCH_FIELDS,
      limit: 10,
      after: options?.after?.trim() || undefined,
    },
  );

  return {
    permission: "threads_keyword_search",
    endpoint: "GET /v1.0/keyword_search",
    keyword: normalized,
    data: result.payload,
    next_cursor: extractKeywordSearchCursor(result.payload),
    http_status: result.http_status,
    meta_headers: result.headers,
  };
}

function extractKeywordSearchCursor(payload: unknown): string | null {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const paging =
    record && record.paging && typeof record.paging === "object"
      ? (record.paging as Record<string, unknown>)
      : null;
  if (!paging) return null;
  const cursors =
    paging.cursors && typeof paging.cursors === "object"
      ? (paging.cursors as Record<string, unknown>)
      : null;
  if (typeof cursors?.after === "string" && cursors.after.trim()) return cursors.after.trim();
  if (typeof paging.next !== "string" || !paging.next.trim()) return null;
  try {
    return new URL(paging.next).searchParams.get("after")?.trim() || null;
  } catch {
    return null;
  }
}

export async function fetchKeywordSearch(accessToken: string, keyword: string) {
  const page = await fetchKeywordSearchPage(accessToken, keyword);
  return {
    permission: page.permission,
    endpoint: page.endpoint,
    keyword: page.keyword,
    data: page.data,
  };
}

export function buildThreadsAuthorizeUrl(origin: string, state: string): string {
  const { appId } = requireMetaReviewConfig();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: getMetaReviewRedirectUri(origin),
    scope: "threads_basic,threads_profile_discovery,threads_keyword_search",
    response_type: "code",
    state,
  });
  return `${getThreadsOAuthAuthorizeUrl()}?${params.toString()}`;
}
