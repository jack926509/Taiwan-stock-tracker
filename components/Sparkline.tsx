// 迷你走勢圖：近 20 日收盤折線。固定使用品牌靛藍，
// 避免近 20 日方向的紅綠色與卡片「今日漲跌」語意互相衝突。

export default function Sparkline({ points }: { points: number[] }) {
  if (!points || points.length < 2) return null;

  const w = 64;
  const h = 24;
  const pad = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);

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
      aria-label="近 20 日收盤走勢"
      className="grid w-[4.75rem] shrink-0 justify-items-end gap-1"
    >
      <span className="text-[10px] font-medium tracking-wide text-muted">20 日</span>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <path
          d={d}
          fill="none"
          className="stroke-primary"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
