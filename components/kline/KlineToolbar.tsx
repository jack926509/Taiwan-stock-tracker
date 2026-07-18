"use client";

// K 線圖工具列 UI：主圖疊圖開關（MA5/MA20/MA60、布林通道）＋副圖切換 pill 列
// （成交量／KD／MACD／RSI 四選一，等同 K 線圖內部的「週期切換」控制項）。
// 純展示元件，狀態由 components/kline/KlineChart.tsx 持有並透過 props 控制（controlled）。
// 顏色（chip 開關的色點、選中色）一律由呼叫端從 klinePalette.ts 取得後傳入，本檔不寫死 hex。

export type SubPane = "volume" | "kd" | "macd" | "rsi";

export const SUB_PANES: { key: SubPane; label: string }[] = [
  { key: "volume", label: "成交量" },
  { key: "kd", label: "KD" },
  { key: "macd", label: "MACD" },
  { key: "rsi", label: "RSI" },
];

export interface MaDef {
  n: 5 | 20 | 60;
  color: string;
  label: string;
}

export function OverlayToggleRow({
  maDefs,
  maOn,
  onToggleMa,
  showBoll,
  onToggleBoll,
  chipOffColor,
  primaryColor,
}: {
  maDefs: MaDef[];
  maOn: Record<5 | 20 | 60, boolean>;
  onToggleMa: (n: 5 | 20 | 60) => void;
  showBoll: boolean;
  onToggleBoll: () => void;
  chipOffColor: string;
  primaryColor: string;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
      {maDefs.map((def) => (
        <button
          key={def.label}
          onClick={() => onToggleMa(def.n)}
          className={`flex min-h-[28px] items-center gap-1 rounded-pill px-2 py-1 font-medium ring-1 transition-colors ${
            maOn[def.n]
              ? "bg-app text-ink ring-line"
              : "bg-transparent text-muted/60 ring-line/50"
          }`}
        >
          <i
            className="h-0.5 w-3 rounded"
            style={{ background: maOn[def.n] ? def.color : chipOffColor }}
          />
          {def.label}
        </button>
      ))}
      <button
        onClick={onToggleBoll}
        className={`flex min-h-[28px] items-center gap-1 rounded-pill px-2 py-1 font-medium ring-1 transition-colors ${
          showBoll
            ? "bg-app text-ink ring-line"
            : "bg-transparent text-muted/60 ring-line/50"
        }`}
      >
        <i
          className="h-0.5 w-3 rounded"
          style={{ background: showBoll ? primaryColor : chipOffColor }}
        />
        布林
      </button>
    </div>
  );
}

export function SubPaneTabs({
  subPane,
  onChange,
}: {
  subPane: SubPane;
  onChange: (key: SubPane) => void;
}) {
  return (
    <div className="mt-3 -mx-1 overflow-x-auto px-1">
      <div className="inline-flex min-w-full rounded-pill bg-app p-0.5 text-xs sm:min-w-0">
        {SUB_PANES.map((it) => (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={`min-h-[44px] flex-1 whitespace-nowrap rounded-pill px-3 py-2 font-medium transition-colors sm:flex-none ${
              subPane === it.key
                ? "bg-surface text-ink shadow-card"
                : "text-muted hover:text-ink"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}
