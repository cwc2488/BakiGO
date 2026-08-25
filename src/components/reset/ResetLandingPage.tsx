"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ResetLandingView } from "@/components/reset/ResetExperienceViews";
import { stashResetBootExperience } from "@/lib/analysis/reset/reset-boot-cache";
import type { ResetPublicView } from "@/lib/analysis/reset/reset-contract";
import { getShareParams, saveFatLossQuizAttribution } from "@/lib/quiz/fat-loss/session-storage";

export function ResetLandingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const landingBeaconSent = useRef(false);
  /** Sync lock: one in-flight start per tap sequence (before React re-renders). */
  const startInFlight = useRef(false);

  useEffect(() => {
    // Prime serverless + quiz id cache while the user reads the landing (no session write).
    void fetch("/api/analysis/sessions", { method: "GET", cache: "no-store" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const share = getShareParams(searchParams);
    if (landingBeaconSent.current) return;
    if (!share.shareCode && !share.resultShareCode) return;
    if (typeof navigator !== "undefined" && "webdriver" in navigator && navigator.webdriver) return;
    landingBeaconSent.current = true;
    if (share.shareCode) {
      void fetch("/api/quiz/partner/landing-view", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-baki-human": "1" },
        body: JSON.stringify({ shareCode: share.shareCode }),
      }).catch(() => undefined);
    }
    if (share.resultShareCode) {
      void fetch("/api/quiz/result-shares/landing-view", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-baki-human": "1" },
        body: JSON.stringify({ code: share.resultShareCode }),
      }).catch(() => undefined);
    }
  }, [searchParams]);

  async function handleStart() {
    if (startInFlight.current) return;
    startInFlight.current = true;
    // Paint busy CTA in this same tap before awaiting the network.
    flushSync(() => {
      setStarting(true);
      setError(null);
    });
    const share = getShareParams(searchParams);
    saveFatLossQuizAttribution({
      referralShareToken: share.referralShareToken,
      shareCode: share.shareCode,
      referrerMemberId: share.referrerMemberId,
      resultShareCode: share.resultShareCode,
    });
    try {
      const response = await fetch("/api/analysis/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry: "reset_v1",
          referralShareToken: share.referralShareToken ?? null,
          shareCode: share.shareCode ?? null,
          resultShareCode: share.resultShareCode ?? null,
        }),
      });
      const payload = (await response.json()) as {
        token?: string;
        error?: string;
        experience?: ResetPublicView;
      };
      if (!response.ok || !payload.token) throw new Error(payload.error ?? "無法開始");
      if (payload.experience) {
        stashResetBootExperience(payload.token, payload.experience);
      }
      router.push(`/analysis/${payload.token}`);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "無法開始");
      setStarting(false);
      startInFlight.current = false;
    }
  }

  return <ResetLandingView starting={starting} error={error} onStart={() => void handleStart()} />;
}
