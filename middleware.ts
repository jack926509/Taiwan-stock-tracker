import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, sha256Hex } from "@/lib/auth";

// 攔截所有非公開路徑做 cookie 驗證（附錄 A.2 契約）。
// 未設定 APP_ACCESS_PASSWORD（本機開發）時不攔截。
// /sw.js 必須公開：Service Worker 註冊請求不帶登入 cookie 語意，被導向 /login 會拿到 HTML 而註冊失敗
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/sw.js"];

export async function middleware(req: NextRequest) {
  const password = process.env.APP_ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const expected = await sha256Hex(password);
  if (req.cookies.get(AUTH_COOKIE)?.value === expected) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|icon).*)"],
};
