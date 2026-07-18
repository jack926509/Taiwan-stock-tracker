"use client";

// 自選股標題列＋狀態文字＋排序／篩選工具列（同一排，照視覺規範 .board-head + .toolbar）。
import type { ReactNode } from "react";
import { SORTS, FILTERS, type SortKey, type FilterKey } from "@/components/home/QuoteBoard";

export default function WatchlistToolbar({
  sort,
  filter,
  onSort,
  onFilter,
  statusText,
  showChips = true,
  reorderHint = false,
}: {
  sort: SortKey;
  filter: FilterKey;
  onSort: (k: SortKey) => void;
  onFilter: (k: FilterKey) => void;
  // 契約型別為 string；實際會塞入含即時跳動 <RelativeTime/> 的節點，ReactNode 是 string 的超集，
  // 對外可傳純字串完全相容（詳見 task-7-report.md 的偏差說明）。
  statusText: ReactNode;
  showChips?: boolean;
  reorderHint?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-ink">自選股</h2>
        <p className="text-xs text-muted">{statusText}</p>
      </div>
      {reorderHint && (
        <p className="mt-1 text-[11px] text-muted md:hidden">長按拖曳把手可調整排序</p>
      )}

      {showChips && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[2px] text-muted">排序</span>
            <div className="flex gap-1.5">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => onSort(s.key)}
                  aria-label={`依${s.label}排序`}
                  aria-pressed={sort === s.key}
                  className={`min-h-11 rounded-pill px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.97] ${
                    sort === s.key
                      ? "bg-primary text-white shadow-card dark:text-app"
                      : "border border-line bg-surface text-muted hover:border-primary hover:text-primary"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <span className="hidden h-5 w-px bg-line-strong sm:block" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[2px] text-muted">篩選</span>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => onFilter(f.key)}
                  aria-label={`篩選：${f.label}`}
                  aria-pressed={filter === f.key}
                  className={`min-h-11 whitespace-nowrap rounded-pill px-3 py-1 text-xs font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.97] ${
                    filter === f.key
                      ? "bg-primary text-white ring-primary dark:text-app"
                      : "bg-surface text-muted ring-line hover:bg-primary-tint hover:text-primary"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
