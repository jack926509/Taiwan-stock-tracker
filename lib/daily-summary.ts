// 每日收盤總覽：工作日 13:35（收盤後）由常駐排程呼叫一次。
// 內容：加權指數背景 + 漲跌家數 + 各自選股（收盤價／漲跌點數／當日幅／本週累計／高低）+ 最強最弱。
// 排序依當日漲跌幅由大到小，紅漲（▲）綠跌（▼）。
import { listWatchlist } from "@/lib/store";
import { fetchQuotes } from "@/lib/providers/quoteProvider";
import { loadKline } from "@/lib/klineStore";
import { pushLine, lineConfigured } from "@/lib/notify";
import { taipeiNow, type TaipeiTime } from "@/lib/market-hours";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function fmtPrice(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// p 為小數（0.0236）→ 顯示 +2.36%
function fmtPct(p: number | null): string {
  if (p === null) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${(p * 100).toFixed(2)}%`;
}

function fmtPoint(n: number | null): string {
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtPrice(n)}`;
}

// 本週一（台北）的 ISO 日期；用來界定「本週累計」基準
function thisMondayIso(t: TaipeiTime): string {
  const offset = t.dayOfWeek === 0 ? 6 : t.dayOfWeek - 1; // 距週一幾天
  const d = new Date(`${t.isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

// 本週累計漲跌幅（小數）：以本週一之前最後一個收盤為基準，對比現價
async function weekChangePct(
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

// 回傳 true 表示有發出總覽（自選股為空或未設 LINE 則回 false）
export async function dailySummary(now: Date = new Date()): Promise<boolean> {
  if (!lineConfigured()) return false;

  const items = await listWatchlist();
  if (items.length === 0) return false;

  const ids = new Set(items.map((i) => i.stock_id));
  // 自選股 + 加權指數併同一個 MIS 請求（零額外請求）
  const result = await fetchQuotes([
    ...items.map((i) => ({ stockId: i.stock_id, market: i.market })),
    { stockId: "t00", market: "tse" as const },
  ]);

  const index = result.quotes.find((q) => !ids.has(q.stockId)) ?? null;
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
  if (index) {
    const ip = index.changePct;
    const ie = ip === null || ip === 0 ? "➡️" : ip > 0 ? "📈" : "📉";
    head.push(`${ie} 加權指數 ${fmtPrice(index.price)}　${fmtPct(ip)}`);
  }
  head.push(`漲 ${up}　跌 ${down}　平 ${flat}`);

  // 每檔以 ▪ 起點（方向交由群組標題表達），三行：名稱／價＋幅／本週＋高低
  const fmtRow = (q: (typeof rows)[number]): string => {
    const w = weekPct.get(q.stockId) ?? null;
    return [
      `▪${q.name}（${q.stockId}）`,
      `　${fmtPrice(q.price)}　${fmtPoint(q.change)}（${fmtPct(q.changePct)}）`,
      `　本週 ${fmtPct(w)}・高 ${fmtPrice(q.high)} 低 ${fmtPrice(q.low)}`,
    ].join("\n");
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

  const foot: string[] = [];
  const ranked = rows.filter((q) => q.changePct !== null);
  if (ranked.length > 0) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    foot.push(`🏆 最強 ${best.name} ${fmtPct(best.changePct)}`);
    if (worst.stockId !== best.stockId) {
      foot.push(`最弱 ${worst.name} ${fmtPct(worst.changePct)}`);
    }
  }
  foot.push(`⏰ 共 ${rows.length} 檔・收盤 13:35`);

  const text = [
    ...head,
    "━━━━━━━━━━",
    ...body,
    "━━━━━━━━━━",
    ...foot,
  ].join("\n");

  return pushLine(text);
}
