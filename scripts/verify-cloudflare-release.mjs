import { pathToFileURL } from "node:url";

const ENDPOINTS = Object.freeze([
  "/",
  "/login",
  "/api/health",
  "/manifest.webmanifest",
  "/sw.js",
]);

function parseBaseUrl(baseUrl) {
  if (!baseUrl) {
    throw new Error("VERIFY_BASE_URL 未設定");
  }

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("VERIFY_BASE_URL 格式無效");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("VERIFY_BASE_URL 只允許 HTTP 或 HTTPS");
  }

  return `${parsed.protocol}//${parsed.host}/`;
}

function connectionResult(error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return "連線逾時（15 秒）";
  }
  if (error instanceof TypeError) {
    return "連線失敗";
  }
  return "請求失敗";
}

export async function verifyCloudflareRelease(
  baseUrl,
  { fetchImpl = globalThis.fetch, log = console.log } = {},
) {
  const rootUrl = parseBaseUrl(baseUrl);

  for (const endpoint of ENDPOINTS) {
    let response;
    try {
      response = await fetchImpl(new URL(endpoint, rootUrl), {
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new Error(`${endpoint}: ${connectionResult(error)}`);
    }

    if (!response.ok) {
      throw new Error(`${endpoint}: HTTP ${response.status}`);
    }

    log(`[通過] ${endpoint}: HTTP ${response.status}`);
  }
}

const isCommandLine =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCommandLine) {
  try {
    await verifyCloudflareRelease(process.env.VERIFY_BASE_URL);
  } catch (error) {
    console.error(`[失敗] ${error.message}`);
    process.exitCode = 1;
  }
}
