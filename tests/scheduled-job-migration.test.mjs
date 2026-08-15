import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("scheduled job migration is additive and service-role only", () => {
  const sql = readFileSync(
    new URL(
      "../supabase/migrations/20260815000000_add_scheduled_job_state.sql",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(sql, /create table if not exists public\.scheduled_job_state/);
  assert.match(sql, /primary key \(job_name\)/);
  assert.match(
    sql,
    /alter table public\.scheduled_job_state enable row level security/
  );
  assert.match(
    sql,
    /grant all on table public\.scheduled_job_state to service_role/
  );
  assert.match(sql, /create or replace function public\.claim_scheduled_job/);
  assert.match(
    sql,
    /where public\.scheduled_job_state\.lease_until <= now\(\)/
  );
  assert.match(sql, /create or replace function public\.finish_scheduled_job/);
  assert.equal(sql.match(/security definer\s+set search_path = public/g)?.length, 2);
  assert.match(
    sql,
    /where job_name = p_job_name\s+and run_id = p_run_id/
  );
  assert.match(
    sql,
    /revoke execute on function public\.claim_scheduled_job\(text, uuid, integer\)\s+from public, anon, authenticated/
  );
  assert.match(
    sql,
    /revoke execute on function public\.finish_scheduled_job\(text, uuid, text, jsonb\)\s+from public, anon, authenticated/
  );
  assert.match(
    sql,
    /grant execute on function public\.claim_scheduled_job\(text, uuid, integer\)\s+to service_role/
  );
  assert.match(
    sql,
    /grant execute on function public\.finish_scheduled_job\(text, uuid, text, jsonb\)\s+to service_role/
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.(?:claim|finish)_scheduled_job[\s\S]*?to (?:public|anon|authenticated)/i
  );
  assert.doesNotMatch(
    sql,
    /\b(drop|truncate|delete from|alter table public\.(watchlist|daily_kline|news_cache|mis_session))\b/i
  );
});
