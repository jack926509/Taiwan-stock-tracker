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
import { POLL_MS, STALE_STOP_THRESHOLD } from "@/lib/pollConfig";
import { getMarketSessionLabel } from "@/lib/marketSession";

interface AlertRow {
  stock_id: string;
  name: string;
  market: "tse" | "otc";
  alert_high: number | null;
  alert_low: number | null;
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
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
  const hasAlert = row.alert_high != null || row.alert_low != null;
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
            ⌄
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
        role="dialog"
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
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:text-ink active:scale-[0.95]"
          >
            ✕
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
  const [autoPaused, setAutoPaused] = useState(false);
  const staleCount = useRef(0);
  const lastTimeKey = useRef("");
  const [now, setNow] = useState(() => new Date());

  // 頂部時段文字每 30 秒更新一次即可，不需隨報價輪詢頻率跳動
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const quote = useSWR<QuoteResponse>("/api/quote", fetcher, {
    refreshInterval: (latest) =>
      autoPaused || (latest && !latest.marketOpen) ? 0 : POLL_MS,
    refreshWhenHidden: false,
    onSuccess: (data) => {
      // 颱風/臨時停盤保險：盤中卻連續抓不到新報價時間，視為異常停輪詢
      const key = data.quotes.map((q) => q.time).join("|");
      if (data.marketOpen && key && key === lastTimeKey.current) {
        staleCount.current += 1;
        if (staleCount.current >= STALE_STOP_THRESHOLD) setAutoPaused(true);
      } else {
        staleCount.current = 0;
      }
      lastTimeKey.current = key;
    },
  });

  // 使用者切回分頁時解除自動暫停、重新輪詢
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === "visible") {
        staleCount.current = 0;
        setAutoPaused(false);
      }
    };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, []);

  const [editing, setEditing] = useState<string | null>(null);

  const priceOf = new Map(
    (quote.data?.quotes ?? []).map((q) => [q.stockId, q])
  );
  // 已設提醒者排前面，其餘維持自選清單原順序
  const items = [...(watchlist.data?.items ?? [])].sort((a, b) => {
    const sa = a.alert_high != null || a.alert_low != null ? 0 : 1;
    const sb = b.alert_high != null || b.alert_low != null ? 0 : 1;
    return sa - sb;
  });

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
              ←
            </button>
            <span className="truncate font-serif text-lg font-bold tracking-tight text-ink">
              到價提醒
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-right font-mono text-xs leading-tight text-muted tabular sm:block">
              {getMarketSessionLabel(now)}
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
            <Link
              href={`/stock/${editingRow.stock_id}`}
              className="mt-3 inline-block text-xs text-primary hover:underline"
            >
              查看走勢與基本面 →
            </Link>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
