import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("package exposes OpenNext build, preview and upload commands", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["cf:build"], "opennextjs-cloudflare build");
  assert.equal(pkg.scripts["cf:preview"], "opennextjs-cloudflare preview");
  assert.equal(pkg.scripts["cf:upload"], "opennextjs-cloudflare upload");
  assert.equal(
    pkg.scripts["cf:types"],
    "wrangler types --env-interface CloudflareEnv --include-runtime false",
  );
  assert.ok(pkg.devDependencies["@opennextjs/cloudflare"]);
  assert.ok(pkg.devDependencies.wrangler);
});

test("wrangler serves OpenNext assets without a production custom domain", () => {
  const config = read("wrangler.jsonc");
  assert.match(config, /"main":\s*"\.\/\.open-next\/worker\.js"/);
  assert.match(config, /"directory":\s*"\.open-next\/assets"/);
  const parsed = JSON.parse(config);
  assert.equal(parsed.workers_dev, true);
  assert.equal(parsed.route, undefined);
  assert.equal(parsed.routes, undefined);
});
