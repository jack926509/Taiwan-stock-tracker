// Next.js 啟動鉤子。只在 Node.js runtime 載入 Node 專屬排程，
// 避免 node:fs/node:path 被打包進 Edge 版而 build 失敗（Next.js 官方建議的條件載入寫法）。
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
