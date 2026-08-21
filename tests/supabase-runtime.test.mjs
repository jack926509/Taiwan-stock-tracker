import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const ORIGINAL_ENV = { ...process.env };
let importSequence = 0;

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function loadFreshSupabase() {
  importSequence += 1;
  return import(
    new URL(`../lib/supabase.ts?runtime-test=${importSequence}`, import.meta.url)
  );
}

test("local mode keeps the existing null fallback when Supabase is not configured", async () => {
  delete process.env.CLOUDFLARE_WORKERS;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { getSupabase } = await loadFreshSupabase();

  assert.equal(getSupabase(), null);
});

test("Worker mode fails closed when either Supabase setting is missing, even after a local null was cached", async () => {
  delete process.env.CLOUDFLARE_WORKERS;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { getSupabase } = await loadFreshSupabase();
  assert.equal(getSupabase(), null);

  process.env.CLOUDFLARE_WORKERS = "true";
  for (const settings of [
    {},
    { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" },
    { SUPABASE_SERVICE_ROLE_KEY: "test-service-role" },
  ]) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    Object.assign(process.env, settings);

    assert.throws(
      () => getSupabase(),
      /Supabase runtime 設定不完整/,
    );
  }
});
