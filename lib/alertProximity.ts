import type { WatchlistItem,Quote } from "./types.ts";
type Target=Pick<WatchlistItem,"stock_id"|"alert_high"|"alert_low"|"alert_high_hit_at"|"alert_low_hit_at">;
export function nearestAlertDistance(item:Target|undefined,quote:Pick<Quote,"price">):number|null {
  const price=quote.price;
  if(!item||price===null||!Number.isFinite(price)||price<=0)return null;
  const gaps:number[]=[];
  if(item.alert_high!=null&&Number.isFinite(item.alert_high)&&item.alert_high>0&&item.alert_high_hit_at==null)gaps.push(Math.max(0,(item.alert_high-price)/price));
  if(item.alert_low!=null&&Number.isFinite(item.alert_low)&&item.alert_low>0&&item.alert_low_hit_at==null)gaps.push(Math.max(0,(price-item.alert_low)/price));
  return gaps.length?Math.min(...gaps):null;
}
export function sortByAlertDistance<T extends Pick<Quote,"stockId"|"price">>(quotes:readonly T[],items:readonly Target[]):T[] {
  const byId=new Map(items.map(item=>[item.stock_id,item]));
  return [...quotes].sort((a,b)=>{
    const first=nearestAlertDistance(byId.get(a.stockId),a),second=nearestAlertDistance(byId.get(b.stockId),b);
    if(first===null)return second===null?0:1;
    if(second===null)return -1;
    return first-second;
  });
}
