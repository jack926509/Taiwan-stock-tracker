import { ImageResponse } from "next/og";

// 用純圖形（漸層底 + 三根遞增白色長條＝上升走勢）產生 App 圖示，
// 不依賴中文字型，跨 iOS/Android 都能正確渲染、可當 maskable（背景滿版）。
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
          background: "linear-gradient(135deg, #4F6BED 0%, #7B96F4 100%)",
        }}
      >
        <svg
          width={size * 0.56}
          height={size * 0.56}
          viewBox="0 0 100 100"
          fill="none"
        >
          <rect x="14" y="50" width="16" height="34" rx="3" fill="#ffffff" opacity="0.55" />
          <rect x="42" y="33" width="16" height="51" rx="3" fill="#ffffff" opacity="0.78" />
          <rect x="70" y="16" width="16" height="68" rx="3" fill="#ffffff" />
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}
