# PWA 精品牛市封面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 Cloudflare PWA 的 App icon 與 iPhone 啟動畫面改為核准的 A「精品牛市」視覺，完成測試後部署至 `twstock.xiehnet.com`。

**Architecture:** 延續既有 `next/og` 靜態圖片路由，以共用的 `lib/iconImage.tsx` 繪製深藍圖章、五根紅色上升 K 棒與金色趨勢線。192／512 icon 與九種 iPhone 啟動畫面都呼叫同一個繪圖介面，Next.js 靜態匯出時產生 PNG；layout、manifest 與 Service Worker 只負責引用及快取。

**Tech Stack:** Next.js 15、React 19、`next/og` ImageResponse、TypeScript、Node.js test runner、Cloudflare Pages。

## Global Constraints

- App icon 不放文字；啟動畫面只顯示「台股追蹤」，不放英文副標。
- 色彩固定為暖米白 `#F7F2E7`、深藍 `#17385F`、紅色 `#F05449`、金色 `#E4B84F`。
- 主圖固定使用五根由左下往右上排列的紅色 K 棒。
- 不加入牛隻、人物、硬幣、鈔票、火箭、浮誇 3D、漸層字或浮水印。
- 不修改首頁功能、股票資料、Zeabur API 代理或離線資料標示邏輯。
- 只提交本功能相關檔案，保留工作區既有的其他未提交修改。

---

### Task 1: 以測試固定精品牛市資產契約

**Files:**
- Modify: `tests/cloudflare-pwa.test.mjs`
- Test: `tests/cloudflare-pwa.test.mjs`

**Interfaces:**
- Consumes: 現有檔案文字讀取 helper `read(path): Promise<string>`。
- Produces: 對品牌色、五根 K 棒、maskable icon、九個啟動畫面、Service Worker v2 快取清單的回歸保護。

- [ ] **Step 1: 寫入失敗測試**

在既有 PWA 測試加入：

```js
test("PWA 使用精品牛市 icon 與 iPhone 啟動畫面", async () => {
  const [icon, layout, manifest, worker] = await Promise.all([
    read("lib/iconImage.tsx"),
    read("frontend/app/layout.tsx"),
    read("frontend/app/manifest.ts"),
    read("frontend/public/sw.js"),
  ]);

  for (const color of ["#F7F2E7", "#17385F", "#F05449", "#E4B84F"]) {
    assert.match(icon, new RegExp(color, "i"));
  }
  assert.match(icon, /BULLISH_CANDLES = \[/);
  assert.match(icon, /renderLaunchImage/);
  assert.match(manifest, /purpose:\s*"maskable"/);
  for (const size of ["750x1334", "828x1792", "1125x2436", "1170x2532", "1179x2556", "1206x2622", "1242x2688", "1290x2796", "1320x2868"]) {
    assert.match(layout, new RegExp(`/splash/${size}`));
    assert.match(worker, new RegExp(`/splash/${size}`));
  }
  assert.match(worker, /CACHE_VERSION = "twstock-pwa-v2"/);
});
```

- [ ] **Step 2: 確認測試先失敗**

Run: `npm test -- --test-name-pattern="精品牛市"`

Expected: FAIL，因為 `BULLISH_CANDLES`、`renderLaunchImage` 與 `/splash/*` 尚未存在。

- [ ] **Step 3: 提交測試切片**

```bash
git add tests/cloudflare-pwa.test.mjs
git commit -m "test: 定義 PWA 精品牛市資產契約"
```

---

### Task 2: 建立共用 icon 與啟動畫面繪圖器

**Files:**
- Modify: `lib/iconImage.tsx`
- Create: `frontend/app/splash/750x1334/route.tsx`
- Create: `frontend/app/splash/828x1792/route.tsx`
- Create: `frontend/app/splash/1125x2436/route.tsx`
- Create: `frontend/app/splash/1170x2532/route.tsx`
- Create: `frontend/app/splash/1179x2556/route.tsx`
- Create: `frontend/app/splash/1206x2622/route.tsx`
- Create: `frontend/app/splash/1242x2688/route.tsx`
- Create: `frontend/app/splash/1290x2796/route.tsx`
- Create: `frontend/app/splash/1320x2868/route.tsx`
- Test: `tests/cloudflare-pwa.test.mjs`

**Interfaces:**
- Produces: `renderAppIcon(size: number): ImageResponse` 與 `renderLaunchImage(width: number, height: number): ImageResponse`。
- Consumers: `/icons/192`、`/icons/512` 與九個 `/splash/<size>` route handlers。

- [ ] **Step 1: 以共用常數與元件改寫 icon renderer**

`lib/iconImage.tsx` 必須定義：

```tsx
const COLORS = { cream: "#F7F2E7", navy: "#17385F", red: "#F05449", gold: "#E4B84F" } as const;
export const BULLISH_CANDLES = [
  { x: 25, top: 61, height: 20 },
  { x: 38, top: 52, height: 25 },
  { x: 51, top: 43, height: 22 },
  { x: 64, top: 31, height: 28 },
  { x: 77, top: 20, height: 19 },
] as const;
```

`BullMarketMark` 以 SVG 繪製金色上升路徑及五根紅色 K 棒，外層為深藍圓角方形並保留至少 20% maskable 安全邊界。`renderAppIcon` 使用滿版米白背景；`renderLaunchImage` 以直式米白背景置中同一圖形，並在下方輸出「台股追蹤」。

- [ ] **Step 2: 建立九個靜態圖片 route**

每個 route 僅替換尺寸，例如：

```tsx
import { renderLaunchImage } from "@/lib/iconImage";
export const dynamic = "force-static";
export function GET() { return renderLaunchImage(1290, 2796); }
```

- [ ] **Step 3: 執行目標測試確認繪圖契約已部分通過**

Run: `npm test -- --test-name-pattern="精品牛市"`

Expected: 仍 FAIL，只缺 layout、manifest 或 worker 整合；繪圖器相關斷言已通過。

- [ ] **Step 4: 提交繪圖切片**

```bash
git add lib/iconImage.tsx frontend/app/splash
git commit -m "feat: 製作 PWA 精品牛市圖片資產"
```

---

### Task 3: 整合 PWA metadata、manifest 與離線快取

**Files:**
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/manifest.ts`
- Modify: `frontend/public/sw.js`
- Test: `tests/cloudflare-pwa.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `/icons/192`、`/icons/512` 與九個 `/splash/<size>`。
- Produces: Android／iOS 安裝資訊、Apple startup image link 與 v2 App Shell cache。

- [ ] **Step 1: 在 layout 加入 Apple startup image 清單**

定義 `APPLE_STARTUP_IMAGES`，每筆含 `href` 與對應 `media`，例如：

```tsx
{ href: "/splash/1290x2796", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" }
```

在 `<html>` 內加入 `<head>`，將清單映射為：

```tsx
<link key={href} rel="apple-touch-startup-image" href={href} media={media} />
```

- [ ] **Step 2: 更新 manifest icon purpose**

保留一般 192／512 icon，並把 maskable 項目明確寫成：

```ts
{ src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" }
```

- [ ] **Step 3: 更新 Service Worker 快取**

將版本提升為 `twstock-pwa-v2`，並在 `APP_SHELL_PATHS` 加入 `/icons/192`、`/icons/512` 與全部九個 `/splash/<size>` 路徑。

- [ ] **Step 4: 跑 PWA 測試**

Run: `npm test -- --test-name-pattern="Cloudflare PWA|Apple|精品牛市|離線提示"`

Expected: PASS，全部 PWA 測試通過。

- [ ] **Step 5: 提交整合切片**

```bash
git add frontend/app/layout.tsx frontend/app/manifest.ts frontend/public/sw.js
git commit -m "feat: 整合精品牛市 PWA 啟動畫面"
```

---

### Task 4: 完整驗收、發布與正式網域檢查

**Files:**
- Verify only: `frontend/out/**`

**Interfaces:**
- Consumes: 前三個 Task 的完整提交。
- Produces: GitHub PR、`main` 合併提交、Cloudflare Production deployment 與正式網域驗收證據。

- [ ] **Step 1: 執行完整自動驗收**

Run: `npm test && npm run build && npm --prefix frontend run build`

Expected: 全部測試通過，兩個 Next.js build 成功；`frontend/out/icons/192`、`frontend/out/icons/512` 與九個 `frontend/out/splash/*` 都存在。

- [ ] **Step 2: 檢查輸出圖片**

以本機圖片檢視 192 icon、512 maskable icon、1290×2796 splash，確認五根紅 K 棒、金色趨勢線、安全邊界與「台股追蹤」文字沒有裁切。

- [ ] **Step 3: 手機瀏覽器驗收**

以 390×844 開啟 Cloudflare frontend 本機頁面，確認首頁渲染正常、manifest link 存在且 console 無 error。

- [ ] **Step 4: 交叉審查**

提供 `origin/main...HEAD` diff、規格、風險與驗收結果給獨立審查；Critical／Important finding 必須先修正再發布。

- [ ] **Step 5: 推送與合併**

推送 `codex/cloudflare-frontend`，建立 ready PR 合併至 `main`，不得 force push。

- [ ] **Step 6: 驗收 Cloudflare Production**

確認 deployment source 為新的 `main` commit 且狀態為 `Active`；正式網域的 `/manifest.webmanifest`、`/icons/192`、`/icons/512`、九個 `/splash/<size>`、`/sw.js`、`/api/health` 全部回應 HTTP 200，並以手機寬度實開首頁確認 console 無 error。
