export function taipeiDateRange(date: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const canonical = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(canonical.getTime()) || canonical.toISOString().slice(0,10) !== date) return null;
  const start = new Date(`${date}T00:00:00+08:00`).getTime();
  return { from: new Date(start).toISOString(), to: new Date(start + 86_400_000).toISOString() };
}
