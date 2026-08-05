const PASSWORD_SALT = "baki-go-auth-v1";

export async function hashPassword(password: string): Promise<string> {
  const encoded = new TextEncoder().encode(`${PASSWORD_SALT}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const nextHash = await hashPassword(password);
  return nextHash === passwordHash;
}
