"use client";

import { useEffect } from "react";

// 註冊 public/sw.js（遠端 PWA 修復波次提供的離線快取 Service Worker）。
// 原本隨 Cloudflare 前端實驗一併被刪，整合時還原：sw.js／offline.html 為正式 PWA 功能，非 Cloudflare 專屬。
export default function PWAServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.update().catch(() => undefined);

        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      })
      .catch(() => undefined);
  }, []);

  return null;
}
