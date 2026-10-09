// 瀏覽器與伺服器共用的最小診斷契約，不含原始錯誤、堆疊或個人內容。
const ROUTES = ["home", "search", "alerts", "stock", "other"] as const;
const KINDS = ["runtime", "promise", "hydration", "render"] as const;
export type DiagnosticRoute = typeof ROUTES[number];
export type DiagnosticKind = typeof KINDS[number];
export interface DiagnosticContext {
  route: DiagnosticRoute;
  entryRoute: DiagnosticRoute;
  online: boolean;
  mobile: boolean;
  serviceWorker: boolean;
}
export interface ClientDiagnostic extends DiagnosticContext {
  schema: 1;
  kind: DiagnosticKind;
  code: "418" | null;
  digest: string | null;
}

export function diagnosticRoute(path: string): DiagnosticRoute {
  const pathname = path.split(/[?#]/, 1)[0];
  if (pathname === "/") return "home";
  if (pathname === "/search") return "search";
  if (pathname === "/alerts") return "alerts";
  if (/^\/stock\/[0-9]{4,6}$/.test(pathname)) return "stock";
  return "other";
}

export function parseClientDiagnostic(value: unknown): ClientDiagnostic | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.schema !== 1 || !KINDS.includes(row.kind as DiagnosticKind)
    || !ROUTES.includes(row.route as DiagnosticRoute) || !ROUTES.includes(row.entryRoute as DiagnosticRoute)
    || typeof row.online !== "boolean" || typeof row.mobile !== "boolean" || typeof row.serviceWorker !== "boolean"
    || (row.code !== null && row.code !== "418")
    || (row.digest !== null && (typeof row.digest !== "string" || !/^\d{1,20}$/.test(row.digest)))) return null;
  return {
    schema: 1, kind: row.kind as DiagnosticKind, route: row.route as DiagnosticRoute,
    entryRoute: row.entryRoute as DiagnosticRoute, online: row.online, mobile: row.mobile,
    serviceWorker: row.serviceWorker, code: row.code as "418" | null, digest: row.digest as string | null,
  };
}

export function createClientReporter(
  readContext: () => DiagnosticContext,
  send: (data: ClientDiagnostic) => void
) {
  const seen = new Set<string>();
  return (kind: DiagnosticKind, error: unknown) => {
    try {
      if (seen.size >= 5) return;
      // 跨視窗 Error 不通過本視窗的 instanceof；僅讀必要欄位且由外層捕捉存取失敗。
      const record = error !== null && typeof error === "object" ? error as Record<string, unknown> : null;
      const message = typeof record?.message === "string" ? record.message : "";
      const hydration = /Minified React error #418\b|react\.dev\/errors\/418\b|Hydration failed because/.test(message);
      const rawDigest = record?.digest;
      const digest = typeof rawDigest === "string" && /^\d{1,20}$/.test(rawDigest) ? rawDigest : null;
      const data: ClientDiagnostic = {
        schema: 1, ...readContext(), kind: hydration ? "hydration" : kind,
        code: hydration ? "418" : null, digest,
      };
      const key = JSON.stringify(data);
      if (seen.has(key)) return;
      seen.add(key);
      send(data);
    } catch {
      // 診斷本身的失敗不能中斷頁面，也不能再次產生診斷迴圈。
    }
  };
}

let browserReporter: ReturnType<typeof createClientReporter> | undefined;

export function reportClientError(kind: DiagnosticKind, error: unknown): void {
  browserReporter?.(kind, error);
}

export function installClientDiagnostics(): void {
  if (typeof window === "undefined" || browserReporter) return;
  const entryRoute = diagnosticRoute(window.location.pathname);
  browserReporter = createClientReporter(() => ({
    route: diagnosticRoute(window.location.pathname), entryRoute,
    online: navigator.onLine, mobile: window.innerWidth < 768,
    serviceWorker: Boolean(navigator.serviceWorker?.controller),
  }), (data) => {
    // 不重試回報；回報失敗不輸出例外或攔截原始 console。
    void fetch("/api/client-diagnostics", {
      method: "POST", credentials: "same-origin", keepalive: true,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).catch(() => {});
  });
  window.addEventListener("error", (event) => reportClientError("runtime", event.error));
  window.addEventListener("unhandledrejection", (event) => reportClientError("promise", event.reason));
}
