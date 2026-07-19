"use client";

import Link from "next/link";
import StockSearch from "@/components/StockSearch";
import AddStockForm from "@/components/AddStockForm";

// 搜尋分頁（手機底部導覽用，桌機亦可直接造訪）：
// 上方查任意個股看 K 線/基本面，下方可直接加入自選。
export default function SearchPage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-app/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-card transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.97] md:hidden"
            aria-label="返回自選"
          >
            ←
          </Link>
          <span className="font-serif font-semibold text-ink">搜尋個股</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-5 sm:px-6">
        <section className="space-y-2">
          <StockSearch />
          <p className="px-1 text-xs text-muted">
            輸入代號（例如 2330）即可查看 K 線與基本面，不必先加入自選。
          </p>
        </section>

        <section className="rounded-card bg-surface p-4 shadow-card ring-1 ring-line">
          <h2 className="mb-3 font-serif text-sm font-semibold text-ink">加入自選股</h2>
          <AddStockForm onAdded={() => {}} />
        </section>
      </main>
    </div>
  );
}
