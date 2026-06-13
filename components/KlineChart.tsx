"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/providers/klineProvider";
import { fmt, fmtVol } from "@/lib/format";

interface Legend {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
}

function legendDate(time: UTCTimestamp): string {
  // toTime 以 UTC 午夜編碼，回推日期不受時區影響
  const iso = new Date((time as number) * 1000).toISOString().slice(0, 10);
  return `${iso.slice(0, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

// 台股紅漲綠跌（與全站 token 一致）
const UP = "#E03131";
const DOWN = "#2F9E44";
export const MA_COLORS = { ma5: "#E8830C", ma20: "#4F6BED", ma60: "#2DAAA0" };

function toTime(date: string): UTCTimestamp {
  return (Date.parse(`${date}T00:00:00Z`) / 1000) as UTCTimestamp;
}

// 簡單移動平均：前 n-1 筆不足期數者略過
function sma(candles: Candle[], n: number) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= n) sum -= candles[i - n].close;
    if (i >= n - 1) {
      out.push({ time: toTime(candles[i].date), value: sum / n });
    }
  }
  return out;
}

export default function KlineChart({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [legend, setLegend] = useState<Legend | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#8A929E",
        fontFamily:
          'var(--font-sans), "PingFang TC", system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: "#EDF0F4" },
        horzLines: { color: "#EDF0F4" },
      },
      rightPriceScale: { borderColor: "#EDF0F4" },
      timeScale: { borderColor: "#EDF0F4", timeVisible: false },
      crosshair: {
        horzLine: { labelBackgroundColor: "#4F6BED" },
        vertLine: { labelBackgroundColor: "#4F6BED" },
      },
      localization: {
        locale: "zh-TW",
        priceFormatter: (p: number) => p.toLocaleString("zh-TW", { maximumFractionDigits: 2 }),
      },
    });
    chartRef.current = chart;

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
      scaleMargins: { top: 0.05, bottom: 0.28 },
    });

    // 成交量（張）：下方 1/4 高度、依漲跌染淡色
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.setData(
      candles.map((c) => ({
        time: toTime(c.date),
        value: c.volume,
        color: c.close >= c.open ? "rgba(224,49,49,0.35)" : "rgba(47,158,68,0.35)",
      }))
    );
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    // MA5 / MA20 / MA60 均線（保留各 series 以便游標讀數）
    const maSeries = ([
      [5, MA_COLORS.ma5],
      [20, MA_COLORS.ma20],
      [60, MA_COLORS.ma60],
    ] as const).map(([n, color]) => {
      const line = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      line.setData(sma(candles, n));
      return line;
    });
    const [ma5Series, ma20Series, ma60Series] = maSeries;

    chart.timeScale().fitContent();

    // 由某根 K 棒組出讀數列；無 MA 值（期數不足）以 null 呈現
    const maAt = (s: typeof ma5Series, time: UTCTimestamp): number | null => {
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
        ma5: maAt(ma5Series, time),
        ma20: maAt(ma20Series, time),
        ma60: maAt(ma60Series, time),
      };
    };

    // 預設顯示最新一根
    setLegend(legendFrom(candles[candles.length - 1]));

    // 游標移動即時更新讀數；移出圖外則回到最新一根
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
      const vol = param.seriesData.get(volumeSeries) as
        | { value?: number }
        | undefined;
      const ma = (s: typeof ma5Series) => {
        const d = param.seriesData.get(s) as { value?: number } | undefined;
        return d?.value ?? null;
      };
      setLegend({
        date: legendDate(param.time as UTCTimestamp),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: vol?.value ?? 0,
        ma5: ma(ma5Series),
        ma20: ma(ma20Series),
        ma60: ma(ma60Series),
      });
    });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles]);

  const up = legend ? legend.close >= legend.open : true;
  const closeColor = up ? "text-up" : "text-down";

  return (
    <div className="relative">
      {legend && (
        <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-lg bg-surface/85 px-2.5 py-1.5 text-[11px] tabular shadow-card ring-1 ring-line backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-semibold text-ink">{legend.date}</span>
            <span className="text-muted">開 {fmt(legend.open)}</span>
            <span className="text-muted">高 {fmt(legend.high)}</span>
            <span className="text-muted">低 {fmt(legend.low)}</span>
            <span className={closeColor}>收 {fmt(legend.close)}</span>
            <span className="text-muted">量 {fmtVol(legend.volume)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
            <span style={{ color: MA_COLORS.ma5 }}>
              MA5 {legend.ma5 === null ? "—" : fmt(legend.ma5)}
            </span>
            <span style={{ color: MA_COLORS.ma20 }}>
              MA20 {legend.ma20 === null ? "—" : fmt(legend.ma20)}
            </span>
            <span style={{ color: MA_COLORS.ma60 }}>
              MA60 {legend.ma60 === null ? "—" : fmt(legend.ma60)}
            </span>
          </div>
        </div>
      )}
      <div ref={containerRef} className="h-[420px] w-full" />
    </div>
  );
}
