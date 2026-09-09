if (!(self as unknown as ServiceWorkerGlobalScope).skipWaiting) {
  // noop for type guard in non-sw context
}

const SW = self as unknown as ServiceWorkerGlobalScope;

function sanitizeUrl(raw: unknown): string {
  if (typeof raw !== "string") {
    return "/";
  }
  const trimmed = raw.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/";
  }
  if (trimmed.includes("://") || trimmed.toLowerCase().startsWith("javascript:")) {
    return "/";
  }
  if (trimmed.includes("\\") || trimmed.includes("@")) {
    return "/";
  }
  return trimmed;
}

SW.addEventListener("install", (event) => {
  event.waitUntil(SW.skipWaiting());
});

SW.addEventListener("activate", (event) => {
  event.waitUntil(SW.clients.claim());
});

SW.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let title = "Baki Go";
      let body = "你有一則新提醒";
      let url = "/";
      let tag = "baki-go-push";
      let icon = "/icon-192.png";
      let badge = "/icon-192.png";

      try {
        if (event.data) {
          const parsed = event.data.json() as {
            title?: unknown;
            body?: unknown;
            url?: unknown;
            tag?: unknown;
            icon?: unknown;
            badge?: unknown;
          };
          if (typeof parsed.title === "string" && parsed.title.trim()) {
            title = parsed.title.trim();
          }
          if (typeof parsed.body === "string" && parsed.body.trim()) {
            body = parsed.body.trim();
          }
          url = sanitizeUrl(parsed.url);
          if (typeof parsed.tag === "string" && parsed.tag.trim()) {
            tag = parsed.tag.trim();
          }
          if (typeof parsed.icon === "string" && parsed.icon.startsWith("/")) {
            icon = parsed.icon;
          }
          if (typeof parsed.badge === "string" && parsed.badge.startsWith("/")) {
            badge = parsed.badge;
          }
        }
      } catch {
        try {
          const text = event.data?.text();
          if (text && text.trim()) {
            body = text.trim().slice(0, 180);
          }
        } catch {
          // keep defaults
        }
      }

      await SW.registration.showNotification(title, {
        body,
        icon,
        badge,
        tag,
        data: { url },
      });
    })(),
  );
});

SW.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = sanitizeUrl(event.notification.data?.url ?? "/calendar");

  event.waitUntil(
    SW.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client && typeof client.navigate === "function") {
            client.navigate(url);
          }
          return client.focus();
        }
      }
      return SW.clients.openWindow(url);
    }),
  );
});

SW.addEventListener("message", (event) => {
  if (event.data?.type === "SYNC_CALENDAR_REMINDERS") {
    // Kept for backward compatibility; server-side Web Push is the primary delivery path.
  }
});
