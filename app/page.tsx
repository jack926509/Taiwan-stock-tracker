"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import type { QuoteResponse, WatchlistItem } from "@/lib/types";
import type { Signal } from "@/lib/signals";
import IndexCards from "@/components/IndexCard";
import Link from "next/link";
import QuoteCard from "@/components/QuoteCard";
import SwipeToDelete from "@/components/SwipeToDelete";
import AddStockForm from "@/components/AddStockForm";
import StockSearch from "@/components/StockSearch";
import RelativeTime from "@/components/RelativeTime";
import MobileNetworkBanner from "@/components/MobileNetworkBanner";
import PullToRefresh from "@/components/PullToRefresh";
import EmptyState from "@/components/EmptyState";
import { POLL_MS, STALE_STOP_THRESHOLD } from "@/lib/pollConfig";
import { getMarketSessionDetail } from "@/lib/marketSession";

// @dnd-kit 屬重量套件，動態載入避免拖慢首頁首次 JS；載入完成前退回不可拖曳的靜態格線
const DraggableGrid = dynamic(() => import("@/components/DraggableGrid"), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-card bg-surface shadow-card" />
      ))}
    </div>
  ),
});

const SORTS = [
  { key: "default", label: "預設" },
  { key: "gain", label: "漲幅" },
  { key: "loss", label: "跌幅" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "alert", label: "已設提醒" },
  { key: "up", label: "僅看漲" },
  { key: "down", label: "僅看跌" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

// masthead 日期時間：「2026 / 07 / 04　09:31 TPE」（台北時間，非依賴瀏覽器時區）
function formatMastheadDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")} / ${get("month")} / ${get("day")}　${get("hour")}:${get("minute")} TPE`;
}

// 手機窄版 masthead 用的精簡日期「07/04 09:31」
function formatMastheadDateShort(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export default function Dashboard() {
  const [autoPaused, setAutoPaused] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [order, setOrder] = useState<string[]>([]); // 預設模式的自訂排序（拖曳）
  const [filterKey, setFilterKey] = useState<FilterKey>("all");
  const staleCount = useRef(0);
  const lastTimeKey = useRef("");
  const [now, setNow] = useState<Date | null>(null);

  // masthead 的日期／盤別文字每 30 秒更新一次即可，不需隨報價輪詢頻率跳動
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const watchlist = useSWR<{ items: WatchlistItem[]; storage: string }>(
    "/api/watchlist",
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: true }
  );

  const quote = useSWR<QuoteResponse>("/api/quote", fetcher, {
    refreshInterval: (latest) =>
      autoPaused || (latest && !latest.marketOpen) ? 0 : POLL_MS,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshWhenHidden: false,
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

  // 自訂排序以自選清單（後端已依 sort_order 排好）為基準，
  // 同時保留本次拖曳結果、自動納入新增/移除的代號
  const items = watchlist.data?.items;
  useEffect(() => {
    const ids = (items ?? []).map((i) => i.stock_id);
    setOrder((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      const same =
        next.length === prev.length && next.every((id, i) => id === prev[i]);
      return same ? prev : next;
    });
  }, [items]);

  const refreshAll = useCallback(async () => {
    await Promise.all([watchlist.mutate(), quote.mutate()]);
  }, [watchlist, quote]);

  async function handleDelete(stockId: string) {
    await fetch(`/api/watchlist?id=${encodeURIComponent(stockId)}`, {
      method: "DELETE",
    });
    refreshAll();
  }

  // 拖曳結束：先在畫面即時排好（樂觀更新），再寫回後端
  const persistOrder = useCallback(
    async (next: string[]) => {
      try {
        await fetch("/api/watchlist", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: next }),
        });
      } catch {
        /* 失敗時下次輪詢會以後端順序校正 */
      }
      watchlist.mutate();
    },
    [watchlist]
  );

  function handleReorder(next: string[]) {
    setOrder(next);
    void persistOrder(next);
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
  const sparks = useSWR<{
    data: Record<string, { spark: number[]; signals: Signal[] }>;
  }>(sparkIds ? `/api/sparklines?ids=${sparkIds}` : null, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
  });

  // UI-1：依今日漲跌幅排序（null 一律排最後），預設依自訂拖曳順序
  const sortedQuotes = useMemo(() => {
    const list = data?.quotes ?? [];
    if (sortKey === "default") {
      if (order.length === 0) return list;
      const map = new Map(list.map((q) => [q.stockId, q]));
      const ordered = order.map((id) => map.get(id)).filter(Boolean) as typeof list;
      const extra = list.filter((q) => !order.includes(q.stockId));
      return [...ordered, ...extra];
    }
    const dir = sortKey === "gain" ? -1 : 1;
    return [...list].sort((a, b) => {
      if (a.changePct === null) return 1;
      if (b.changePct === null) return -1;
      return (a.changePct - b.changePct) * dir;
    });
  }, [data?.quotes, sortKey, order]);

  // 已設提醒的代號集合（供「僅看已設提醒」篩選使用）
  const alertedIds = useMemo(
    () =>
      new Set(
        (items ?? [])
          .filter((i) => i.alert_high != null || i.alert_low != null)
          .map((i) => i.stock_id)
      ),
    [items]
  );

  const filteredQuotes = useMemo(() => {
    if (filterKey === "alert") {
      return sortedQuotes.filter((q) => alertedIds.has(q.stockId));
    }
    if (filterKey === "up") {
      return sortedQuotes.filter((q) => q.changePct !== null && q.changePct > 0);
    }
    if (filterKey === "down") {
      return sortedQuotes.filter((q) => q.changePct !== null && q.changePct < 0);
    }
    return sortedQuotes;
  }, [sortedQuotes, filterKey, alertedIds]);

  return (
    <div className="min-h-screen">
      <PullToRefresh onRefresh={refreshAll} />
      {/* masthead（sticky）：左＝站名（襯線），右＝日期＋盤別；下接 2px 實色深墨分隔線 */}
      <header className="sticky top-0 z-10 bg-app/95 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 border-b-2 border-ink px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-sm font-bold text-white shadow-card">
              台
            </span>
            <span className="font-serif text-lg font-bold tracking-tight text-ink">
              台股追蹤
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-right font-mono text-xs leading-tight text-muted tabular sm:block">
              <div>{now ? formatMastheadDate(now) : "---- / -- / --　--:-- TPE"}</div>
              <div className="mt-0.5 flex items-center justify-end gap-1">
                {data?.marketOpen && <span className="pulse-dot text-primary">●</span>}
                <span className={data?.marketOpen ? "font-semibold text-primary" : ""}>
                  {now ? getMarketSessionDetail(now) : "載入中"}
                </span>
              </div>
            </div>
            <div className="text-right font-mono text-[11px] leading-tight tabular sm:hidden">
              <div className="text-muted">
                {now ? formatMastheadDateShort(now) : "--/-- --:--"}
              </div>
              <div
                className={
                  data?.marketOpen ? "mt-0.5 font-semibold text-primary" : "mt-0.5 text-muted"
                }
              >
                {now ? getMarketSessionDetail(now) : "載入中"}
              </div>
            </div>
            <Link
              href="/alerts"
              aria-label="到價提醒總覽"
              className="hidden h-7 w-7 items-center justify-center rounded-lg bg-surface text-muted ring-1 ring-line transition-colors hover:text-ink active:scale-[0.97] md:flex"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </Link>
            <button
              onClick={refreshAll}
              disabled={quote.isValidating}
              aria-label="立即更新"
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface text-muted ring-1 ring-line transition-colors hover:text-ink active:scale-[0.97] disabled:opacity-50"
            >
              <span className={quote.isValidating ? "inline-block animate-spin" : ""}>
                ↻
              </span>
            </button>
          </div>
        </div>

        {/* 大盤指數：手機兩顆各半寬一次顯示，桌面版改為佔滿版寬的橫條帶 */}
        <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
          {data ? (
            <IndexCards indices={data.indices} />
          ) : (
            <div className="flex gap-2 sm:gap-0 sm:rounded-card sm:border sm:border-line sm:bg-surface sm:shadow-card">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-14 flex-1 animate-pulse rounded-card bg-surface sm:h-16 sm:rounded-none sm:bg-transparent"
                />
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
        <MobileNetworkBanner
          stale={data?.source === "stale" || autoPaused}
          error={quote.error || watchlist.error}
          asOf={data?.asOf}
        />

        {/* 手機首頁提供快速個股入口；桌面版沿用原有搜尋區塊。 */}
        <div className="md:hidden">
          <StockSearch />
        </div>

        {/* 全市場個股搜尋（不必先加自選即可看 K 線/基本面） */}
        <div className="hidden md:block">
          <StockSearch />
        </div>

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

        {/* 自選股 */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">自選股</h2>
              <p className="text-xs text-muted">
                {data ? (
                  <>
                    {filteredQuotes.length} / {data.quotes.length} 檔・盤中每 10 秒更新・
                    <RelativeTime iso={data.asOf} />
                  </>
                ) : (
                  "載入中…"
                )}
              </p>
              {sortKey === "default" && filterKey === "all" && data?.quotes.length && data.quotes.length > 1 ? (
                <p className="mt-1 text-[11px] text-muted md:hidden">長按拖曳把手可調整排序</p>
              ) : null}
            </div>
            <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:w-auto sm:flex-wrap sm:overflow-visible">
              {data && data.quotes.length > 1 && (
                <div className="flex shrink-0 rounded-pill bg-app p-0.5 text-xs">
                  {SORTS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setSortKey(s.key)}
                      aria-label={`依${s.label}排序`}
                      aria-pressed={sortKey === s.key}
                      className={`min-h-11 rounded-pill px-3 py-1 font-medium transition-colors active:scale-[0.97] ${
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
              <div className="hidden md:block">
                <AddStockForm onAdded={refreshAll} />
              </div>
            </div>
          </div>

          {data && data.quotes.length > 1 && (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 text-xs [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilterKey(f.key)}
                  aria-label={`篩選：${f.label}`}
                  aria-pressed={filterKey === f.key}
                  className={`min-h-11 shrink-0 rounded-pill px-3 py-1 font-medium ring-1 transition-colors active:scale-[0.97] ${
                    filterKey === f.key
                      ? "bg-primary-tint text-primary ring-primary/30"
                      : "bg-surface text-muted ring-line hover:text-ink"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {data && data.quotes.length > 0 ? (
            filteredQuotes.length === 0 ? (
              <EmptyState description="此篩選條件下沒有自選股" />
            ) : (
              (() => {
                // 僅「預設」排序、無篩選、且 ≥2 檔時可拖曳排序（漲幅/跌幅為即時計算、篩選中皆不可手動排）
                const canSort =
                  sortKey === "default" &&
                  filterKey === "all" &&
                  data.quotes.length > 1;
                const cards = filteredQuotes.map((q, i) => ({
                  id: q.stockId,
                  node: (
                    <div
                      className="rise-in"
                      style={{ animationDelay: `${140 + Math.min(i, 8) * 50}ms` }}
                    >
                      <SwipeToDelete onDelete={() => handleDelete(q.stockId)}>
                        <QuoteCard
                          quote={q}
                          onDelete={handleDelete}
                          reorderable={canSort}
                          spark={sparks.data?.data[q.stockId]?.spark}
                          signals={sparks.data?.data[q.stockId]?.signals}
                        />
                      </SwipeToDelete>
                    </div>
                  ),
                }));
                return canSort ? (
                  <DraggableGrid cards={cards} onReorder={handleReorder} />
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {cards.map((c) => (
                      <div key={c.id} id={`stock-${c.id}`} className="scroll-mt-24">
                        {c.node}
                      </div>
                    ))}
                  </div>
                );
              })()
            )
          ) : data ? (
            <EmptyState
              emoji="📈"
              description="還沒有自選股，輸入代號加入第一檔吧（例如 2330 台積電）"
            />
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
