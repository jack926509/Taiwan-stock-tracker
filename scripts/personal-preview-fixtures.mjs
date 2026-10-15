// 本機瀏覽器驗收：頁面與資源來自已建置 Worker，API 使用隔離資料。
// 提醒 PATCH 僅改此程序的記憶體示範清單；其他寫入封鎖，不轉送正式 API。
// 使用：node scripts/personal-preview-fixtures.mjs http://127.0.0.1:8787
import http from "node:http";

const upstream = new URL(process.argv[2] ?? "http://127.0.0.1:8787");
if (!["127.0.0.1", "localhost"].includes(upstream.hostname)) throw new Error("僅允許本機預覽來源");
const baseItem = { market: "tse", group_name: "預設", alert_high: null, alert_low: null, alert_high_hit_at: null, alert_low_hit_at: null, alert_change_pct: null, alert_change_hit_at: null, alert_volume_on: false, alert_volume_hit_at: null };
const items = [
  { ...baseItem, stock_id: "2330", name: "台積電",group_name:"持有", sort_order: 0, alert_high:105, alert_high_hit_at:"2026-10-15T02:30:00.000Z",
    alert_low:95, alert_low_hit_at:"2026-10-15T02:20:00.000Z" },
  { ...baseItem, stock_id: "2317", name: "鴻海",group_name:"觀察", sort_order: 1, alert_high: 210 },
];
const asOf = "2026-10-15T05:10:00.000Z";
const quote = { stockId: "2330", market: "tse", name: "TAIWAN SEMICONDUCTOR", price: 100, prevClose: 99, change: 1, changePct: 1 / 99, open: 99, high: 101, low: 98, volume: null, traded: true, time: "13:10:00", asOf };
const candles = Array.from({ length: 50 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 7, 26 + i)).toISOString().slice(0, 10);
  return { date, open: 99, high: 101, low: 98, close: 100, volume: 10 };
});
const empty = { institutional: [], revenue: [], valuation: null, eps: [], dividend: [] };
const freshness = {
  institutional: { state: "empty", lastSuccessAt: asOf },
  revenue: { state: "unavailable", lastSuccessAt: null },
  valuation: { state: "stale", lastSuccessAt: "2026-10-14T08:00:00.000Z" },
  eps: { state: "empty", lastSuccessAt: asOf },
  dividend: { state: "empty", lastSuccessAt: asOf },
};

function start(port, mode) {
  const demoItems = structuredClone(items);
  const demoHistory = ["accepted","limited","failed"].map((state,i)=>({v:1,id:`demo-${i}`,stockId:"2330",market:"tse",name:"台積電",
    kind:"high",threshold:105,price:110,changePct:0.1,volume:1000,open:100,high:111,low:99,
    triggeredAt:`2026-10-15T02:${30+i}:00.000Z`,quoteAsOf:`2026-10-15T02:${30+i}:00.000Z`,
    notification:{state,attempts:i+1,reason:state==="failed"?"retry-expired":null}}));
  http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const json = (data, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(data));
    };
    if (req.method === "PATCH" && url.pathname === "/api/watchlist") {
      let raw = "";
      for await (const chunk of req) { raw += chunk; if(raw.length>2048)return json({error:"測試資料過長"},413); }
      try {
        const body = JSON.parse(raw), row = demoItems.find(item=>item.stock_id===body.stockId);
        if(!row)return json({error:"測試股票不存在"},404);
        if(body.groupName!==undefined){row.group_name=body.groupName.trim()||"預設";return json({ok:true,stockId:row.stock_id,groupName:row.group_name});}
        const columns = {high:["alert_high","alert_high_hit_at"],low:["alert_low","alert_low_hit_at"],changePct:["alert_change_pct","alert_change_hit_at"],volumeOn:["alert_volume_on","alert_volume_hit_at"]};
        for(const [field,[valueCol,hitCol]] of Object.entries(columns)) {
          if(body[field]===undefined)continue;
          const value = field==="volumeOn" ? body[field]===true : body[field]===null ? null : Number(body[field]);
          if(value!==row[valueCol]) { row[valueCol]=value; row[hitCol]=null; }
        }
        const hitColumns = {high:"alert_high_hit_at",low:"alert_low_hit_at",change:"alert_change_hit_at",volume:"alert_volume_hit_at"};
        for(const side of body.rearm??[]) { if(hitColumns[side])row[hitColumns[side]]=null; }
        return json({ok:true});
      } catch { return json({error:"測試請求格式錯誤"},400); }
    }
    if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "隔離驗收不允許此寫入" }, 405);
    if (url.pathname.startsWith("/api/")) {
      switch (url.pathname) {
        case "/api/watchlist": return json({ items:demoItems, storage: "supabase" });
        case "/api/alert-history": {
          const date = url.searchParams.get("date")??"2026-10-15", offset=Number(url.searchParams.get("offset")??0);
          const events = date==="2026-10-15"?demoHistory:[];
          return json({date,total:events.length,offset,limit:50,nextOffset:null,events:events.slice(offset,offset+50)});
        }
        case "/api/quote": return mode === "offline"
          ? json({ error: "測試：行情來源暫時無法使用" }, 502)
          : json({ asOf, marketOpen: false, source: "yahoo", complete: false, indices: [],
            quotes:!url.searchParams.get("ids")||url.searchParams.get("ids").split(",").includes("2330")?[quote]:[] });
        case "/api/sparklines": return json({ data: {} });
        case "/api/summary": return json({ summary: null });
        case "/api/kline": return json({ stockId: url.searchParams.get("id")??"2330", candles, latestDate: candles.at(-1).date, stale: true, expectedDate: "2026-10-15" });
        case "/api/fundamental": return json({ stockId: url.searchParams.get("id")??"2330", asOf, ...empty,
          freshness: mode === "empty" ? Object.fromEntries(Object.keys(freshness).map(key => [key, { state: "unavailable", lastSuccessAt: null }])) : freshness,
          valuation: mode === "empty" ? null : { date: "2026-10-14", per: 20, pbr: 5, dividendYield: 2 } });
        case "/api/search": return json({ results: [{ stockId: "2330", market: "tse", name: "台積電" }] });
        default: return json({ error: "未設定的測試端點" }, 404);
      }
    }
    try {
      const target = new URL(req.url, upstream);
      const requestHeaders = { accept: req.headers.accept ?? "*/*" };
      for (const key of ["rsc", "next-router-state-tree", "next-router-prefetch", "next-router-segment-prefetch", "next-url"]) {
        if (typeof req.headers[key] === "string") requestHeaders[key] = req.headers[key];
      }
      const response = await fetch(target, { headers: requestHeaders, redirect: "manual" });
      const headers = Object.fromEntries(response.headers);
      delete headers["content-encoding"];
      delete headers["content-length"];
      res.writeHead(response.status, { ...headers, "Cache-Control": "no-store" });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      json({ error: "本機 Worker 預覽尚未就緒" }, 502);
    }
  }).listen(port, "127.0.0.1", () => console.log(`隔離驗收 ${mode}: http://127.0.0.1:${port}`));
}
start(8790, "partial");
start(8791, "offline");
start(8792, "empty");
