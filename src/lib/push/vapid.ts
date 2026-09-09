/**
 * VAPID env helpers.
 * Public key is intentionally exposable via NEXT_PUBLIC_VAPID_PUBLIC_KEY.
 * Private key must never ship to the client.
 */

export function readVapidPublicKey(): string {
  return (
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    process.env.VAPID_PUBLIC_KEY?.trim() ||
    ""
  );
}

export function readVapidPrivateKey(): string {
  return process.env.VAPID_PRIVATE_KEY?.trim() || "";
}

export function readVapidSubject(): string {
  return (
    process.env.VAPID_SUBJECT?.trim() ||
    process.env.WEB_PUSH_CONTACT?.trim() ||
    "mailto:support@bakigo.tw"
  );
}

export function isVapidConfigured(): boolean {
  return Boolean(readVapidPublicKey() && readVapidPrivateKey());
}

/** Convert URL-safe base64 VAPID public key to Uint8Array for PushManager.subscribe. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}
