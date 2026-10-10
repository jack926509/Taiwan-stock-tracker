import type { WatchlistItem } from "@/lib/types";
import { fmt, fmtPct } from "@/lib/format";
import type { TouchState } from "@/lib/alertTouched";

// 供 IndexRail／app/page.tsx 共用：AlertSummaryCard 需要「條件價 vs 現價」算距觸價 %，
// 這比純 WatchlistItem 多一個現價欄位，故在既有型別上疊加，不改動 lib/types.ts 的共用契約。
export type AlertRailItem = WatchlistItem & {
  price: number | null;
  // 已觸及狀態由首頁資料層依「今日 MIS 成交價」算好：hit＝已觸及、past＝價格雖越過但非今日成交價
  highState: TouchState;
  lowState: TouchState;
};

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    </svg>
  );
}

function AlertRow({ item }: { item: AlertRailItem }) {
  const { price } = item;
  // 一檔可能同時設高低價提醒；各自算一行距觸價（以現價為分母）
  const rows: { label: string; target: number; tone: "up" | "down"; state: TouchState }[] = [];
  if (item.alert_high != null) rows.push({ label: "≥", target: item.alert_high, tone: "up", state: item.highState });
  if (item.alert_low != null) rows.push({ label: "≤", target: item.alert_low, tone: "down", state: item.lowState });

  return (
    <div className="flex items-start gap-2.5 border-t border-line py-2 first:border-t-0 first:pt-0">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
        <BellIcon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">{item.name}</div>
        <div className="font-mono text-xs tracking-wide text-faint">{item.stock_id}</div>
      </div>
      <div className="shrink-0 text-right">
        {rows.map((r) => {
          const dist = price != null && price !== 0 ? Math.abs((r.target - price) / price) : null;
          const note =
            r.state === "hit" ? "已觸及"
            : r.state === "past" ? "參考價已越過（非即時成交）"
            : dist === null ? "距觸價 —" : `距觸價 ${fmtPct(dist)}`;
          return (
            <div key={r.label} className="leading-tight">
              <div className={`font-mono text-xs font-bold tabular ${r.tone === "up" ? "text-up" : "text-down"}`}>
                {r.label} {fmt(r.target)}
              </div>
              <div className={`text-xs ${r.state === "hit" ? "font-semibold text-ink" : "text-muted"}`}>
                {note}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AlertSummaryCard({ items }: { items: AlertRailItem[] }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-sm font-bold tracking-wide text-ink">提醒摘要</span>
        <span className="ml-auto font-mono text-xs tracking-wide text-faint">
          {items.length} 檔監控中
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted">尚未設定任何到價提醒</p>
      ) : (
        items.map((item) => <AlertRow key={item.stock_id} item={item} />)
      )}
    </div>
  );
}
