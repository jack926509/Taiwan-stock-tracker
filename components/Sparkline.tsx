// 迷你走勢圖：近 N 日收盤折線。依整體方向上紅下綠（台股紅漲綠跌）
const UP = "#E03131";
const DOWN = "#2F9E44";

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

  const rising = points[points.length - 1] >= points[0];

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      className="shrink-0"
    >
      <path
        d={d}
        fill="none"
        stroke={rising ? UP : DOWN}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
