"use client";

// 首頁：純組裝殼層。資料層（輪詢／排序／篩選／刪除／左欄統計）都在 lib/useHomeDashboard.ts，
// 這裡只負責把資料接到 components/home/* 六個元件與既有共用元件上。
import StockSearch from "@/components/StockSearch";
import MobileNetworkBanner from "@/components/MobileNetworkBanner";
import PullToRefresh from "@/components/PullToRefresh";
import DeleteStockDialog from "@/components/DeleteStockDialog";
import WatchlistGroupDialog from "@/components/WatchlistGroupDialog";
import TopBar from "@/components/home/TopBar";
import IndexRail from "@/components/home/IndexRail";
import WatchlistToolbar from "@/components/home/WatchlistToolbar";
import QuoteBoard from "@/components/home/QuoteBoard";
import ClosingSummary from "@/components/ClosingSummary";
import StatusNotice from "@/components/home/StatusNotice";
import PersonalStatusCard from "@/components/PersonalStatusCard";
import { useHomeDashboard } from "@/lib/useHomeDashboard";
import { formatQuoteAsOf } from "@/lib/quoteStatus";

export default function Dashboard() {
  const {
    data,
    todayFocus, todayDate,
    storage,
    quote,
    watchlist,
    items,
    autoPaused,
    sortKey,
    setSortKey,
    filterKey,
    setFilterKey,
    groups,groupFilter,setGroupFilter,groupEditingRow,setGroupEditingId,handleGroupSaved,
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
        hasUnread={(watchStats.todayHits ?? 0) > 0}
        onRefresh={handleManualRefresh}
        refreshing={quote.isValidating}
      />

      <div className="mx-auto max-w-[1360px] px-4 sm:px-[18px]">
        {/* 離線提示維持原樣；其餘警告（備援／缺漏／暫停輪詢／更新失敗…）併入 StatusNotice 單行摘要 */}
        <div className="pt-4 empty:hidden md:hidden"><MobileNetworkBanner /></div>
        <StatusNotice
          data={data}
          items={items ?? []}
          todayDate={todayDate}
          autoPaused={Boolean(autoPaused)}
          localStorageMode={storage === "local"}
          fetchError={Boolean(quote.error || watchlist.error)}
          countError={Boolean(todayFocus.error)}
        />
        {/* 左欄 1360px 起才並排：1000–1359 併排會把主欄壓到 8 欄表格的最小寬以下，
            表格橫向溢出→觸控板捲動被鎖在表格上（2026-07-19 滑不到底根因之一） */}
        <div className="grid grid-cols-1 gap-4 pt-4 min-[1360px]:grid-cols-[336px_1fr] min-[1360px]:items-start min-[1360px]:gap-5">
          <IndexRail
            indices={data?.indices ?? []}
            watchStats={watchStats}
            alertItems={alertItems}
          />

          <main className="grid min-w-0 grid-cols-1 gap-4 pb-6">
            {/* 單一搜尋框：點列看走勢，列右側「＋ 自選」加入自選 */}
            <StockSearch onAdded={refreshAll} />

            <WatchlistToolbar
              sort={sortKey}
              filter={filterKey}
              onSort={setSortKey}
              onFilter={setFilterKey}
              statusText={statusText}
              showChips={(items?.length ?? data?.quotes.length ?? 0) > 1}
              reorderHint={canSort}
              groups={items?.length?groups:[]}
              groupFilter={groupFilter}
              onGroupFilter={setGroupFilter}
            />

            {data || items ? (
              <QuoteBoard
                quotes={filteredQuotes}
                items={items ?? []}
                onDelete={requestDelete}
                sparkData={sparks.data?.data}
                sparkLoading={sparks.isLoading}
                allQuotes={data?.quotes}
                reorderable={canSort}
                onReorder={handleReorder}
                onEditGroup={setGroupEditingId}
                showAlertDistance={sortKey==="near"}
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

            {/* 收盤回顧可隨時選日期；今日尚未保存時另標示為暫覽。 */}
            <ClosingSummary />

            <PersonalStatusCard />

            <footer className="pt-2 text-center text-xs leading-relaxed text-muted">
              {!data ? "目前尚未取得行情資料" : data.source === "yahoo"
                ? "報價來源：Yahoo Finance 備援"
                : data?.source === "stale"
                  ? "報價來源：最近一次成功快照"
                  : "資料來源：台灣證券交易所・證券櫃檯買賣中心（MIS 即時行情）"}
              <br className="sm:hidden" />
              <span className="hidden sm:inline">・</span>
              {!data ? "自選清單仍保留，可稍後重新讀取報價" : data.source === "yahoo"
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
      <WatchlistGroupDialog item={groupEditingRow} groups={groups} onClose={()=>setGroupEditingId(null)} onSaved={handleGroupSaved}/>
    </div>
  );
}
