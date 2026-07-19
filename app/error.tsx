"use client";

import Link from "next/link";

// 繁中錯誤頁：Next.js App Router 慣例的 client component，套用「晨間財經誌」設計系統。
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-6">
      <div className="w-full max-w-sm rounded-card bg-surface p-8 text-center shadow-card ring-1 ring-line">
        <div className="text-3xl" aria-hidden="true">
          ⚠️
        </div>
        <h1 className="mt-3 font-serif text-xl font-semibold text-ink">
          發生錯誤，請重試
        </h1>
        <p className="mt-2 text-sm text-muted">
          頁面載入時發生問題，您可以重試，或回首頁繼續使用。
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full rounded-pill bg-primary px-4 py-2 text-sm font-medium text-white shadow-card transition-opacity hover:opacity-90 dark:text-app"
          >
            重試
          </button>
          <Link
            href="/"
            className="w-full rounded-pill border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90"
          >
            回首頁
          </Link>
        </div>
      </div>
    </div>
  );
}
