"use client";

// 首頁資料層：把原本塞在 app/page.tsx 的 SWR 輪詢／自訂排序／篩選／刪除／左欄統計
// 全部搬進這支 hook，app/page.tsx 只留組裝 JSX（六個 components/home/* 元件）。
// 行為與舊版 app/page.tsx 完全相同，純粹搬移＋依資料來源分組，不增減任何邏輯。
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import useSWR from "swr";
import type { QuoteResponse, WatchlistItem } from "@/lib/types";
import type { Signal } from "@/lib/signals";
import { hitToday } from "@/lib/alertLogic";
import { POLL_MS, STALE_STOP_THRESHOLD } from "@/lib/pollConfig";
import { getMarketSessionLabel } from "@/lib/marketSession";
import type { SortKey, FilterKey } from "@/components/home/QuoteBoard";
import type { AlertRailItem } from "@/components/home/AlertSummaryCard";

type PendingDelete = { stockId: string; name: string };

// masthead 日期時間：「2026 / 07 / 18　09:31 TPE」（台北時間，非依賴瀏覽器時區）。
// 舊版 app/page.tsx 同名函式原樣搬過來：sessionDetail 要顯示的是「現在幾點」，
// 不是再講一次盤別狀態字（那個由 sessionLabel 負責，見 TopBar 的 dot + 文字）。
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

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export function useHomeDashboard() {
  const [autoPaused, setAutoPaused] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [order, setOrder] = useState<string[]>([]); // 預設模式的自訂排序（拖曳）
  const [filterKey, setFilterKey] = useState<FilterKey>("all");
  const staleCount = useRef(0);
  const lastTimeKey = useRef("");
  const [now, setNow] = useState<Date | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");

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

  async function handleManualRefresh() {
    try {
      await refreshAll();
      setLiveMessage("報價已更新");
    } catch {
      setLiveMessage("更新失敗，請檢查網路後再試一次");
    }
  }

  function requestDelete(stockId: string, name: string) {
    setPendingDelete({ stockId, name });
  }

  async function confirmDelete() {
    if (!pendingDelete || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(
        `/api/watchlist?id=${encodeURIComponent(pendingDelete.stockId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const deletedName = pendingDelete.name;
      setPendingDelete(null);
      setLiveMessage(`已刪除 ${deletedName}`);
      void refreshAll().catch(() => {
        setLiveMessage(`已刪除 ${deletedName}，但畫面重新整理失敗，請稍後更新`);
      });
    } catch {
      setLiveMessage("刪除失敗，清單未變更，請稍後再試");
    } finally {
      setDeleteBusy(false);
    }
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

  // UI-2：批次取各自選股近 20 日收盤，做迷你走勢圖／技術訊號（key 以排序後 id 串，重排不重抓）
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

  // 已設提醒的代號集合（供「僅看已設提醒」篩選、表格鈴鐺圖示、左欄提醒摘要共用）
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

  // 左欄「自選概況」：以全部自選股（不受篩選影響）即時計算漲跌家數 ＋ 今日已觸發到價提醒則數
  const watchStats = useMemo(() => {
    let up = 0;
    let down = 0;
    let flat = 0;
    for (const q of data?.quotes ?? []) {
      if (q.changePct === null || q.changePct === 0) flat++;
      else if (q.changePct > 0) up++;
      else down++;
    }
    const nowDate = now ?? new Date();
    let todayHits = 0;
    for (const i of items ?? []) {
      if (hitToday(i.alert_high_hit_at, nowDate)) todayHits++;
      if (hitToday(i.alert_low_hit_at, nowDate)) todayHits++;
    }
    return { up, down, flat, todayHits };
  }, [data?.quotes, items, now]);

  // 左欄「提醒摘要」：已設到價提醒的自選股，補上現價供算「距觸價 %」（不新增 API，沿用既有 quotes）
  const alertItems: AlertRailItem[] = useMemo(() => {
    const priceById = new Map((data?.quotes ?? []).map((q) => [q.stockId, q.price]));
    return (items ?? [])
      .filter((i) => i.alert_high != null || i.alert_low != null)
      .map((i) => ({ ...i, price: priceById.get(i.stock_id) ?? null }));
  }, [items, data?.quotes]);

  const sessionLabel = now ? getMarketSessionLabel(now) : "載入中";
  const sessionDetail = now ? formatMastheadDate(now) : "---- / -- / --　--:-- TPE";

  // 僅「預設」排序、無篩選、且 ≥2 檔時可拖曳排序（漲幅/跌幅為即時計算、篩選中皆不可手動排）
  const canSort =
    sortKey === "default" && filterKey === "all" && (data?.quotes.length ?? 0) > 1;

  return {
    now,
    data,
    storage,
    quote,
    watchlist,
    items,
    autoPaused,
    sortKey,
    setSortKey,
    filterKey,
    setFilterKey,
    filteredQuotes,
    sparks,
    watchStats,
    alertItems,
    canSort,
    sessionLabel,
    sessionDetail,
    liveMessage,
    pendingDelete,
    setPendingDelete,
    deleteBusy,
    refreshAll,
    handleManualRefresh,
    requestDelete,
    confirmDelete,
    handleReorder,
  };
}
