"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import type { QuoteResponse } from "@/lib/types";
import type { Candle } from "@/lib/providers/klineProvider";
import type { Fundamental } from "@/lib/providers/fundamentalProvider";
import KlineChart, { MA_COLORS } from "@/components/KlineChart";
import FundamentalSection from "@/components/FundamentalSection";
import {
  fmt,
  fmtVol,
  fmtPct,
  trendOf,
  arrowOf,
  textColor,
  chipColor,
} from "@/lib/format";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

const RANGES = [
  { key: "3m", label: "3 月", months: 3 },
  { key: "6m", label: "6 月", months: 6 },
  { key: "1y", label: "1 年", months: 12 },
] as const;

function cutoffDate(last: string, months: number): string {
  const d = new Date(`${last}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export default function StockPage() {
  const params = useParams<{ id: string }>();
  const id = (params.id ?? "").toUpperCase();
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("6m");

  const quote = useSWR<QuoteResponse>(
    id ? `/api/quote?ids=${encodeURIComponent(id)}` : null,
    fetcher,
    {
      refreshInterval: (latest) => (latest && !latest.marketOpen ? 0 : 10_000),
    }
  );
  const kline = useSWR<{ stockId: string; candles: Candle[] }>(
    id ? `/api/kline?id=${encodeURIComponent(id)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const fundamental = useSWR<Fundamental & { stockId: string; asOf: string }>(
    id ? `/api/fundamental?id=${encodeURIComponent(id)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const q = quote.data?.quotes[0];
  const t = trendOf(q?.change ?? null);

  const visible = useMemo(() => {
    const all = kline.data?.candles ?? [];
    if (all.length === 0) return all;
    const months = RANGES.find((r) => r.key === range)?.months ?? 6;
    const cutoff = cutoffDate(all[all.length - 1].date, months);
    return all.filter((c) => c.date >= cutoff);
  }, [kline.data, range]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line/70 bg-app/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface text-muted ring-1 ring-line transition-colors hover:text-ink"
              aria-label="返回首頁"
            >
              ←
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">
                  {q?.name ?? id}
                </span>
                <span className="rounded-pill bg-surface px-2 py-0.5 text-[11px] text-muted ring-1 ring-line">
                  {id}
                  {q && `・${q.market === "tse" ? "上市" : "上櫃"}`}
                </span>
              </div>
            </div>
          </div>
          {quote.data && (
            <span
              className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-medium ${
                quote.data.marketOpen ? "bg-up-tint text-up" : "bg-app text-muted"
              }`}
            >
              {quote.data.marketOpen ? (
                <>
                  <span className="pulse-dot">●</span> 盤中
                </>
              ) : (
                "○ 已收盤"
              )}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
        {/* 即時報價列 */}
        {q ? (
          <div className="rise-in flex flex-wrap items-end justify-between gap-4 rounded-card bg-surface p-5 shadow-card ring-1 ring-line">
            <div>
              <div className="flex items-baseline gap-3">
                <span className={`text-4xl font-bold tracking-tight tabular ${textColor[t]}`}>
                  {fmt(q.price)}
                </span>
                <span className={`text-sm font-semibold tabular ${textColor[t]}`}>
                  {q.change === null
                    ? ""
                    : `${q.change > 0 ? "+" : ""}${fmt(q.change)}`}
                </span>
                <span
                  className={`rounded-pill px-2 py-1 text-xs font-semibold tabular ${chipColor[t]}`}
                >
                  {arrowOf(t)} {fmtPct(q.changePct)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted tabular">
              <span className="whitespace-nowrap">開 {fmt(q.open)}</span>
              <span className="whitespace-nowrap">高 {fmt(q.high)}</span>
              <span className="whitespace-nowrap">低 {fmt(q.low)}</span>
              <span className="whitespace-nowrap">昨收 {fmt(q.prevClose)}</span>
              <span className="whitespace-nowrap">量 {fmtVol(q.volume)}</span>
            </div>
          </div>
        ) : (
          <div className="h-24 animate-pulse rounded-card bg-surface shadow-card" />
        )}

        {/* K 線圖 */}
        <div
          className="rise-in rounded-card bg-surface p-5 shadow-card ring-1 ring-line"
          style={{ animationDelay: "80ms" }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[11px] text-muted">
              <span className="text-sm font-semibold text-ink">日 K</span>
              <span className="flex items-center gap-1">
                <i className="h-0.5 w-3 rounded" style={{ background: MA_COLORS.ma5 }} />
                MA5
              </span>
              <span className="flex items-center gap-1">
                <i className="h-0.5 w-3 rounded" style={{ background: MA_COLORS.ma20 }} />
                MA20
              </span>
              <span className="flex items-center gap-1">
                <i className="h-0.5 w-3 rounded" style={{ background: MA_COLORS.ma60 }} />
                MA60
              </span>
            </div>
            <div className="flex rounded-pill bg-app p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${
                    range === r.key
                      ? "bg-surface text-ink shadow-card"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {kline.error ? (
            <div className="grid h-[420px] place-items-center text-sm text-warn">
              {kline.error.message}
            </div>
          ) : visible.length > 0 ? (
            <KlineChart candles={visible} />
          ) : (
            <div className="h-[420px] animate-pulse rounded-lg bg-app" />
          )}
        </div>

        {/* 基本面：估值＋法人買賣超＋月營收＋EPS（ETF 等無資料的區塊自動隱藏） */}
        {fundamental.data && (
          <FundamentalSection fund={fundamental.data} price={q?.price ?? null} />
        )}

        <footer className="pb-4 pt-1 text-center text-[11px] text-muted">
          日 K 與基本面資料來源：FinMind（未還原價）・即時報價：MIS・僅供個人參考，非投資建議
        </footer>
      </main>
    </div>
  );
}
