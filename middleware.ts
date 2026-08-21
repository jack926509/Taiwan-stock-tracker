import { NextRequest, NextResponse } from "next/server.js";
import { AUTH_COOKIE, sha256Hex } from "./lib/auth.ts";
import { isPublicPath } from "./lib/publicPaths.ts";

// 攔截所有非公開路徑做 cookie 驗證（附錄 A.2 契約）。
// 未設定 APP_ACCESS_PASSWORD（本機開發）時不攔截。
// /sw.js 與 /offline.html 必須公開：SW 註冊被導向 /login 會拿到 HTML 而註冊失敗；
// 離線頁若在未登入時被預快取，會把登入頁誤存成離線頁
export async function middleware(req: NextRequest) {
  const password = process.env.APP_ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) {
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
  matcher: ["/((?!_next/static|_next/image).*)"],
};
