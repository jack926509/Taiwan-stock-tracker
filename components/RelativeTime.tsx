"use client";

import { useEffect, useState } from "react";
import { fmtAgo } from "@/lib/format";

// 獨立計時：每秒只更新「更新於 X 秒前」這一行字，
// 避免整個儀表板（含所有卡片）每秒重繪，手機捲動更順。
export default function RelativeTime({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>更新於 {fmtAgo(iso, now)}</>;
}
