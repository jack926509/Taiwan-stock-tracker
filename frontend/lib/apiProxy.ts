const BACKEND_ORIGIN = "https://tw-stock-tracker.zeabur.app";

const EXCLUDED_REQUEST_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function forwardedHeaders(headers: Headers): Headers {
  const result = new Headers();
  for (const [name, value] of headers) {
    if (EXCLUDED_REQUEST_HEADERS.has(name) || name.startsWith("cf-")) continue;
    result.set(name, value);
  }
  return result;
}

export function toBackendRequest(request: Request): Request {
  const incoming = new URL(request.url);
  if (!incoming.pathname.startsWith("/api/")) {
    throw new Error("只允許代理 API 路徑");
  }

  const target = new URL(`${incoming.pathname}${incoming.search}`, BACKEND_ORIGIN);
  return new Request(target, {
    method: request.method,
    headers: forwardedHeaders(request.headers),
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });
}

export async function proxyApiRequest(
  request: Request,
  fetcher: typeof fetch = fetch
): Promise<Response> {
  const upstream = await fetcher(toBackendRequest(request));
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}
