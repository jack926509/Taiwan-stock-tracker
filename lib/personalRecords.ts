import { promises as fs } from "node:fs";
import path from "node:path";
import { getSupabase } from "@/lib/supabase";

export interface PersonalRecord<T> { key: string; data: T; fetchedAt: string }
const FILE = path.join(process.cwd(), ".data", "personal-records.json");
const NEVER_EXPIRE = "2099-12-31T00:00:00.000Z";
let localQueue: Promise<unknown> = Promise.resolve();
export function serialPersonalWrite<T>(work: () => Promise<T>): Promise<T> {
  const result = localQueue.then(work, work);
  localQueue = result.catch(() => undefined);
  return result;
}
async function readFile(): Promise<Record<string, PersonalRecord<unknown>>> {
  try {
    const value = JSON.parse(await fs.readFile(FILE, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("本機紀錄格式錯誤");
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("讀取個人紀錄失敗");
  }
}
export async function loadPersonalRecord<T>(key: string): Promise<PersonalRecord<T> | null> {
  const db = getSupabase();
  if (!db) return ((await readFile())[key] as PersonalRecord<T> | undefined) ?? null;
  const { data, error } = await db.from("news_cache").select("payload,fetched_at").eq("cache_key", key).maybeSingle();
  if (error) throw new Error("讀取個人紀錄失敗");
  return data ? { key, data: data.payload as T, fetchedAt: data.fetched_at } : null;
}
export async function savePersonalRecord<T>(key: string, data: T, at: Date): Promise<void> {
  const db = getSupabase();
  if (!db) {
    // 呼叫端需要多步驟同步時由 serialPersonalWrite 包住；單筆寫入也以 rename 避免半份 JSON。
    const records = await readFile();
    records[key] = { key, data, fetchedAt: at.toISOString() };
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(`${FILE}.tmp`, JSON.stringify(records), "utf8");
    await fs.rename(`${FILE}.tmp`, FILE);
    return;
  }
  const { error } = await db.from("news_cache").upsert({ cache_key: key, payload: data,
    fetched_at: at.toISOString(), expires_at: NEVER_EXPIRE });
  if (error) throw new Error("保存個人紀錄失敗");
}

export async function listPersonalRecords<T>(prefix: string, options: {
  from?: string; to?: string; offset?: number; limit?: number; states?: string[]; ascending?: boolean;
} = {}): Promise<{ items: PersonalRecord<T>[]; total: number }> {
  const { from, to, offset = 0, limit = 50, states, ascending = false } = options;
  const db = getSupabase();
  if (!db) {
    const records = Object.values(await readFile()).filter(record => record.key.startsWith(prefix)
      && (!from || record.fetchedAt >= from) && (!to || record.fetchedAt < to)
      && (!states || states.includes((record.data as { notification?: { state?: string } }).notification?.state ?? "")));
    records.sort((a, b) => (a.fetchedAt.localeCompare(b.fetchedAt) || a.key.localeCompare(b.key)) * (ascending ? 1 : -1));
    return { items: records.slice(offset, offset + limit) as PersonalRecord<T>[], total: records.length };
  }
  let query = db.from("news_cache").select("cache_key,payload,fetched_at", { count: "exact" }).like("cache_key", `${prefix}%`);
  if (from) query = query.gte("fetched_at", from);
  if (to) query = query.lt("fetched_at", to);
  if (states) query = query.in("payload->notification->>state", states);
  const { data, count, error } = await query.order("fetched_at", { ascending }).order("cache_key", { ascending }).range(offset, offset + limit - 1);
  if (error || typeof count !== "number") throw new Error("讀取個人紀錄列表失敗");
  return { items: (data ?? []).map(row => ({ key: row.cache_key, data: row.payload as T, fetchedAt: row.fetched_at })), total: count };
}
