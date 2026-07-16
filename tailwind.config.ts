import type { Config } from "tailwindcss";

// 「晨間財經誌」風格 token（暖白紙感底＋深墨文字＋襯線標題＋單一靛藍點綴）。台股紅漲綠跌不變。
// 深色模式「夜報版」：色票改由 CSS 變數承接，實際淺／深色數值定義在 app/globals.css
// 的 :root 與 @media (prefers-color-scheme: dark)，隨系統自動切換，不做手動切換鈕。
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 注意：全站多處用 bg-app/95、ring-primary/30 這類透明度修飾語法，Tailwind
        // 要能把 /NN 換算成 alpha 值，色票必須用 rgb(var(--x) / <alpha-value>) 寫法
        // （純 var(--x) 字串 Tailwind 無法附加透明度，會整個 utility 生不出來）。
        // 因此下列 CSS 變數在 globals.css 裡存的是「R G B」三數字（不是 hex），
        // 而非直接參與透明度修飾的 tint/strong 則維持一般 var(--x) 即可。
        app: "rgb(var(--c-app) / <alpha-value>)", // 底色（--paper／夜報底）
        surface: "rgb(var(--c-surface) / <alpha-value>)", // 卡片底色（--card）
        line: "rgb(var(--c-line) / <alpha-value>)", // 分隔線（--rule）
        ink: "rgb(var(--c-ink) / <alpha-value>)", // 主文字（--ink）
        muted: "rgb(var(--c-muted) / <alpha-value>)", // 次要文字（--sub）
        primary: {
          DEFAULT: "rgb(var(--c-primary) / <alpha-value>)", // 單一飽和點綴
          tint: "var(--c-primary-tint)",
        },
        up: {
          DEFAULT: "rgb(var(--c-up) / <alpha-value>)", // 漲・紅
          tint: "var(--c-up-tint)",
          strong: "var(--c-up-strong)", // |漲跌幅|≥3% 加深一階；深色模式改為提亮
        },
        down: {
          DEFAULT: "rgb(var(--c-down) / <alpha-value>)", // 跌・綠
          tint: "var(--c-down-tint)",
          strong: "var(--c-down-strong)", // 同上
        },
        flat: "rgb(var(--c-flat) / <alpha-value>)", // 介於 muted 與 ink 之間的暖灰
        warn: {
          DEFAULT: "rgb(var(--c-warn) / <alpha-value>)", // 橘色系暖化以貼近整體暖色調
          tint: "var(--c-warn-tint)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        // 扁平雜誌排版：極輕陰影，靠實色分隔線分界，不做厚重浮起感
        // 深色模式陰影改用黑色系半透明（見 globals.css 的 --shadow-card-color）
        card: "0 1px 0 var(--shadow-card-color)",
        lift: "0 1px 2px var(--shadow-lift-color)",
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
