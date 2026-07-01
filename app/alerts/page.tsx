"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { QuoteResponse } from "@/lib/types";
import PriceAlertCard from "@/components/PriceAlertCard";
import MobileNetworkBanner from "@/components/MobileNetworkBanner";
import PullToRefresh from "@/components/PullToRefresh";
import { fmt, fmtPct, trendOf, arrowOf, textColor, chipColor } from "@/lib/format";
import { POLL_MS, STALE_STOP_THRESHOLD } from "@/lib/pollConfig";

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

// 到價提醒總覽：列出所有自選股（已設提醒者排前面），點任一列即可就地設定門檻，毋須進個股頁。
export default function AlertsPage() {
  const router = useRouter();
  const watchlist = useSWR<{ items: AlertRow[] }>("/api/watchlist", fetcher, {
    revalidateOnFocus: true,
  });
  const [autoPaused, setAutoPaused] = useState(false);
  const staleCount = useRef(0);
  const lastTimeKey = useRef("");
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

  return (
    <div className="min-h-screen">
      <PullToRefresh onRefresh={refreshAll} />
      <header className="sticky top-0 z-10 border-b border-line/70 bg-app/95 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface text-muted ring-1 ring-line transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="上一頁"
              title="上一頁"
            >
              ←
            </button>
            <span className="truncate font-semibold">到價提醒</span>
          </div>
          <Link
            href="/"
            className="rounded-pill bg-surface px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-line transition-colors hover:text-ink"
          >
            自選
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-3 px-4 py-5 sm:px-6">
        <MobileNetworkBanner
          stale={quote.data?.source === "stale" || autoPaused}
          error={quote.error || watchlist.error}
        />

        {!watchlist.data ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-card bg-surface shadow-card"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-card border border-dashed border-line bg-surface/60 p-10 text-center">
            <div className="text-2xl">🔔</div>
            <p className="mt-2 text-sm text-muted">
              還沒有自選股。先到「自選」分頁加入個股，再回來設定到價提醒。
            </p>
          </div>
        ) : (
          items.map((a) => {
            const q = priceOf.get(a.stock_id);
            const price = q?.price ?? null;
            const t = trendOf(q?.change ?? null);
            const hasAlert = a.alert_high != null || a.alert_low != null;
            const highHit =
              price != null && a.alert_high != null && price >= a.alert_high;
            const lowHit =
              price != null && a.alert_low != null && price <= a.alert_low;
            const isEditing = editing === a.stock_id;
            return (
              <div
                key={a.stock_id}
                className="rounded-card bg-surface shadow-card ring-1 ring-line"
              >
                {/* 整列為按鈕：點擊就地展開/收合設定面板（手機大觸控目標） */}
                <button
                  onClick={() =>
                    setEditing((cur) => (cur === a.stock_id ? null : a.stock_id))
                  }
                  aria-expanded={isEditing}
                  className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold leading-tight">
                      {a.name}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {a.stock_id}
                      <span className="mx-1 text-line">·</span>
                      {a.market === "tse" ? "上市" : "上櫃"}
                    </div>
                    {/* 已設門檻：顯示目標價與離觸發距離；未設：提示可點擊設定 */}
                    {hasAlert ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {a.alert_high != null && (
                          <span
                            className={`rounded-pill px-2.5 py-1 font-medium tabular ${
                              highHit ? "bg-up text-white" : "bg-up-tint text-up"
                            }`}
                          >
                            ▲ 目標 {fmt(a.alert_high)}
                            <span className="ml-1 font-normal">
                              {highHit
                                ? "・已觸及"
                                : price != null
                                  ? `・差 ${fmtPct((a.alert_high - price) / price)}`
                                  : ""}
                            </span>
                          </span>
                        )}
                        {a.alert_low != null && (
                          <span
                            className={`rounded-pill px-2.5 py-1 font-medium tabular ${
                              lowHit ? "bg-down text-white" : "bg-down-tint text-down"
                            }`}
                          >
                            ▼ 目標 {fmt(a.alert_low)}
                            <span className="ml-1 font-normal">
                              {lowHit
                                ? "・已觸及"
                                : price != null
                                  ? `・差 ${fmtPct((price - a.alert_low) / price)}`
                                  : ""}
                            </span>
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-muted">
                        尚未設定，點此設定提醒
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`text-lg font-bold tabular ${textColor[t]}`}>
                      {fmt(price)}
                    </span>
                    {q && (
                      <span
                        className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold tabular ${chipColor[t]}`}
                      >
                        {arrowOf(t)} {fmtPct(q.changePct)}
                      </span>
                    )}
                    <span
                      className={`mt-1 text-muted transition-transform ${
                        isEditing ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    >
                      ⌄
                    </span>
                  </div>
                </button>

                {isEditing && (
                  <div className="border-t border-line px-4 pb-4 pt-3">
                    <PriceAlertCard stockId={a.stock_id} name={a.name} />
                    <Link
                      href={`/stock/${a.stock_id}`}
                      className="mt-3 inline-block text-xs text-primary hover:underline"
                    >
                      查看走勢與基本面 →
                    </Link>
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
