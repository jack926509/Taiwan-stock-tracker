// @ts-ignore OpenNext 建置後才會產生此模組。
import handler from "./.open-next/worker.js";
import { runScheduledCron } from "./lib/scheduledJobs";
import { authorizeWorkerRequest } from "./lib/workerAuth";

interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

type ExportedHandler<Env> = {
  fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response>;
  scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): void | Promise<void>;
};

type WorkerEnv = CloudflareEnv & {
  APP_ACCESS_PASSWORD?: string;
};

export default {
  async fetch(request, env, ctx) {
    const authResponse = await authorizeWorkerRequest(
      request,
      env.APP_ACCESS_PASSWORD,
    );
    return authResponse ?? handler.fetch(request, env, ctx);
  },
  async scheduled(event, _env, ctx) {
    ctx.waitUntil(
      runScheduledCron(event.cron, new Date(event.scheduledTime)).catch(() => {
        // 只輸出固定訊息，避免例外內容夾帶密鑰進入日誌。
        console.error("[scheduled] 執行失敗");
      })
    );
  },
} satisfies ExportedHandler<WorkerEnv>;
