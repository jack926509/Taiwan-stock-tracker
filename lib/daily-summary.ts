// 每日收盤總覽：工作日 13:35（收盤後）由常駐排程呼叫一次。
// 內容：加權＋櫃買指數背景 + 漲跌家數 + 各自選股（單行緊湊：收盤價／當日幅／本週累計）+ 最強最弱
// + 今日新出現的技術訊號 + 今日觸發提醒則數。排序依當日漲跌幅由大到小，紅漲（▲）綠跌（▼）。
import { listWatchlist, type WatchItem } from "@/lib/store";
import { fetchQuotes, INDEX_TARGETS } from "@/lib/providers/quoteProvider";
import { loadKline } from "@/lib/klineStore";
import { pushLine, lineConfigured } from "@/lib/notify";
import { taipeiNow, type TaipeiTime } from "@/lib/market-hours";
import { newSignalsToday } from "@/lib/summarySignals";
import type { Signal } from "@/lib/signals";
import type { Candle } from "@/lib/providers/klineProvider";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function fmtPrice(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// p 為小數（0.0236）→ 顯示 +2.36%；本週欄用 1 位小數縮短行寬
function fmtPct(p: number | null, decimals = 2): string {
  if (p === null) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${(p * 100).toFixed(decimals)}%`;
}

// 本週一（台北）的 ISO 日期；用來界定「本週累計」基準（匯出供站內收盤總覽 lib/summaryData.ts 共用）
export function thisMondayIso(t: TaipeiTime): string {
  const offset = t.dayOfWeek === 0 ? 6 : t.dayOfWeek - 1; // 距週一幾天
  const d = new Date(`${t.isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

// 本週累計漲跌幅（小數）：以本週一之前最後一個收盤為基準，對比現價
export async function weekChangePct(
  stockId: string,
  price: number | null,
  mondayIso: string
): Promise<number | null> {
  if (price === null) return null;
  const candles = await loadKline(stockId);
  let base: number | null = null;
  for (const c of candles) {
    if (c.date < mondayIso) base = c.close;
    else break; // candles 已按日期升序
  }
  if (base === null || base === 0) return null;
  return price / base - 1;
}

// 訊號差集邏輯在 lib/summarySignals.ts（獨立小模組，node --test 可直接載入測試）

// 以當日 MIS 報價合成一根收盤 candle；報價無現價時回 null（跳過該檔訊號計算，不誤報）
export function todayCandleFromQuote(
  q: { price: number | null; open: number | null; high: number | null; low: number | null; volume: number | null },
  isoDate: string
): Candle | null {
  if (q.price === null) return null;
  return {
    date: isoDate,
    open: q.open ?? q.price,
    high: q.high ?? q.price,
    low: q.low ?? q.price,
    close: q.price,
    volume: q.volume ?? 0,
  };
}

// 今日是否曾觸發（供「今日觸發提醒」計數用；台北日期比對，與 alerts.ts 的每日一次性判斷同邏輯）
function isTodayHit(hitAt: string | null, now: Date): boolean {
  if (!hitAt) return false;
  return taipeiNow(new Date(hitAt)).isoDate === taipeiNow(now).isoDate;
}

export function countTodayHits(items: WatchItem[], now: Date): number {
  let n = 0;
  for (const i of items) {
    if (isTodayHit(i.alert_high_hit_at, now)) n++;
    if (isTodayHit(i.alert_low_hit_at, now)) n++;
    if (isTodayHit(i.alert_change_hit_at, now)) n++;
    if (isTodayHit(i.alert_volume_hit_at, now)) n++;
  }
  return n;
}

// 回傳 true 表示有發出總覽（自選股為空或未設 LINE 則回 false）
export async function dailySummary(now: Date = new Date()): Promise<boolean> {
  if (!lineConfigured()) return false;

  const items = await listWatchlist();
  if (items.length === 0) return false;

  const ids = new Set(items.map((i) => i.stock_id));
  // 自選股 + 加權／櫃買指數併同一個 MIS 請求（零額外請求）
  const result = await fetchQuotes([
    ...items.map((i) => ({ stockId: i.stock_id, market: i.market })),
    ...INDEX_TARGETS,
  ]);

  const weightedIndex = result.quotes.find((q) => q.stockId === "t00") ?? null;
  const otcIndex = result.quotes.find((q) => q.stockId === "o00") ?? null;
  const rows = result.quotes
    .filter((q) => ids.has(q.stockId))
    .sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));

  const t = taipeiNow(now);
  const mondayIso = thisMondayIso(t);
  const weekPct = new Map<string, number | null>(
    await Promise.all(
      rows.map(
        async (q) =>
          [q.stockId, await weekChangePct(q.stockId, q.price, mondayIso)] as const
      )
    )
  );

  // 漲跌家數
  let up = 0;
  let down = 0;
  let flat = 0;
  for (const q of rows) {
    const c = q.changePct;
    if (c === null || c === 0) flat++;
    else if (c > 0) up++;
    else down++;
  }

  const date = `${t.isoDate.slice(5, 7)}/${t.isoDate.slice(8, 10)}（${WEEKDAY[t.dayOfWeek]}）`;
  const head: string[] = [`📊 收盤總覽　${date}`];
  if (weightedIndex) {
    const ip = weightedIndex.changePct;
    const ie = ip === null || ip === 0 ? "➡️" : ip > 0 ? "📈" : "📉";
    head.push(`${ie} 加權 ${fmtPrice(weightedIndex.price)} ${fmtPct(ip)}`);
  }
  if (otcIndex) {
    const op = otcIndex.changePct;
    const oe = op === null || op === 0 ? "➡️" : op > 0 ? "📈" : "📉";
    head.push(`${oe} 櫃買 ${fmtPrice(otcIndex.price)} ${fmtPct(op)}`);
  }
  head.push(`漲 ${up}　跌 ${down}　平 ${flat}`);

  // 每檔單行緊湊：方向記號＋名稱＋收盤價＋當日幅｜本週累計（高低價點連結進網頁看）
  const fmtRow = (q: (typeof rows)[number]): string => {
    const w = weekPct.get(q.stockId) ?? null;
    const c = q.changePct ?? 0;
    const mark = c > 0 ? "▲" : c < 0 ? "▼" : "▪";
    return `${mark} ${q.name} ${fmtPrice(q.price)} ${fmtPct(q.changePct)}｜週 ${fmtPct(w, 1)}`;
  };
  // 依方向分組（null 視為持平）；空組不顯示。組間用比主線淡的虛線分隔。
  const groups = [
    { label: "🔴 上漲", list: rows.filter((q) => (q.changePct ?? 0) > 0) },
    { label: "⚪ 持平", list: rows.filter((q) => (q.changePct ?? 0) === 0) },
    { label: "🟢 下跌", list: rows.filter((q) => (q.changePct ?? 0) < 0) },
  ].filter((g) => g.list.length > 0);
  const body: string[] = [];
  groups.forEach((g, i) => {
    if (i > 0) body.push("┈┈┈┈┈┈┈┈");
    body.push(g.label, ...g.list.map(fmtRow));
  });

  // 今日新出現的技術訊號：各自選股「不含今日」與「含今日」兩次 computeSignals 做差集，無新訊號的檔略過
  const signalsByStock = new Map<string, Signal[]>(
    await Promise.all(
      rows.map(async (q) => {
        const todayCandle = todayCandleFromQuote(q, t.isoDate);
        if (!todayCandle) return [q.stockId, [] as Signal[]] as const;
        const existing = await loadKline(q.stockId);
        return [q.stockId, newSignalsToday(existing, todayCandle)] as const;
      })
    )
  );
  const signalSection: string[] = [];
  const signalRows = rows.filter((q) => (signalsByStock.get(q.stockId) ?? []).length > 0);
  if (signalRows.length > 0) {
    signalSection.push("📐 今日技術訊號");
    for (const q of signalRows) {
      const labels = (signalsByStock.get(q.stockId) ?? []).map((s) => s.label).join("、");
      signalSection.push(`▪${q.name}（${q.stockId}）：${labels}`);
    }
  }

  const foot: string[] = [];
  const ranked = rows.filter((q) => q.changePct !== null);
  if (ranked.length > 0) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    foot.push(
      worst.stockId !== best.stockId
        ? `🏆 最強 ${best.name} ${fmtPct(best.changePct)}　最弱 ${worst.name} ${fmtPct(worst.changePct)}`
        : `🏆 最強 ${best.name} ${fmtPct(best.changePct)}`
    );
  }
  foot.push(`🔔 今日觸發提醒 ${countTodayHits(items, now)} 則`);

  const text = [
    ...head,
    "━━━━━━━━━━",
    ...body,
    ...(signalSection.length > 0 ? ["━━━━━━━━━━", ...signalSection] : []),
    "━━━━━━━━━━",
    ...foot,
  ].join("\n");

  return pushLine(text);
}
