const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/health",
  "/sw.js",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons",
] as const;

export function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    PUBLIC_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  );
}
