/**
 * Boundary parser for Recognition original-photo references.
 *
 * Production rows store a private Storage object path such as
 * `recognition/<submissionId>/entries/<entryId>/original.jpg`.
 * Calling `new URL(path)` on that value throws:
 *   - Node: `Invalid URL`
 *   - Safari / WebKit: `The string did not match the expected pattern.`
 * This module classifies the value without throwing. Invalid refs become
 * 「缺少有效照片」 instead of crashing PPT readiness.
 */

import { getPublicAppOrigin } from "@/lib/app/public-origin";

export const RECOGNITION_PHOTOS_BUCKET = "recognition-photos";
export const RECOGNITION_MISSING_VALID_PHOTO = "缺少有效照片";

export const RECOGNITION_URL_PATTERN_ERROR_MARKERS = [
  "the string did not match the expected pattern",
  "invalid url",
  "failed to construct 'url'",
  "failed to parse url",
  "url constructor:",
] as const;

const PLACEHOLDER_STRINGS = new Set(["", "null", "undefined", "none", "n/a"]);
const MAX_REF_LENGTH = 4096;
const RECOGNITION_STORAGE_PREFIX = "recognition/";
const STORAGE_BUCKET_MARK = `/${RECOGNITION_PHOTOS_BUCKET}/`;

export type RecognitionPhotoRefReason = "missing" | "malformed";

export type RecognitionPhotoRef =
  | { ok: true; kind: "storage-path"; storagePath: string }
  | { ok: true; kind: "https-url"; url: string }
  | { ok: true; kind: "data-url"; url: string }
  | { ok: true; kind: "blob-url"; url: string }
  | { ok: false; reason: RecognitionPhotoRefReason };

function asTrimmedString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value).trim();
    }
    return null;
  }
  return value.trim();
}

function looksLikeAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function looksLikeDataUrl(value: string): boolean {
  return /^data:/i.test(value);
}

function looksLikeBlobUrl(value: string): boolean {
  return /^blob:/i.test(value);
}

/**
 * Parse an absolute http(s)/data/blob URL only after the scheme is confirmed.
 * Never call `new URL()` on a Storage object path.
 */
function parseAbsoluteUrl(value: string): URL | null {
  if (
    !looksLikeAbsoluteHttpUrl(value)
    && !looksLikeDataUrl(value)
    && !looksLikeBlobUrl(value)
  ) {
    return null;
  }
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isSafeStorageObjectPath(path: string): boolean {
  if (!path || path.length > MAX_REF_LENGTH) return false;
  if (path.includes("\\") || path.includes("://") || path.includes(";")) return false;
  if (path.startsWith("/") || path.endsWith("/")) return false;
  if (/\s/.test(path)) return false;
  if (!/^[A-Za-z0-9/_\-.]+$/.test(path)) return false;
  const segments = path.split("/");
  if (segments.length < 2) return false;
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return false;
  }
  return true;
}

function extractRecognitionStoragePathFromUrl(url: URL): string | null {
  const pathname = url.pathname;
  const markIndex = pathname.lastIndexOf(STORAGE_BUCKET_MARK);
  if (markIndex < 0) return null;
  const rest = decodePathSegment(pathname.slice(markIndex + STORAGE_BUCKET_MARK.length));
  if (!rest) return null;
  if (looksLikeAbsoluteHttpUrl(rest)) {
    const nested = parseAbsoluteUrl(rest);
    if (!nested) return null;
    return extractRecognitionStoragePathFromUrl(nested);
  }
  return isSafeStorageObjectPath(rest) ? rest : null;
}

function asStorageObjectPath(value: string): string | null {
  const withoutQuery = value.split("?")[0]?.split("#")[0] ?? value;
  const stripped = withoutQuery.replace(/^\/+/, "");
  if (!isSafeStorageObjectPath(stripped)) return null;
  return stripped;
}

function resolveRelativeAppPath(path: string): RecognitionPhotoRef {
  const origin = getPublicAppOrigin();
  if (!origin || !looksLikeAbsoluteHttpUrl(origin)) {
    return { ok: false, reason: "malformed" };
  }
  try {
    const resolved = new URL(path, origin.endsWith("/") ? origin : `${origin}/`);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return { ok: false, reason: "malformed" };
    }
    const extracted = extractRecognitionStoragePathFromUrl(resolved);
    if (extracted) {
      return { ok: true, kind: "storage-path", storagePath: extracted };
    }
    return { ok: true, kind: "https-url", url: resolved.toString() };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

export function parseRecognitionPhotoRef(value: unknown): RecognitionPhotoRef {
  const trimmed = asTrimmedString(value);
  if (trimmed == null || PLACEHOLDER_STRINGS.has(trimmed.toLowerCase())) {
    return { ok: false, reason: "missing" };
  }
  if (trimmed.length > MAX_REF_LENGTH) {
    return { ok: false, reason: "malformed" };
  }

  if (looksLikeBlobUrl(trimmed)) {
    const parsed = parseAbsoluteUrl(trimmed);
    if (!parsed) return { ok: false, reason: "malformed" };
    return { ok: true, kind: "blob-url", url: parsed.toString() };
  }

  if (looksLikeDataUrl(trimmed) || /^image\/[a-z0-9+.-]+;base64,/i.test(trimmed)) {
    const href = looksLikeDataUrl(trimmed) ? trimmed : `data:${trimmed}`;
    const parsed = parseAbsoluteUrl(href);
    if (!parsed || !/^data:image\//i.test(parsed.href)) {
      return { ok: false, reason: "malformed" };
    }
    return { ok: true, kind: "data-url", url: parsed.href };
  }

  if (looksLikeAbsoluteHttpUrl(trimmed)) {
    const parsed = parseAbsoluteUrl(trimmed);
    if (!parsed) return { ok: false, reason: "malformed" };
    const extracted = extractRecognitionStoragePathFromUrl(parsed);
    if (extracted) {
      return { ok: true, kind: "storage-path", storagePath: extracted };
    }
    return { ok: true, kind: "https-url", url: parsed.toString() };
  }

  if (
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    && !trimmed.startsWith(RECOGNITION_STORAGE_PREFIX)
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (trimmed.startsWith("/")) {
    const asStorage = asStorageObjectPath(trimmed);
    if (asStorage?.startsWith(RECOGNITION_STORAGE_PREFIX)) {
      return { ok: true, kind: "storage-path", storagePath: asStorage };
    }
    return resolveRelativeAppPath(trimmed);
  }

  const storagePath = asStorageObjectPath(trimmed);
  if (storagePath) {
    return { ok: true, kind: "storage-path", storagePath };
  }
  return { ok: false, reason: "malformed" };
}

export function recognitionPhotoHasUsableOriginal(value: unknown): boolean {
  const parsed = parseRecognitionPhotoRef(value);
  return parsed.ok && parsed.kind !== "blob-url";
}

export function recognitionPhotoStoragePathForDownload(value: unknown): string | null {
  const parsed = parseRecognitionPhotoRef(value);
  if (!parsed.ok) return null;
  if (parsed.kind === "storage-path") return parsed.storagePath;
  return null;
}

export function isRecognitionUrlPatternError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return isRecognitionUrlPatternErrorMessage(message);
}

export function isRecognitionUrlPatternErrorMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;
  return RECOGNITION_URL_PATTERN_ERROR_MARKERS.some((marker) => normalized.includes(marker));
}

export function recognitionPhotoStatusErrorMessage(
  error: unknown,
  fallback = "無法載入表揚 PPT 狀態。",
): string {
  if (isRecognitionUrlPatternError(error)) {
    return RECOGNITION_MISSING_VALID_PHOTO;
  }
  if (error instanceof Error && error.message.trim()) {
    if (isRecognitionUrlPatternErrorMessage(error.message)) {
      return RECOGNITION_MISSING_VALID_PHOTO;
    }
    return error.message;
  }
  return fallback;
}

export function recognitionNamedPhotoError(displayName: string, detail?: string): string {
  const suffix = detail?.trim() ? `（${detail.trim()}）` : "";
  return `${displayName}：${RECOGNITION_MISSING_VALID_PHOTO}${suffix}`;
}
