"use client";

import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";
import { useToast } from "@/components/Toast";

// 加入自選的共用邏輯（原 AddStockForm 的 POST /api/watchlist、錯誤處理與成功回饋）。
// onAdded 有給就由呼叫端負責重新整理（首頁傳 refreshAll）；沒給就只刷新自選清單快取。
export function useAddToWatchlist(onAdded?: () => void | Promise<unknown>) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [busyId, setBusyId] = useState<string | null>(null);

  const add = useCallback(
    async (stockId: string): Promise<boolean> => {
      if (busyId) return false;
      setBusyId(stockId);
      try {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stockId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.show(json.error ?? "新增失敗", { tone: "error" });
          return false;
        }
        toast.show(`已加入 ${json.item?.name ?? stockId}`, { tone: "success" });
        if (onAdded) await onAdded();
        else await mutate("/api/watchlist");
        return true;
      } catch {
        toast.show("連線失敗，請再試一次", { tone: "error" });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [busyId, mutate, onAdded, toast]
  );

  return { add, busyId };
}
