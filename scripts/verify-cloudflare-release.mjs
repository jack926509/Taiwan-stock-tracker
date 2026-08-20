import { pathToFileURL } from "node:url";

const ENDPOINTS = Object.freeze([
  "/",
  "/login",
  "/api/health",
]);

const STATIC_ENDPOINTS = Object.freeze(["/manifest.webmanifest", "/sw.js"]);

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

function requireVerifierSecret(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} 未設定`);
  }
  return value;
}

async function readJson(response, endpoint) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${endpoint}: JSON 格式無效`);
  }
}

function authCookie(response) {
  const setCookie = response.headers?.get?.("set-cookie") ?? "";
  const match = setCookie.match(/(?:^|,\s*)app_auth=([^;,\s]+)/);
  if (!match) {
    throw new Error("/api/auth: 缺少驗證 cookie");
  }
  return `app_auth=${match[1]}`;
}

export async function verifyCloudflareRelease(
  baseUrl,
  {
    fetchImpl = globalThis.fetch,
    log = console.log,
    appPassword,
    healthDetailToken,
  } = {},
) {
  const rootUrl = parseBaseUrl(baseUrl);
  const verifiedAppPassword = requireVerifierSecret(
    appPassword,
    "VERIFY_APP_ACCESS_PASSWORD",
  );
  const verifiedHealthToken = requireVerifierSecret(
    healthDetailToken,
    "VERIFY_HEALTH_DETAIL_TOKEN",
  );

  const request = async (endpoint, init = {}) => {
    let response;
    try {
      response = await fetchImpl(new URL(endpoint, rootUrl), {
        ...init,
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new Error(`${endpoint}: ${connectionResult(error)}`);
    }

    if (!response.ok) {
      throw new Error(`${endpoint}: HTTP ${response.status}`);
    }

    log(`[通過] ${endpoint}: HTTP ${response.status}`);
    return response;
  };

  for (const endpoint of ENDPOINTS) {
    await request(endpoint);
  }

  const loginResponse = await request("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: verifiedAppPassword }),
  });
  const cookie = authCookie(loginResponse);

  const watchlistResponse = await request("/api/watchlist", {
    headers: { Cookie: cookie },
  });
  const watchlist = await readJson(watchlistResponse, "/api/watchlist");
  if (!Array.isArray(watchlist?.items) || watchlist.storage !== "supabase") {
    throw new Error("/api/watchlist: 未使用 Supabase");
  }

  const detailEndpoint = "/api/health?detail=1";
  const detailResponse = await request(detailEndpoint, {
    headers: { Authorization: `Bearer ${verifiedHealthToken}` },
  });
  const detail = await readJson(detailResponse, detailEndpoint);
  if (detail?.ok !== true || detail.storage !== "supabase") {
    throw new Error(`${detailEndpoint}: 詳細健康檢查未使用 Supabase`);
  }

  for (const endpoint of STATIC_ENDPOINTS) {
    await request(endpoint);
  }
}

export async function runVerifierCli({
  baseUrl = process.env.VERIFY_BASE_URL,
  appPassword = process.env.VERIFY_APP_ACCESS_PASSWORD,
  healthDetailToken = process.env.VERIFY_HEALTH_DETAIL_TOKEN,
  fetchImpl = globalThis.fetch,
  log = console.log,
  errorLog = console.error,
} = {}) {
  try {
    await verifyCloudflareRelease(baseUrl, {
      fetchImpl,
      log,
      appPassword,
      healthDetailToken,
    });
    return 0;
  } catch (error) {
    errorLog(`[失敗] ${error.message}`);
    return 1;
  }
}

const isCommandLine =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCommandLine) {
  process.exitCode = await runVerifierCli();
}
