import { parseClientDiagnostic } from "@/lib/clientDiagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 1024;
let windowStarted = 0;
let received = 0;

export async function POST(request: Request): Promise<Response> {
  const noStore = { "Cache-Control": "no-store" };
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response(null, { status: 403, headers: noStore });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return new Response(null, { status: 415, headers: noStore });
  }
  // 限量僅作用於單一 Worker 執行個體，不儲存 IP 或其他識別資訊。
  const now = Date.now();
  if (now - windowStarted >= 60_000) { windowStarted = now; received = 0; }
  if (received >= 30) return new Response(null, { status: 429, headers: { ...noStore, "Retry-After": "60" } });
  received++;
  let value: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400, headers: noStore });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > MAX_BYTES) {
          void reader.cancel().catch(() => {});
          return new Response(null, { status: 413, headers: noStore });
        }
        chunks.push(chunk);
      }
    } finally { reader.releaseLock(); }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    value = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return new Response(null, { status: 400, headers: noStore });
  }
  const diagnostic = parseClientDiagnostic(value);
  if (!diagnostic) return new Response(null, { status: 400, headers: noStore });
  console.error("[client:diagnostic]", { ...diagnostic, receivedAt: new Date(now).toISOString() });
  return new Response(null, { status: 204, headers: noStore });
}
