// 左欄（桌面 ≥1360px 336px 並排；<1360px 併入主欄上方）：
// 大盤指數卡 ×2 ＋ 自選概況卡 ＋ 提醒摘要卡。指數卡在 600–1359px 併排兩欄，<600px 單欄堆疊。
import type { Quote } from "@/lib/types";
import IndexCards from "@/components/IndexCard";
import WatchSummaryCard from "@/components/home/WatchSummaryCard";
import AlertSummaryCard, { type AlertRailItem } from "@/components/home/AlertSummaryCard";

export default function IndexRail({
  indices,
  watchStats,
  alertItems,
}: {
  indices: Quote[];
  watchStats: { up: number; down: number; flat: number; todayHits: number };
  alertItems: AlertRailItem[];
}) {
  return (
    // 不 sticky、不欄內捲動：左欄比視窗高時，sticky 會把底部釘在畫面外；改成欄內
    // overflow-y-auto 又會讓觸控板一次滑動被鎖定在左欄小捲動區、頁面不動（2026-07-19
    // 使用者兩度回報滑不到底）。整頁只留一個捲動軸最穩。
    // 手機（<600px）：aside 用 contents 攤平成外層格線的子項，指數卡留在最上面（縮成一行兩顆），
    // 自選概況／提醒摘要用 order-last 排到自選股清單之後，讓第一個畫面就看得到自選股。
    <aside className="min-w-0 max-[599px]:contents">
      <div className="mb-2.5 flex items-center gap-2 max-[599px]:hidden">
        <span className="font-mono text-xs uppercase tracking-[2px] text-muted">
          大盤指數
        </span>
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </div>
      <div className="grid gap-3 max-[599px]:contents">
        {/* 兩顆指數卡：<1360px 併排兩欄（手機版縮小成一行），≥1360px 單欄堆疊 */}
        <IndexCards indices={indices} />
        <div className="grid gap-3 max-[599px]:order-last max-[599px]:pb-4">
          <WatchSummaryCard
            up={watchStats.up}
            down={watchStats.down}
            flat={watchStats.flat}
            todayHits={watchStats.todayHits}
          />
          <AlertSummaryCard items={alertItems} />
        </div>
      </div>
    </aside>
  );
}
