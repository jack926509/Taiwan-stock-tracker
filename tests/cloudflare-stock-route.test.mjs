import assert from "node:assert/strict";
import test from "node:test";

test("個股 RSC 預載路徑回傳靜態 stock shell", async () => {
  const { onRequest } = await import("../frontend/functions/stock/[id]/[[path]].ts");
  let assetPath = "";
  const response = await onRequest({
    request: new Request("https://twstock.xiehnet.com/stock/2330/index.txt"),
    env: {
      ASSETS: {
        fetch(request) {
          assetPath = new URL(request.url).pathname;
          return Promise.resolve(new Response("stock shell"));
        },
      },
    },
  });

  assert.equal(assetPath, "/stock/index.txt");
  assert.equal(await response.text(), "stock shell");
});

test("個股深連結回傳 HTML 靜態 stock shell", async () => {
  const { onRequest } = await import("../frontend/functions/stock/[id]/[[path]].ts");
  let assetPath = "";
  await onRequest({
    request: new Request("https://twstock.xiehnet.com/stock/2330/"),
    env: {
      ASSETS: {
        fetch(request) {
          assetPath = new URL(request.url).pathname;
          return Promise.resolve(new Response("stock shell"));
        },
      },
    },
  });

  assert.equal(assetPath, "/stock/");
});
