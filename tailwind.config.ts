import type { Config } from "tailwindcss";

// 「晨間財經誌」風格 token（暖白紙感底＋深墨文字＋襯線標題＋單一靛藍點綴）。台股紅漲綠跌不變。
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "#F7F2E7", // 暖白紙感底（--paper）
        surface: "#FFFDF7", // 卡片底色（--card）
        line: "#DDD3BF", // 分隔線（--rule）
        ink: "#211D16", // 主文字（--ink）
        muted: "#7D7361", // 次要文字（--sub）
        primary: { DEFAULT: "#1A3A63", tint: "#E7ECF3" }, // 單一飽和點綴：靛藍（--accent）
        up: { DEFAULT: "#C01926", tint: "#F7E2E0", strong: "#8F1119" }, // 漲・紅（strong：|漲跌幅|≥3% 加深一階）
        down: { DEFAULT: "#0A7A45", tint: "#DCEFE3", strong: "#075C34" }, // 跌・綠（strong：|漲跌幅|≥3% 加深一階）
        flat: "#5F5745", // 介於 muted 與 ink 之間的暖灰
        warn: { DEFAULT: "#C97A1B", tint: "#F7ECD9" }, // 橘色系暖化以貼近整體暖色調
        danger: { DEFAULT: "#8B1E12", tint: "#F3E3DF" }, // 破壞性操作專用深磚紅：與漲色（#C01926）區隔，避免「刪除＝上漲」語意衝突
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        // 扁平雜誌排版：極輕陰影，靠實色分隔線分界，不做厚重浮起感
        card: "0 1px 0 rgba(33,29,22,0.06)",
        lift: "0 1px 2px rgba(33,29,22,0.08)",
      },
      borderRadius: {
        card: "4px",
        pill: "999px",
      },
    },
  },
  plugins: [],
};

export default config;
