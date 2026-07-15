import { ImageResponse } from "next/og";

const COLORS = {
  cream: "#F7F2E7",
  navy: "#17385F",
  red: "#F05449",
  gold: "#E4B84F",
} as const;

export const BULLISH_CANDLES = [
  { x: 25, top: 61, height: 20 },
  { x: 38, top: 52, height: 25 },
  { x: 51, top: 43, height: 22 },
  { x: 64, top: 31, height: 28 },
  { x: 77, top: 20, height: 19 },
] as const;

function BullMarketMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: size * 0.22,
        background: COLORS.navy,
        boxShadow: `0 ${size * 0.07}px ${size * 0.16}px rgba(23, 56, 95, 0.24)`,
      }}
    >
      <svg width={size * 0.76} height={size * 0.76} viewBox="0 0 100 100" fill="none">
        <path
          d="M18 76 C31 71, 39 61, 48 56 C58 49, 65 39, 82 20"
          stroke={COLORS.gold}
          strokeWidth="3.5"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path d="M72 21 L83 19 L81 31" stroke={COLORS.gold} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        {BULLISH_CANDLES.map((candle) => (
          <g key={candle.x}>
            <line
              x1={candle.x + 3.5}
              x2={candle.x + 3.5}
              y1={candle.top - 5}
              y2={candle.top + candle.height + 5}
              stroke={COLORS.red}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <rect x={candle.x} y={candle.top} width="7" height={candle.height} rx="2" fill={COLORS.red} />
          </g>
        ))}
      </svg>
    </div>
  );
}

export function renderAppIcon(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: COLORS.cream,
        }}
      >
        <BullMarketMark size={size * 0.72} />
      </div>
    ),
    { width: size, height: size }
  );
}

export function renderLaunchImage(width: number, height: number): ImageResponse {
  const markSize = Math.min(width * 0.46, height * 0.22);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: height * 0.035,
          background: COLORS.cream,
          color: COLORS.navy,
        }}
      >
        <BullMarketMark size={markSize} />
        <div
          style={{
            display: "flex",
            fontSize: Math.max(44, width * 0.062),
            fontWeight: 700,
            letterSpacing: width * 0.012,
          }}
        >
          台股追蹤
        </div>
      </div>
    ),
    { width, height }
  );
}
