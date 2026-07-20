import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import PWAServiceWorker from "@/components/PWAServiceWorker";
import ToastProvider from "@/components/Toast";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

const APPLE_STARTUP_IMAGES = [
  { href: "/splash/750x1334", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" },
  { href: "/splash/828x1792", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" },
  { href: "/splash/1125x2436", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/1170x2532", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/1179x2556", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/1206x2622", media: "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/1242x2688", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/1290x2796", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/1320x2868", media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)" },
] as const;

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
    apple: [{ url: "/icons/512", sizes: "512x512", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // 全站固定暖米白，與主站 app/layout.tsx 同步（2026-07-19 主站取消夜報版）
  themeColor: "#F5F1E8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant" className={manrope.variable}>
      <head>
        {APPLE_STARTUP_IMAGES.map(({ href, media }) => (
          <link key={href} rel="apple-touch-startup-image" href={href} media={media} />
        ))}
      </head>
      <body className="min-h-screen text-ink antialiased">
        <ToastProvider>
          <div className="pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
          <PWAInstallPrompt />
          <BottomNav />
        </ToastProvider>
        <PWAServiceWorker />
      </body>
    </html>
  );
}
