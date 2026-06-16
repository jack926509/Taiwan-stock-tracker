"use client";

import Link from "next/link";
import useSWR from "swr";
import type { QuoteResponse } from "@/lib/types";
import { fmt, fmtPct, trendOf, arrowOf, textColor, chipColor } from "@/lib/format";

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

// 到價提醒總覽：一次看完所有已設門檻的個股，以及目前離觸發還差多少
export default function AlertsPage() {
  const watchlist = useSWR<{ items: AlertRow[] }>("/api/watchlist", fetcher, {
    revalidateOnFocus: true,
  });
  const quote = useSWR<QuoteResponse>("/api/quote", fetcher, {
    refreshInterval: (latest) => (latest && !latest.marketOpen ? 0 : 10_000),
  });

  const priceOf = new Map(
    (quote.data?.quotes ?? []).map((q) => [q.stockId, q])
  );
  const alerts = (watchlist.data?.items ?? []).filter(
    (i) => i.alert_high != null || i.alert_low != null
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line/70 bg-app/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted ring-1 ring-line transition-colors hover:text-ink md:hidden"
            aria-label="返回自選"
          >
            ←
          </Link>
          <span className="font-semibold">到價提醒</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-3 px-4 py-5 sm:px-6">
        {watchlist.data && alerts.length === 0 ? (
          <div className="rounded-card border border-dashed border-line bg-surface/60 p-10 text-center">
            <div className="text-2xl">🔔</div>
            <p className="mt-2 text-sm text-muted">
              尚未設定到價提醒。點進任一個股，按右上角鈴鐺即可設定。
            </p>
          </div>
        ) : !watchlist.data ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-card bg-surface shadow-card"
              />
            ))}
          </div>
        ) : (
          alerts.map((a) => {
            const q = priceOf.get(a.stock_id);
            const price = q?.price ?? null;
            const t = trendOf(q?.change ?? null);
            const highHit = price != null && a.alert_high != null && price >= a.alert_high;
            const lowHit = price != null && a.alert_low != null && price <= a.alert_low;
            return (
              <Link
                key={a.stock_id}
                href={`/stock/${a.stock_id}`}
                className="block rounded-card bg-surface p-4 shadow-card ring-1 ring-line transition-all hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold leading-tight">
                      {a.name}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {a.stock_id}
                      <span className="mx-1 text-line">·</span>
                      {a.market === "tse" ? "上市" : "上櫃"}
                    </div>
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
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
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
              </Link>
            );
          })
        )}
      </main>
    </div>
  );
}
