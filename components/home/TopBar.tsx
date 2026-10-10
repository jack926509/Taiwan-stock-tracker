"use client";

// 頂欄（sticky）：品牌字號 + 盤別狀態膠囊（含日期時間）+ 提醒／重新整理圖示鈕。
// 大盤指數已搬到 IndexRail（見視覺規範，指數卡改列左欄），此處只留 masthead 本身。
import Link from "next/link";

export default function TopBar({
  sessionLabel,
  sessionDetail,
  hasUnread,
  onRefresh,
  refreshing = false,
}: {
  sessionLabel: string;
  sessionDetail: string;
  hasUnread: boolean;
  onRefresh: () => void;
  // 契約外加的可選項（向下相容）：沿用舊版「重新整理中」轉圈與 disabled 狀態，不丟功能。
  refreshing?: boolean;
}) {
  const isOpen = sessionLabel === "盤中";

  return (
    <header className="sticky top-0 z-40 bg-app/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-[1360px] items-center gap-3 border-b border-line px-4 py-3 sm:px-[18px]">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary text-sm font-extrabold text-white shadow-card dark:text-app">
            台
          </span>
          <div>
            <h1 className="font-serif text-base font-bold tracking-tight text-ink">台股追蹤</h1>
            <div className="hidden font-mono text-xs uppercase tracking-[2.5px] text-faint sm:block">
              Terminal
            </div>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3 rounded-pill border border-line bg-surface px-3.5 py-1.5 shadow-card">
          <span
            aria-hidden="true"
            className={`h-[7px] w-[7px] rounded-full ${isOpen ? "pulse-dot bg-primary" : "bg-faint"}`}
          />
          <span className={`whitespace-nowrap text-xs font-semibold tracking-wide ${isOpen ? "text-primary" : "text-muted"}`}>
            {sessionLabel}
          </span>
          <span className="h-3.5 w-px bg-line-strong max-[599px]:hidden" aria-hidden="true" />
          <span className="whitespace-nowrap font-mono text-xs font-semibold tabular text-ink max-[599px]:hidden">
            {sessionDetail}
          </span>
        </div>

        <Link
          href="/alerts"
          aria-label="到價提醒總覽"
          className="relative hidden h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-card transition-colors hover:bg-primary-tint hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.97] md:flex"
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
          {hasUnread && (
            <span
              aria-hidden="true"
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-surface"
            />
          )}
        </Link>

        <button
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="立即更新"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-card transition-colors hover:bg-primary-tint hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.97] disabled:opacity-50"
        >
          <span className={refreshing ? "inline-block animate-spin" : ""}>↻</span>
        </button>
      </div>
    </header>
  );
}
