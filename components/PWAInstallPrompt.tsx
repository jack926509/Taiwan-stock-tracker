"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISSED_KEY = "tw-stock-pwa-install-dismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}

export default function PWAInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  async function install() {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
      setEvent(null);
    }
  }

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  if (!visible || !event) return null;

  return (
    <div className="fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 md:hidden">
      <div className="mx-auto max-w-md rounded-card bg-ink p-3 text-white shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">加入主畫面</div>
            <div className="mt-0.5 text-xs text-white/70">
              用 App 模式開啟，自選與提醒更快進入。
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-2 py-1 text-xs text-white/70"
            >
              稍後
            </button>
            <button
              type="button"
              onClick={install}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-ink"
            >
              安裝
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
