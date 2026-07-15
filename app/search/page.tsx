"use client";

import Link from "next/link";
import StockSearch from "@/components/StockSearch";
import AddStockForm from "@/components/AddStockForm";
import { IconArrowLeft } from "@/components/icons";

// 搜尋分頁（手機底部導覽用，桌機亦可直接造訪）：
// 上方查任意個股看 K 線/基本面，下方可直接加入自選。
export default function SearchPage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line/70 bg-app/95 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-surface text-muted ring-1 ring-line transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.97]"
            aria-label="返回自選"
          >
            <IconArrowLeft className="h-4 w-4" />
          </Link>
          <span className="font-serif font-semibold">搜尋個股</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-5 sm:px-6">
        <section className="space-y-2">
          <StockSearch />
          <p className="px-1 text-xs text-muted">
            輸入代號或公司名稱（例如 2330 或 台積電）即可查看 K 線與基本面，不必先加入自選。
          </p>
        </section>

        <section className="rounded-card bg-surface p-4 shadow-card ring-1 ring-line">
          <h2 className="mb-3 font-serif text-sm font-semibold">加入自選股</h2>
          <AddStockForm onAdded={() => {}} />
        </section>
      </main>
    </div>
  );
}
