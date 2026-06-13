// LINE 推播：複用 Hermes 既有的 LINE 官方帳號憑證，直接打 Messaging API push 端點。
// 不經 Hermes 行程（那是本機常駐、靠 cloudflared 通道），由 Zeabur 雲端直送最穩。
// 憑證只放環境變數（.env.local 與 Zeabur），切勿寫進程式碼或 git。

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

export function lineConfigured(): boolean {
  return Boolean(
    process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_TARGET_USER_ID
  );
}

// 推一則純文字訊息給設定的 userId；成功回 true，未設定或失敗回 false（不丟例外，避免中斷檢查迴圈）
export async function pushLine(text: string): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_TARGET_USER_ID;
  if (!token || !to) return false;
  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[line] push 失敗 ${res.status}：${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[line] push 例外：", e);
    return false;
  }
}
