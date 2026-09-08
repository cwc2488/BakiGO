import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "l2k1:";

function getTokenSecret(): Buffer {
  const raw =
    process.env.LOSE2KG_TOKEN_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "baki-go-lose2kg-dev-token-secret";
  return createHash("sha256").update(`lose2kg-token-v1:${raw}`, "utf8").digest();
}

/** Encrypt raw share token for Admin-only persistent display. */
export function encryptLose2kgToken(rawToken: string): string {
  const key = getTokenSecret();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(rawToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptLose2kgToken(payload: string | null | undefined): string | null {
  if (!payload || !payload.startsWith(PREFIX)) return null;
  try {
    const body = payload.slice(PREFIX.length);
    const [ivB64, tagB64, dataB64] = body.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const key = getTokenSecret();
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}
