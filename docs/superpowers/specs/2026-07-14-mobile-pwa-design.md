# Spec: 手機離線 PWA

## Objective

讓 `https://twstock.xiehnet.com` 可安裝到 Android 與 iPhone 主畫面，並在離線時開啟已快取的介面。股票與 API 資料在離線時必須清楚標示可能不是最新；網路恢復後，畫面會自動重新取得資料。

## Tech Stack

- Next.js 靜態輸出，部署於 Cloudflare Pages。
- Cloudflare Pages Functions 將 `/api/*` 代理至 Zeabur。
- 原生 Service Worker；不新增第三方 PWA 套件。

## Commands

```bash
npm test
npm run build
npm --prefix frontend run build
```

## Project Structure

- `frontend/app/`：Cloudflare 靜態前端入口與 manifest。
- `frontend/public/`：Service Worker、PWA 圖示與靜態離線資源。
- `components/`：安裝提示與連線狀態 UI。
- `tests/`：PWA 靜態設定與快取策略的自動測試。

## Design

### 安裝

- 提供 Web App Manifest、192px／512px 圖示、`standalone` 顯示模式與 Apple Web App 中繼資料。
- Android／Chrome 收到 `beforeinstallprompt` 時顯示既有安裝提示。
- iPhone／Safari 不支援該事件時，於手機瀏覽器顯示簡短「分享 → 加入主畫面」指引；已安裝時不顯示。

### 離線與更新

- Service Worker 預快取 App shell（首頁、靜態 JS、CSS、圖示與離線頁）。
- 網頁導覽採「網路優先，失敗時回傳快取介面」；首次完全離線時提供離線頁。
- `/api/*` 採網路優先；離線時僅使用先前成功回應的短期快取，並由介面提示資料可能過期。
- 收到 `online` 事件後，通知頁面並重新驗證／重新抓取既有資料。
- 快取名稱帶版本號；新 Service Worker 啟用時會清除舊快取，避免發布後仍開到舊版。

### 使用者提示

- 離線時顯示固定但不遮擋操作的狀態列。
- 顯示最新資料時間；離線快取資料顯示「快取資料」與「恢復連線後將自動更新」。
- 不離線保存登入密碼、環境變數或其他敏感資料。

## Code Style

```ts
const CACHE_VERSION = "twstock-pwa-v1";

function isApiRequest(request: Request) {
  return new URL(request.url).pathname.startsWith("/api/");
}
```

- TypeScript 採既有嚴格型別設定。
- 元件訊息使用繁體中文。
- API 回應不得假裝是即時資料；離線快取必須可辨識。

## Testing Strategy

- 自動測試驗證 manifest、Service Worker 註冊、快取策略與離線提示條件。
- 執行根目錄測試、根目錄建置與 Cloudflare 前端建置。
- 使用瀏覽器驗收：手機尺寸下可安裝、離線介面可顯示、恢復網路後資料重新載入。

## Boundaries

- Always：保留 Cloudflare Pages Functions 的 `/api/*` 代理、明示資料快取狀態、每次修改後通過建置。
- Ask first：新增 Web Push 權限、資料庫 schema、第三方 PWA 服務或推播服務。
- Never：快取帳密、token、環境變數；將舊報價標示為即時；覆蓋使用者現有未提交的樣式或版面修改。

## Success Criteria

1. Android Chrome 與 iPhone Safari 可將網站加入主畫面，開啟後是獨立 App 模式。
2. 離線時已造訪過的首頁能開啟，且畫面清楚標示離線／快取狀態。
3. 恢復網路後，自動取得最新 API 資料並移除離線提示。
4. 新部署不會持續使用舊版靜態介面。
5. `npm test`、`npm run build`、`npm --prefix frontend run build` 全部通過。
