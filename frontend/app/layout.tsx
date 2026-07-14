import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import PWAServiceWorker from "@/components/PWAServiceWorker";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

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
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F7F2E7" }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant" className={manrope.variable}><body className="min-h-screen text-ink antialiased"><div className="pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">{children}</div><PWAServiceWorker /><PWAInstallPrompt /><BottomNav /></body></html>;
}
