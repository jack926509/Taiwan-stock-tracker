import { AUTH_COOKIE, sha256Hex } from "./auth.ts";
import { isPublicPath } from "./publicPaths.ts";

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return rawValue.join("=");
  }
  return null;
}

export async function authorizeWorkerRequest(
  request: Request,
  password: string | undefined,
): Promise<Response | null> {
  if (!password) return null;

  const url = new URL(request.url);
  if (isPublicPath(url.pathname)) return null;

  const expected = await sha256Hex(password);
  if (cookieValue(request.headers.get("cookie"), AUTH_COOKIE) === expected) {
    return null;
  }

  if (url.pathname.startsWith("/api/")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  url.pathname = "/login";
  url.search = "";
  return Response.redirect(url, 307);
}
