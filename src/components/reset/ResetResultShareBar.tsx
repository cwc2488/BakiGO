"use client";

import { useEffect, useRef, useState } from "react";
import { downloadBlob } from "@/lib/images/image-file-utils";
import type { PersonalityType } from "@/lib/quiz/fat-loss/types";
import {
  canShareResultImageFile,
  isNativeShareAbort,
} from "@/lib/quiz/viral/quiz-result-share-capability";
import {
  QUIZ_RESULT_SHARE_CTA,
  QUIZ_RESULT_SHARE_FALLBACK_CTA,
  QUIZ_RESULT_SHARE_FALLBACK_HINT,
  QUIZ_RESULT_SHARE_NUDGE,
  buildQuizResultShareCopy,
} from "@/lib/quiz/viral/quiz-result-share-copy";
import { renderQuizResultShareBlob, shareImageFilename } from "@/lib/quiz/viral/quiz-result-share-visual";

type SharePayload = {
  code: string;
  href: string;
  animalType: PersonalityType;
  shareTitle: string;
  shareText: string;
};

async function postEvent(token: string, event: string) {
  await fetch("/api/quiz/result-shares/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, event }),
  }).catch(() => undefined);
}

export function ResetResultShareBar({
  token,
  animalType,
}: {
  token: string;
  animalType: PersonalityType;
}) {
  const viewed = useRef(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const fileShare = canShareResultImageFile();

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    void postEvent(token, "result_reveal_viewed");
  }, [token]);

  async function ensureShare(): Promise<SharePayload> {
    const response = await fetch("/api/quiz/result-shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const payload = (await response.json()) as SharePayload & { error?: string };
    if (!response.ok || !payload.code || !payload.href) {
      throw new Error(payload.error ?? "無法建立分享連結");
    }
    return payload;
  }

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    setHint(null);
    try {
      void postEvent(token, "result_share_clicked");
      const share = await ensureShare();
      const copy = buildQuizResultShareCopy(animalType);
      const blob = await renderQuizResultShareBlob(animalType);
      const filename = shareImageFilename(copy.animalName);
      const file = new File([blob], filename, { type: "image/png" });

      if (fileShare && navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: share.shareTitle,
            text: `${share.shareText}\n${share.href}`,
          });
          void postEvent(token, "native_share_completed");
        } catch (error) {
          if (!isNativeShareAbort(error)) throw error;
        }
        return;
      }

      downloadBlob(blob, filename);
      void postEvent(token, "result_share_fallback_saved");
      setHint(QUIZ_RESULT_SHARE_FALLBACK_HINT);
    } catch (error) {
      setHint(error instanceof Error ? error.message : "分享失敗，請再試一次");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rx-share">
      <button type="button" className="rx-cta-secondary" disabled={busy} onClick={() => void handleShare()}>
        {fileShare ? QUIZ_RESULT_SHARE_CTA : QUIZ_RESULT_SHARE_FALLBACK_CTA}
      </button>
      <p className="rx-share-nudge">{QUIZ_RESULT_SHARE_NUDGE}</p>
      {hint ? <p className="rx-share-hint">{hint}</p> : fileShare ? null : <p className="rx-share-hint">{QUIZ_RESULT_SHARE_FALLBACK_HINT}</p>}
    </div>
  );
}
