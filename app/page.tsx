"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import useSWR from "swr";
import type { QuoteResponse, WatchlistItem } from "@/lib/types";
import IndexCards from "@/components/IndexCard";
import QuoteCard from "@/components/QuoteCard";
import AddStockForm from "@/components/AddStockForm";
import { fmtAgo } from "@/lib/format";

const SORTS = [
  { key: "default", label: "預設" },
  { key: "gain", label: "漲幅" },
  { key: "loss", label: "跌幅" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

const POLL_MS = 10_000; // MIS 限流硬規則：預設 10 秒、不可低於 5 秒
const STALE_STOP_THRESHOLD = 6; // 連續 6 次（約 1 分鐘）報價時間未變 → 自動停輪詢

export default function Dashboard() {
  const [autoPaused, setAutoPaused] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [now, setNow] = useState(() => Date.now());
  const staleCount = useRef(0);
  const lastTimeKey = useRef("");

  const watchlist = useSWR<{ items: WatchlistItem[]; storage: string }>(
    "/api/watchlist",
    fetcher,
    { revalidateOnFocus: false }
  );

  const quote = useSWR<QuoteResponse>("/api/quote", fetcher, {
    refreshInterval: (latest) =>
      autoPaused || (latest && !latest.marketOpen) ? 0 : POLL_MS,
    revalidateOnFocus: true,
    onSuccess: (data) => {
      // 颱風/臨時停盤保險：盤中卻連續抓不到新報價時間，視為異常停輪詢
      const key = [...data.indices, ...data.quotes].map((q) => q.time).join("|");
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

  // 每秒更新「更新於 X 秒前」相對時間
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refreshAll = useCallback(() => {
    watchlist.mutate();
    quote.mutate();
  }, [watchlist, quote]);

  async function handleDelete(stockId: string) {
    await fetch(`/api/watchlist?id=${encodeURIComponent(stockId)}`, {
      method: "DELETE",
    });
    refreshAll();
  }

  const data = quote.data;
  const storage = watchlist.data?.storage;

  // UI-2：批次取各自選股近 20 日收盤，做卡片迷你走勢圖（key 以排序後 id 串，重排不重抓）
  const sparkIds = useMemo(
    () =>
      (data?.quotes ?? [])
        .map((q) => q.stockId)
        .sort()
        .join(","),
    [data?.quotes]
  );
  const sparks = useSWR<{ data: Record<string, number[]> }>(
    sparkIds ? `/api/sparklines?ids=${sparkIds}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // UI-1：依今日漲跌幅排序（null 一律排最後），預設維持自選順序
  const sortedQuotes = useMemo(() => {
    const list = data?.quotes ?? [];
    if (sortKey === "default") return list;
    const dir = sortKey === "gain" ? -1 : 1;
    return [...list].sort((a, b) => {
      if (a.changePct === null) return 1;
      if (b.changePct === null) return -1;
      return (a.changePct - b.changePct) * dir;
    });
  }, [data?.quotes, sortKey]);

  return (
    <div className="min-h-screen">
      {/* 頂部 App Bar（sticky，毛玻璃感） */}
      <header className="sticky top-0 z-10 border-b border-line/70 bg-app/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-[#7B96F4] text-sm font-bold text-white shadow-card">
              台
            </span>
            <span className="font-semibold">台股追蹤</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {data && (
              <span
                className={`rounded-pill px-2.5 py-1 font-medium ${
                  data.marketOpen ? "bg-up-tint text-up" : "bg-app text-muted"
                }`}
              >
                {data.marketOpen ? (
                  <>
                    <span className="pulse-dot">●</span> 盤中
                  </>
                ) : (
                  "○ 已收盤"
                )}
              </span>
            )}
            {data && (
              <span className="text-muted tabular">
                <span className="hidden sm:inline">
                  {new Date(data.asOf).toLocaleDateString("zh-TW", {
                    month: "numeric",
                    day: "numeric",
                    weekday: "short",
                    timeZone: "Asia/Taipei",
                  })}
                  <span className="mx-1.5 text-line">|</span>
                  {new Date(data.asOf).toLocaleTimeString("zh-TW", {
                    hour12: false,
                    timeZone: "Asia/Taipei",
                  })}
                  <span className="mx-1.5 text-line">·</span>
                </span>
                更新於 {fmtAgo(data.asOf, now)}
              </span>
            )}
            <button
              onClick={refreshAll}
              disabled={quote.isValidating}
              aria-label="立即更新"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface text-muted ring-1 ring-line transition-colors hover:text-ink disabled:opacity-50"
            >
              <span className={quote.isValidating ? "inline-block animate-spin" : ""}>
                ↻
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {/* 提示列 */}
        {(data?.source === "stale" || autoPaused || storage === "local") && (
          <div className="flex flex-wrap gap-2 text-xs">
            {data?.source === "stale" && (
              <span className="rounded-pill bg-warn-tint px-2.5 py-1 text-warn">
                資料來源暫時異常，顯示最近快照
              </span>
            )}
            {autoPaused && (
              <span className="rounded-pill bg-warn-tint px-2.5 py-1 text-warn">
                報價久未更新，已暫停輪詢（切回分頁自動恢復）
              </span>
            )}
            {storage === "local" && (
              <span className="rounded-pill bg-app px-2.5 py-1 text-muted">
                本地測試模式（自選股存於本機，未連 Supabase）
              </span>
            )}
          </div>
        )}

        {/* 大盤指數 hero */}
        {data ? (
          <IndexCards indices={data.indices} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-card bg-surface shadow-card" />
            ))}
          </div>
        )}

        {/* 自選股 */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">自選股</h2>
              <p className="text-xs text-muted">
                {data ? `${data.quotes.length} 檔・盤中每 10 秒更新` : "載入中…"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {data && data.quotes.length > 1 && (
                <div className="flex rounded-pill bg-app p-0.5 text-xs">
                  {SORTS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setSortKey(s.key)}
                      className={`rounded-pill px-2.5 py-1 font-medium transition-colors ${
                        sortKey === s.key
                          ? "bg-surface text-ink shadow-card"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
              <AddStockForm onAdded={refreshAll} />
            </div>
          </div>

          {data && data.quotes.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedQuotes.map((q, i) => (
                <div
                  key={q.stockId}
                  className="rise-in"
                  style={{ animationDelay: `${140 + Math.min(i, 8) * 50}ms` }}
                >
                  <QuoteCard
                    quote={q}
                    onDelete={handleDelete}
                    spark={sparks.data?.data[q.stockId]}
                  />
                </div>
              ))}
            </div>
          ) : data ? (
            <div className="rounded-card border border-dashed border-line bg-surface/60 p-10 text-center">
              <div className="text-2xl">📈</div>
              <p className="mt-2 text-sm text-muted">
                還沒有自選股，輸入代號加入第一檔吧（例如 2330 台積電）
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-card bg-surface shadow-card" />
              ))}
            </div>
          )}
        </section>

        {quote.error && !data && (
          <div className="rounded-card bg-surface p-4 text-sm text-warn shadow-card ring-1 ring-line">
            報價來源暫時無法使用，稍後會自動重試。
          </div>
        )}

        <footer className="pb-6 pt-2 text-center text-[11px] leading-relaxed text-muted">
          資料來源：台灣證券交易所・證券櫃檯買賣中心（MIS 即時行情）
          <br className="sm:hidden" />
          <span className="hidden sm:inline">・</span>
          報價約延遲 10 秒，僅供個人參考，非投資建議
        </footer>
      </main>
    </div>
  );
}
