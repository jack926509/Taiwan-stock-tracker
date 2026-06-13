import type { Config } from "tailwindcss";

// 淺色現代風 token（計劃書附錄 B.2 護眼基礎上精煉）。台股紅漲綠跌不變。
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "#F5F7FA", // 柔和淺灰底
        surface: "#FFFFFF",
        line: "#EDF0F4", // 極淺分隔線
        ink: "#1A1D24", // 主文字（深灰非純黑）
        muted: "#8A929E", // 次要文字
        primary: { DEFAULT: "#4F6BED", tint: "#EEF1FE" }, // 沉穩靛藍（chrome 用）
        up: { DEFAULT: "#E03131", tint: "#FFF1F1" }, // 漲・紅
        down: { DEFAULT: "#2F9E44", tint: "#EAFBEF" }, // 跌・綠
        flat: "#868E96",
        warn: { DEFAULT: "#E8830C", tint: "#FFF6E9" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // 柔和浮起（淺色現代風關鍵）
        card: "0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -12px rgba(16,24,40,0.10)",
        lift: "0 2px 4px rgba(16,24,40,0.05), 0 16px 32px -16px rgba(16,24,40,0.14)",
      },
      borderRadius: {
        card: "16px",
        pill: "999px",
      },
    },
  },
  plugins: [],
};

export default config;
