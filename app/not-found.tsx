import Link from "next/link";

// 繁中 404 頁：取代 Next.js 英文預設樣板，套用「晨間財經誌」設計系統。
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-6">
      <div className="w-full max-w-sm rounded-card bg-surface p-8 text-center shadow-card ring-1 ring-line">
        <div className="text-3xl" aria-hidden="true">
          🧭
        </div>
        <h1 className="mt-3 font-serif text-xl font-semibold text-ink">
          找不到這個頁面
        </h1>
        <p className="mt-2 text-sm text-muted">
          您要找的內容不存在，或已經被移除。
        </p>
        <Link
          href="/"
          className="mt-6 inline-block w-full rounded-pill bg-primary px-4 py-2 text-sm font-medium text-white shadow-card transition-opacity hover:opacity-90 dark:text-app"
        >
          回首頁
        </Link>
      </div>
    </div>
  );
}
