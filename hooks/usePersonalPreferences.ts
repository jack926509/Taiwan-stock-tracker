"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PERSONAL_PREFERENCES, PERSONAL_PREFERENCES_KEY, readPersonalPreferences, persistPersonalPreferences,
  type PersonalPreferences, type PreferencesStorage } from "@/lib/personalPreferences";

function storage():PreferencesStorage|null {
  try {return typeof window!=="undefined"?window.localStorage:null;} catch {return null;}
}
export function usePersonalPreferences() {
  const [preferences,setPreferences]=useState<PersonalPreferences>({...DEFAULT_PERSONAL_PREFERENCES});
  const latest=useRef(preferences);
  useEffect(()=>{
    const load=()=>{const value=readPersonalPreferences(storage());latest.current=value;setPreferences(value);};
    load();
    const changed=(event:StorageEvent)=>{if(event.key===PERSONAL_PREFERENCES_KEY||event.key===null)load();};
    window.addEventListener("storage",changed);
    return ()=>window.removeEventListener("storage",changed);
  },[]);
  const setPreference=useCallback((patch:Partial<PersonalPreferences>)=>{
    const next=persistPersonalPreferences(storage(),latest.current,patch);
    latest.current=next;setPreferences(next);
  },[]);
  return {preferences,setPreference};
}
