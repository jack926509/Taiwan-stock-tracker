const AUTH_COOKIE = "app_auth";

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return rawValue.join("=");
  }
  return null;
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export async function isAuthorizedHealthDetail(req: Request): Promise<boolean> {
  const token = process.env.HEALTH_DETAIL_TOKEN;
  const bearer = bearerToken(req.headers.get("authorization"));
  if (token && bearer === token) return true;

  const password = process.env.APP_ACCESS_PASSWORD;
  if (!password) return false;

  const expected = await sha256Hex(password);
  return cookieValue(req.headers.get("cookie"), AUTH_COOKIE) === expected;
}
