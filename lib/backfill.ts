// 每日收盤後補資料：逐檔把自選股的當日 K 線補進快取（Supabase）。
// 同時天然當作 Supabase keep-alive（7 天無活動會被暫停的對策）。
// 由 instrumentation.ts 的排程在 Zeabur 常駐程式內自跑；亦可手動呼叫。
import { listWatchlist } from "@/lib/store";
import { ensureKline } from "@/lib/klineService";
import { taipeiNow } from "@/lib/market-hours";
import { recordBackfill } from "@/lib/status";

export async function backfillWatchlist(): Promise<{ ok: number; fail: number }> {
  const today = taipeiNow().isoDate;
  const items = await listWatchlist();
  let ok = 0;
  let fail = 0;
  // 逐檔（非併發）補抓，避免一次打太多撞 FinMind 限流
  for (const it of items) {
    try {
      await ensureKline(it.stock_id, today);
      ok += 1;
    } catch {
      fail += 1;
    }
  }
  // 記錄本次結果供 /api/health?detail=1 觀測（雲端模式才寫）
  await recordBackfill(ok, fail, new Date());
  return { ok, fail };
}
