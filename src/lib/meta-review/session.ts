import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import {
  META_REVIEW_OAUTH_STATE_COOKIE,
  META_REVIEW_SESSION_COOKIE,
  requireMetaReviewConfig,
} from "./config";

export type MetaReviewSession = {
  accessToken: string;
  userId: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
  expiresAt: number;
};

type SignedSessionPayload = MetaReviewSession;

function signPayload(payload: SignedSessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyPayload(token: string, secret: string): SignedSessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SignedSessionPayload;
  } catch {
    return null;
  }
}

function getSessionSecret(): string {
  return requireMetaReviewConfig().appSecret;
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function setMetaReviewSession(session: MetaReviewSession): Promise<void> {
  const token = signPayload(session, getSessionSecret());
  const maxAge = Math.max(60, Math.floor((session.expiresAt - Date.now()) / 1000));
  (await cookies()).set(META_REVIEW_SESSION_COOKIE, token, cookieOptions(maxAge));
}

export async function clearMetaReviewSession(): Promise<void> {
  (await cookies()).set(META_REVIEW_SESSION_COOKIE, "", {
    ...cookieOptions(0),
    maxAge: 0,
  });
}

export async function getMetaReviewSession(): Promise<MetaReviewSession | null> {
  const token = (await cookies()).get(META_REVIEW_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const session = verifyPayload(token, getSessionSecret());
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    await clearMetaReviewSession();
    return null;
  }

  return session;
}

export async function setOAuthState(state: string): Promise<void> {
  (await cookies()).set(META_REVIEW_OAUTH_STATE_COOKIE, state, cookieOptions(600));
}

export async function consumeOAuthState(state: string | null): Promise<boolean> {
  const cookieStore = await cookies();
  const stored = cookieStore.get(META_REVIEW_OAUTH_STATE_COOKIE)?.value;
  cookieStore.set(META_REVIEW_OAUTH_STATE_COOKIE, "", {
    ...cookieOptions(0),
    maxAge: 0,
  });

  return Boolean(stored && state && stored === state);
}

export function toPublicSessionView(session: MetaReviewSession) {
  return {
    connected: true as const,
    userId: session.userId,
    username: session.username,
    name: session.name ?? null,
    profilePictureUrl: session.profilePictureUrl ?? null,
    expiresAt: new Date(session.expiresAt).toISOString(),
  };
}
