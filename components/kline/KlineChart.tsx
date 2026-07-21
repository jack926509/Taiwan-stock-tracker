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
import { getKlinePalette } from "./klinePalette";
import { OverlayToggleRow, SubPaneTabs, type MaDef, type SubPane } from "./KlineToolbar";

// 主圖疊圖：MA5/20/60 各自開關 + 布林通道開關
const MA_DEFS: MaDef[] = [
  { n: 5, color: MA_COLORS.ma5, label: "MA5" },
  { n: 20, color: MA_COLORS.ma20, label: "MA20" },
  { n: 60, color: MA_COLORS.ma60, label: "MA60" },
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
  // 全站固定暖米白、不跟隨系統深色模式（見 app/globals.css 2026-07-19 決定）。
  // K 線圖一併固定淺色色票：否則使用者系統設為深色時，淺色頁面中會夾一張黑底圖表（不一致）。
  const isDark = false;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;
    const pal = getKlinePalette(isDark);

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: pal.surface },
        textColor: pal.muted,
        fontFamily: 'var(--font-sans), "PingFang TC", system-ui, sans-serif',
        panes: { separatorColor: pal.line, separatorHoverColor: pal.lineHover },
      },
      grid: {
        vertLines: { color: pal.grid },
        horzLines: { color: pal.grid },
      },
      rightPriceScale: { borderColor: pal.line },
      timeScale: { borderColor: pal.line, timeVisible: false },
      crosshair: {
        horzLine: { labelBackgroundColor: pal.primary },
        vertLine: { labelBackgroundColor: pal.primary },
      },
      localization: {
        locale: "zh-TW",
        priceFormatter: (p: number) =>
          p.toLocaleString("zh-TW", { maximumFractionDigits: 2 }),
      },
    });
    chartRef.current = chart;

    // 布林通道填色帶：先畫在最底層（候選蠟燭圖之前），上軌用半透明色鋪滿到
    // 圖底，下軌用卡片底色（不透明）蓋掉下軌以下的區域，只留上下軌之間的帶狀色塊。
    if (showBoll) {
      const band = bollinger(candles);
      const upperFill = chart.addSeries(AreaSeries, {
        lineVisible: false,
        topColor: pal.bollFill,
        bottomColor: pal.bollFill,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      upperFill.setData(
        band.map((b) => ({ time: toTime(b.date), value: b.upper }))
      );
      const lowerMask = chart.addSeries(AreaSeries, {
        lineVisible: false,
        topColor: pal.surface,
        bottomColor: pal.surface,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      lowerMask.setData(
        band.map((b) => ({ time: toTime(b.date), value: b.lower }))
      );
    }

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: pal.up,
      downColor: pal.down,
      borderUpColor: pal.up,
      borderDownColor: pal.down,
      wickUpColor: pal.up,
      wickDownColor: pal.down,
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
        color: pal.up,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "提醒 ▲",
      });
    }
    if (alertLow != null) {
      candleSeries.createPriceLine({
        price: alertLow,
        color: pal.down,
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
      mk((b) => b.upper, pal.primary, LineStyle.Dashed, "上軌");
      mk((b) => b.middle, pal.primary, LineStyle.Solid, "中軌");
      mk((b) => b.lower, pal.primary, LineStyle.Dashed, "下軌");
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
          color: c.close >= c.open ? pal.volUp : pal.volDown,
        }))
      );
      indReadouts.push({ label: "量", color: pal.muted, series: volumeSeries });
    } else if (subPane === "kd") {
      const data = kd(candles);
      indReadouts.push({
        label: "K",
        color: pal.primary,
        series: addOsc(
          pal.primary,
          data.map((p) => ({ time: toTime(p.date), value: p.k }))
        ),
      });
      indReadouts.push({
        label: "D",
        color: pal.muted,
        series: addOsc(
          pal.muted,
          data.map((p) => ({ time: toTime(p.date), value: p.d }))
        ),
      });
    } else if (subPane === "rsi") {
      const data = rsi(candles);
      indReadouts.push({
        label: "RSI",
        color: pal.primary,
        series: addOsc(
          pal.primary,
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
          color: p.hist >= 0 ? pal.macdUp : pal.macdDown,
        }))
      );
      indReadouts.push({ label: "柱", color: pal.muted, series: hist });
      indReadouts.push({
        label: "DIF",
        color: pal.primary,
        series: addOsc(
          pal.primary,
          data.map((p) => ({ time: toTime(p.date), value: p.dif }))
        ),
      });
      indReadouts.push({
        label: "DEA",
        color: pal.muted,
        series: addOsc(
          pal.muted,
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
  }, [candles, subPane, maOn, showBoll, alertHigh, alertLow, isDark]);

  const up = legend ? legend.close >= legend.open : true;
  const closeTrend: "up" | "down" = up ? "up" : "down";
  const pal = getKlinePalette(isDark); // 供下方 chip 開關等非圖表 inline style 使用

  return (
    <div>
      {/* 主圖疊圖開關：MA5/MA20/MA60 + 布林通道，樣式一致的小型 chip 開關 */}
      <OverlayToggleRow
        maDefs={MA_DEFS}
        maOn={maOn}
        onToggleMa={(n) => setMaOn((prev) => ({ ...prev, [n]: !prev[n] }))}
        showBoll={showBoll}
        onToggleBoll={() => setShowBoll((v) => !v)}
        chipOffColor={pal.chipOff}
        primaryColor={pal.primary}
      />

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
        <div
          ref={containerRef}
          className="h-[clamp(240px,45dvh,460px)] w-full"
        />
      </div>

      {/* 指標切換 pill 列：成交量／KD／MACD／RSI 四選一 */}
      <SubPaneTabs subPane={subPane} onChange={setSubPane} />
    </div>
  );
}
