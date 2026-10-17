import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const fixture = { dates: [], saved: undefined, preview: undefined };
globalThis.__closingSourceUi = {
  useState: () => [fixture.dates.shift(), () => {}],
  useSWR: key => ({ data: key?.startsWith("/api/summary?date=") ? fixture.saved : key === "/api/summary" ? fixture.preview : undefined }),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      react: "export const useState = globalThis.__closingSourceUi.useState; export const useEffect = () => {};",
      swr: "export default globalThis.__closingSourceUi.useSWR;",
    };
    if (context.parentURL?.endsWith("/components/ClosingSummary.tsx") && stubs[specifier]) {
      return { url:`data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit:true };
    }
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`,import.meta.url).href,context);
    return nextResolve(specifier,context);
  },
  load(url,context,nextLoad) {
    if (url.endsWith("/components/ClosingSummary.tsx")) return {
      format:"module",shortCircuit:true,
      source:ts.transpileModule(readFileSync(new URL(url),"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText,
    };
    return nextLoad(url,context);
  },
});
const {default:ClosingSummary} = await import("../components/ClosingSummary.tsx");
function render(source,{saved=false}={}) {
  fixture.dates=[saved ? "2026-10-16" : "2026-10-19","2026-10-19"];
  const summary={date:fixture.dates[0],source,asOf:`${fixture.dates[0]}T05:30:00Z`,complete:true,
    counts:{up:1,down:0,flat:0},indices:[],rows:[{stockId:"2330",name:"台積電",price:100,changePct:.01,weekPct:.02,newSignals:[]}],alertHits:0,best:null,worst:null};
  fixture.saved=saved ? {summary,savedAt:"2026-10-16T05:35:00Z"} : {summary:null,savedAt:null};
  fixture.preview={summary};
  return renderToStaticMarkup(createElement(ClosingSummary));
}
for (const [source,label] of [["mixed","混合來源報價（含參考行情）"],["tpex","櫃買中心興櫃參考行情"]]) {
  for (const saved of [false,true]) test(`${saved ? "歷史保存" : "當日暫覽"}的 ${source} 收盤摘要不冒稱 MIS`,()=>{
    const html=render(source,{saved});
    assert.ok(html.includes(label));
    assert.doesNotMatch(html,/來源：MIS/);
    assert.ok(html.includes(source === "tpex" ? "製表時間：" : "資料時間："));
    assert.match(html,/台積電/);
    assert.match(html,saved ? /保存於/ : /今日暫覽，尚未保存/);
  });
}
for (const [source,label] of [["mis","MIS 行情"],["yahoo","Yahoo 備援（可能延遲）"],["stale","舊報價快照（非即時）"],[undefined,"來源待確認"]]) {
  test(`收盤摘要來源 ${source ?? "未知"} 顯示正確文案`,()=>{
    assert.ok(render(source).includes(label));
  });
}
