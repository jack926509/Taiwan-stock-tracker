import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase.ts";

export type ScheduledJobName =
  | "alerts"
  | "daily-summary"
  | "backfill"
  | "keep-alive";

export type ScheduledJobResult = {
  status: "ok" | "error";
  detail: Record<string, string | number | boolean | null>;
};

type ScheduledJobDb = Pick<SupabaseClient, "rpc">;

function requireSupabase(
  db: ScheduledJobDb | undefined,
  action: "取得排程鎖定" | "記錄排程完成"
): ScheduledJobDb {
  const client = db ?? getSupabase();
  if (!client) {
    throw new Error(`未設定 Supabase，無法${action}`);
  }
  return client;
}

function safeErrorMessage(error: unknown): string {
  const rawMessage =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : "未知錯誤";

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return rawMessage;
  return rawMessage.replaceAll(secret, "[已隱藏]");
}

export async function claimScheduledJob(
  jobName: ScheduledJobName,
  runId: string,
  leaseSeconds: number,
  db?: ScheduledJobDb
): Promise<boolean> {
  const client = requireSupabase(db, "取得排程鎖定");
  const { data, error } = await client.rpc("claim_scheduled_job", {
    p_job_name: jobName,
    p_run_id: runId,
    p_lease_seconds: leaseSeconds,
  });

  if (error) {
    throw new Error(`排程鎖定失敗：${safeErrorMessage(error)}`);
  }
  return data === true;
}

export async function finishScheduledJob(
  jobName: ScheduledJobName,
  runId: string,
  result: ScheduledJobResult,
  db?: ScheduledJobDb
): Promise<void> {
  const client = requireSupabase(db, "記錄排程完成");
  const { error } = await client.rpc("finish_scheduled_job", {
    p_job_name: jobName,
    p_run_id: runId,
    p_status: result.status,
    p_detail: result.detail,
  });

  if (error) {
    throw new Error(`排程完成記錄失敗：${safeErrorMessage(error)}`);
  }
}
