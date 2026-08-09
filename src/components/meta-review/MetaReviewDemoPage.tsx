"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PAGE_GRADIENT_CLASS } from "@/components/ui/brand-ui";

type SessionView = {
  configured: boolean;
  connected: boolean;
  userId?: string;
  username?: string;
  name?: string | null;
  profilePictureUrl?: string | null;
  expiresAt?: string;
};

type ApiResult = {
  ok: boolean;
  status?: string;
  error?: string;
  [key: string]: unknown;
};

function ResultPanel({ result }: { result: ApiResult | null }) {
  if (!result) {
    return null;
  }

  return (
    <div className="space-y-3">
      <p
        className={`text-sm font-semibold ${
          result.ok ? "text-[var(--brand-primary-dark)]" : "text-red-600"
        }`}
      >
        {result.ok ? "API Request Successful" : "API Request Failed"}
      </p>
      {result.error ? <p className="text-sm text-red-600">{result.error}</p> : null}
      <pre className="overflow-x-auto rounded-2xl bg-[#0f172a] p-4 text-xs leading-6 text-[#e2e8f0]">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

function PermissionBadge({ permission }: { permission: string }) {
  return (
    <p className="rounded-full bg-[var(--brand-primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--brand-primary-dark)]">
      Permission used: {permission}
    </p>
  );
}

export function MetaReviewDemoPage({
  initialError,
  initialConnected,
}: {
  initialError?: string;
  initialConnected?: boolean;
}) {
  const [session, setSession] = useState<SessionView | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [profileUsername, setProfileUsername] = useState("meta");
  const [keyword, setKeyword] = useState("fitness");
  const [basicResult, setBasicResult] = useState<ApiResult | null>(null);
  const [profileResult, setProfileResult] = useState<ApiResult | null>(null);
  const [keywordResult, setKeywordResult] = useState<ApiResult | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(initialError ?? null);

  const loadSession = useCallback(async () => {
    setLoadingSession(true);
    try {
      const response = await fetch("/api/meta-review/session", { cache: "no-store" });
      const payload = (await response.json()) as SessionView;
      setSession(payload);
    } finally {
      setLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (initialConnected) {
      setBanner("Threads account connected successfully.");
    }
  }, [initialConnected]);

  const flowSteps = useMemo(
    () => [
      "OAuth Login",
      "threads_basic",
      "profile discovery",
      "keyword search",
      "API result",
    ],
    [],
  );

  async function runDemoRequest(
    key: string,
    url: string,
    setter: (value: ApiResult) => void,
  ) {
    setActionLoading(key);
    try {
      const response = await fetch(url, { cache: "no-store" });
      const payload = (await response.json()) as ApiResult;
      setter(payload);
    } catch (error) {
      setter({
        ok: false,
        status: "API Request Failed",
        error: error instanceof Error ? error.message : "Request failed.",
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function disconnect() {
    setActionLoading("disconnect");
    try {
      await fetch("/api/meta-review/disconnect", { method: "POST" });
      setBasicResult(null);
      setProfileResult(null);
      setKeywordResult(null);
      setBanner("Threads account disconnected.");
      await loadSession();
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className={`min-h-full ${PAGE_GRADIENT_CLASS}`}>
      <main className="home-container flex flex-col gap-8 pb-24 pt-10 sm:pt-14">
        <header className="space-y-4">
          <p className="text-sm text-[var(--brand-text-muted)]">Baki GO · Meta App Review</p>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-[var(--brand-text)] sm:text-[2rem]">
            Meta Threads API Review Demo
          </h1>
          <p className="max-w-3xl text-[0.9375rem] leading-7 text-[var(--brand-text-secondary)]">
            This page demonstrates how Baki GO uses the official Meta Threads API with OAuth and
            the permissions <code>threads_basic</code>, <code>threads_profile_discovery</code>,
            and <code>threads_keyword_search</code>. Access tokens stay server-side only.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--brand-text-muted)]">
            {flowSteps.map((step, index) => (
              <span key={step} className="flex items-center gap-2">
                <span className="rounded-full border border-[var(--brand-border)] bg-white/70 px-3 py-1">
                  {step}
                </span>
                {index < flowSteps.length - 1 ? <span>↓</span> : null}
              </span>
            ))}
          </div>
        </header>

        {banner ? (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-white/80 px-4 py-3 text-sm text-[var(--brand-text-secondary)]">
            {banner}
          </div>
        ) : null}

        <section className="rounded-[1.5rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]/95 p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-[var(--brand-text)]">Connect Threads Account</h2>
          {loadingSession ? (
            <p className="text-sm text-[var(--brand-text-muted)]">Checking session…</p>
          ) : !session?.configured ? (
            <p className="text-sm text-red-600">
              Server is missing THREADS_APP_ID / THREADS_APP_SECRET. Configure Vercel environment
              variables before recording the review demo.
            </p>
          ) : session.connected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                {session.profilePictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.profilePictureUrl}
                    alt={`${session.username} profile`}
                    className="h-16 w-16 rounded-full border border-[var(--brand-border)] object-cover"
                  />
                ) : null}
                <div className="space-y-1 text-sm text-[var(--brand-text-secondary)]">
                  <p>
                    <span className="font-semibold text-[var(--brand-text)]">Status:</span> Authorized
                  </p>
                  <p>
                    <span className="font-semibold text-[var(--brand-text)]">Username:</span> @
                    {session.username}
                  </p>
                  <p>
                    <span className="font-semibold text-[var(--brand-text)]">User ID:</span>{" "}
                    {session.userId}
                  </p>
                  {session.name ? (
                    <p>
                      <span className="font-semibold text-[var(--brand-text)]">Name:</span>{" "}
                      {session.name}
                    </p>
                  ) : null}
                  {session.expiresAt ? (
                    <p>
                      <span className="font-semibold text-[var(--brand-text)]">Token expires:</span>{" "}
                      {session.expiresAt}
                    </p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={actionLoading === "disconnect"}
                className="rounded-full border border-[var(--brand-border)] px-4 py-2 text-sm font-medium text-[var(--brand-text-secondary)]"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <a
              href="/api/meta-review/auth/start"
              className="inline-flex rounded-full bg-[var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white"
            >
              Connect Threads Account
            </a>
          )}
        </section>

        <section className="rounded-[1.5rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]/95 p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[var(--brand-text)]">1. Threads Basic</h2>
            <PermissionBadge permission="threads_basic" />
          </div>
          <p className="mb-4 text-sm leading-6 text-[var(--brand-text-secondary)]">
            Calls the official <code>GET /v1.0/me</code> endpoint for the OAuth authorized account.
          </p>
          <button
            type="button"
            disabled={!session?.connected || actionLoading === "basic"}
            onClick={() =>
              void runDemoRequest("basic", "/api/meta-review/basic", setBasicResult)
            }
            className="rounded-full bg-[var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {actionLoading === "basic" ? "Loading…" : "Fetch Basic Profile"}
          </button>
          <div className="mt-4">
            <ResultPanel result={basicResult} />
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]/95 p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[var(--brand-text)]">2. Public Profile Discovery</h2>
            <PermissionBadge permission="threads_profile_discovery" />
          </div>
          <p className="mb-4 text-sm leading-6 text-[var(--brand-text-secondary)]">
            Uses official <code>GET /v1.0/profile_lookup</code> and{" "}
            <code>GET /v1.0/profile_posts</code>. Before Advanced Access approval, Meta only allows
            lookup for official accounts such as <code>@meta</code>, <code>@threads</code>,{" "}
            <code>@instagram</code>, and <code>@facebook</code>. Public profiles also require at least
            100 followers.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex-1 text-sm">
              <span className="mb-1 block font-medium text-[var(--brand-text)]">
                Public Threads Username
              </span>
              <input
                value={profileUsername}
                onChange={(event) => setProfileUsername(event.target.value)}
                placeholder="meta"
                className="w-full rounded-2xl border border-[var(--brand-border)] bg-white px-4 py-3"
              />
            </label>
            <button
              type="button"
              disabled={!session?.connected || actionLoading === "profile"}
              onClick={() =>
                void runDemoRequest(
                  "profile",
                  `/api/meta-review/profile-discovery?username=${encodeURIComponent(profileUsername)}`,
                  setProfileResult,
                )
              }
              className="self-end rounded-full bg-[var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {actionLoading === "profile" ? "Searching…" : "Search Public Profile"}
            </button>
          </div>
          <div className="mt-4">
            <ResultPanel result={profileResult} />
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]/95 p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[var(--brand-text)]">3. Public Threads Keyword Search</h2>
            <PermissionBadge permission="threads_keyword_search" />
          </div>
          <p className="mb-4 text-sm leading-6 text-[var(--brand-text-secondary)]">
            Uses official <code>GET /v1.0/keyword_search</code>. Before Advanced Access approval,
            Meta limits search to posts owned by the authenticated user only.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex-1 text-sm">
              <span className="mb-1 block font-medium text-[var(--brand-text)]">Keyword</span>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="fitness"
                className="w-full rounded-2xl border border-[var(--brand-border)] bg-white px-4 py-3"
              />
            </label>
            <button
              type="button"
              disabled={!session?.connected || actionLoading === "keyword"}
              onClick={() =>
                void runDemoRequest(
                  "keyword",
                  `/api/meta-review/keyword-search?q=${encodeURIComponent(keyword)}`,
                  setKeywordResult,
                )
              }
              className="self-end rounded-full bg-[var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {actionLoading === "keyword" ? "Searching…" : "Search Public Threads"}
            </button>
          </div>
          <div className="mt-4">
            <ResultPanel result={keywordResult} />
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-dashed border-[var(--brand-border)] bg-white/60 p-5 text-sm leading-6 text-[var(--brand-text-secondary)]">
          <h2 className="mb-2 text-base font-semibold text-[var(--brand-text)]">Official API Notes</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>No scraping, simulated login, or undocumented endpoints are used on this page.</li>
            <li>
              The <code>owner</code> field is excluded by Meta from keyword search and profile post
              responses; only API-provided fields are shown.
            </li>
            <li>
              Public third-party discovery requires Meta Advanced Access and App Review approval.
            </li>
            <li>
              Baki GO production AI Radar uses system-owned tokens; this page exists only for Meta
              App Review demonstration.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
