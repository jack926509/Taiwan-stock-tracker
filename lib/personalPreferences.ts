import type { SortKey, FilterKey } from "../components/home/QuoteBoard";
import { KLINE_RANGES, WEEK_RANGE_KEYS, type KlineRangeKey } from "./klineRange.ts";
import { normalizeGroupName } from "./watchlistGroups.ts";

export interface PersonalPreferences {
  v:1;sort:SortKey;filter:FilterKey;group:string|null;
  klinePeriod:"day"|"week"|"month";klineRange:KlineRangeKey;
}
export interface PreferencesStorage { getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void }
export const PERSONAL_PREFERENCES_KEY="twstock:personal-preferences:v1";
export const DEFAULT_PERSONAL_PREFERENCES:PersonalPreferences={v:1,sort:"default",filter:"all",group:null,klinePeriod:"day",klineRange:"6m"};
function oneOf<T extends string>(value:unknown,values:readonly T[],fallback:T):T {
  return values.find(item=>item===value)??fallback;
}
function normalize(value:unknown,fallback:PersonalPreferences):PersonalPreferences {
  if(!value||typeof value!=="object"||Array.isArray(value))return {...fallback};
  const input=value as Partial<Record<keyof PersonalPreferences,unknown>>;
  if(input.v!==1)return {...fallback};
  const period=oneOf(input.klinePeriod,["day","week","month"] as const,fallback.klinePeriod);
  const range=oneOf(input.klineRange,KLINE_RANGES.map(item=>item.key),fallback.klineRange);
  return {v:1,sort:oneOf(input.sort,["default","gain","loss","near"] as const,fallback.sort),
    filter:oneOf(input.filter,["all","alert","up","down"] as const,fallback.filter),
    group:input.group===null?null:typeof input.group==="string"?(input.group.trim()?normalizeGroupName(input.group):null):fallback.group,
    klinePeriod:period,klineRange:period==="week"&&!WEEK_RANGE_KEYS.includes(range)?"1y":range};
}
export function readPersonalPreferences(storage:PreferencesStorage|null,fallback=DEFAULT_PERSONAL_PREFERENCES):PersonalPreferences {
  try {const raw=storage?.getItem(PERSONAL_PREFERENCES_KEY);return raw?normalize(JSON.parse(raw),fallback):{...fallback};}
  catch{return {...fallback};}
}
export function persistPersonalPreferences(storage:PreferencesStorage|null,current:PersonalPreferences,patch:Partial<PersonalPreferences>):PersonalPreferences {
  const next=normalize({...readPersonalPreferences(storage,current),...patch,v:1},current);
  try {storage?.setItem(PERSONAL_PREFERENCES_KEY,JSON.stringify(next));} catch {/* 儲存受限仍保留當頁操作 */}
  return next;
}
