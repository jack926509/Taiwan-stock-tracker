import type { MetadataRoute } from "next";

// PWA 設定：可「加到主畫面」全螢幕開啟（standalone），圖示由 /icons 動態產生
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "台股追蹤",
    short_name: "台股追蹤",
    description: "個人台股自選股即時報價與到價提醒",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "zh-Hant",
    // 對齊「晨間財經誌」暖白紙感底（tailwind.config.ts 的 app token）
    background_color: "#F7F2E7",
    theme_color: "#F7F2E7",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
