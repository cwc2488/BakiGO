import { normalizeCustomerPhone } from "@/lib/customers/customer-profile";

export const EXPERIENCE_21D_CONSUMER_CHANNELS = [
  { id: "line", label: "LINE", placeholder: "你的 LINE ID" },
  { id: "instagram", label: "Instagram", placeholder: "@你的IG帳號" },
  { id: "phone", label: "手機", placeholder: "09xxxxxxxx" },
] as const;

export type Experience21dConsumerChannel = (typeof EXPERIENCE_21D_CONSUMER_CHANNELS)[number]["id"];
/** Stored rows may still be `email` from the first 21D patch. Consumer UI no longer offers it. */
export type Experience21dContactChannel = Experience21dConsumerChannel | "email";

export type Experience21dContactInput = {
  displayName: string;
  channel: Experience21dConsumerChannel;
  value: string;
};

const INSTAGRAM_USERNAME = /^[A-Za-z0-9._]{1,30}$/;

export function normalizeInstagramUsername(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || /instagram\.com/i.test(trimmed) || /[/\s?]/.test(trimmed)) {
    return null;
  }
  const username = trimmed.replace(/^@+/, "").trim();
  if (!INSTAGRAM_USERNAME.test(username)) return null;
  return username;
}

export function instagramProfileUrl(username: string): string {
  return `https://www.instagram.com/${username}/`;
}

export function format21dPartnerContact(
  channel: string | null,
  value: string | null,
): { label: string; display: string; href: string | null } | null {
  if (!channel || !value) return null;
  if (channel === "line") return { label: "LINE", display: `LINE：${value}`, href: null };
  if (channel === "instagram") {
    return {
      label: "Instagram",
      display: `Instagram：@${value}`,
      href: instagramProfileUrl(value),
    };
  }
  if (channel === "phone") return { label: "手機", display: `手機：${value}`, href: null };
  if (channel === "email") return { label: "Email", display: `Email：${value}`, href: null };
  return { label: channel, display: `${channel}：${value}`, href: null };
}

export function parse21dContact(input: {
  displayName?: string | null;
  channel?: string | null;
  value?: string | null;
}): Experience21dContactInput | null {
  const displayName = String(input.displayName ?? "").trim();
  if (displayName.length < 1 || displayName.length > 20) return null;
  const channel = input.channel;
  const raw = String(input.value ?? "").trim();
  if (!raw) return null;
  if (channel === "phone") {
    const digits = normalizeCustomerPhone(raw);
    if (digits.length < 8 || digits.length > 15) return null;
    return { displayName, channel: "phone", value: digits };
  }
  if (channel === "line") {
    const line = raw.replace(/^@/, "").trim();
    if (line.length < 2 || line.length > 40) return null;
    return { displayName, channel: "line", value: line };
  }
  if (channel === "instagram") {
    const username = normalizeInstagramUsername(raw);
    if (!username) return null;
    return { displayName, channel: "instagram", value: username };
  }
  return null;
}

export function hasUsableContact(row: {
  contact_channel?: string | null;
  contact_value?: string | null;
} | null): boolean {
  return Boolean(row?.contact_channel && row?.contact_value);
}
