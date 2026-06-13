#!/usr/bin/env node
// Phase 0 決策 Gate：MIS 連線 smoke test（計劃書 §2.4）
//
// 用法：
//   本機直打 MIS（驗證台灣 IP 基準線）：
//     node scripts/smoke-test.mjs --minutes 5
//   實測部署節點（真正的 Gate：海外 egress IP 能否穩定打 MIS）：
//     node scripts/smoke-test.mjs --url https://xxx.vercel.app --minutes 5 [--password <APP_ACCESS_PASSWORD>]
//
// 判定：成功率 >= 95% → 免費路線（Vercel）；否則 → 穩定路線（Zeabur 常駐）

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

const baseUrl = arg("url", null);
const minutes = parseFloat(arg("minutes", "5"));
const intervalSec = Math.max(5, parseFloat(arg("interval", "10")));
const password = arg("password", null);

const MIS_BASE = "https://mis.twse.com.tw/stock/api";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Referer: "https://mis.twse.com.tw/stock/",
  Accept: "application/json",
};
const EX_CH = "tse_2330.tw|otc_6488.tw|tse_t00.tw|otc_o00.tw";

let cookie = "";
let authCookie = "";

async function createMisSession() {
  const res = await fetch(`${MIS_BASE}/getStock.jsp?ch=2330.tw&json=1&_=${Date.now()}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("無法取得 MIS session cookie");
}

async function loginDeployedApp() {
  const res = await fetch(`${baseUrl}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`登入失敗 HTTP ${res.status}`);
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  authCookie = setCookies.map((c) => c.split(";")[0]).join("; ");
}

async function probeOnce() {
  const start = performance.now();
  try {
    let ok = false;
    let detail = "";
    if (baseUrl) {
      const res = await fetch(`${baseUrl}/api/quote?ids=2330,6488`, {
        headers: authCookie ? { Cookie: authCookie } : {},
        signal: AbortSignal.timeout(10000),
      });
      const json = await res.json().catch(() => ({}));
      ok = res.ok && Array.isArray(json.quotes) && json.quotes.length > 0 && json.source === "mis";
      detail = ok ? "" : `HTTP ${res.status} source=${json.source ?? "?"}`;
    } else {
      const res = await fetch(
        `${MIS_BASE}/getStockInfo.jsp?ex_ch=${encodeURIComponent(EX_CH)}&json=1&delay=0&_=${Date.now()}`,
        { headers: { ...HEADERS, Cookie: cookie }, signal: AbortSignal.timeout(10000) }
      );
      const json = await res.json().catch(() => ({}));
      ok = res.ok && json.rtcode === "0000" && Array.isArray(json.msgArray) && json.msgArray.length > 0;
      detail = ok ? "" : `HTTP ${res.status} rtcode=${json.rtcode ?? "?"}`;
      if (!ok) await createMisSession().catch(() => {});
    }
    return { ok, latencyMs: performance.now() - start, detail };
  } catch (err) {
    return { ok: false, latencyMs: performance.now() - start, detail: String(err.message ?? err) };
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

const mode = baseUrl ? `部署節點 ${baseUrl}` : "本機直打 MIS";
console.log(`=== MIS smoke test｜${mode}｜${minutes} 分鐘，每 ${intervalSec} 秒 1 次 ===\n`);

if (!baseUrl) await createMisSession();
else if (password) await loginDeployedApp();

const results = [];
const deadline = Date.now() + minutes * 60 * 1000;
let i = 0;
while (Date.now() < deadline) {
  i += 1;
  const r = await probeOnce();
  results.push(r);
  const mark = r.ok ? "✓" : "✗";
  console.log(
    `[${new Date().toLocaleTimeString("zh-TW", { hour12: false })}] #${String(i).padStart(3)} ${mark} ${r.latencyMs.toFixed(0)}ms ${r.detail}`
  );
  const remaining = deadline - Date.now();
  if (remaining <= 0) break;
  await new Promise((res) => setTimeout(res, Math.min(intervalSec * 1000, remaining)));
}

const okResults = results.filter((r) => r.ok);
const successRate = results.length ? okResults.length / results.length : 0;
const latencies = okResults.map((r) => r.latencyMs).sort((a, b) => a - b);
const avg = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

const summary = {
  mode: baseUrl ? "deployed" : "direct",
  url: baseUrl,
  finishedAt: new Date().toISOString(),
  attempts: results.length,
  success: okResults.length,
  successRate: +(successRate * 100).toFixed(1),
  avgLatencyMs: +avg.toFixed(0),
  p95LatencyMs: +percentile(latencies, 95).toFixed(0),
  maxLatencyMs: +(latencies[latencies.length - 1] ?? 0).toFixed(0),
  verdict:
    successRate >= 0.95
      ? "PASS → 免費路線（Vercel）"
      : "FAIL → 穩定路線（Zeabur 常駐）",
  failures: results.filter((r) => !r.ok).map((r) => r.detail).slice(0, 10),
};

console.log("\n=== 結果 ===");
console.log(`嘗試次數：${summary.attempts}`);
console.log(`成功次數：${summary.success}（成功率 ${summary.successRate}%）`);
console.log(`延遲：平均 ${summary.avgLatencyMs}ms｜p95 ${summary.p95LatencyMs}ms｜最大 ${summary.maxLatencyMs}ms`);
console.log(`判定（門檻 95%）：${summary.verdict}`);

const { writeFileSync } = await import("node:fs");
const { fileURLToPath } = await import("node:url");
const { dirname, join } = await import("node:path");
const outPath = join(dirname(fileURLToPath(import.meta.url)), "smoke-result.json");
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(`\n結果已寫入 ${outPath}`);
