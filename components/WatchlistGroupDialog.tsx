"use client";
import { useEffect, useRef, useState } from "react";
import type { WatchlistItem } from "@/lib/types";
import { normalizeGroupName } from "@/lib/watchlistGroups";

export default function WatchlistGroupDialog({item,groups,onClose,onSaved}:{
  item:WatchlistItem|null;groups:string[];onClose:()=>void;onSaved:(stockId:string,group:string)=>Promise<void>;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [name,setName]=useState("預設"),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    if(!item)return;
    setName(item.group_name||"預設");setError("");
    const element=dialog.current;
    if(element&&!element.open)element.showModal();
    return ()=>element?.close();
  },[item?.stock_id,item?.group_name]);
  if(!item)return null;
  const stockId=item.stock_id;
  async function save() {
    const groupName=normalizeGroupName(name);
    if(groupName===null){setError("分組名稱最多 20 字，請勿加入控制字元");return;}
    setBusy(true);setError("");
    try {
      const response=await fetch("/api/watchlist",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({stockId,groupName})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error??"儲存分組失敗");
      await onSaved(stockId,groupName);
    } catch(e) {setError(e instanceof Error?e.message:"儲存分組失敗");}
    finally {setBusy(false);}
  }
  return <dialog ref={dialog} aria-labelledby="group-dialog-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}
    aria-busy={busy} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-card border border-line bg-surface p-5 text-ink shadow-lift backdrop:bg-ink/40">
    <h2 id="group-dialog-title" className="font-serif text-lg font-semibold">{item.name} 分組</h2>
    <label className="mt-4 block text-sm">分組名稱
      <input value={name} maxLength={20} onChange={event=>setName(event.target.value)} list="personal-watch-groups"
        className="mt-2 min-h-11 w-full rounded-lg border border-line bg-app px-3" />
    </label>
    <datalist id="personal-watch-groups">{[...new Set(["預設","持有","觀察","ETF",...groups])].map(group=><option key={group} value={group}/>)}</datalist>
    <p className="mt-2 text-xs text-muted">可用持有、觀察、ETF，或輸入自己的分組名稱。</p>
    {error&&<p role="alert" className="mt-2 text-sm text-warn">{error}</p>}
    <div className="mt-5 grid grid-cols-2 gap-3">
      <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-pill border border-line px-4 disabled:opacity-50">取消</button>
      <button type="button" disabled={busy} onClick={()=>void save()} className="min-h-11 rounded-pill bg-primary px-4 text-white disabled:opacity-50 dark:text-app">{busy?"儲存中…":"儲存分組"}</button>
    </div>
  </dialog>;
}
