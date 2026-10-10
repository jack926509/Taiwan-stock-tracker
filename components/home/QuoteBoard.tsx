"use client";

// 自選股主表：桌面 ≥600px 顯示表格（thead + row，7 欄格線照抄視覺規範），
// 手機 <600px 用 CSS 斷點把「同一列 DOM」切成卡片（grid-template-areas）。
// 排序／篩選狀態與資料抓取留在 app/page.tsx（資料層），本元件只負責渲染＋刪除／拖曳排序回呼。
import Link from "next/link";
import type { Quote, WatchlistItem } from "@/lib/types";
import type { Signal } from "@/lib/signals";
import Sparkline from "@/components/Sparkline";
import SwipeToDelete from "@/components/SwipeToDelete";
import EmptyState from "@/components/EmptyState";
import SortableQuoteRows, { SortableRow } from "@/components/home/SortableQuoteRows";
import { fmt, fmtVol, fmtPct, trendOf, limitOf } from "@/lib/format";
import { hasAnyAlert } from "@/lib/alertBadge";
import { quoteDelayLabel } from "@/lib/quoteStatus";

export const SORTS = [
  { key: "default", label: "預設" },
  { key: "gain", label: "漲幅" },
  { key: "loss", label: "跌幅" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];

export const FILTERS = [
  { key: "all", label: "全部" },
  { key: "alert", label: "已設提醒" },
  { key: "up", label: "僅看漲" },
  { key: "down", label: "僅看跌" },
] as const;
export type FilterKey = (typeof FILTERS)[number]["key"];

// 桌面格線源自視覺規範 2026-07-18-visual-spec-final.html（.thead, .row）7 欄，
// 另加一欄（36px）放刪除鍵：不可用 absolute 浮貼＋列 padding 預留——padding 會壓縮
// 格線可用寬，寬度不足時欄位溢出 padding 區、刪除鍵照樣疊到最後一欄（2026-07-19 教訓）。
// 600–1359px 只排 6 欄（藏成交量、日內走勢）：表格一旦橫向溢出，Mac 觸控板帶斜向的
// 捲動手勢會被鎖在表格橫向軸、整頁垂直捲動被吃掉（CDP 手勢實測重現；使用者若開
// 頁面縮放，有效寬度更容易落入此區間）。≥1360px 才排滿 8 欄。
// 商品名（元大台灣加權指數ETF基金…）較長，原 minmax(140px,1.1fr) 會被 truncate 切成「元大台灣…」；
// 訊號欄原 minmax(196px,1.5fr) 留白過多。把寬度從訊號欄挪給商品欄：兩欄「最小寬」總和維持 336px 不變
// （210+126），不增加橫向溢出風險（見下方 600–1359px 溢出警告），只調 fr 權重讓商品欄優先吃多餘空間。
// 報價欄 92→120px（2026-07-22）：盤中「報價 13:25:47未成交」whitespace-nowrap 不換行會溢出 92px 欄、
// 侵入左側走勢欄（CDP 實測 gap −14px）；加寬到 120px 後最壞情況 gap +14px。彈性兩欄餘裕充足、不增溢出風險。
// 走勢欄的「20 日」語意已移到表頭欄名，Sparkline 只留圖並置中，不再於每列右緣印字與報價時間相撞。
// 8 欄最小寬須塞進「固定」主欄（2026-07-23）：外層 max-w-[1360px]、左欄 rail 336px+gap 20px 把主欄鎖在
// 約 968px；可拖曳時列還有 pl-9（36px）。舊版 8 欄最小寬總和 854px+gaps 84px=938px，扣掉內距後超出可用寬
// 約 24px，剛好把最後一欄（刪除鍵）擠出卡片右邊界。改法：收窄非內容關鍵欄——漲跌 110→100、量 80→64、
// 走勢 88→72、刪除 36→32（共 −46px），最小寬總和降到 808px，穩穩落在可用寬內留餘裕；商品欄(210)、報價欄(120)
// 不動避免長名截斷／盤中報價時間溢出回歸。收窄多出的空間由彈性 fr 欄（商品／訊號）吸收，列仍填滿主欄不留空。
const GRID_COLS =
  "grid-cols-[minmax(210px,1.8fr)_84px_100px_minmax(126px,0.9fr)_120px_32px] " +
  "min-[1360px]:grid-cols-[minmax(210px,1.8fr)_84px_100px_minmax(126px,0.9fr)_64px_72px_120px_32px]";
// 手機把同一組欄位改用具名區域堆成精簡卡（約 100px 高，原 206px）：
// 第 1 行 商品｜現價，第 2 行 訊號｜漲跌，第 3 行 市場別・量・延遲・提醒。
// 手機不排 20 日走勢（桌面表格版維持原樣）。
const MOBILE_AREAS =
  "max-[599px]:grid-cols-[1fr_auto] max-[599px]:[grid-template-areas:'sym_price'_'sig_change'_'foot_foot']";

function Skeleton({ className }: { className: string }) {
  return <span aria-hidden="true" className={`inline-block animate-pulse rounded bg-line/70 ${className}`} />;
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    </svg>
  );
}

function signalToneClass(tone: Signal["tone"]): string {
  if (tone === "up") return "bg-up-tint text-up-strong";
  if (tone === "down") return "bg-down-tint text-down";
  return "bg-line/35 text-muted";
}

function Row({
  quote,
  hasAlert,
  spark,
  signals,
  sparkLoading,
  latestAsOf,
  onDelete,
  reorderable,
}: {
  quote: Quote;
  hasAlert: boolean;
  spark?: number[];
  signals?: Signal[];
  sparkLoading: boolean;
  latestAsOf: string | null;
  onDelete: (stockId: string, name: string) => void;
  reorderable: boolean;
}) {
  const t = trendOf(quote.change);
  const limit = limitOf(quote.changePct);
  const upDown = limit ?? (t === "flat" ? null : t);
  // 報價時間整批只在標題顯示一次；這一列只有落後同批最新行情時才標「延遲」
  // 沒有來源時間的列照契約仍須呈現缺漏，標「時間未知」
  const delay = quote.asOf ? quoteDelayLabel(quote.asOf, latestAsOf) : "時間未知";

  const badges: { key: string; label: string; cls: string }[] = [];
  if (limit === "up") badges.push({ key: "limit", label: "漲停", cls: "bg-up text-white dark:text-app" });
  else if (limit === "down") badges.push({ key: "limit", label: "跌停", cls: "bg-down text-white dark:text-app" });
  for (const s of signals ?? []) {
    badges.push({ key: s.kind, label: s.label, cls: signalToneClass(s.tone) });
  }

  return (
    <SwipeToDelete onDelete={() => onDelete(quote.stockId, quote.name)}>
      <div
        id={`stock-${quote.stockId}`}
        className={`group relative scroll-mt-24 grid items-center gap-3 border-line bg-surface px-4 py-3 hover:bg-surface-2 rise-in max-[599px]:gap-y-1.5 max-[599px]:rounded-card max-[599px]:border max-[599px]:border-line max-[599px]:bg-surface max-[599px]:px-4 max-[599px]:py-2.5 max-[599px]:shadow-card ${GRID_COLS} ${MOBILE_AREAS} ${reorderable ? "max-[599px]:pl-8 min-[600px]:pl-9" : ""}`}
      >
        {/* 左緣 3px 漲跌色條 */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 w-[3px] max-[599px]:rounded-l-card ${
            upDown === "up" ? "bg-up" : upDown === "down" ? "bg-down" : "bg-transparent"
          }`}
        />

        <Link
          href={`/stock/${quote.stockId}`}
          className="flex min-w-0 items-center gap-2.5 max-[599px]:[grid-area:sym] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="shrink-0 rounded border border-line-strong px-1.5 py-0.5 font-mono text-xs text-muted">
            {quote.stockId}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <span className="truncate">{quote.name}</span>
              {hasAlert && <BellIcon className="h-3.5 w-3.5 shrink-0 text-warn" />}
            </span>
            <span className="mt-0.5 block font-mono text-xs text-faint max-[599px]:hidden">
              {quote.market === "tse" ? "上市" : "上櫃"}
            </span>
          </span>
        </Link>

        <div className="text-right font-mono text-base font-bold tabular text-ink max-[599px]:text-lg max-[599px]:[grid-area:price]">
          {fmt(quote.price)}
        </div>

        <div className="flex flex-col items-end gap-1 text-right max-[599px]:[grid-area:change] max-[599px]:flex-row max-[599px]:items-center max-[599px]:gap-2">
          <span className={`font-mono text-[13px] font-bold tabular ${t === "up" ? "text-up" : t === "down" ? "text-down" : "text-flat"}`}>
            {quote.change !== null && quote.change > 0 ? "+" : ""}
            {fmt(quote.change)}
          </span>
          <span
            className={`rounded-pill px-2 py-0.5 font-mono text-xs font-bold tabular ${
              t === "up" ? "bg-up-tint text-up-strong" : t === "down" ? "bg-down-tint text-down" : "bg-surface-2 text-flat"
            }`}
          >
            {quote.changePct !== null && quote.changePct > 0 ? "+" : ""}
            {fmtPct(quote.changePct)}
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5 max-[599px]:[grid-area:sig]">
          {badges.length > 0 ? (
            <>
              {badges.slice(0, 3).map((b, i) => (
                <span
                  key={b.key}
                  className={`truncate rounded px-1.5 py-0.5 text-xs font-semibold ${b.cls} ${i >= 2 ? "max-[599px]:hidden" : ""}`}
                >
                  {b.label}
                </span>
              ))}
              {/* 手機最多顯示 2 個訊號，其餘以「+N」表示（不裁切標籤） */}
              {badges.length > 2 && (
                <span className="hidden shrink-0 rounded bg-line/35 px-1.5 py-0.5 text-xs font-semibold text-muted max-[599px]:inline">
                  +{badges.length - 2}
                </span>
              )}
            </>
          ) : sparkLoading ? (
            <Skeleton className="h-5 w-16" />
          ) : (
            <span className="text-xs text-faint max-[599px]:hidden">—</span>
          )}
        </div>

        {/* 成交量欄只在 ≥1360px 排入格線（600–1359 藏欄防橫向捲軸；<600 手機另在 foot 列顯示量）；
            桌面格線沒有具名區域，不可加 grid-area，否則會被推進隱形末欄並多出一列空白 */}
        <div className="hidden text-right font-mono text-xs tabular text-ink min-[1360px]:block">
          {fmtVol(quote.volume)}
        </div>

        <div className="flex justify-center max-[599px]:hidden min-[600px]:max-[1359px]:hidden">
          {spark && spark.length > 1 ? (
            <Sparkline points={spark} />
          ) : sparkLoading ? (
            <Skeleton className="h-5 w-16" />
          ) : (
            <span className="text-xs text-faint">—</span>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 text-right max-[599px]:[grid-area:foot] max-[599px]:w-full max-[599px]:flex-row max-[599px]:flex-wrap max-[599px]:items-center max-[599px]:justify-start max-[599px]:gap-x-3 max-[599px]:gap-y-0">
          <span className="hidden font-mono text-xs text-muted max-[599px]:inline">
            {quote.market === "tse" ? "上市" : "上櫃"}
          </span>
          <span className="hidden font-mono text-xs text-muted tabular max-[599px]:inline">
            量 {fmtVol(quote.volume)}
          </span>
          {delay && (
            <span className="whitespace-nowrap font-mono text-xs font-semibold text-warn tabular">{delay}</span>
          )}
          {hasAlert ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-pill bg-warn-tint px-2 py-0.5 text-xs font-semibold text-warn">
              <BellIcon className="h-3 w-3" />已設
            </span>
          ) : (
            <span className="text-xs text-faint max-[599px]:hidden">—</span>
          )}
        </div>

        {/* 刪除鍵＝格線第 8 欄（40px）的正式成員，滑入列才浮現；手機（<600px）改用滑動刪除 */}
        <button
          type="button"
          onClick={() => onDelete(quote.stockId, quote.name)}
          aria-label={`刪除 ${quote.name}`}
          className="hidden h-8 w-8 items-center justify-center justify-self-end rounded-lg border border-line bg-surface text-xs text-muted opacity-0 shadow-card transition-[transform,color,opacity] hover:scale-105 hover:bg-up-tint hover:text-up-strong focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100 active:scale-[0.97] md:flex max-[599px]:hidden"
        >
          ✕
        </button>
      </div>
    </SwipeToDelete>
  );
}

export default function QuoteBoard({
  quotes,
  items,
  onDelete,
  sparkData,
  incomplete = false,
  sparkLoading = false,
  allQuotes,
  reorderable = false,
  onReorder,
}: {
  quotes: Quote[];
  items: WatchlistItem[];
  onDelete: (stockId: string, name: string) => void;
  // 額外資料（超出 task-7-brief 最小契約，皆為可選＋向下相容，見 task-7-report.md）：
  // 既有訊號／20 日走勢資料（來自 /api/sparklines，本元件不重新打 API）
  sparkData?: Record<string, { spark: number[]; signals: Signal[] }>;
  incomplete?: boolean;
  // 訊號／20 日走勢資料載入中：顯示骨架條，載入完成（或失敗）才顯示「—」
  sparkLoading?: boolean;
  // 未經篩選的全部報價：「延遲」基準時間用它算，切換篩選時同一檔的標記才不會忽有忽無
  allQuotes?: Quote[];
  // 拖曳排序：僅「預設排序＋無篩選＋≥2 檔」時 shell 會傳入，保留舊版可拖曳排序功能
  reorderable?: boolean;
  onReorder?: (next: string[]) => void;
}) {
  const alertedIds = new Set(
    items.filter(hasAnyAlert).map((i) => i.stock_id)
  );

  if (items.length === 0) {
    return (
      <EmptyState
        emoji="📈"
        description="還沒有自選股，輸入代號加入第一檔吧（例如 2330 台積電）"
      />
    );
  }

  if (quotes.length === 0) {
    return <EmptyState description={incomplete
      ? "暫時未取得符合條件的報價，稍後會重新嘗試"
      : "此篩選條件下沒有自選股"} />;
  }

  const canDrag = reorderable && !!onReorder && quotes.length > 1;
  // 同批最新的行情時間：個別股票落後它才標「延遲」
  const latestAsOf = (allQuotes ?? quotes).reduce<string | null>((latest, q) => {
    const t = q.asOf ? Date.parse(q.asOf) : NaN;
    if (!Number.isFinite(t)) return latest;
    return latest === null || t > Date.parse(latest) ? (q.asOf ?? null) : latest;
  }, null);
  const ids = quotes.map((q) => q.stockId);

  const rows = quotes.map((q, i) => {
    const node = (
      <div className="rise-in" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
        <Row
          quote={q}
          hasAlert={alertedIds.has(q.stockId)}
          spark={sparkData?.[q.stockId]?.spark}
          signals={sparkData?.[q.stockId]?.signals}
          sparkLoading={sparkLoading}
          latestAsOf={latestAsOf}
          onDelete={onDelete}
          reorderable={canDrag}
        />
      </div>
    );
    return canDrag ? (
      <SortableRow key={q.stockId} id={q.stockId}>
        {node}
      </SortableRow>
    ) : (
      <div key={q.stockId}>{node}</div>
    );
  });

  return (
    // 6 欄版最小內容寬約 770px，600–805px 視窗仍可能溢出；外層 overflow-x-auto 讓
    // 「表格自己」局部橫向捲動，不把整個頁面撐寬（見 task-7-report.md）。此捲動容器
    // 在溢出時會吃掉觸控板斜向手勢的垂直分量，所以欄位設計上盡量讓它不溢出。
    <div className="max-[599px]:overflow-visible overflow-x-auto">
      <div className="rounded-card border border-line bg-surface shadow-card max-[599px]:border-0 max-[599px]:bg-transparent max-[599px]:shadow-none">
        <div
          className={`grid items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5 font-mono text-xs uppercase tracking-wide text-muted max-[599px]:hidden ${GRID_COLS} ${canDrag ? "min-[600px]:pl-9" : ""}`}
        >
          <span>商品</span>
          <span className="text-right">現價</span>
          <span className="text-right">漲跌 / 幅度</span>
          <span>訊號</span>
          {/* 量、日內走勢兩欄與列一致：只在 ≥1360px 排入 */}
          <span className="hidden text-right min-[1360px]:block">量</span>
          <span className="hidden text-center min-[1360px]:block">20 日走勢</span>
          <span className="text-right">提醒</span>
          {/* 末欄＝刪除鍵欄，表頭留空對齊 */}
          <span aria-hidden="true" />
        </div>
        {/* 列間細分隔線畫在容器（divide-y 作用於外層 wrapper）：列本身不能用 border-b＋last:，
            因為每列都被 rise-in/Sortable wrapper 包住、皆為 :last-child，線會全被吃掉 */}
        <div className="divide-y divide-line max-[599px]:grid max-[599px]:gap-3 max-[599px]:divide-y-0">
          {canDrag && onReorder ? (
            <SortableQuoteRows ids={ids} onReorder={onReorder}>
              {rows}
            </SortableQuoteRows>
          ) : (
            rows
          )}
        </div>
      </div>
    </div>
  );
}
