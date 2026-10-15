import type { Fundamental } from "./providers/fundamentalProvider.ts";

export const FUNDAMENTAL_KEYS = ["institutional", "revenue", "valuation", "eps", "dividend"] as const;
export type FundamentalKey = (typeof FUNDAMENTAL_KEYS)[number];
export interface DatasetFreshness {
  state: "ok" | "empty" | "stale" | "unavailable";
  lastSuccessAt: string | null;
}
export type CachedFundamental = Fundamental & {
  freshness?: Partial<Record<FundamentalKey, DatasetFreshness>>;
};

export function mergeFundamental(
  fresh: Fundamental,
  failed: readonly FundamentalKey[],
  cached: { data: CachedFundamental; fetchedAt: string } | null,
  now: Date
): CachedFundamental {
  const data: CachedFundamental = { ...fresh, freshness: {} };
  for (const key of FUNDAMENTAL_KEYS) {
    const previous = cached?.data[key];
    const hadData = Array.isArray(previous) ? previous.length > 0 : previous != null;
    if (failed.includes(key)) {
      // 按同一個 key 回填，避免失敗的空陣列覆蓋有效資料。
      Object.assign(data, { [key]: previous ?? fresh[key] });
      data.freshness![key] = {
        state: hadData ? "stale" : "unavailable",
        lastSuccessAt: cached?.data.freshness?.[key]?.lastSuccessAt
          ?? (hadData ? cached!.fetchedAt : null),
      };
    } else {
      const value = fresh[key];
      const hasData = Array.isArray(value) ? value.length > 0 : value != null;
      data.freshness![key] = { state: hasData ? "ok" : "empty", lastSuccessAt: now.toISOString() };
    }
  }
  return data;
}
