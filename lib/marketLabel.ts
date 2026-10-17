import type { Market } from "./types.ts";

export function marketLabel(market: Market): string {
  return { tse: "上市", otc: "上櫃", emerging: "興櫃" }[market];
}
