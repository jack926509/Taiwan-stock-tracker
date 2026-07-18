// 左欄「自選概況」卡：把視覺規範原本的「市場概況」（全市場漲跌家數／成交金額，
// 我們沒有這組全市場資料）換成完全用既有資料算得出來的版本——
// 自選股上漲/下跌/平盤家數 ＋ 今日觸發提醒數（hitToday 邏輯），不打任何新 API。
export default function WatchSummaryCard({
  up,
  down,
  flat,
  todayHits,
}: {
  up: number;
  down: number;
  flat: number;
  todayHits: number;
}) {
  const hasData = up > 0 || down > 0 || flat > 0;

  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-bold tracking-wide text-ink">自選概況</span>
        <span className="ml-auto font-mono text-[10px] tracking-wide text-faint">WATCHLIST</span>
      </div>

      <div className="mb-3 flex h-2 overflow-hidden rounded-pill bg-surface-2" aria-hidden="true">
        <span className="bg-up" style={{ flex: up || 0.0001 }} />
        <span className="bg-line-strong" style={{ flex: flat || 0.0001 }} />
        <span className="bg-down" style={{ flex: down || 0.0001 }} />
      </div>

      <dl className="divide-y divide-line text-sm">
        <div className="flex items-center justify-between py-1.5">
          <dt className="flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 shrink-0 rounded-sm bg-up" aria-hidden="true" />
            上漲家數
          </dt>
          <dd className="font-mono font-bold tabular text-up">
            {up} <span className="text-[11px] font-semibold text-faint">家</span>
          </dd>
        </div>
        <div className="flex items-center justify-between py-1.5">
          <dt className="flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 shrink-0 rounded-sm bg-down" aria-hidden="true" />
            下跌家數
          </dt>
          <dd className="font-mono font-bold tabular text-down">
            {down} <span className="text-[11px] font-semibold text-faint">家</span>
          </dd>
        </div>
        <div className="flex items-center justify-between py-1.5">
          <dt className="flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 shrink-0 rounded-sm bg-line-strong" aria-hidden="true" />
            平盤家數
          </dt>
          <dd className="font-mono font-bold tabular text-ink">
            {flat} <span className="text-[11px] font-semibold text-faint">家</span>
          </dd>
        </div>
        <div className="flex items-center justify-between py-1.5">
          <dt className="flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 shrink-0 rounded-sm bg-primary" aria-hidden="true" />
            今日觸發提醒
          </dt>
          <dd className="font-mono font-bold tabular text-ink">
            {todayHits} <span className="text-[11px] font-semibold text-faint">則</span>
          </dd>
        </div>
      </dl>
      {!hasData && <p className="mt-2 text-xs text-muted">尚無自選股資料</p>}
    </div>
  );
}
