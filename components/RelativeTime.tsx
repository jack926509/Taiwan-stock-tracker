"use client";

import { useEffect, useState } from "react";
import { fmtAgo } from "@/lib/format";

// 獨立計時：每秒只更新「更新於 X 秒前」這一行字，
// 避免整個儀表板（含所有卡片）每秒重繪，手機捲動更順。
export default function RelativeTime({ iso }: { iso: string }) {
  // 初始值固定 null（伺服器端與客戶端首次渲染皆相同，避免文字內容因
  // Date.now() 在兩端讀到不同時間而觸發 hydration mismatch）；
  // 掛載後才讀真實時間並開始每秒跳動。
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>更新於 {now === null ? "剛剛" : fmtAgo(iso, now)}</>;
}
