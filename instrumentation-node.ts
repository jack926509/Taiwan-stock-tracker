// Node.js 專屬：在 Zeabur 常駐程式內掛「每日收盤補資料」排程。
// 只在雲端模式（有設 Supabase 變數）才掛；本機開發（走本地 JSON）不掛、不吵。
import { usingSupabase } from "@/lib/store";
import { schedule } from "node-cron";
import { backfillWatchlist } from "@/lib/backfill";

if (usingSupabase()) {
  // 週一～五 17:00（台北）：收盤後 FinMind 日 K 已更新時補抓，並兼作 Supabase keep-alive
  schedule(
    "0 17 * * 1-5",
    () => {
      backfillWatchlist()
        .then((r) => console.log(`[backfill] 完成 ok=${r.ok} fail=${r.fail}`))
        .catch((e) => console.error("[backfill] 失敗：", e));
    },
    { timezone: "Asia/Taipei" }
  );
  console.log("[backfill] 已排程：週一～五 17:00 (Asia/Taipei)");
}
