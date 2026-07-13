import assert from "node:assert/strict";
import test from "node:test";
import { proxyApiRequest, toBackendRequest } from "../frontend/lib/apiProxy.ts";

test("保留 API 路徑與查詢字串並轉送至 Zeabur", () => {
  const request = new Request("https://twstock.xiehnet.com/api/health?detail=1", {
    headers: { Cookie: "app_auth=example", Host: "twstock.xiehnet.com" },
  });

  const target = toBackendRequest(request);

  assert.equal(target.url, "https://tw-stock-tracker.zeabur.app/api/health?detail=1");
  assert.equal(target.headers.get("cookie"), "app_auth=example");
  assert.equal(target.headers.get("host"), null);
});

test("拒絕非 API 路徑，避免 Function 成為任意代理", () => {
  assert.throws(
    () => toBackendRequest(new Request("https://twstock.xiehnet.com/stock/2330")),
    /API/
  );
});

test("保留 Zeabur 回應的狀態與本文", async () => {
  const request = new Request("https://twstock.xiehnet.com/api/health");
  const fetcher = async (target) => {
    assert.equal(target.url, "https://tw-stock-tracker.zeabur.app/api/health");
    return new Response('{"ok":true}', {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const response = await proxyApiRequest(request, fetcher);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"ok":true}');
});
