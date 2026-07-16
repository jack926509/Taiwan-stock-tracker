import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";

// Manrope：數字表格等寬效果佳、比 Inter 更有個性的現代無襯線（中文仍走系統 PingFang TC）
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "台股追蹤",
  description: "個人台股即時追蹤儀表板",
  applicationName: "台股追蹤",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "台股追蹤" },
  icons: {
    icon: [
      { url: "/icons/192", sizes: "192x192", type: "image/png" },
      { url: "/icons/512", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/512", sizes: "512x512" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // 讓 env(safe-area-inset-*) 在 iPhone 瀏海/底欄生效
  // 夜報版：瀏覽器 UI（如 Android 網址列色塊）跟隨系統深色模式自動換色
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F2E7" },
    { media: "(prefers-color-scheme: dark)", color: "#1B1712" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant" className={manrope.variable}>
      <body className="min-h-screen text-ink antialiased">
        {/* 手機底部導覽高度的緩衝，避免內容被導覽列遮住（桌機無導覽列） */}
        <div className="pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </div>
        <PWAInstallPrompt />
        <BottomNav />
      </body>
    </html>
  );
}
