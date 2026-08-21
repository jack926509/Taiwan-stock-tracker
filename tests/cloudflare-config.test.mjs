import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const loadVerifier = () =>
  import(new URL("../scripts/verify-cloudflare-release.mjs", import.meta.url));

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

test("wrangler serves OpenNext assets and declares the production custom domain", () => {
  const config = read("wrangler.jsonc");
  assert.match(config, /"main":\s*"\.\/cloudflare-worker\.ts"/);
  assert.match(config, /"directory":\s*"\.open-next\/assets"/);
  const parsed = JSON.parse(config);
  assert.equal(parsed.workers_dev, true);
  assert.equal(parsed.assets?.run_worker_first, true);
  assert.equal(parsed.route, undefined);
  assert.deepEqual(parsed.routes, [
    {
      pattern: "twstock.xiehnet.com",
      custom_domain: true,
    },
  ]);
});

test("custom worker exposes fetch and scheduled handlers without password gating", () => {
  const worker = read("cloudflare-worker.ts");
  assert.match(worker, /async fetch\(/);
  assert.match(worker, /handler\.fetch\(request, env, ctx\)/);
  assert.doesNotMatch(worker, /APP_ACCESS_PASSWORD|authorizeWorkerRequest/);
  assert.match(worker, /async scheduled\(/);
  assert.match(worker, /ctx\.waitUntil\(/);
  assert.match(
    worker,
    /runScheduledCron\(event\.cron,\s*new Date\(event\.scheduledTime\)\)/,
  );
  assert.match(worker, /console\.error\("\[scheduled\] 執行失敗"\)/);
});

test("wrangler config registers the four UTC cron triggers", () => {
  const config = JSON.parse(read("wrangler.jsonc"));
  assert.deepEqual(config.triggers?.crons, [
    "* * * * MON-FRI",
    "35 5 * * MON-FRI",
    "0 9 * * MON-FRI",
    "30 4 * * SAT,SUN",
  ]);
});

test("worker workflow validates every push but uploads only after a successful manual dispatch", () => {
  const workflow = read(".github/workflows/cloudflare-worker.yml");
  const validate = workflow.match(
    /  validate:\n[\s\S]*?(?=\n  upload-preview:)/,
  )?.[0];
  const upload = workflow.match(/  upload-preview:\n[\s\S]*$/)?.[0];

  assert.ok(validate, "workflow 必須有 validate job");
  assert.ok(upload, "workflow 必須有 upload-preview job");
  assert.match(workflow, /\n  push:/);
  assert.match(workflow, /\n  workflow_dispatch:/);

  const validationCommands = [
    "npm ci",
    "npm test",
    "npm run build",
    "npm run cf:build",
  ];
  let previousIndex = -1;
  for (const command of validationCommands) {
    const index = validate.indexOf(`run: ${command}`);
    assert.ok(index > previousIndex, `validate 必須依序執行 ${command}`);
    previousIndex = index;
  }
  assert.doesNotMatch(validate, /npm run cf:upload/);

  assert.match(upload, /needs:\s*validate/);
  assert.match(
    upload,
    /github\.event_name\s*==\s*'workflow_dispatch'\s*&&\s*needs\.validate\.result\s*==\s*'success'/,
  );
  assert.match(upload, /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/);
  assert.match(upload, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}/);
  assert.doesNotMatch(
    upload,
    /\n    env:\n/,
    "Cloudflare secrets 不可放在 upload-preview job env",
  );
  const uploadStep = upload.match(
    /      - name: 上傳 Worker 預覽版本\n[\s\S]*$/,
  )?.[0];
  assert.ok(uploadStep, "workflow 必須有唯一上傳 step");
  assert.match(uploadStep, /\n        env:\n/);
  assert.equal(upload.match(/^          CLOUDFLARE_API_TOKEN:/gm)?.length, 1);
  assert.equal(upload.match(/^          CLOUDFLARE_ACCOUNT_ID:/gm)?.length, 1);
  const uploadBuildIndex = upload.indexOf("run: npm run cf:build");
  const uploadCommandIndex = upload.indexOf("run: npm run cf:upload");
  assert.ok(uploadBuildIndex >= 0, "手動 upload job 必須在獨立 runner 重建");
  assert.ok(
    uploadBuildIndex < uploadCommandIndex,
    "手動 upload job 必須在獨立 runner 重建後才上傳",
  );
  assert.equal(workflow.match(/npm run cf:upload/g)?.length, 1);

  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(workflow, /custom[_ -]?domain/i);
  assert.doesNotMatch(workflow, /pages\s+delete|delete\s+pages/i);
  assert.doesNotMatch(workflow, /zeabur/i);
});

test("legacy Pages deployment and Zeabur API proxy are removed", () => {
  for (const path of [
    ".github/workflows/cloudflare-pages.yml",
    "frontend/functions/api/[[path]].ts",
    "frontend/lib/apiProxy.ts",
  ]) {
    assert.equal(
      existsSync(new URL(`../${path}`, import.meta.url)),
      false,
      `${path} 不應再存在`,
    );
  }

  const routes = JSON.parse(read("frontend/public/_routes.json"));
  assert.deepEqual(routes.include, ["/stock/*"]);
});

test("Cloudflare verifier declares the public endpoint and timeout contract without app-password secrets", () => {
  const pkg = JSON.parse(read("package.json"));
  const verifier = read("scripts/verify-cloudflare-release.mjs");

  assert.equal(pkg.scripts["verify:cloudflare"], "node scripts/verify-cloudflare-release.mjs");
  assert.deepEqual(verifier.match(/process\.env\.[A-Z0-9_]+/g), [
    "process.env.VERIFY_BASE_URL",
    "process.env.VERIFY_HEALTH_DETAIL_TOKEN",
  ]);
  assert.doesNotMatch(verifier, /VERIFY_APP_ACCESS_PASSWORD|\.env\.local|dotenv|readFile/i);
  assert.match(verifier, /AbortSignal\.timeout\(15_000\)/);
  assert.match(verifier, /response\.ok/);
  assert.match(verifier, /redirect:\s*"manual"/);
});

test("Cloudflare verifier checks the public site, Supabase watchlist, and protected detailed health", async () => {
  const { verifyCloudflareRelease } = await loadVerifier();
  const requests = [];

  await verifyCloudflareRelease("https://release.invalid/base?private=value", {
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      const endpoint = `${parsed.pathname}${parsed.search}`;
      requests.push({ endpoint, options });
      if (endpoint === "/api/watchlist") {
        return { ok: true, status: 200, json: async () => ({ items: [], storage: "supabase" }) };
      }
      if (endpoint === "/api/health?detail=1") {
        return { ok: true, status: 200, json: async () => ({ ok: true, storage: "supabase" }) };
      }
      return { ok: true, status: 200 };
    },
    log: () => {},
    healthDetailToken: "health-secret",
  });

  assert.deepEqual(requests.map(({ endpoint }) => endpoint), [
    "/", "/api/health", "/api/watchlist", "/api/health?detail=1",
    "/manifest.webmanifest", "/sw.js", "/offline.html", "/icons/192", "/icons/512",
  ]);
  const detailRequest = requests.find(({ endpoint }) => endpoint === "/api/health?detail=1");
  assert.equal(detailRequest.options.headers.Authorization, "Bearer health-secret");
  assert.equal(requests.some(({ options }) => options.headers?.Cookie), false);
});

test("Cloudflare verifier requires the detailed-health token before making requests", async () => {
  const { verifyCloudflareRelease } = await loadVerifier();
  let requestCount = 0;
  await assert.rejects(
    () => verifyCloudflareRelease("https://release.invalid", {
      fetchImpl: async () => { requestCount += 1; return { ok: true, status: 200 }; },
      log: () => {},
    }),
    /VERIFY_HEALTH_DETAIL_TOKEN 未設定/,
  );
  assert.equal(requestCount, 0);
});

test("Cloudflare verifier rejects a local-storage watchlist despite HTTP 200", async () => {
  const { verifyCloudflareRelease } = await loadVerifier();
  await assert.rejects(
    () => verifyCloudflareRelease("https://release.invalid", {
      fetchImpl: async (url) => {
        const endpoint = new URL(url).pathname;
        if (endpoint === "/api/watchlist") {
          return { ok: true, status: 200, json: async () => ({ items: [], storage: "local" }) };
        }
        return { ok: true, status: 200 };
      },
      log: () => {},
      healthDetailToken: "health-secret",
    }),
    /\/api\/watchlist: 未使用 Supabase/,
  );
});
