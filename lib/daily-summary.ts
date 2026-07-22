// 每日收盤總覽：工作日 13:35（收盤後）由常駐排程呼叫一次。
// 內容：加權＋櫃買指數背景 + 漲跌家數 + 各自選股（單行緊湊：收盤價／當日幅／本週累計）+ 最強最弱
// + 今日新出現的技術訊號 + 今日觸發提醒則數。排序依當日漲跌幅由大到小，紅漲（▲）綠跌（▼）。
// 送出格式：LINE Flex Message 卡片（色塊標題＋白底分區＋按鈕，沿用機票降價通知卡的視覺語言）。
import { listWatchlist, type WatchItem } from "@/lib/store";
import { fetchQuotes, INDEX_TARGETS } from "@/lib/providers/quoteProvider";
import { loadKline } from "@/lib/klineStore";
import { pushLineMessages, lineConfigured, type LineMessage } from "@/lib/notify";
import { taipeiNow, type TaipeiTime } from "@/lib/market-hours";
import { hitToday } from "@/lib/alertLogic";
import { newSignalsToday } from "@/lib/summarySignals";
import type { Signal, SignalKind } from "@/lib/signals";
import type { Candle } from "@/lib/providers/klineProvider";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

// 卡片站台按鈕連結：與 lib/alerts.ts 的 BASE_URL 同一套環境變數約定
const BASE_URL = process.env.APP_BASE_URL ?? "https://twstock.xiehnet.com";

// ── 色票（沿用機票降價通知卡 Flight-search-web/backend/services/notifier.py 的暖棕色語言）──
const C_PRIMARY = "#1F3A5F"; // 深藍（使用者 2026-07-22 由原咖啡色 #B0522E 改為深藍）：標題色塊＋按鈕
const C_INK = "#2B2420";
const C_MUTED = "#6B5E54";
const C_HAIRLINE = "#EBE4DD";
const C_CARD = "#FFFFFF";
const C_HEADER_DATE = "#C6D6E8"; // 標題右側日期：配深藍底的淺藍（原暖米 #F3E0D6）
// 台股語意色：紅漲綠跌
const C_UP = "#C4362B";
const C_DOWN = "#4E7A3A";
// 技術訊號 badge 底色（淡色塊，文字用對應語意色）
const C_BADGE_UP_BG = "#F7E1DE";
const C_BADGE_DOWN_BG = "#E3EAD9";
const C_BADGE_NEUTRAL_BG = "#EFEBE6";

// 訊號 kind → badge 短字（訊號本身的 label 已是完整敘述，如「跌破 MA20」，badge 只需短標籤）
const SIGNAL_BADGE: Record<SignalKind, string> = {
  "ma20-above": "站上",
  "ma20-below": "跌破",
  "kd-golden-cross": "黃金交叉",
  "kd-death-cross": "死亡交叉",
  "rsi-overbought": "超買",
  "rsi-oversold": "超賣",
};

function fmtPrice(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// p 為小數（0.0236）→ 顯示 +2.36%；本週欄用 1 位小數縮短行寬
function fmtPct(p: number | null, decimals = 2): string {
  if (p === null) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${(p * 100).toFixed(decimals)}%`;
}

// 漲＝紅、跌＝綠、平／未知＝muted
function pctColor(p: number | null): string {
  if (p === null || p === 0) return C_MUTED;
  return p > 0 ? C_UP : C_DOWN;
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

// 供 lib/summaryData.ts 的站內收盤總覽計數用；沿用 alertLogic.hitToday 單一實作（台北日期比對）
export function countTodayHits(items: WatchItem[], now: Date): number {
  let n = 0;
  for (const i of items) {
    if (hitToday(i.alert_high_hit_at, now)) n++;
    if (hitToday(i.alert_low_hit_at, now)) n++;
    if (hitToday(i.alert_change_hit_at, now)) n++;
    if (hitToday(i.alert_volume_hit_at, now)) n++;
  }
  return n;
}

// ── Flex 卡片組裝（版本 A · 完整卡，見 line-card-mockup.html）──────────────────

export interface SummaryStockRow {
  stockId: string;
  name: string;
  price: number | null;
  changePct: number | null;
  weekPct: number | null;
}

export interface SummarySignalRow {
  stockId: string;
  name: string;
  kind: SignalKind;
  label: string;
  tone: "neutral" | "up" | "down";
}

export interface SummaryFlexInput {
  date: string; // 如 "07/20（一）"
  weightedIndex: { price: number | null; changePct: number | null } | null;
  otcIndex: { price: number | null; changePct: number | null } | null;
  up: number;
  down: number;
  flat: number;
  upRows: SummaryStockRow[];
  downRows: SummaryStockRow[];
  flatRows: SummaryStockRow[];
  signalRows: SummarySignalRow[];
  best: { stockId: string; name: string; changePct: number | null } | null;
  worst: { stockId: string; name: string; changePct: number | null } | null;
  hits: number;
  baseUrl: string;
}

function separator(): object {
  return { type: "separator", color: C_HAIRLINE, margin: "md" };
}

// 加權（大字 xl）／櫃買（小字 sm）共用的 baseline 三欄：label／價格／漲跌%
function heroBox(label: string, price: string, pct: string, pct_color: string, big: boolean): object {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      { type: "text", text: label, size: "sm", color: C_MUTED, flex: 2 },
      {
        type: "text",
        text: price,
        size: big ? "xl" : "sm",
        weight: big ? "bold" : "regular",
        color: C_INK,
        align: "end",
        flex: 5,
      },
      { type: "text", text: pct, size: big ? "md" : "sm", weight: "bold", color: pct_color, align: "end", flex: 3 },
    ],
  };
}

function groupHeader(text: string, color: string): object {
  return { type: "text", text, size: "sm", weight: "bold", color };
}

// 單一自選股列：方向記號＋名稱／收盤價／當日幅（週漲跌已依使用者 2026-07-22 回饋移除，避免單行過擠）
function stockRow(q: SummaryStockRow, arrow: string, color: string): object {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: `${arrow} ${q.name}`, size: "sm", color, flex: 6 },
      { type: "text", text: fmtPrice(q.price), size: "xs", color: C_MUTED, align: "end", flex: 3 },
      { type: "text", text: fmtPct(q.changePct), size: "sm", weight: "bold", color, align: "end", flex: 3 },
    ],
  };
}

function badgeStyle(tone: "neutral" | "up" | "down"): { bg: string; color: string } {
  if (tone === "up") return { bg: C_BADGE_UP_BG, color: C_UP };
  if (tone === "down") return { bg: C_BADGE_DOWN_BG, color: C_DOWN };
  return { bg: C_BADGE_NEUTRAL_BG, color: C_MUTED };
}

// 技術訊號列：一行內嵌（類別粗體彩色帶頭＋股名／敘述）。
// 原本用窄 badge box，在橫向排版被壓到看不清（使用者 2026-07-22 回饋「太擠看不到」），改成整行 span 可換行。
function signalRow(s: SummarySignalRow): object {
  const badgeText = SIGNAL_BADGE[s.kind] ?? s.label;
  const { color } = badgeStyle(s.tone);
  return {
    type: "text",
    size: "sm",
    wrap: true,
    contents: [
      { type: "span", text: badgeText, color, weight: "bold" },
      { type: "span", text: `　${s.name}：${s.label}`, color: C_MUTED },
    ],
  };
}

function buildAltText(input: SummaryFlexInput): string {
  const idxParts: string[] = [];
  if (input.weightedIndex) {
    idxParts.push(`加權 ${fmtPrice(input.weightedIndex.price)} ${fmtPct(input.weightedIndex.changePct)}`);
  }
  if (input.otcIndex) {
    idxParts.push(`櫃買 ${fmtPrice(input.otcIndex.price)} ${fmtPct(input.otcIndex.changePct)}`);
  }
  const parts = [`📊 收盤總覽 ${input.date}`];
  if (idxParts.length > 0) parts.push(idxParts.join("・"));
  parts.push(`漲 ${input.up} 跌 ${input.down} 平 ${input.flat}`);
  return parts.join("｜").slice(0, 400);
}

// 組出完整 Flex message 物件（header 色塊／body 白底分區／footer 按鈕）
export function buildDailySummaryFlex(input: SummaryFlexInput): LineMessage {
  const body: object[] = [];

  if (input.weightedIndex) {
    body.push(
      heroBox(
        "加權",
        fmtPrice(input.weightedIndex.price),
        fmtPct(input.weightedIndex.changePct),
        pctColor(input.weightedIndex.changePct),
        true
      )
    );
  }
  if (input.otcIndex) {
    body.push(
      heroBox(
        "櫃買",
        fmtPrice(input.otcIndex.price),
        fmtPct(input.otcIndex.changePct),
        pctColor(input.otcIndex.changePct),
        true // 與加權同字級（使用者 2026-07-22 要求兩指數大小一致）
      )
    );
  }

  body.push({
    type: "text",
    size: "sm",
    wrap: true,
    contents: [
      { type: "span", text: "漲 ", color: C_MUTED },
      { type: "span", text: String(input.up), color: C_UP, weight: "bold" },
      { type: "span", text: "　跌 ", color: C_MUTED },
      { type: "span", text: String(input.down), color: C_DOWN, weight: "bold" },
      { type: "span", text: "　平 ", color: C_MUTED },
      { type: "span", text: String(input.flat), color: C_INK, weight: "bold" },
    ],
  });

  body.push(separator());

  if (input.upRows.length > 0) {
    body.push(groupHeader(`🔴 上漲（${input.upRows.length}）`, C_UP));
    for (const q of input.upRows) body.push(stockRow(q, "▲", C_UP));
  }
  if (input.downRows.length > 0) {
    body.push(groupHeader(`🟢 下跌（${input.downRows.length}）`, C_DOWN));
    for (const q of input.downRows) body.push(stockRow(q, "▼", C_DOWN));
  }
  if (input.flatRows.length > 0) {
    body.push(groupHeader(`⚪ 持平（${input.flatRows.length}）`, C_MUTED));
    for (const q of input.flatRows) body.push(stockRow(q, "▪", C_MUTED));
  }

  // 今日技術訊號：僅當有新訊號才附上這段與其前置分隔線；沒有就整段（含分隔線）省略
  if (input.signalRows.length > 0) {
    body.push(separator());
    body.push(groupHeader("📐 今日技術訊號", C_MUTED));
    for (const s of input.signalRows) body.push(signalRow(s));
  }

  body.push(separator());

  // 最強／最弱各自一行（使用者 2026-07-22 要求分兩行）
  if (input.best) {
    body.push({
      type: "text",
      size: "sm",
      wrap: true,
      contents: [
        { type: "span", text: "🏆 最強 ", color: C_MUTED },
        { type: "span", text: `${input.best.name} `, color: C_MUTED },
        { type: "span", text: fmtPct(input.best.changePct), color: pctColor(input.best.changePct), weight: "bold" },
      ],
    });
  }
  if (input.worst && (!input.best || input.worst.stockId !== input.best.stockId)) {
    body.push({
      type: "text",
      size: "sm",
      wrap: true,
      contents: [
        { type: "span", text: "📉 最弱 ", color: C_MUTED },
        { type: "span", text: `${input.worst.name} `, color: C_MUTED },
        { type: "span", text: fmtPct(input.worst.changePct), color: pctColor(input.worst.changePct), weight: "bold" },
      ],
    });
  }
  body.push({ type: "text", text: `🔔 今日觸發提醒 ${input.hits} 則`, size: "sm", color: C_MUTED });

  const bubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: C_PRIMARY,
      paddingAll: "16px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "📊 收盤總覽", color: "#FFFFFF", weight: "bold", size: "md" },
            { type: "text", text: input.date, color: C_HEADER_DATE, size: "sm", align: "end" },
          ],
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: C_CARD,
      paddingAll: "20px",
      spacing: "sm",
      contents: body,
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: C_PRIMARY,
          height: "sm",
          action: { type: "uri", label: "查看即時報價", uri: input.baseUrl },
        },
      ],
    },
  };

  return { type: "flex", altText: buildAltText(input), contents: bubble };
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

  const toRow = (q: (typeof rows)[number]): SummaryStockRow => ({
    stockId: q.stockId,
    name: q.name,
    price: q.price,
    changePct: q.changePct,
    weekPct: weekPct.get(q.stockId) ?? null,
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
  const signalRows: SummarySignalRow[] = [];
  for (const q of rows) {
    for (const s of signalsByStock.get(q.stockId) ?? []) {
      signalRows.push({ stockId: q.stockId, name: q.name, kind: s.kind, label: s.label, tone: s.tone });
    }
  }

  const ranked = rows.filter((q) => q.changePct !== null);
  const best = ranked.length > 0 ? ranked[0] : null;
  const worst = ranked.length > 0 ? ranked[ranked.length - 1] : null;

  const flexInput: SummaryFlexInput = {
    date,
    weightedIndex: weightedIndex ? { price: weightedIndex.price, changePct: weightedIndex.changePct } : null,
    otcIndex: otcIndex ? { price: otcIndex.price, changePct: otcIndex.changePct } : null,
    up,
    down,
    flat,
    upRows: rows.filter((q) => (q.changePct ?? 0) > 0).map(toRow),
    downRows: rows.filter((q) => (q.changePct ?? 0) < 0).map(toRow),
    flatRows: rows.filter((q) => (q.changePct ?? 0) === 0).map(toRow),
    signalRows,
    best: best ? { stockId: best.stockId, name: best.name, changePct: best.changePct } : null,
    worst: worst ? { stockId: worst.stockId, name: worst.name, changePct: worst.changePct } : null,
    hits: countTodayHits(items, now),
    baseUrl: BASE_URL,
  };

  return pushLineMessages([buildDailySummaryFlex(flexInput)]);
}
