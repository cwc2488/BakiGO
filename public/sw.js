/* Baki Go service worker — plain browser JS (no TypeScript). */

function sanitizeUrl(raw) {
  if (typeof raw !== "string") {
    return "/";
  }
  var trimmed = raw.trim();
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

self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  event.waitUntil(
    (async function () {
      var title = "Baki Go";
      var body = "你有一則新提醒";
      var url = "/";
      var tag = "baki-go-push";
      var icon = "/icon-192.png";
      var badge = "/icon-192.png";

      try {
        if (event.data) {
          var parsed = event.data.json();
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
      } catch (err) {
        try {
          if (event.data) {
            var text = event.data.text();
            if (text && text.trim()) {
              body = text.trim().slice(0, 180);
            }
          }
        } catch (textErr) {
          // keep defaults
        }
      }

      await self.registration.showNotification(title, {
        body: body,
        icon: icon,
        badge: badge,
        tag: tag,
        data: { url: url },
      });
    })(),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var rawUrl =
    event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : "/calendar";
  var url = sanitizeUrl(rawUrl);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i += 1) {
        var client = clients[i];
        if ("focus" in client) {
          if ("navigate" in client && typeof client.navigate === "function") {
            client.navigate(url);
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SYNC_CALENDAR_REMINDERS") {
    // Kept for backward compatibility; server-side Web Push is the primary delivery path.
  }
});
