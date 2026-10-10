"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { countTouchedAlerts, type TouchableAlert } from "@/lib/alertTouched";

type AlertRow = TouchableAlert & { stock_id: string };
type QuoteLite = { quotes: { stockId: string; price: number | null }[] };

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

// 手機底部分頁導覽（md 以上隱藏，桌機沿用頂部 chrome）。
// 三個分頁：自選 / 搜尋 / 提醒總覽。含 iOS 底部安全區內距。
const TABS = [
  {
    href: "/",
    label: "自選",
    icon: (
      <path d="M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    ),
  },
  {
    href: "/search",
    label: "搜尋",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
  },
  {
    href: "/alerts",
    label: "提醒",
    icon: (
      <>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </>
    ),
  },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const watchlist = useSWR<{ items: AlertRow[] }>("/api/watchlist", fetcher, {
    revalidateOnFocus: true,
  });
  // 與 /api/quote 共用同一個 SWR key，不多打 API；紅點數字＝已觸及的提醒則數（與提醒頁、首頁同一套判斷）
  const quote = useSWR<QuoteLite>("/api/quote", fetcher, { revalidateOnFocus: true });
  const priceById = new Map((quote.data?.quotes ?? []).map((q) => [q.stockId, q.price]));
  const activeAlerts = countTouchedAlerts(watchlist.data?.items ?? [], (id) => priceById.get(id));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line/70 bg-app/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                active ? "text-primary" : "text-muted"
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 mx-auto h-0.5 w-8 rounded-full bg-primary"
                />
              )}
              <span className="relative">
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.2 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {tab.icon}
                </svg>
                {tab.href === "/alerts" && activeAlerts > 0 && (
                  <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-up px-1 text-center text-xs font-bold leading-4 text-white dark:text-app">
                    {activeAlerts > 9 ? "9+" : activeAlerts}
                  </span>
                )}
              </span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
