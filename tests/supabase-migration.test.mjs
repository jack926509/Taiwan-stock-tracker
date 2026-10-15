import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
const migrations = files
  .map((file) => readFileSync(new URL(file, migrationsDir), "utf8"))
  .join("\n");

test("migration defines all backend storage tables", () => {
  for (const table of [
    "watchlist",
    "daily_kline",
    "news_cache",
    "mis_session",
    "assistant_conversations",
    "assistant_messages",
    "news_articles",
    "scheduled_job_state",
  ]) {
    assert.match(migrations, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migrations, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migrations, new RegExp(`grant all on table public\\.${table} to service_role`));
  }
});

test("保留既有 Supabase migration 歷史，新增 migration 與正式套用版本一致", () => {
  assert.deepEqual(files.slice(0, 7), [
    "20260612140245_init_taiwan_stock_tracker.sql",
    "20260613055604_enable_pg_cron_purge_expired_news_cache.sql",
    "20260613055617_comment_reserved_normalized_tables.sql",
    "20260613123937_add_alert_hit_timestamps.sql",
    "20260619130901_assistant_and_news.sql",
    "20260706134143_add_change_and_volume_alerts.sql",
    "20260815000000_add_scheduled_job_state.sql",
  ]);
  assert.deepEqual(files.slice(7), ["20261015060931_personal_alert_events.sql"]);
});

test("migrations include operational indexes and purge job", () => {
  assert.match(migrations, /idx_assistant_messages_conversation/);
  assert.match(migrations, /idx_news_articles_channel_published/);
  assert.match(migrations, /purge-expired-news-cache/);
});
