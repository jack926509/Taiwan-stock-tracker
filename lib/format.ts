// 共用：數字格式化與台股漲跌色（紅漲綠跌，附錄 B.0）

export function fmt(n: number | null, digits = 2): string {
  if (n === null) return "—";
  return n.toLocaleString("zh-TW", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtInt(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("zh-TW");
}

// 成交量精簡：滿萬張以「萬」計，卡片內不佔版面
export function fmtVol(n: number | null): string {
  if (n === null) return "—";
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 萬`;
  return n.toLocaleString("zh-TW");
}

export function fmtPct(p: number | null): string {
  if (p === null) return "—";
  return `${(p * 100).toFixed(2)}%`;
}

// 帶正負號的整數（法人買賣超用）
export function fmtSigned(n: number | null): string {
  if (n === null) return "—";
  const s = n.toLocaleString("zh-TW");
  return n > 0 ? `+${s}` : s;
}

// 元 → 億元（月營收用）
export function fmtYi(n: number | null): string {
  if (n === null) return "—";
  return (n / 1e8).toLocaleString("zh-TW", { maximumFractionDigits: 1 });
}

// 漲跌停偵測：台股日漲跌幅上限 ±10%，依跳動單位捨入後實際多落在 9.5%~10%，
// 故以 |漲跌幅| ≥ 9.5% 視為觸及漲/跌停（涵蓋低價股較粗的跳動單位）
export function limitOf(changePct: number | null): "up" | "down" | null {
  if (changePct === null) return null;
  if (changePct >= 0.095) return "up";
  if (changePct <= -0.095) return "down";
  return null;
}

// 相對時間：「更新於 X 秒前 / X 分前」
export function fmtAgo(fromIso: string, nowMs: number): string {
  const sec = Math.max(0, Math.round((nowMs - Date.parse(fromIso)) / 1000));
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分前`;
  return `${Math.floor(min / 60)} 小時前`;
}

export type Trend = "up" | "down" | "flat";

export function trendOf(change: number | null): Trend {
  if (change === null || change === 0) return "flat";
  return change > 0 ? "up" : "down";
}

export function arrowOf(t: Trend): string {
  return t === "up" ? "▲" : t === "down" ? "▼" : "";
}

// 文字色
export const textColor: Record<Trend, string> = {
  up: "text-up",
  down: "text-down",
  flat: "text-flat",
};

// 標籤膠囊（tint 底）
export const chipColor: Record<Trend, string> = {
  up: "bg-up-tint text-up",
  down: "bg-down-tint text-down",
  flat: "bg-app text-flat",
};
