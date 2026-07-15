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
import { fmt, fmtPct, trendOf, arrowOf, textColor, chipColor } from "@/lib/format";
import { getMarketSessionLabel } from "@/lib/marketSession";
import { hasAnyAlert } from "@/lib/alertBadge";
import useDialogFocus from "@/hooks/useDialogFocus";
import { usePollGuard } from "@/hooks/usePollGuard";
import {
  IconArrowLeft,
  IconChevronDown,
  IconX,
  IconChartBar,
  IconAlertTriangle,
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

interface HealthDetail {
  lineLastFailure?: { at: string; reason: string; minutesAgo: number } | null;
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

// LINE 推播異常橫幅：健康檢查回報「有失敗紀錄且距今不到 3 小時」就提醒——
// 簡化判斷（不做連續失敗次數計數），失敗後成功推播一次即會清掉紀錄，橫幅自然消失。
const LINE_FAILURE_STALE_MIN = 180;

function LineFailureBanner({ minutesAgo }: { minutesAgo: number }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-warn/20 bg-warn-tint px-4 py-3 text-sm font-medium text-warn">
      <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        LINE 推播可能異常（最近一次失敗約 {minutesAgo}{" "}
        分鐘前），提醒可能未送達，請檢查。
      </span>
    </div>
  );
}

// 單張提醒卡片：視覺沿用首頁 QuoteCard 語彙（kicker 代號、大字現價、襯線股名、紅漲綠跌），
// 點擊整卡從畫面底部彈出設定面板（BottomSheet + PriceAlertCard），毋須進個股頁、也不佔用卡片牆版位。
function AlertQuoteCard({
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

  return (
    <div
      className={`rounded-card bg-surface shadow-card transition-all duration-200 ${
        isEditing ? "ring-2 ring-primary" : "ring-1 ring-line"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={isEditing}
        aria-label={`${row.name} 到價提醒設定`}
        className="block w-full p-4 text-left active:scale-[0.99]"
      >
        {/* 第一行 kicker：漲跌方向 · 代號，等寬字＋靛藍點綴 */}
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-wider text-primary">
            {t === "up" ? "上漲" : t === "down" ? "下跌" : "持平"}
            <span className="mx-1 text-primary/40">·</span>
            {row.stock_id}
          </span>
          <span className="shrink-0 text-muted" aria-hidden="true">
            <IconChevronDown className="h-4 w-4" />
          </span>
        </div>

        {/* 第二行：大字現價 */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={`text-3xl font-bold tracking-tight tabular ${textColor[t]}`}>
            {fmt(price)}
          </span>
        </div>

        {/* 第三行：襯線股名、市場別；右側漲跌幅 */}
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-serif text-base font-medium leading-tight text-ink">
              {row.name}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">
              {row.market === "tse" ? "上市" : "上櫃"}
            </div>
          </div>
          {quote && (
            <span
              className={`shrink-0 rounded-pill px-2 py-1 text-right font-mono text-xs font-semibold tabular ${chipColor[t]}`}
            >
              {arrowOf(t)} {fmtPct(quote.changePct)}
            </span>
          )}
        </div>

        {/* 提醒門檻區塊：沿用原本判斷邏輯，僅換容器 */}
        <div className="mt-3 border-t border-dotted border-line pt-2.5">
          {hasAlert ? (
            <div className="flex flex-wrap gap-2 font-mono text-xs">
              {row.alert_high != null && (
                <span
                  className={`rounded-pill px-2.5 py-1 font-medium tabular ${
                    highHit ? "bg-up text-white" : "bg-up-tint text-up"
                  }`}
                >
                  ▲ 目標 {fmt(row.alert_high)}
                  <span className="ml-1 font-normal">
                    {highHit
                      ? "・已觸及"
                      : price != null
                        ? `・差 ${fmtPct((row.alert_high - price) / price)}`
                        : ""}
                  </span>
                </span>
              )}
              {row.alert_low != null && (
                <span
                  className={`rounded-pill px-2.5 py-1 font-medium tabular ${
                    lowHit ? "bg-down text-white" : "bg-down-tint text-down"
                  }`}
                >
                  ▼ 目標 {fmt(row.alert_low)}
                  <span className="ml-1 font-normal">
                    {lowHit
                      ? "・已觸及"
                      : price != null
                        ? `・差 ${fmtPct((price - row.alert_low) / price)}`
                        : ""}
                  </span>
                </span>
              )}
              {row.alert_change_pct != null && (
                <span className="rounded-pill bg-line/60 px-2.5 py-1 font-medium tabular text-ink">
                  ±{row.alert_change_pct}%
                </span>
              )}
              {row.alert_volume_on && (
                <span className="flex items-center gap-1 rounded-pill bg-line/60 px-2.5 py-1 font-medium tabular text-ink">
                  <IconChartBar className="h-3 w-3" /> 爆量
                </span>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted">尚未設定提醒，點此設定</div>
          )}
        </div>
      </button>
    </div>
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
  // 每 5 分鐘查一次健康檢查，顯示 LINE 推播異常橫幅；未登入（401）時靜默失敗，不影響頁面其餘功能
  const health = useSWR<HealthDetail>("/api/health?detail=1", fetcher, {
    refreshInterval: 5 * 60_000,
    shouldRetryOnError: false,
  });
  const lineFailure = health.data?.lineLastFailure;
  const showLineFailureBanner =
    !!lineFailure && lineFailure.minutesAgo < LINE_FAILURE_STALE_MIN;
  const { autoPaused, onQuoteSuccess, refreshInterval } = usePollGuard();
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
    await Promise.all([watchlist.mutate(), quote.mutate()]);
  }, [watchlist, quote]);

  const editingRow = items.find((a) => a.stock_id === editing) ?? null;

  return (
    <div className="min-h-screen">
      <PullToRefresh onRefresh={refreshAll} />
      {/* masthead（sticky）：比照首頁風格，左＝返回＋站名，右＝盤別＋自選連結 */}
      <header className="sticky top-0 z-10 bg-app/95 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 border-b-2 border-ink px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={goBack}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface text-muted ring-1 ring-line transition-colors hover:text-ink active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
            <div className="hidden text-right font-mono text-xs leading-tight text-muted tabular sm:block">
              {now ? getMarketSessionLabel(now) : "載入中"}
            </div>
            <Link
              href="/"
              aria-label="返回自選股列表"
              className="rounded-pill bg-surface px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-line transition-colors hover:text-ink active:scale-[0.97]"
            >
              自選
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-3 px-4 py-5 sm:px-6">
        <MobileNetworkBanner
          stale={quote.data?.source === "stale" || autoPaused}
          error={quote.error || watchlist.error}
        />

        {showLineFailureBanner && lineFailure && (
          <LineFailureBanner minutesAgo={lineFailure.minutesAgo} />
        )}

        {!watchlist.data ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-card bg-surface shadow-card"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            emoji="🔔"
            description="還沒有自選股。先到「自選」分頁加入個股，再回來設定到價提醒。"
          />
        ) : (
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a) => (
              <AlertQuoteCard
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
