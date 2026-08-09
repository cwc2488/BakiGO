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

async function threadsGet<T>(
  path: string,
  accessToken: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
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
  if (!response.ok) {
    throw new Error(parseThreadsGraphError(payload));
  }
  return payload as T;
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

export async function fetchProfileDiscovery(accessToken: string, username: string) {
  const normalized = username.trim().replace(/^@/, "");
  if (!normalized) {
    throw new Error("Public Threads username is required.");
  }

  const profile = await threadsGet<Record<string, unknown>>("/profile_lookup", accessToken, {
    username: normalized,
  });

  let posts: unknown = null;
  let postsError: string | null = null;
  try {
    posts = await threadsGet<{ data?: unknown[] }>("/profile_posts", accessToken, {
      username: normalized,
      fields: "id,text,media_type,permalink,username,timestamp",
      limit: 10,
    });
  } catch (error) {
    postsError =
      error instanceof Error ? error.message : "profile_posts request failed.";
  }

  return {
    permission: "threads_profile_discovery",
    endpoints: ["GET /v1.0/profile_lookup", "GET /v1.0/profile_posts"],
    username: normalized,
    profile,
    posts,
    postsError,
  };
}

export async function fetchKeywordSearch(accessToken: string, keyword: string) {
  const normalized = keyword.trim();
  if (!normalized) {
    throw new Error("Keyword is required.");
  }

  const data = await threadsGet<{ data?: unknown[] }>("/keyword_search", accessToken, {
    q: normalized,
    search_type: "TOP",
    fields: "id,text,media_type,permalink,timestamp,username,has_replies,is_quote_post,is_reply",
    limit: 10,
  });

  return {
    permission: "threads_keyword_search",
    endpoint: "GET /v1.0/keyword_search",
    keyword: normalized,
    data,
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
