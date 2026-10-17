import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const fixture = { states: [], watch: { items: [] }, quotes: undefined, suggestions: [], personal: undefined };
globalThis.__emergingUi = {
  useState: (initial) => [fixture.states.length ? fixture.states.shift() : initial, () => {}],
  useSWR: (key) => ({ data: key === "/api/personal-status" ? fixture.personal : key === "/api/watchlist" ? fixture.watch : String(key).startsWith("/api/quote") ? fixture.quotes : undefined }),
  suggestions: () => ({ results: fixture.suggestions, state: "done" }),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      react: "export const useState = globalThis.__emergingUi.useState; export const useEffect = () => {}; export const useRef = (v) => ({current:v}); export const useMemo = (f) => f(); export const useCallback = (f) => f;",
      "react/jsx-runtime": "export const jsx = (type, props) => ({type,props}); export const jsxs = jsx; export const Fragment = 'fragment';",
      swr: "export default globalThis.__emergingUi.useSWR;",
      "next/link": "export default ({children,...props}) => ({type:'a',props:{...props,children}});",
      "next/navigation": "export const useRouter = () => ({back(){},push(){}}); export const useParams = () => ({id:'7930'});",
      "next/dynamic": "export default () => () => null;",
      "@/components/Toast": "export const useToast = () => ({show(){}});",
      "@/hooks/usePollGuard": "export const usePollGuard = () => ({autoPaused:false,resumePolling(){}});",
      "@/hooks/useDialogFocus": "export default () => {};",
      "@/hooks/usePersonalPreferences": "export const usePersonalPreferences = () => ({preferences:{klineRange:'3m',klinePeriod:'day'},setPreference(){}});",
      "@/hooks/useStockSuggestions": "export const useStockSuggestions = globalThis.__emergingUi.suggestions;",
      "@/hooks/useAddToWatchlist": "export const useAddToWatchlist = () => ({add(){},busyId:null});",
      "@/components/home/SortableQuoteRows": "export default ({children}) => children; export const SortableRow = ({children}) => children;",
      "@/components/icons": "export const IconArrowLeft = () => null; export const IconChevronDown = () => null; export const IconX = () => null; export const IconChartBar = () => null;",
      "@/components/SwipeToDelete": "export default ({children}) => children;",
    };
    const source = stubs[specifier] ?? (specifier.startsWith("@/components/") ? "export default () => null;" : null);
    if (source) return {url:`data:text/javascript,${encodeURIComponent(source)}`,shortCircuit:true};
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`,import.meta.url).href,context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".tsx")) return {format:"module",shortCircuit:true,source:ts.transpileModule(readFileSync(new URL(url),"utf8"), {
      compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
    }).outputText};
    return nextLoad(url,context);
  },
});
const { default: PersonalStatusCard } = await import("../components/PersonalStatusCard.tsx");
const { default: QuoteBoard } = await import("../components/home/QuoteBoard.tsx");
const { default: AlertsPage } = await import("../app/alerts/page.tsx");
const { default: StockPage } = await import("../app/stock/[id]/page.tsx");
const { default: StockSearch } = await import("../components/StockSearch.tsx");
const quote = {stockId:"7930",name:"WST",market:"emerging",source:"tpex",price:106.5,prevClose:null,change:null,changePct:null,open:null,high:110,low:105,volume:null,traded:false,time:"13:30:00",asOf:"2026-10-16T05:30:00Z"};
const row = {stock_id:"7930",name:"WST",market:"emerging",group_name:"預設",alert_high:null,alert_low:null,alert_change_pct:null,alert_volume_on:false};
function nodes(node) {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node !== "object") return [node];
  if (typeof node.type === "function") return nodes(node.type(node.props));
  return [node,...nodes(node.props?.children)];
}
function textOf(all) { return all.filter(n=>typeof n === "string" || typeof n === "number").join(" "); }
function reset() {
  fixture.states=[];
  fixture.watch={items:[{...row}]};
  fixture.quotes={quotes:[{...quote}],indices:[],asOf:quote.asOf,source:"mixed",complete:true,marketOpen:false};
}
test("首頁興櫃列在桌機與手機市場欄都標興櫃，並顯示參考來源及製表時間",()=>{
  reset();
  const output=nodes(QuoteBoard({quotes:[quote],items:[row],onDelete(){}}));
  const text=textOf(output);
  assert.equal(output.filter(n=>n === "興櫃").length,2);
  assert.match(text,/櫃買中心.*參考/);
  assert.match(text,/製表.*2026\/10\/16.*13:30/);
  assert.doesNotMatch(text,/上櫃/);
});
for (const source of ["yahoo","stale"]) test(`首頁混合資料的 ${source} 單檔標來源與日期`,()=>{
  reset();
  const output=nodes(QuoteBoard({quotes:[{...quote,market:"tse",source}],items:[row],onDelete(){}}));
  assert.match(textOf(output),source === "yahoo" ? /Yahoo.*可能延遲/ : /舊報價快照.*非即時/);
  assert.match(textOf(output),/2026\/10\/16/);
});
test("興櫃提醒列保留既有門檻但不能新增或編輯",()=>{
  reset(); fixture.watch.items[0].alert_high=100;
  const output=nodes(AlertsPage()); const text=textOf(output);
  assert.match(text,/興櫃參考行情不觸發即時提醒/);
  assert.match(text,/漲到.*100/);
  assert.doesNotMatch(text,/已觸及|＋ 設定提醒/);
  const button=output.find(n=>n?.type === "button" && n.props["aria-label"]?.includes("WST"));
  assert.equal(button?.props.disabled,true);
});
test("混合批次中的有效 MIS 列仍使用自己的來源判斷已觸及",()=>{
  reset();
  fixture.watch.items=[{...row,stock_id:"2330",name:"台積電",market:"tse",alert_high:100}];
  fixture.quotes.quotes=[{...quote,stockId:"2330",name:"台積電",market:"tse",source:"mis",traded:true,asOf:new Date().toISOString()}];
  assert.match(textOf(nodes(AlertsPage())),/已觸及/);
});
test("興櫃單股頁顯示參考來源與製表時間，停用提醒入口",()=>{
  reset(); fixture.states=[true,"/stock/7930"];
  const output=nodes(StockPage()); const text=textOf(output);
  assert.match(text,/興櫃/); assert.match(text,/櫃買中心.*參考/); assert.match(text,/製表時間/);
  assert.match(text,/興櫃參考行情不觸發即時提醒/); assert.doesNotMatch(text,/即時報價：MIS/);
  const button=output.find(n=>n?.type === "button" && n.props["aria-label"] === "到價提醒");
  assert.equal(button?.props.disabled,true);
});
test("搜尋建議顯示正確興櫃分類",()=>{
  reset(); fixture.states=["7930",true,-1]; fixture.suggestions=[{stockId:"7930",name:"WST",market:"emerging"}];
  const text=textOf(nodes(StockSearch({})));
  assert.match(text,/興櫃/); assert.doesNotMatch(text,/上櫃/);
});

test("興櫃較晚的製表時間不會將同批正常 MIS 行情誤標延遲",()=>{
  reset();
  const mis={...quote,stockId:"2330",market:"tse",source:"mis",asOf:"2026-10-16T05:30:00Z"};
  const emerging={...quote,asOf:"2026-10-16T08:00:00Z"};
  const text=textOf(nodes(QuoteBoard({quotes:[mis,emerging],items:[{...row,stock_id:"2330",market:"tse"},row],onDelete(){}})));
  assert.doesNotMatch(text,/延遲 13:30/);
});
test("無既有門檻的興櫃列不提供新增提醒，即使清單快取尚未更新市場",()=>{
  reset(); fixture.watch.items[0].market="otc";
  const output=nodes(AlertsPage());
  assert.match(textOf(output),/興櫃參考行情不觸發即時提醒/);
  assert.doesNotMatch(textOf(output),/＋ 設定提醒/);
  assert.equal(output.find(n=>n?.type === "button" && n.props["aria-label"]?.includes("WST"))?.props.disabled,true);
});
test("興櫃舊快照仍將來源時間標為製表時間",()=>{
  reset();
  const text=textOf(nodes(QuoteBoard({quotes:[{...quote,source:"stale"}],items:[row],onDelete(){}})));
  assert.match(text,/舊報價快照.*製表時間/);
});

for (const [source,label] of [["mixed","混合來源"],["tpex","興櫃參考行情"]]) test(`後端檢查紀錄的 ${source} 清楚標示來源`,()=>{
  reset();
  fixture.personal={monitor:{finishedAt:quote.asOf,outcome:"completed",source,complete:true,rows:[]},line:{configured:false,usage:null},issues:[]};
  const text=textOf(nodes(PersonalStatusCard({})));
  assert.ok(text.includes(label)); assert.doesNotMatch(text,/未取行情/);
});

test("興櫃完全缺價時仍明確標示報價暫缺",()=>{
  reset();
  const text=textOf(nodes(QuoteBoard({quotes:[{...quote,source:undefined,price:null,missing:true,asOf:undefined}],items:[row],onDelete(){}})));
  assert.match(text,/報價暫缺/);
});
