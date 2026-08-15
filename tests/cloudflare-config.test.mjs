import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("wrangler serves OpenNext assets without a production custom domain", () => {
  const config = read("wrangler.jsonc");
  assert.match(config, /"main":\s*"\.\/cloudflare-worker\.ts"/);
  assert.match(config, /"directory":\s*"\.open-next\/assets"/);
  const parsed = JSON.parse(config);
  assert.equal(parsed.workers_dev, true);
  assert.equal(parsed.route, undefined);
  assert.equal(parsed.routes, undefined);
});

test("custom worker exposes fetch and scheduled handlers", () => {
  const worker = read("cloudflare-worker.ts");
  assert.match(worker, /fetch:\s*handler\.fetch/);
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
    "* * * * 1-5",
    "35 5 * * 1-5",
    "0 9 * * 1-5",
    "30 4 * * 0,6",
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

test("Cloudflare verifier declares the public endpoint and timeout contract without reading secrets", () => {
  const pkg = JSON.parse(read("package.json"));
  const verifier = read("scripts/verify-cloudflare-release.mjs");

  assert.equal(
    pkg.scripts["verify:cloudflare"],
    "node scripts/verify-cloudflare-release.mjs",
  );
  assert.deepEqual(verifier.match(/process\.env\.[A-Z0-9_]+/g), [
    "process.env.VERIFY_BASE_URL",
  ]);
  assert.doesNotMatch(verifier, /\.env\.local|dotenv|readFile/i);
  assert.match(verifier, /AbortSignal\.timeout\(15_000\)/);
  assert.match(verifier, /response\.ok/);
  assert.match(verifier, /process\.exitCode\s*=\s*1/);

  const endpoints = [
    '"/"',
    '"/login"',
    '"/api/health"',
    '"/manifest.webmanifest"',
    '"/sw.js"',
  ];
  let previousIndex = -1;
  for (const endpoint of endpoints) {
    const index = verifier.indexOf(endpoint);
    assert.ok(index > previousIndex, `${endpoint} 必須以指定順序出現`);
    previousIndex = index;
  }
});

test("Cloudflare verifier checks all endpoints sequentially on success", async () => {
  const { verifyCloudflareRelease } = await loadVerifier();
  const requests = [];
  const messages = [];

  await verifyCloudflareRelease("https://release.invalid/base?private=value", {
    fetchImpl: async (url, options) => {
      requests.push(new URL(url).pathname);
      assert.ok(options.signal instanceof AbortSignal);
      return { ok: true, status: 200 };
    },
    log: (message) => messages.push(message),
  });

  assert.deepEqual(requests, [
    "/",
    "/login",
    "/api/health",
    "/manifest.webmanifest",
    "/sw.js",
  ]);
  assert.equal(messages.length, 5);
  assert.doesNotMatch(messages.join("\n"), /release\.invalid|private=value/);
});

test("Cloudflare verifier stops at the first non-2xx response without leaking the base URL", async () => {
  const { verifyCloudflareRelease } = await loadVerifier();
  const requests = [];
  const baseUrl = "https://do-not-print.invalid/?secret=private";

  await assert.rejects(
    () =>
      verifyCloudflareRelease(baseUrl, {
        fetchImpl: async (url) => {
          const endpoint = new URL(url).pathname;
          requests.push(endpoint);
          return {
            ok: endpoint !== "/login",
            status: endpoint === "/login" ? 503 : 200,
          };
        },
        log: () => {},
      }),
    (error) => {
      assert.match(error.message, /\/login.*HTTP 503/);
      assert.doesNotMatch(error.message, /do-not-print|secret=private/);
      return true;
    },
  );
  assert.deepEqual(requests, ["/", "/login"]);
});
