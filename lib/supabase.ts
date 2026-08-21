import { createClient, SupabaseClient } from "@supabase/supabase-js";

// 僅供後端 Route Handler 使用（service key），前端永不引用本模組。
// 本機環境變數未設定時回傳 null；Worker 正式環境則必須明確失敗。
let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.CLOUDFLARE_WORKERS === "true" && (!url || !key)) {
    throw new Error("Supabase runtime 設定不完整");
  }
  if (client !== undefined) return client;
  client = url && key
    ? createClient(url, key, { auth: { persistSession: false } })
    : null;
  return client;
}
