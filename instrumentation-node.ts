// Node.js 專屬：在 Zeabur 常駐程式內掛「每日收盤補資料」排程。
// 只在雲端模式（有設 Supabase 變數）才掛；本機開發（走本地 JSON）不掛、不吵。
import { usingSupabase } from "@/lib/store";
import { schedule } from "node-cron";
import { backfillWatchlist } from "@/lib/backfill";
import { keepAlive } from "@/lib/status";
import { checkAlerts } from "@/lib/alerts";
import { isMarketOpenNow } from "@/lib/market-hours";

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
  // 週六、日 12:30（台北）：輕量 ping，補足週末無活動的 keep-alive 缺口
  schedule(
    "30 12 * * 0,6",
    () => {
      keepAlive()
        .then(() => console.log("[keep-alive] 週末 ping 完成"))
        .catch((e) => console.error("[keep-alive] 失敗：", e));
    },
    { timezone: "Asia/Taipei" }
  );
  // 工作日每分鐘：盤中才檢查到價提醒（isMarketOpenNow 守門，非盤中不抓報價）
  schedule(
    "* * * * 1-5",
    async () => {
      if (!(await isMarketOpenNow())) return;
      checkAlerts()
        .then((n) => {
          if (n > 0) console.log(`[alerts] 推播 ${n} 則到價提醒`);
        })
        .catch((e) => console.error("[alerts] 檢查失敗：", e));
    },
    { timezone: "Asia/Taipei" }
  );
  console.log(
    "[backfill] 已排程：工作日 17:00 補資料、週末 12:30 keep-alive、盤中每分鐘檢查到價提醒 (Asia/Taipei)"
  );
}
