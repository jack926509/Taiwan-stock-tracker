"use client";

// 首頁：純組裝殼層。資料層（輪詢／排序／篩選／刪除／左欄統計）都在 lib/useHomeDashboard.ts，
// 這裡只負責把資料接到 components/home/* 六個元件與既有共用元件上。
import StockSearch from "@/components/StockSearch";
import AddStockForm from "@/components/AddStockForm";
import MobileNetworkBanner from "@/components/MobileNetworkBanner";
import PullToRefresh from "@/components/PullToRefresh";
import DeleteStockDialog from "@/components/DeleteStockDialog";
import RelativeTime from "@/components/RelativeTime";
import TopBar from "@/components/home/TopBar";
import IndexRail from "@/components/home/IndexRail";
import WatchlistToolbar from "@/components/home/WatchlistToolbar";
import QuoteBoard from "@/components/home/QuoteBoard";
import ClosingSummary from "@/components/ClosingSummary";
import { useHomeDashboard } from "@/lib/useHomeDashboard";

export default function Dashboard() {
  const {
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
    pendingDelete,
    setPendingDelete,
    deleteBusy,
    refreshAll,
    handleManualRefresh,
    requestDelete,
    confirmDelete,
    handleReorder,
  } = useHomeDashboard();

  const statusText = data ? (
    <>
      {filteredQuotes.length} / {data.quotes.length} 檔・盤中每 10 秒更新・
      <RelativeTime iso={data.asOf} />
    </>
  ) : (
    "載入中…"
  );

  return (
    <div className="min-h-screen">
      <PullToRefresh onRefresh={refreshAll} />

      <TopBar
        sessionLabel={sessionLabel}
        sessionDetail={sessionDetail}
        hasUnread={watchStats.todayHits > 0}
        onRefresh={handleManualRefresh}
        refreshing={quote.isValidating}
      />

      <div className="mx-auto max-w-[1360px] px-4 sm:px-[18px]">
        {/* 左欄 1360px 起才並排：1000–1359 併排會把主欄壓到 8 欄表格的最小寬以下，
            表格橫向溢出→觸控板捲動被鎖在表格上（2026-07-19 滑不到底根因之一） */}
        <div className="grid grid-cols-1 gap-4 pt-4 min-[1360px]:grid-cols-[336px_1fr] min-[1360px]:items-start min-[1360px]:gap-5">
          <IndexRail
            indices={data?.indices ?? []}
            watchStats={watchStats}
            alertItems={alertItems}
          />

          <main className="grid min-w-0 grid-cols-1 gap-4 pb-6">
            <MobileNetworkBanner
              stale={data?.source === "stale" || autoPaused}
              error={quote.error || watchlist.error}
              asOf={data?.asOf}
            />

            <div className="flex flex-wrap items-stretch gap-3">
              <div className="min-w-0 flex-1">
                <StockSearch />
              </div>
              <div className="hidden md:block">
                <AddStockForm onAdded={refreshAll} />
              </div>
            </div>

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

            <WatchlistToolbar
              sort={sortKey}
              filter={filterKey}
              onSort={setSortKey}
              onFilter={setFilterKey}
              statusText={statusText}
              showChips={(data?.quotes.length ?? 0) > 1}
              reorderHint={canSort}
            />

            {data ? (
              <QuoteBoard
                quotes={filteredQuotes}
                items={items ?? []}
                onDelete={requestDelete}
                sparkData={sparks.data?.data}
                reorderable={canSort}
                onReorder={handleReorder}
              />
            ) : (
              <div className="grid gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-card bg-surface shadow-card" />
                ))}
              </div>
            )}

            {/* 收盤總覽：休市時段且有自選股時顯示（複用每日 LINE 總結彙整邏輯，盤中隱藏避免半場數據誤導） */}
            {data && !data.marketOpen && data.quotes.length > 0 && <ClosingSummary />}

            {quote.error && !data && (
              <div className="rounded-card bg-surface p-4 text-sm text-warn shadow-card ring-1 ring-line">
                報價來源暫時無法使用，稍後會自動重試。
              </div>
            )}

            <footer className="pt-2 text-center text-[11px] leading-relaxed text-muted">
              資料來源：台灣證券交易所・證券櫃檯買賣中心（MIS 即時行情）
              <br className="sm:hidden" />
              <span className="hidden sm:inline">・</span>
              報價約延遲 10 秒，僅供個人參考，非投資建議
            </footer>
          </main>
        </div>
      </div>

      <DeleteStockDialog
        open={pendingDelete !== null}
        stockName={pendingDelete?.name ?? ""}
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setPendingDelete(null);
        }}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </div>
  );
}
