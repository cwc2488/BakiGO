if (!(self as unknown as ServiceWorkerGlobalScope).skipWaiting) {
  // noop for type guard in non-sw context
}

const SW = self as unknown as ServiceWorkerGlobalScope;

SW.addEventListener("install", (event) => {
  event.waitUntil(SW.skipWaiting());
});

SW.addEventListener("activate", (event) => {
  event.waitUntil(SW.clients.claim());
});

SW.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string | undefined) ?? "/calendar";

  event.waitUntil(
    SW.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return SW.clients.openWindow(url);
    }),
  );
});

SW.addEventListener("message", (event) => {
  if (event.data?.type === "SYNC_CALENDAR_REMINDERS") {
    // 喚醒 service worker；實際檢查仍由前景頁面執行
  }
});
