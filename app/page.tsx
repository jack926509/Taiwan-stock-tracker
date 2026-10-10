"use client";

// 首頁：純組裝殼層。資料層（輪詢／排序／篩選／刪除／左欄統計）都在 lib/useHomeDashboard.ts，
// 這裡只負責把資料接到 components/home/* 六個元件與既有共用元件上。
import StockSearch from "@/components/StockSearch";
import AddStockForm from "@/components/AddStockForm";
import MobileNetworkBanner from "@/components/MobileNetworkBanner";
import PullToRefresh from "@/components/PullToRefresh";
import DeleteStockDialog from "@/components/DeleteStockDialog";
import TopBar from "@/components/home/TopBar";
import IndexRail from "@/components/home/IndexRail";
import WatchlistToolbar from "@/components/home/WatchlistToolbar";
import QuoteBoard from "@/components/home/QuoteBoard";
import ClosingSummary from "@/components/ClosingSummary";
import { useHomeDashboard } from "@/lib/useHomeDashboard";
import { formatQuoteAsOf, quoteWarnings } from "@/lib/quoteStatus";

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
  const warnings = data ? quoteWarnings(data) : [];
  const quoteAt = formatQuoteAsOf(data?.asOf);
  const initialError = !data && Boolean(quote.error || watchlist.error);

  const statusText = data ? (
    <>
      {filteredQuotes.length} / {items?.length ?? data.quotes.length} 檔・
      {quoteAt ? `行情 ${quoteAt}（台北）` : "行情日期時間未知"}
    </>
  ) : (
    initialError ? "載入失敗，稍後會自動重試" : "載入中…"
  );

  return (
    <div className="min-h-screen">
      <PullToRefresh onRefresh={handleManualRefresh} />

      <TopBar
        sessionLabel={sessionLabel}
        sessionDetail={sessionDetail}
        hasUnread={watchStats.todayHits > 0}
        onRefresh={handleManualRefresh}
        refreshing={quote.isValidating}
      />

      <div className="mx-auto max-w-[1360px] px-4 sm:px-[18px]">
        {(warnings.length > 0 || autoPaused || storage === "local" || quote.error || watchlist.error) && (
          <div className="space-y-2 pt-4">
            <MobileNetworkBanner
              stale={data?.source === "stale" || autoPaused}
              error={quote.error || watchlist.error}
              asOf={data?.asOf}
            />
            {(quote.error || watchlist.error) && (
              <p role="alert" className="hidden rounded-card bg-warn-tint px-3 py-2 text-xs text-warn md:block">
                {data ? "資料更新失敗，畫面保留先前資料，稍後會自動重試。" : "行情或自選清單暫時無法載入，稍後會自動重試，也可按立即更新。"}
              </p>
            )}
            {(warnings.length > 0 || autoPaused || storage === "local") && (
              <div className="flex flex-wrap gap-2 text-xs">
                {warnings.map((warning) => (
                  <span key={warning} className="rounded-card bg-warn-tint px-2.5 py-1 leading-relaxed text-warn">
                    {warning}
                  </span>
                ))}
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
          </div>
        )}
        {/* 左欄 1360px 起才並排：1000–1359 併排會把主欄壓到 8 欄表格的最小寬以下，
            表格橫向溢出→觸控板捲動被鎖在表格上（2026-07-19 滑不到底根因之一） */}
        <div className="grid grid-cols-1 gap-4 pt-4 min-[1360px]:grid-cols-[336px_1fr] min-[1360px]:items-start min-[1360px]:gap-5">
          <IndexRail
            indices={data?.indices ?? []}
            watchStats={watchStats}
            alertItems={alertItems}
          />

          <main className="grid min-w-0 grid-cols-1 gap-4 pb-6">
            {/* 桌面兩個輸入框用途不同，各加標題避免混淆：左＝查看個股走勢、右＝加入自選清單 */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <p className="mb-1 hidden text-xs font-semibold text-muted md:block">搜尋個股（查看走勢）</p>
                <StockSearch />
              </div>
              <div className="hidden md:block">
                <p className="mb-1 text-xs font-semibold text-muted">加入自選股</p>
                <AddStockForm onAdded={refreshAll} />
              </div>
            </div>

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
                incomplete={data.complete !== true}
                sparkLoading={!sparks.data && !sparks.error}
                reorderable={canSort}
                onReorder={handleReorder}
              />
            ) : initialError ? (
              <div className="rounded-card bg-surface p-4 text-sm text-muted shadow-card ring-1 ring-line">
                尚未取得行情資料。
                <button type="button" onClick={handleManualRefresh} disabled={quote.isValidating || watchlist.isValidating}
                  className="ml-3 rounded-pill bg-primary px-4 py-2 text-white focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 dark:text-app">
                  立即重試
                </button>
              </div>
            ) : (
              <div className="grid gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-card bg-surface shadow-card" />
                ))}
              </div>
            )}

            {/* 收盤總覽：休市時段且有自選股時顯示（複用每日 LINE 總結彙整邏輯，盤中隱藏避免半場數據誤導） */}
            {data && !data.marketOpen && data.quotes.length > 0 && <ClosingSummary />}

            <footer className="pt-2 text-center text-xs leading-relaxed text-muted">
              {data?.source === "yahoo"
                ? "報價來源：Yahoo Finance 備援"
                : data?.source === "stale"
                  ? "報價來源：最近一次成功快照"
                  : "資料來源：台灣證券交易所・證券櫃檯買賣中心（MIS 即時行情）"}
              <br className="sm:hidden" />
              <span className="hidden sm:inline">・</span>
              {data?.source === "yahoo"
                ? "備援報價可能延遲，僅供個人參考，非投資建議"
                : data?.source === "stale"
                  ? "快照不是即時報價，僅供個人參考，非投資建議"
                  : "報價約延遲 10 秒，僅供個人參考，非投資建議"}
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
