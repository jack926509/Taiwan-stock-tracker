import { NextRequest, NextResponse } from "next/server.js";

// 個人站不設應用程式登入門檻；保留 middleware 以維持既有 Next.js 路由設定。
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
