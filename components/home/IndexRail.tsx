// 左欄（桌面 ≥1000px sticky 336px；<1000px 併入主欄上方）：
// 大盤指數卡 ×2 ＋ 自選概況卡 ＋ 提醒摘要卡。三卡在 600–999px 併排兩欄，<600px 單欄堆疊
// （照抄視覺規範 .rail-stack 的斷點：max-width:999px 起單欄，600–999px 兩欄）。
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
    <aside className="min-w-0 min-[1000px]:sticky min-[1000px]:top-[78px]">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[2px] text-muted">
          大盤指數
        </span>
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </div>
      <div className="grid gap-3">
        {/* 兩顆指數卡自己內部在 600–999px 併排兩欄，<600px／≥1000px 皆單欄 */}
        <IndexCards indices={indices} />
        <WatchSummaryCard
          up={watchStats.up}
          down={watchStats.down}
          flat={watchStats.flat}
          todayHits={watchStats.todayHits}
        />
        <AlertSummaryCard items={alertItems} />
      </div>
    </aside>
  );
}
