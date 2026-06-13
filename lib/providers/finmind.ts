// FinMind v4 共用請求層（免費；FINMIND_TOKEN 可選，填了限流較寬）

const API = "https://api.finmindtrade.com/api/v4/data";

interface FinMindResponse<T> {
  msg: string;
  status: number;
  data: T[];
}

export async function finmindRows<T>(
  dataset: string,
  dataId: string,
  startDate: string
): Promise<T[]> {
  const params = new URLSearchParams({
    dataset,
    data_id: dataId,
    start_date: startDate,
  });
  const token = process.env.FINMIND_TOKEN;
  if (token) params.set("token", token);

  const res = await fetch(`${API}?${params}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`FinMind HTTP ${res.status}`);
  const json = (await res.json()) as FinMindResponse<T>;
  if (json.status !== 200) throw new Error(`FinMind: ${json.msg}`);
  return json.data;
}
