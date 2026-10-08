// HTTP 失敗要回報呼叫端，避免拖曳排序看似成功卻沒有寫入。
export async function saveWatchlistOrder(
  order: string[],
  request: typeof fetch = fetch
): Promise<void> {
  const response = await request("/api/watchlist", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}
