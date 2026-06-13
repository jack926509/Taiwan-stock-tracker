import { createClient, SupabaseClient } from "@supabase/supabase-js";

// 僅供後端 Route Handler 使用（service key），前端永不引用本模組。
// 環境變數未設定時回傳 null，呼叫端需自行降級處理。
let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}
