export function normalizeGroupName(value: string): string | null {
  const name=value.trim()||"預設";
  return Array.from(name).length>20||/[\x00-\x1f\x7f]/.test(name) ? null : name;
}
export function watchlistGroups(items:readonly {group_name?:string|null}[]):string[] {
  return [...new Set(["預設",...items.map(item=>item.group_name?.trim()||"預設")])];
}
export function filterByGroup<T extends {stockId:string}>(quotes:readonly T[],items:readonly {stock_id:string;group_name?:string|null}[],group:string|null):T[] {
  if(group===null)return [...quotes];
  const ids=new Set(items.filter(item=>(item.group_name?.trim()||"預設")===group).map(item=>item.stock_id));
  return quotes.filter(quote=>ids.has(quote.stockId));
}
