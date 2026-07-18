// K 線圖明暗色票 + 目前是否為深色模式判斷。
// lightweight-charts 走 Canvas 繪製，無法用 CSS 變數，需依系統深色模式各自帶一套色票。
// 本檔是 components/kline/ 這組元件唯一允許出現色票 hex 值的地方；
// KlineChart.tsx／KlineToolbar.tsx 一律只透過 getKlinePalette() 取色，不得再寫死 hex。
// 台股紅漲綠跌（與全站 token 一致，暖米白 × 深墨配色，完全去藍）。

export interface KlinePaletteColors {
  up: string;
  down: string;
  primary: string; // 深墨互動色（去藍，與 --c-primary 同值）
  muted: string; // 圖表文字（與 --c-ink 同值，供 layout.textColor 用）
  surface: string; // 卡片底（圖表背景／布林下軌遮罩）
  line: string; // 分隔線（與 --c-line 同值）
  lineHover: string; // 與 --c-line-strong 同值
  grid: string;
  volUp: string;
  volDown: string;
  macdUp: string;
  macdDown: string;
  bollFill: string;
  chipOff: string;
}

const PALETTE: { light: KlinePaletteColors; dark: KlinePaletteColors } = {
  light: {
    up: "#D92D3A",
    down: "#0E9F6E",
    primary: "#4A4237",
    muted: "#29241C",
    surface: "#FFFDF8",
    line: "#E9E2D3",
    lineHover: "#DDD4C0",
    grid: "rgba(233,226,211,0.5)",
    volUp: "rgba(217,45,58,0.55)",
    volDown: "rgba(14,159,110,0.55)",
    macdUp: "rgba(217,45,58,0.5)",
    macdDown: "rgba(14,159,110,0.5)",
    bollFill: "rgba(74,66,55,0.14)",
    chipOff: "#DDD4C0",
  },
  dark: {
    up: "#E86470",
    down: "#43B57E",
    primary: "#BFB49C", // 亮暖墨（與 --c-primary 深色版同值，去藍）
    muted: "#EAE2CF", // 圖表文字（與 --c-ink 深色版同值）
    surface: "#1D1913", // 與 --c-surface 深色版同值
    line: "#3D362A",
    lineHover: "#524939", // 與 --c-line-strong 深色版同值
    grid: "rgba(61,54,42,0.55)",
    volUp: "rgba(232,100,112,0.5)",
    volDown: "rgba(67,181,126,0.5)",
    macdUp: "rgba(232,100,112,0.45)",
    macdDown: "rgba(67,181,126,0.45)",
    bollFill: "rgba(191,180,156,0.16)",
    chipOff: "#524939",
  },
};

// 依目前是否深色模式取得對應色票（options 物件形狀與原 KlineChart.tsx 內 PALETTE.light/dark 完全一致）
export function getKlinePalette(dark: boolean): KlinePaletteColors {
  return dark ? PALETTE.dark : PALETTE.light;
}

// 目前是否為深色模式（供 chip 開關等非圖表 inline style 使用）
export function isDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
