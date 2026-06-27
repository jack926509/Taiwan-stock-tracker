"use client";

import { useEffect, useState } from "react";

interface MobileNetworkBannerProps {
  stale?: boolean;
  error?: unknown;
}

export default function MobileNetworkBanner({
  stale = false,
  error,
}: MobileNetworkBannerProps) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const hasError = Boolean(error);
  if (online && !stale && !hasError) return null;

  const message = !online
    ? "目前離線，畫面會保留最後一次資料"
    : stale
      ? "報價來源暫時異常，正在顯示快取資料"
      : "更新失敗，稍後會自動重試";

  return (
    <div className="md:hidden">
      <div className="rounded-xl border border-warn/20 bg-warn-tint px-3 py-2 text-xs font-medium text-warn">
        {message}
      </div>
    </div>
  );
}
