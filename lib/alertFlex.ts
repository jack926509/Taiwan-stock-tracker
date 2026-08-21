import type { LineMessage } from "@/lib/notify";

export type AlertFlexKind = "high" | "low" | "change" | "volume";

export interface AlertFlexInput {
  kind: AlertFlexKind;
  stockId: string;
  name: string;
  price: number | null;
  changePct: number | null;
  threshold: number;
  time: string;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  baseUrl: string;
}

const C_UP = "#C4362B";
const C_DOWN = "#4E7A3A";
const C_NEUTRAL = "#6B5E54";
const C_INK = "#2B2420";
const C_MUTED = "#6B5E54";
const C_HAIRLINE = "#EBE4DD";

function fmtPrice(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtPct(p: number | null): string {
  if (p === null) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${(p * 100).toFixed(2)}%`;
}

function fmtVolume(volume: number): string {
  if (volume >= 10000) return `${(volume / 10000).toFixed(1)} 萬張`;
  return `${Math.round(volume).toLocaleString("en-US")} 張`;
}

function isUp(input: AlertFlexInput): boolean {
  return input.kind === "high" || (input.kind === "change" && (input.changePct ?? 0) >= 0);
}

function tone(input: AlertFlexInput): { header: string; accent: string } {
  if (input.kind === "volume") return { header: C_NEUTRAL, accent: C_INK };
  const color = isUp(input) ? C_UP : C_DOWN;
  return { header: color, accent: color };
}

function title(input: AlertFlexInput): string {
  switch (input.kind) {
    case "high": return `🔔 ${input.stockId} 漲破提醒`;
    case "low": return `🔔 ${input.stockId} 跌破提醒`;
    case "change": return `🔔 ${input.stockId} 漲跌幅提醒`;
    case "volume": return `🔔 ${input.stockId} 爆量提醒`;
  }
}

function triggerText(input: AlertFlexInput): string {
  switch (input.kind) {
    case "high": return `漲破設定價 ${fmtPrice(input.threshold)}`;
    case "low": return `跌破設定價 ${fmtPrice(input.threshold)}`;
    case "change": {
      const pct = Math.abs((input.changePct ?? 0) * 100).toFixed(1);
      return `今日${isUp(input) ? "大漲" : "大跌"} ${pct}%（門檻 ${fmtPrice(input.threshold)}%）`;
    }
    case "volume": {
      const volume = input.volume ?? 0;
      const ratio = input.threshold > 0 ? volume / input.threshold : 0;
      return `爆量 ${fmtVolume(volume)}（近 5 日均量 ${fmtVolume(input.threshold)} 的 ${ratio.toFixed(1)} 倍）`;
    }
  }
}

function altText(input: AlertFlexInput): string {
  return `${input.name} ${input.stockId} ${triggerText(input)}｜現價 ${fmtPrice(input.price)} ${fmtPct(input.changePct)}`.slice(0, 400);
}

function separator(): object {
  return { type: "separator", color: C_HAIRLINE, margin: "md" };
}

export function buildAlertFlex(input: AlertFlexInput): LineMessage {
  const colors = tone(input);
  const body: object[] = [
    { type: "text", text: input.name, size: "lg", weight: "bold", color: C_INK },
    { type: "text", text: input.stockId, size: "xs", color: C_MUTED, margin: "none" },
    {
      type: "box",
      layout: "baseline",
      margin: "md",
      contents: [
        { type: "text", text: fmtPrice(input.price), size: "xxl", weight: "bold", color: C_INK, flex: 6 },
        { type: "text", text: fmtPct(input.changePct), size: "md", weight: "bold", color: colors.accent, align: "end", flex: 4 },
      ],
    },
    { type: "text", text: triggerText(input), size: "sm", weight: "bold", color: colors.accent, wrap: true },
    separator(),
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `開盤\n${fmtPrice(input.open)}`, size: "xs", color: C_MUTED, flex: 1, wrap: true },
        { type: "text", text: `最高\n${fmtPrice(input.high)}`, size: "xs", color: C_MUTED, flex: 1, wrap: true, align: "center" },
        { type: "text", text: `最低\n${fmtPrice(input.low)}`, size: "xs", color: C_MUTED, flex: 1, wrap: true, align: "end" },
      ],
    },
  ];

  return {
    type: "flex",
    altText: altText(input),
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "horizontal",
        backgroundColor: colors.header,
        paddingAll: "16px",
        contents: [
          { type: "text", text: title(input), color: "#FFFFFF", weight: "bold", size: "md", flex: 8 },
          { type: "text", text: input.time, color: "#FFFFFF", size: "sm", align: "end", flex: 2 },
        ],
      },
      body: { type: "box", layout: "vertical", paddingAll: "20px", spacing: "sm", contents: body },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: colors.header,
            height: "sm",
            action: { type: "uri", label: `查看 ${input.stockId}`, uri: `${input.baseUrl}/stock/${input.stockId}` },
          },
        ],
      },
    },
  };
}
