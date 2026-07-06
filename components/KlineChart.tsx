"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/providers/klineProvider";
import { bollinger, rsi, kd, macd } from "@/lib/indicators";
import { fmt, fmtVol, arrowOf } from "@/lib/format";
import { MA_COLORS } from "@/lib/klineColors";

// 副圖（第 2 窗格）四選一，成交量為預設
type SubPane = "volume" | "kd" | "macd" | "rsi";

const SUB_PANES: { key: SubPane; label: string }[] = [
  { key: "volume", label: "成交量" },
  { key: "kd", label: "KD" },
  { key: "macd", label: "MACD" },
  { key: "rsi", label: "RSI" },
];

// 主圖疊圖：MA5/20/60 各自開關 + 布林通道開關
const MA_DEFS = [
  { n: 5 as const, color: MA_COLORS.ma5, label: "MA5" },
  { n: 20 as const, color: MA_COLORS.ma20, label: "MA20" },
  { n: 60 as const, color: MA_COLORS.ma60, label: "MA60" },
];

// 游標讀數中，每個指標數列的標籤與顏色
interface IndReadout {
  label: string;
  color: string;
  series: ISeriesApi<SeriesType>;
}

interface Legend {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma: { label: string; color: string; value: number | null }[];
  ind: { label: string; color: string; value: number | null }[];
}

function legendDate(time: UTCTimestamp): string {
  const iso = new Date((time as number) * 1000).toISOString().slice(0, 10);
  return `${iso.slice(0, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

// 台股紅漲綠跌（與全站 token 一致，晨間財經誌配色）
const UP = "#C01926";
const DOWN = "#0A7A45";
const PRIMARY = "#1A3A63"; // 單一飽和點綴：靛藍
const MUTED = "#7D7361"; // 次要暖灰
const BOLL_COLOR = PRIMARY;

function toTime(date: string): UTCTimestamp {
  return (Date.parse(`${date}T00:00:00Z`) / 1000) as UTCTimestamp;
}

function sma(candles: Candle[], n: number) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= n) sum -= candles[i - n].close;
    if (i >= n - 1) out.push({ time: toTime(candles[i].date), value: sum / n });
  }
  return out;
}

export default function KlineChart({
  candles,
  alertHigh = null,
  alertLow = null,
}: {
  candles: Candle[];
  alertHigh?: number | null;
  alertLow?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [subPane, setSubPane] = useState<SubPane>("volume");
  const [maOn, setMaOn] = useState({ 5: true, 20: true, 60: true });
  const [showBoll, setShowBoll] = useState(false);
  const [legend, setLegend] = useState<Legend | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "#FFFDF7" },
        textColor: MUTED,
        fontFamily: 'var(--font-sans), "PingFang TC", system-ui, sans-serif',
        panes: { separatorColor: "#DDD3BF", separatorHoverColor: "#C9BCA0" },
      },
      grid: {
        vertLines: { color: "rgba(221,211,191,0.5)" },
        horzLines: { color: "rgba(221,211,191,0.5)" },
      },
      rightPriceScale: { borderColor: "#DDD3BF" },
      timeScale: { borderColor: "#DDD3BF", timeVisible: false },
      crosshair: {
        horzLine: { labelBackgroundColor: PRIMARY },
        vertLine: { labelBackgroundColor: PRIMARY },
      },
      localization: {
        locale: "zh-TW",
        priceFormatter: (p: number) =>
          p.toLocaleString("zh-TW", { maximumFractionDigits: 2 }),
      },
    });
    chartRef.current = chart;

    // 布林通道填色帶：先畫在最底層（候選蠟燭圖之前），上軌用半透明色鋪滿到
    // 圖底，下軌用卡片底色（不透明白）蓋掉下軌以下的區域，只留上下軌之間的帶狀色塊。
    if (showBoll) {
      const band = bollinger(candles);
      const upperFill = chart.addSeries(AreaSeries, {
        lineVisible: false,
        topColor: "rgba(26,58,99,0.14)",
        bottomColor: "rgba(26,58,99,0.14)",
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      upperFill.setData(
        band.map((b) => ({ time: toTime(b.date), value: b.upper }))
      );
      const lowerMask = chart.addSeries(AreaSeries, {
        lineVisible: false,
        topColor: "#FFFDF7",
        bottomColor: "#FFFDF7",
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      lowerMask.setData(
        band.map((b) => ({ time: toTime(b.date), value: b.lower }))
      );
    }

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    candleSeries.setData(
      candles.map((c) => ({
        time: toTime(c.date),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    candleSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.05, bottom: 0.05 },
    });

    // 關鍵價位標線：watchlist 設定的到價提醒（高／低），紅系／綠系虛線＋價格標籤
    if (alertHigh != null) {
      candleSeries.createPriceLine({
        price: alertHigh,
        color: UP,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "提醒 ▲",
      });
    }
    if (alertLow != null) {
      candleSeries.createPriceLine({
        price: alertLow,
        color: DOWN,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "提醒 ▼",
      });
    }

    // MA5 / MA20 / MA60（各自可開關）
    const maSeries: { def: (typeof MA_DEFS)[number]; series: ISeriesApi<SeriesType> }[] = [];
    for (const def of MA_DEFS) {
      if (!maOn[def.n]) continue;
      const line = chart.addSeries(LineSeries, {
        color: def.color,
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      line.setData(sma(candles, def.n));
      maSeries.push({ def, series: line });
    }

    // 布林通道疊圖：上下軌間半透明填色帶（以面積數列模擬）+ 上中下軌線
    const indReadouts: IndReadout[] = [];
    if (showBoll) {
      const band = bollinger(candles);
      const mk = (
        pick: (b: (typeof band)[number]) => number,
        color: string,
        style: LineStyle,
        label: string
      ) => {
        const s = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          lineStyle: style,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData(band.map((b) => ({ time: toTime(b.date), value: pick(b) })));
        indReadouts.push({ label, color, series: s });
        return s;
      };
      mk((b) => b.upper, BOLL_COLOR, LineStyle.Dashed, "上軌");
      mk((b) => b.middle, BOLL_COLOR, LineStyle.Solid, "中軌");
      mk((b) => b.lower, BOLL_COLOR, LineStyle.Dashed, "下軌");
    }

    // 副圖（第 2 窗格）：成交量 / KD / MACD / RSI 四選一
    const addOsc = (
      color: string,
      data: { time: UTCTimestamp; value: number }[]
    ) => {
      const s = chart.addSeries(
        LineSeries,
        {
          color,
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        },
        1
      );
      s.setData(data);
      return s;
    };

    let volumeSeries: ISeriesApi<SeriesType> | null = null;
    if (subPane === "volume") {
      volumeSeries = chart.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: "volume" },
          lastValueVisible: false,
          priceLineVisible: false,
        },
        1
      );
      volumeSeries.setData(
        candles.map((c) => ({
          time: toTime(c.date),
          value: c.volume,
          color:
            c.close >= c.open ? "rgba(192,25,38,0.55)" : "rgba(10,122,69,0.55)",
        }))
      );
      indReadouts.push({ label: "量", color: MUTED, series: volumeSeries });
    } else if (subPane === "kd") {
      const data = kd(candles);
      indReadouts.push({
        label: "K",
        color: PRIMARY,
        series: addOsc(
          PRIMARY,
          data.map((p) => ({ time: toTime(p.date), value: p.k }))
        ),
      });
      indReadouts.push({
        label: "D",
        color: MUTED,
        series: addOsc(
          MUTED,
          data.map((p) => ({ time: toTime(p.date), value: p.d }))
        ),
      });
    } else if (subPane === "rsi") {
      const data = rsi(candles);
      indReadouts.push({
        label: "RSI",
        color: BOLL_COLOR,
        series: addOsc(
          BOLL_COLOR,
          data.map((p) => ({ time: toTime(p.date), value: p.value }))
        ),
      });
    } else if (subPane === "macd") {
      const data = macd(candles);
      const hist = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: "price" }, lastValueVisible: false, priceLineVisible: false },
        1
      );
      hist.setData(
        data.map((p) => ({
          time: toTime(p.date),
          value: p.hist,
          color: p.hist >= 0 ? "rgba(192,25,38,0.5)" : "rgba(10,122,69,0.5)",
        }))
      );
      indReadouts.push({ label: "柱", color: MUTED, series: hist });
      indReadouts.push({
        label: "DIF",
        color: PRIMARY,
        series: addOsc(
          PRIMARY,
          data.map((p) => ({ time: toTime(p.date), value: p.dif }))
        ),
      });
      indReadouts.push({
        label: "DEA",
        color: MUTED,
        series: addOsc(
          MUTED,
          data.map((p) => ({ time: toTime(p.date), value: p.dea }))
        ),
      });
    }

    // 主窗格佔較大比例、副窗格較小
    const panes = chart.panes();
    if (panes.length > 1) {
      panes[0].setStretchFactor(3);
      panes[1].setStretchFactor(1);
    }

    chart.timeScale().fitContent();

    const valFromData = (
      s: ISeriesApi<SeriesType>,
      time: UTCTimestamp
    ): number | null => {
      const d = s.data().find((p) => p.time === time) as
        | { value?: number }
        | undefined;
      return d?.value ?? null;
    };
    const legendFrom = (c: Candle): Legend => {
      const time = toTime(c.date);
      return {
        date: c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        ma: maSeries.map((m) => ({
          label: m.def.label,
          color: m.def.color,
          value: valFromData(m.series, time),
        })),
        ind: indReadouts.map((r) => ({
          label: r.label,
          color: r.color,
          value: valFromData(r.series, time),
        })),
      };
    };

    setLegend(legendFrom(candles[candles.length - 1]));

    chart.subscribeCrosshairMove((param) => {
      const c = param.time
        ? (param.seriesData.get(candleSeries) as
            | { open: number; high: number; low: number; close: number }
            | undefined)
        : undefined;
      if (!param.time || !c) {
        setLegend(legendFrom(candles[candles.length - 1]));
        return;
      }
      const readVal = (s: ISeriesApi<SeriesType>) => {
        const d = param.seriesData.get(s) as { value?: number } | undefined;
        return d?.value ?? null;
      };
      setLegend({
        date: legendDate(param.time as UTCTimestamp),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume:
          subPane === "volume" && volumeSeries
            ? readVal(volumeSeries) ?? 0
            : (candles.find((x) => toTime(x.date) === param.time)?.volume ?? 0),
        ma: maSeries.map((m) => ({
          label: m.def.label,
          color: m.def.color,
          value: readVal(m.series),
        })),
        ind: indReadouts.map((r) => ({
          label: r.label,
          color: r.color,
          value: readVal(r.series),
        })),
      });
    });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, subPane, maOn, showBoll, alertHigh, alertLow]);

  const up = legend ? legend.close >= legend.open : true;
  const closeTrend: "up" | "down" = up ? "up" : "down";

  return (
    <div>
      {/* 主圖疊圖開關：MA5/MA20/MA60 + 布林通道，樣式一致的小型 chip 開關 */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        {MA_DEFS.map((def) => (
          <button
            key={def.label}
            onClick={() =>
              setMaOn((prev) => ({ ...prev, [def.n]: !prev[def.n] }))
            }
            className={`flex min-h-[28px] items-center gap-1 rounded-pill px-2 py-1 font-medium ring-1 transition-colors ${
              maOn[def.n]
                ? "bg-app text-ink ring-line"
                : "bg-transparent text-muted/60 ring-line/50"
            }`}
          >
            <i
              className="h-0.5 w-3 rounded"
              style={{ background: maOn[def.n] ? def.color : "#C9BFA8" }}
            />
            {def.label}
          </button>
        ))}
        <button
          onClick={() => setShowBoll((v) => !v)}
          className={`flex min-h-[28px] items-center gap-1 rounded-pill px-2 py-1 font-medium ring-1 transition-colors ${
            showBoll
              ? "bg-app text-ink ring-line"
              : "bg-transparent text-muted/60 ring-line/50"
          }`}
        >
          <i
            className="h-0.5 w-3 rounded"
            style={{ background: showBoll ? BOLL_COLOR : "#C9BFA8" }}
          />
          布林
        </button>
      </div>

      <div className="relative">
        {legend && (
          <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-card bg-surface/85 px-2.5 py-1.5 text-[11px] font-mono tabular shadow-card ring-1 ring-line backdrop-blur">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-semibold text-ink">{legend.date}</span>
              <span className="text-muted">開 {fmt(legend.open)}</span>
              <span className="text-muted">高 {fmt(legend.high)}</span>
              <span className="text-muted">低 {fmt(legend.low)}</span>
              <span className={up ? "text-up" : "text-down"}>
                收 {arrowOf(closeTrend)} {fmt(legend.close)}
              </span>
              <span className="text-muted">量 {fmtVol(legend.volume)}</span>
            </div>
            {legend.ma.length > 0 && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
                {legend.ma.map((m) => (
                  <span key={m.label} style={{ color: m.color }}>
                    {m.label} {m.value === null ? "—" : fmt(m.value)}
                  </span>
                ))}
              </div>
            )}
            {legend.ind.length > 0 && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
                {legend.ind.map((r, i) => (
                  <span key={`${r.label}-${i}`} style={{ color: r.color }}>
                    {r.label}{" "}
                    {r.value === null
                      ? "—"
                      : r.label === "量"
                        ? fmtVol(r.value)
                        : fmt(r.value)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={containerRef} className="h-[300px] w-full sm:h-[460px]" />
      </div>

      {/* 指標切換 pill 列：成交量／KD／MACD／RSI 四選一 */}
      <div className="mt-3 -mx-1 overflow-x-auto px-1">
        <div className="inline-flex min-w-full rounded-pill bg-app p-0.5 text-xs sm:min-w-0">
          {SUB_PANES.map((it) => (
            <button
              key={it.key}
              onClick={() => setSubPane(it.key)}
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
    </div>
  );
}
