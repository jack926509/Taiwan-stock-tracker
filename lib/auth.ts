// 單一密碼保護（附錄 A.2 契約）：middleware 與 /api/auth 共用
export const AUTH_COOKIE = "app_auth";

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
