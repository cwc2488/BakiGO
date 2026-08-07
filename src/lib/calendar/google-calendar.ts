import type { GoogleCalendarConnection } from "@/types/calendar-event";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import {
  scheduleGoogleCalendarCloudDelete,
  scheduleGoogleCalendarCloudPush,
} from "@/lib/cloud/google-calendar-cloud-service";

export function loadGoogleCalendarConnection(
  storage: StorageAdapter,
): GoogleCalendarConnection | null {
  const raw = storage.getItem(STORAGE_KEYS.googleCalendarAuth);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as GoogleCalendarConnection;
  } catch {
    return null;
  }
}

export function saveGoogleCalendarConnection(
  storage: StorageAdapter,
  connection: GoogleCalendarConnection,
): void {
  storage.setItem(STORAGE_KEYS.googleCalendarAuth, JSON.stringify(connection));
  scheduleGoogleCalendarCloudPush(storage, connection);
}

export function clearGoogleCalendarConnection(storage: StorageAdapter): void {
  storage.removeItem(STORAGE_KEYS.googleCalendarAuth);
  scheduleGoogleCalendarCloudDelete(storage);
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleOAuthRedirectUri(origin: string): string {
  return `${origin}/api/calendar/google/callback`;
}

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function buildGoogleAuthUrl(origin: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID 尚未設定");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleOAuthRedirectUri(origin),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent select_account",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleAuthCode(
  code: string,
  origin: string,
): Promise<GoogleCalendarConnection> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth 尚未設定");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleOAuthRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error("無法取得 Google 授權");
  }

  const payload = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
}

export async function refreshGoogleAccessToken(
  connection: GoogleCalendarConnection,
): Promise<GoogleCalendarConnection> {
  if (!connection.refreshToken) {
    throw new Error("Google 授權已過期，請重新連接");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth 尚未設定");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Google 授權已過期，請重新連接");
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    ...connection,
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
}

export async function ensureGoogleAccessToken(
  connection: GoogleCalendarConnection,
  storage?: StorageAdapter,
): Promise<GoogleCalendarConnection> {
  if (connection.expiresAt > Date.now() + 60_000) {
    return connection;
  }

  let refreshed: GoogleCalendarConnection;
  if (typeof window !== "undefined") {
    const response = await fetch("/api/calendar/google/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: connection.refreshToken }),
    });
    if (!response.ok) {
      throw new Error("Google 授權已過期，請重新連接");
    }
    const payload = (await response.json()) as { accessToken: string; expiresAt: number };
    refreshed = {
      ...connection,
      accessToken: payload.accessToken,
      expiresAt: payload.expiresAt,
    };
  } else {
    refreshed = await refreshGoogleAccessToken(connection);
  }

  if (storage) {
    saveGoogleCalendarConnection(storage, refreshed);
  }
  return refreshed;
}

export async function fetchGoogleUserEmail(
  connection: GoogleCalendarConnection,
): Promise<string | undefined> {
  const auth = await ensureGoogleAccessToken(connection);
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  if (!response.ok) {
    return undefined;
  }
  const payload = (await response.json()) as { email?: string };
  return payload.email;
}

export function pickDefaultPersonalCalendar(
  calendars: GoogleCalendarListItem[],
): GoogleCalendarListItem | undefined {
  return (
    calendars.find((item) => item.primary) ??
    calendars.find((item) => item.accessRole === "owner") ??
    calendars[0]
  );
}

export async function finalizeGoogleCalendarConnection(
  connection: GoogleCalendarConnection,
): Promise<GoogleCalendarConnection> {
  const calendars = await listGoogleCalendars(connection);
  const primary = pickDefaultPersonalCalendar(calendars);
  const email = (await fetchGoogleUserEmail(connection)) ?? primary?.id;

  return {
    ...connection,
    email,
    selectedCalendarId: primary?.id,
    selectedCalendarName: primary?.summary,
  };
}

export interface GoogleCalendarListItem {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
}

export async function listGoogleCalendars(
  connection: GoogleCalendarConnection,
  storage?: StorageAdapter,
): Promise<GoogleCalendarListItem[]> {
  const auth = await ensureGoogleAccessToken(connection, storage);
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader",
    {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    },
  );

  if (!response.ok) {
    throw new Error("無法讀取 Google 日曆列表");
  }

  const payload = (await response.json()) as {
    items?: Array<{ id: string; summary: string; primary?: boolean; accessRole?: string }>;
  };

  return (payload.items ?? []).map((item) => ({
    id: item.id,
    summary: item.summary,
    primary: item.primary,
    accessRole: item.accessRole,
  }));
}

export interface GoogleCalendarEventItem {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  colorId?: string;
}

function googleDateToLocal(value: { dateTime?: string; date?: string }, fallbackDate: string): string {
  if (value.dateTime) {
    const date = new Date(value.dateTime);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  if (value.date) {
    return `${value.date}T09:00`;
  }
  return `${fallbackDate}T09:00`;
}

export async function fetchGoogleCalendarEvents(
  connection: GoogleCalendarConnection,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  storage?: StorageAdapter,
): Promise<GoogleCalendarEventItem[]> {
  const auth = await ensureGoogleAccessToken(connection, storage);
  const params = new URLSearchParams({
    timeMin: `${timeMin}T00:00:00+08:00`,
    timeMax: `${timeMax}T23:59:59+08:00`,
    singleEvents: "true",
    orderBy: "startTime",
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    },
  );

  if (!response.ok) {
    throw new Error("無法同步 Google 日曆行程");
  }

  const payload = (await response.json()) as { items?: GoogleCalendarEventItem[] };
  return payload.items ?? [];
}

export function mapGoogleEventToLocal(
  item: GoogleCalendarEventItem,
  memberId: string,
  calendarId: string,
) {
  const startAt = googleDateToLocal(item.start ?? {}, getTodayFallback());
  const endAt = googleDateToLocal(item.end ?? {}, startAt.slice(0, 10));
  const allDay = Boolean(item.start?.date && !item.start.dateTime);

  return {
    memberId,
    title: item.summary?.trim() || "（無標題）",
    notes: item.description,
    startAt,
    endAt: endAt <= startAt ? `${startAt.slice(0, 10)}T10:00` : endAt,
    allDay,
    color: "blue" as const,
    googleEventId: item.id,
    googleCalendarId: calendarId,
  };
}

function getTodayFallback(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function buildGoogleReminders(reminderMinutes?: number[]) {
  if (!reminderMinutes || reminderMinutes.length === 0) {
    return undefined;
  }

  return {
    useDefault: false,
    overrides: reminderMinutes.map((minutes) => ({
      method: "popup" as const,
      minutes,
    })),
  };
}

export async function createGoogleCalendarEvent(
  connection: GoogleCalendarConnection,
  calendarId: string,
  input: {
    title: string;
    notes?: string;
    startAt: string;
    endAt: string;
    allDay: boolean;
    reminderMinutes?: number[];
  },
  storage?: StorageAdapter,
): Promise<string> {
  const auth = await ensureGoogleAccessToken(connection, storage);
  const reminders = buildGoogleReminders(input.reminderMinutes);
  const body = input.allDay
    ? {
        summary: input.title,
        description: input.notes,
        start: { date: input.startAt.slice(0, 10) },
        end: { date: input.endAt.slice(0, 10) },
        reminders,
      }
    : {
        summary: input.title,
        description: input.notes,
        start: { dateTime: `${input.startAt}:00+08:00` },
        end: { dateTime: `${input.endAt}:00+08:00` },
        reminders,
      };

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error("無法寫入 Google 日曆");
  }

  const payload = (await response.json()) as { id: string };
  return payload.id;
}

export async function updateGoogleCalendarEvent(
  connection: GoogleCalendarConnection,
  calendarId: string,
  eventId: string,
  input: {
    title: string;
    notes?: string;
    startAt: string;
    endAt: string;
    allDay: boolean;
    reminderMinutes?: number[];
  },
  storage?: StorageAdapter,
): Promise<void> {
  const auth = await ensureGoogleAccessToken(connection, storage);
  const reminders = buildGoogleReminders(input.reminderMinutes);
  const body = input.allDay
    ? {
        summary: input.title,
        description: input.notes,
        start: { date: input.startAt.slice(0, 10) },
        end: { date: input.endAt.slice(0, 10) },
        reminders,
      }
    : {
        summary: input.title,
        description: input.notes,
        start: { dateTime: `${input.startAt}:00+08:00` },
        end: { dateTime: `${input.endAt}:00+08:00` },
        reminders,
      };

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error("無法更新 Google 日曆行程");
  }
}

export async function deleteGoogleCalendarEvent(
  connection: GoogleCalendarConnection,
  calendarId: string,
  eventId: string,
  storage?: StorageAdapter,
): Promise<void> {
  const auth = await ensureGoogleAccessToken(connection, storage);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error("無法刪除 Google 日曆行程");
  }
}
