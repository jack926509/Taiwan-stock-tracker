import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, sha256Hex } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const expected = process.env.APP_ACCESS_PASSWORD;
  if (!expected) {
    return NextResponse.json({ ok: true, note: "未設定密碼保護" });
  }
  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ ok: false, error: "格式錯誤" }, { status: 400 });
  }
  // 密碼只在後端比對，前端 bundle 不含明文
  if (password !== expected) {
    return NextResponse.json({ ok: false, error: "密碼錯誤" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await sha256Hex(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 60, // 60 天
    path: "/",
  });
  return res;
}
