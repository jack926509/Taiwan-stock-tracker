// 迷你走勢圖：近 20 日收盤折線。依「頭尾」方向用淡紅（上升）／淡綠（下降）／灰（持平），
// 以降低透明度與列上「今日漲跌」的實色區隔；紅漲綠跌不變。

export default function Sparkline({ points }: { points: number[] }) {
  if (!points || points.length < 2) return null;

  const w = 64;
  const h = 24;
  const pad = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);

  const first = points[0];
  const last = points[points.length - 1];
  const dir = last > first ? "up" : last < first ? "down" : "flat";
  const strokeClass =
    dir === "up" ? "stroke-up/60" : dir === "down" ? "stroke-down/60" : "stroke-muted/60";
  const dirText = dir === "up" ? "上升" : dir === "down" ? "下降" : "持平";

  const d = points
    .map((p, i) => {
      const x = pad + i * step;
      const y = pad + (1 - (p - min) / range) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <span
      role="img"
      aria-label={`近 20 日收盤走勢，${dirText}`}
      className="inline-flex shrink-0 justify-center"
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <path
          d={d}
          fill="none"
          className={strokeClass}
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
