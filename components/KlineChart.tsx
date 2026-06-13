"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/providers/klineProvider";
import { bollinger, rsi, kd, macd } from "@/lib/indicators";
import { fmt, fmtVol } from "@/lib/format";

type Ind = "none" | "boll" | "kd" | "rsi" | "macd";

const INDICATORS: { key: Ind; label: string }[] = [
  { key: "none", label: "無" },
  { key: "boll", label: "布林" },
  { key: "kd", label: "KD" },
  { key: "rsi", label: "RSI" },
  { key: "macd", label: "MACD" },
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
  ma: (number | null)[]; // MA5/20/60
  ind: { label: string; color: string; value: number | null }[];
}

function legendDate(time: UTCTimestamp): string {
  const iso = new Date((time as number) * 1000).toISOString().slice(0, 10);
  return `${iso.slice(0, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

// 台股紅漲綠跌（與全站 token 一致）
const UP = "#E03131";
const DOWN = "#2F9E44";
export const MA_COLORS = { ma5: "#E8830C", ma20: "#4F6BED", ma60: "#2DAAA0" };
const BOLL_COLOR = "#7A5AF8";

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

export default function KlineChart({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [indicator, setIndicator] = useState<Ind>("none");
  const [legend, setLegend] = useState<Legend | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#8A929E",
        fontFamily: 'var(--font-sans), "PingFang TC", system-ui, sans-serif',
        panes: { separatorColor: "#EDF0F4", separatorHoverColor: "#DCE0E6" },
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
        priceFormatter: (p: number) =>
          p.toLocaleString("zh-TW", { maximumFractionDigits: 2 }),
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

    // 成交量（張）：主窗格下方、依漲跌染淡色
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
        color:
          c.close >= c.open ? "rgba(224,49,49,0.35)" : "rgba(47,158,68,0.35)",
      }))
    );
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    // MA5 / MA20 / MA60
    const maSeries = (
      [
        [5, MA_COLORS.ma5],
        [20, MA_COLORS.ma20],
        [60, MA_COLORS.ma60],
      ] as const
    ).map(([n, color]) => {
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

    // 指標數列（供游標讀數）；布林疊主窗格，KD/RSI/MACD 進第 2 窗格
    const indReadouts: IndReadout[] = [];
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

    if (indicator === "boll") {
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
      };
      mk((b) => b.upper, BOLL_COLOR, LineStyle.Dashed, "上軌");
      mk((b) => b.middle, BOLL_COLOR, LineStyle.Solid, "中軌");
      mk((b) => b.lower, BOLL_COLOR, LineStyle.Dashed, "下軌");
    } else if (indicator === "kd") {
      const data = kd(candles);
      indReadouts.push({
        label: "K",
        color: MA_COLORS.ma5,
        series: addOsc(
          MA_COLORS.ma5,
          data.map((p) => ({ time: toTime(p.date), value: p.k }))
        ),
      });
      indReadouts.push({
        label: "D",
        color: MA_COLORS.ma20,
        series: addOsc(
          MA_COLORS.ma20,
          data.map((p) => ({ time: toTime(p.date), value: p.d }))
        ),
      });
    } else if (indicator === "rsi") {
      const data = rsi(candles);
      indReadouts.push({
        label: "RSI",
        color: BOLL_COLOR,
        series: addOsc(
          BOLL_COLOR,
          data.map((p) => ({ time: toTime(p.date), value: p.value }))
        ),
      });
    } else if (indicator === "macd") {
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
          color: p.hist >= 0 ? "rgba(224,49,49,0.5)" : "rgba(47,158,68,0.5)",
        }))
      );
      indReadouts.push({ label: "柱", color: "#8A929E", series: hist });
      indReadouts.push({
        label: "DIF",
        color: MA_COLORS.ma5,
        series: addOsc(
          MA_COLORS.ma5,
          data.map((p) => ({ time: toTime(p.date), value: p.dif }))
        ),
      });
      indReadouts.push({
        label: "DEA",
        color: MA_COLORS.ma20,
        series: addOsc(
          MA_COLORS.ma20,
          data.map((p) => ({ time: toTime(p.date), value: p.dea }))
        ),
      });
    }

    // 第 2 窗格存在時，讓主窗格佔較大比例
    if (indicator === "kd" || indicator === "rsi" || indicator === "macd") {
      const panes = chart.panes();
      if (panes.length > 1) {
        panes[0].setStretchFactor(3);
        panes[1].setStretchFactor(1);
      }
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
        ma: maSeries.map((s) => valFromData(s, time)),
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
      const vol = param.seriesData.get(volumeSeries) as
        | { value?: number }
        | undefined;
      setLegend({
        date: legendDate(param.time as UTCTimestamp),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: vol?.value ?? 0,
        ma: maSeries.map((s) => readVal(s)),
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
  }, [candles, indicator]);

  const up = legend ? legend.close >= legend.open : true;
  const maLabels = ["MA5", "MA20", "MA60"];
  const maColorArr = [MA_COLORS.ma5, MA_COLORS.ma20, MA_COLORS.ma60];

  return (
    <div>
      {/* 指標切換 */}
      <div className="mb-2 flex justify-end">
        <div className="flex rounded-pill bg-app p-0.5 text-xs">
          {INDICATORS.map((it) => (
            <button
              key={it.key}
              onClick={() => setIndicator(it.key)}
              className={`rounded-pill px-2.5 py-1 font-medium transition-colors ${
                indicator === it.key
                  ? "bg-surface text-ink shadow-card"
                  : "text-muted hover:text-ink"
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        {legend && (
          <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-lg bg-surface/85 px-2.5 py-1.5 text-[11px] tabular shadow-card ring-1 ring-line backdrop-blur">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-semibold text-ink">{legend.date}</span>
              <span className="text-muted">開 {fmt(legend.open)}</span>
              <span className="text-muted">高 {fmt(legend.high)}</span>
              <span className="text-muted">低 {fmt(legend.low)}</span>
              <span className={up ? "text-up" : "text-down"}>
                收 {fmt(legend.close)}
              </span>
              <span className="text-muted">量 {fmtVol(legend.volume)}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
              {legend.ma.map((v, i) => (
                <span key={maLabels[i]} style={{ color: maColorArr[i] }}>
                  {maLabels[i]} {v === null ? "—" : fmt(v)}
                </span>
              ))}
            </div>
            {legend.ind.length > 0 && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
                {legend.ind.map((r) => (
                  <span key={r.label} style={{ color: r.color }}>
                    {r.label} {r.value === null ? "—" : fmt(r.value)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={containerRef} className="h-[460px] w-full" />
      </div>
    </div>
  );
}
