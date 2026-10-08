"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { QuoteResponse, Quote } from "@/lib/types";
import PriceAlertCard from "@/components/PriceAlertCard";
import MobileNetworkBanner from "@/components/MobileNetworkBanner";
import PullToRefresh from "@/components/PullToRefresh";
import EmptyState from "@/components/EmptyState";
import { fmt, fmtPct, trendOf, arrowOf, chipColor } from "@/lib/format";
import { getMarketSessionLabel } from "@/lib/marketSession";
import { hasAnyAlert } from "@/lib/alertBadge";
import { formatQuoteAsOf, quoteWarnings, quoteRefreshFeedback } from "@/lib/quoteStatus";
import { useToast } from "@/components/Toast";
import useDialogFocus from "@/hooks/useDialogFocus";
import { usePollGuard } from "@/hooks/usePollGuard";
import {
  IconArrowLeft,
  IconChevronDown,
  IconX,
  IconChartBar,
} from "@/components/icons";

interface AlertRow {
  stock_id: string;
  name: string;
  market: "tse" | "otc";
  alert_high: number | null;
  alert_low: number | null;
  alert_change_pct: number | null;
  alert_volume_on: boolean;
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

// 單列提醒（2026-07-19 重設計）：捨棄大字報價卡片牆——報價是首頁的事，本頁重點是「管理提醒」。
// 每列＝一行身分（代號＋股名＋現價＋漲跌幅）＋一行門檻標籤，視覺語彙對齊首頁表格列。
// 點整列從畫面底部彈出設定面板（BottomSheet + PriceAlertCard），毋須進個股頁。
function AlertListRow({
  row,
  quote,
  isEditing,
  onToggle,
}: {
  row: AlertRow;
  quote: Quote | undefined;
  isEditing: boolean;
  onToggle: () => void;
}) {
  const price = quote?.price ?? null;
  const t = trendOf(quote?.change ?? null);
  const hasAlert =
    row.alert_high != null ||
    row.alert_low != null ||
    row.alert_change_pct != null ||
    row.alert_volume_on;
  const highHit =
    price != null && row.alert_high != null && price >= row.alert_high;
  const lowHit =
    price != null && row.alert_low != null && price <= row.alert_low;
  const quoteAt = formatQuoteAsOf(quote?.asOf);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-haspopup="dialog"
      aria-expanded={isEditing}
      aria-label={`${row.name} 到價提醒設定`}
      className={`group relative block w-full px-4 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
        isEditing ? "bg-surface-2" : ""
      }`}
    >
      {/* 左緣 3px 漲跌色條，對齊首頁 QuoteBoard 語彙 */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 w-[3px] ${
          t === "up" ? "bg-up" : t === "down" ? "bg-down" : "bg-transparent"
        }`}
      />
      {/* 第一行：代號＋股名＋市場別｜現價＋漲跌幅＋展開箭頭 */}
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 rounded border border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-muted">
          {row.stock_id}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink">{row.name}</span>
          <span className="mt-0.5 block font-mono text-[10px] text-faint">
            {row.market === "tse" ? "上市" : "上櫃"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-sm font-bold tabular text-ink">{fmt(price)}</span>
          {quote && (
            <span
              className={`rounded-pill px-2 py-0.5 font-mono text-xs font-bold tabular ${chipColor[t]}`}
            >
              {arrowOf(t)} {fmtPct(quote.changePct)}
            </span>
          )}
          <IconChevronDown
            className="h-4 w-4 shrink-0 text-faint transition-colors group-hover:text-muted"
            aria-hidden="true"
          />
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        {quote ? (quoteAt ? `行情 ${quoteAt}（台北）` : "行情日期時間未知") : "暫時未取得報價"}
      </p>

      {/* 第二行：門檻標籤（已觸及＝實色、監控中＝淡底；漲跌幅／爆量走中性色，不與紅漲綠跌混淆） */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {hasAlert ? (
          <>
            {row.alert_high != null && (
              <span
                className={`rounded-pill px-2 py-0.5 font-mono text-[11px] font-semibold tabular ${
                  highHit ? "bg-up text-white" : "bg-up-tint text-up"
                }`}
              >
                漲到 {fmt(row.alert_high)}
                {highHit
                  ? "・已觸及"
                  : price != null
                    ? `・差 ${fmtPct((row.alert_high - price) / price)}`
                    : ""}
              </span>
            )}
            {row.alert_low != null && (
              <span
                className={`rounded-pill px-2 py-0.5 font-mono text-[11px] font-semibold tabular ${
                  lowHit ? "bg-down text-white" : "bg-down-tint text-down"
                }`}
              >
                跌到 {fmt(row.alert_low)}
                {lowHit
                  ? "・已觸及"
                  : price != null
                    ? `・差 ${fmtPct((price - row.alert_low) / price)}`
                    : ""}
              </span>
            )}
            {row.alert_change_pct != null && (
              <span className="rounded-pill bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-semibold tabular text-ink ring-1 ring-line">
                漲跌幅 ±{row.alert_change_pct}%
              </span>
            )}
            {row.alert_volume_on && (
              <span className="flex items-center gap-1 rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink ring-1 ring-line">
                <IconChartBar className="h-3 w-3" aria-hidden="true" /> 爆量
              </span>
            )}
          </>
        ) : (
          <span className="inline-flex items-center rounded-pill border border-dashed border-line-strong px-2.5 py-0.5 text-[11px] font-medium text-muted transition-colors group-hover:border-primary group-hover:text-primary">
            ＋ 設定提醒
          </span>
        )}
      </div>
    </button>
  );
}

// 底部彈出面板：手機／桌面共用同一種樣式（從畫面底部滑上、背景暗化遮罩），
// 取代原本「就地展開」——避免同一列其他卡片被撐開高度、留下大片空白。
function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, sheetRef);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label={title}
        className="sheet-pop relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-surface shadow-lift ring-1 ring-line sm:max-w-md sm:rounded-card"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
          <span className="font-serif text-base font-bold text-ink">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.95]"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 pb-6 pt-3">{children}</div>
      </div>
    </div>
  );
}

// 到價提醒總覽：列出所有自選股（已設提醒者排前面），點任一卡即可就地設定門檻，毋須進個股頁。
export default function AlertsPage() {
  const router = useRouter();
  const watchlist = useSWR<{ items: AlertRow[] }>("/api/watchlist", fetcher, {
    revalidateOnFocus: true,
  });
  const { autoPaused, onQuoteSuccess, refreshInterval, resumePolling } = usePollGuard();
  const toast = useToast();
  const [now, setNow] = useState<Date | null>(null);

  // 頂部時段文字每 30 秒更新一次即可，不需隨報價輪詢頻率跳動
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const quote = useSWR<QuoteResponse>("/api/quote", fetcher, {
    refreshInterval,
    refreshWhenHidden: false,
    onSuccess: onQuoteSuccess,
  });

  const [editing, setEditing] = useState<string | null>(null);
  const warnings = quote.data ? quoteWarnings(quote.data) : [];

  const priceOf = new Map(
    (quote.data?.quotes ?? []).map((q) => [q.stockId, q])
  );
  // 已設提醒者排前面（四種提醒任一有設定即算），其餘維持自選清單原順序
  const items = [...(watchlist.data?.items ?? [])].sort(
    (a, b) => (hasAnyAlert(a) ? 0 : 1) - (hasAnyAlert(b) ? 0 : 1)
  );

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  const refreshAll = useCallback(async () => {
    resumePolling();
    try {
      const previous = quote.data;
      const [, latest] = await Promise.all([
        watchlist.mutate(fetcher<{ items: AlertRow[] }>("/api/watchlist"), {
          revalidate: false, throwOnError: true,
        }),
        quote.mutate(fetcher<QuoteResponse>("/api/quote"), {
          revalidate: false, throwOnError: true,
        }),
      ]);
      const feedback = quoteRefreshFeedback(latest, previous);
      toast.show(feedback.message, { tone: feedback.tone });
    } catch {
      toast.show("更新失敗，請檢查網路後再試一次", { tone: "error" });
    }
  }, [watchlist, quote, resumePolling, toast]);

  const editingRow = items.find((a) => a.stock_id === editing) ?? null;
  // 分兩區呈現：已設提醒（管理重點）在前，尚未設定在後
  const alerted = items.filter((a) => hasAnyAlert(a));
  const unset = items.filter((a) => !hasAnyAlert(a));

  return (
    <div className="min-h-screen">
      <PullToRefresh onRefresh={refreshAll} />
      {/* masthead（sticky）：比照首頁 TopBar 風格，左＝返回＋站名，右＝盤別膠囊＋自選連結 */}
      <header className="sticky top-0 z-40 border-b border-line bg-app/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-3 px-4 py-3 sm:px-[18px]">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={goBack}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-card transition-colors hover:text-ink active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="上一頁"
              title="上一頁"
            >
              <IconArrowLeft className="h-3.5 w-3.5" />
            </button>
            <span className="truncate font-serif text-lg font-bold tracking-tight text-ink">
              到價提醒
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center rounded-pill border border-line bg-surface px-3.5 py-1.5 shadow-card sm:flex">
              <span className="whitespace-nowrap font-mono text-xs font-semibold tabular text-ink">
                {now ? getMarketSessionLabel(now) : "載入中"}
              </span>
            </div>
            <Link
              href="/"
              aria-label="返回自選股列表"
              className="flex min-h-11 items-center whitespace-nowrap rounded-pill border border-line bg-surface px-3 text-xs font-medium text-muted shadow-card transition-colors hover:border-primary hover:text-primary active:scale-[0.97]"
            >
              自選
            </Link>
          </div>
        </div>
      </header>

      {/* 主欄：窄螢幕單欄 820；寬螢幕（≥1000px）且兩區都有內容時放寬為 1180 走左右欄
          （已設提醒｜尚未設定），只有一區時維持 820 單欄，避免孤欄被拉太寬 */}
      <main
        className={`mx-auto space-y-5 px-4 py-5 sm:px-[18px] ${
          alerted.length > 0 && unset.length > 0
            ? "max-w-[820px] min-[1000px]:max-w-[1180px]"
            : "max-w-[820px]"
        }`}
      >
        <MobileNetworkBanner
          stale={quote.data?.source === "stale" || autoPaused}
          error={quote.error || watchlist.error}
          asOf={quote.data?.asOf}
        />

        {warnings.length > 0 && (
          <div className="space-y-1 rounded-card bg-warn-tint px-3 py-2 text-xs leading-relaxed text-warn">
            {warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        )}

        {autoPaused && (
          <p className="rounded-card bg-warn-tint px-3 py-2 text-xs text-warn">
            報價久未更新，已暫停輪詢（切回分頁或下拉更新即可恢復）
          </p>
        )}

        {(quote.error || watchlist.error) && (
          <p className="hidden rounded-card bg-warn-tint px-3 py-2 text-xs text-warn md:block">
            資料更新失敗，稍後會自動重試。
          </p>
        )}

        {!watchlist.data && watchlist.error ? (
          <p className="rounded-card border border-line bg-surface p-4 text-sm text-warn shadow-card">
            暫時無法取得提醒清單，請稍後再試。
          </p>
        ) : !watchlist.data ? (
          <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[72px] animate-pulse bg-surface" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            emoji="🔔"
            description="還沒有自選股。先到「自選」分頁加入個股，再回來設定到價提醒。"
          />
        ) : (
          <div
            className={`space-y-5 ${
              alerted.length > 0 && unset.length > 0
                ? "min-[1000px]:grid min-[1000px]:grid-cols-2 min-[1000px]:items-start min-[1000px]:gap-5 min-[1000px]:space-y-0"
                : ""
            }`}
          >
            {alerted.length > 0 && (
              <section className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot"
                  />
                  <h2 className="font-mono text-[10px] tracking-[2px] text-muted">
                    已設提醒
                  </h2>
                  <b className="font-mono text-xs font-bold tabular text-ink">
                    {alerted.length}
                  </b>
                  <span className="h-px flex-1 bg-line" aria-hidden="true" />
                </div>
                <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
                  {alerted.map((a) => (
                    <AlertListRow
                      key={a.stock_id}
                      row={a}
                      quote={priceOf.get(a.stock_id)}
                      isEditing={editing === a.stock_id}
                      onToggle={() =>
                        setEditing((cur) => (cur === a.stock_id ? null : a.stock_id))
                      }
                    />
                  ))}
                </div>
              </section>
            )}
            {unset.length > 0 && (
              <section className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <h2 className="font-mono text-[10px] tracking-[2px] text-muted">
                    尚未設定
                  </h2>
                  <b className="font-mono text-xs font-bold tabular text-muted">
                    {unset.length}
                  </b>
                  <span className="h-px flex-1 bg-line" aria-hidden="true" />
                </div>
                <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
                  {unset.map((a) => (
                    <AlertListRow
                      key={a.stock_id}
                      row={a}
                      quote={priceOf.get(a.stock_id)}
                      isEditing={editing === a.stock_id}
                      onToggle={() =>
                        setEditing((cur) => (cur === a.stock_id ? null : a.stock_id))
                      }
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <BottomSheet
        open={!!editingRow}
        title={editingRow ? `${editingRow.name} 到價提醒` : "到價提醒"}
        onClose={() => setEditing(null)}
      >
        {editingRow && (
          <>
            <PriceAlertCard
              stockId={editingRow.stock_id}
              name={editingRow.name}
              currentPrice={priceOf.get(editingRow.stock_id)?.price ?? null}
              trend={trendOf(priceOf.get(editingRow.stock_id)?.change ?? null)}
            />
            <a
              href={`/stock/${editingRow.stock_id}`}
              className="mt-3 inline-block text-xs text-primary hover:underline"
            >
              查看走勢與基本面 →
            </a>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
