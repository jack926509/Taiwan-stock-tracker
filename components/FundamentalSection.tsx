"use client";

import type { Fundamental } from "@/lib/providers/fundamentalProvider";
import { fmt, fmtSigned, fmtYi } from "@/lib/format";

// 法人買賣超／月營收 YoY 的正負配色（沿用全站紅漲綠跌）
function netColor(n: number | null): string {
  if (n === null || n === 0) return "text-muted";
  return n > 0 ? "text-up" : "text-down";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold tracking-tight tabular">{value}</div>
    </div>
  );
}

function md(date: string): string {
  return `${parseInt(date.slice(5, 7), 10)}/${parseInt(date.slice(8, 10), 10)}`;
}

// 變化率 %（以基準絕對值為分母，基準為 0 時無意義回 null）
function pctChange(cur: number, base: number): number | null {
  return base === 0 ? null : ((cur - base) / Math.abs(base)) * 100;
}

// QoQ/YoY 小徽章（紅漲綠跌）
function DeltaBadge({ label, v }: { label: string; v: number }) {
  const cls = v >= 0 ? "bg-up-tint text-up" : "bg-down-tint text-down";
  return (
    <span className={`rounded-pill px-1.5 py-0.5 ${cls}`}>
      {label} {v > 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

export default function FundamentalSection({
  fund,
  price,
}: {
  fund: Fundamental;
  price?: number | null;
}) {
  const { institutional, revenue, valuation } = fund;
  const eps = fund.eps ?? []; // 舊快取（無此欄位）過渡期防呆
  const instRecent = institutional.slice(-10).reverse(); // 新→舊
  const inst5 = institutional.slice(-5);
  const sum5 = {
    foreign: inst5.reduce((s, d) => s + d.foreign, 0),
    trust: inst5.reduce((s, d) => s + d.trust, 0),
    dealer: inst5.reduce((s, d) => s + d.dealer, 0),
  };
  const maxRevenue = Math.max(...revenue.map((r) => r.revenue), 1);
  const ttmEps = eps.slice(-4).reduce((s, q) => s + q.eps, 0); // 近四季合計
  const maxEps = Math.max(...eps.map((q) => Math.abs(q.eps)), 1);
  const latestEps = eps[eps.length - 1] ?? null;
  const qoq =
    eps.length >= 2 ? pctChange(eps[eps.length - 1].eps, eps[eps.length - 2].eps) : null;
  const yoy =
    eps.length >= 5 ? pctChange(eps[eps.length - 1].eps, eps[eps.length - 5].eps) : null;
  // 動態本益比＝現價 ÷ 近四季 EPS（近四季為正才有意義）
  const dynPer =
    price && price > 0 && eps.length >= 4 && ttmEps > 0 ? price / ttmEps : null;

  if (
    !valuation &&
    institutional.length === 0 &&
    revenue.length === 0 &&
    eps.length === 0
  ) {
    return null;
  }

  return (
    <>
      {/* 估值（ETF 等無此資料時整塊隱藏） */}
      {valuation && (
        <div
          className="rise-in flex flex-wrap items-end justify-between gap-4 rounded-card bg-surface p-5 shadow-card ring-1 ring-line"
          style={{ animationDelay: "140ms" }}
        >
          <div className="flex flex-wrap gap-10">
            <Stat label="本益比 PER" value={fmt(valuation.per)} />
            <Stat label="股價淨值比 PBR" value={fmt(valuation.pbr)} />
            <Stat
              label="殖利率"
              value={
                valuation.dividendYield === null
                  ? "—"
                  : `${fmt(valuation.dividendYield)}%`
              }
            />
          </div>
          <span className="text-[11px] text-muted tabular">
            估值日期 {valuation.date}
          </span>
        </div>
      )}

      <div
        className={`grid grid-cols-1 gap-4 ${
          instRecent.length > 0 && revenue.length > 0 ? "lg:grid-cols-2" : ""
        }`}
      >
        {/* 法人買賣超 */}
        {instRecent.length > 0 && (
          <div
            className="rise-in rounded-card bg-surface p-5 shadow-card ring-1 ring-line"
            style={{ animationDelay: "200ms" }}
          >
            <h3 className="text-sm font-semibold">三大法人買賣超</h3>
            <p className="mt-0.5 text-[11px] text-muted">單位：張，正為買超</p>
            <table className="mt-3 w-full text-xs tabular">
              <thead>
                <tr className="text-muted">
                  <th className="pb-2 text-left font-normal">日期</th>
                  <th className="pb-2 text-right font-normal">外資</th>
                  <th className="pb-2 text-right font-normal">投信</th>
                  <th className="pb-2 text-right font-normal">自營商</th>
                </tr>
              </thead>
              <tbody>
                {instRecent.map((d) => (
                  <tr key={d.date} className="border-t border-line">
                    <td className="py-1.5 text-muted">{md(d.date)}</td>
                    <td className={`py-1.5 text-right ${netColor(d.foreign)}`}>
                      {fmtSigned(d.foreign)}
                    </td>
                    <td className={`py-1.5 text-right ${netColor(d.trust)}`}>
                      {fmtSigned(d.trust)}
                    </td>
                    <td className={`py-1.5 text-right ${netColor(d.dealer)}`}>
                      {fmtSigned(d.dealer)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line font-semibold">
                  <td className="pt-2">近 5 日</td>
                  <td className={`pt-2 text-right ${netColor(sum5.foreign)}`}>
                    {fmtSigned(sum5.foreign)}
                  </td>
                  <td className={`pt-2 text-right ${netColor(sum5.trust)}`}>
                    {fmtSigned(sum5.trust)}
                  </td>
                  <td className={`pt-2 text-right ${netColor(sum5.dealer)}`}>
                    {fmtSigned(sum5.dealer)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* 月營收 */}
        {revenue.length > 0 && (
          <div
            className="rise-in rounded-card bg-surface p-5 shadow-card ring-1 ring-line"
            style={{ animationDelay: "260ms" }}
          >
            <h3 className="text-sm font-semibold">月營收</h3>
            <p className="mt-0.5 text-[11px] text-muted">
              單位：億元，YoY 為與去年同月相比
            </p>
            <div className="mt-3 space-y-1.5 text-xs tabular">
              {[...revenue].reverse().map((r) => (
                <div
                  key={`${r.year}-${r.month}`}
                  className="flex items-center gap-2"
                >
                  <span className="w-14 shrink-0 text-muted">
                    {r.year}/{String(r.month).padStart(2, "0")}
                  </span>
                  <div className="h-2 flex-1 rounded-pill bg-app">
                    <div
                      className="h-full rounded-pill bg-primary/35"
                      style={{ width: `${(r.revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right">
                    {fmtYi(r.revenue)}
                  </span>
                  <span
                    className={`w-16 shrink-0 text-right ${netColor(r.yoy)}`}
                  >
                    {r.yoy === null
                      ? "—"
                      : `${r.yoy > 0 ? "+" : ""}${r.yoy.toFixed(1)}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 每股盈餘 EPS（單季；ETF 等無資料自動隱藏） */}
      {eps.length > 0 && (
        <div
          className="rise-in rounded-card bg-surface p-5 shadow-card ring-1 ring-line"
          style={{ animationDelay: "320ms" }}
        >
          <div className="flex items-end justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">每股盈餘 EPS</h3>
              <p className="mt-0.5 text-[11px] text-muted">單位：元，單季</p>
              {latestEps && (qoq !== null || yoy !== null) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-muted">
                    最新 {latestEps.year} Q{latestEps.quarter}
                  </span>
                  {qoq !== null && <DeltaBadge label="QoQ" v={qoq} />}
                  {yoy !== null && <DeltaBadge label="YoY" v={yoy} />}
                </div>
              )}
            </div>
            {eps.length >= 4 && (
              <div className="text-right">
                <div className="text-[11px] text-muted">近四季合計 EPS</div>
                <div className={`text-xl font-bold tabular ${netColor(ttmEps)}`}>
                  {fmt(ttmEps)}
                </div>
                {dynPer !== null && (
                  <div className="mt-0.5 text-[11px] text-muted tabular">
                    本益比 {fmt(dynPer, 1)} 倍
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="mt-3 space-y-1.5 text-xs tabular">
            {[...eps].reverse().map((q) => (
              <div key={q.date} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-muted">
                  {q.year} Q{q.quarter}
                </span>
                <div className="h-2 flex-1 rounded-pill bg-app">
                  <div
                    className={`h-full rounded-pill ${
                      q.eps >= 0 ? "bg-up/35" : "bg-down/35"
                    }`}
                    style={{ width: `${(Math.abs(q.eps) / maxEps) * 100}%` }}
                  />
                </div>
                <span className={`w-14 shrink-0 text-right ${netColor(q.eps)}`}>
                  {fmt(q.eps)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
