"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

// 「稍後」記 7 天：localStorage 存「到期時間（毫秒）」，過期後才會再出現；讀寫都包 try/catch（無痕模式可能擲錯）
const SNOOZE_KEY = "tw-stock-pwa-install-snooze-until";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function isSnoozed(): boolean {
  try {
    const until = Number(window.localStorage.getItem(SNOOZE_KEY));
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function snoozeSevenDays() {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    // 無法寫入時只關閉本次提示
  }
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIosSafari() {
  if (typeof window === "undefined") return false;
  const { userAgent, platform, maxTouchPoints } = window.navigator;
  const isIos = /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  return isIos && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
}

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}

export default function PWAInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (isSnoozed()) return;

    if (isIosSafari()) {
      setShowIosGuide(true);
      setVisible(true);
      return;
    }

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
    snoozeSevenDays();
    setVisible(false);
  }

  if (!visible || (!event && !showIosGuide)) return null;

  return (
    <div className="fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 md:hidden">
      <div className="mx-auto max-w-md rounded-card bg-ink p-3 text-white shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">加入主畫面</div>
            <div className="mt-0.5 text-xs text-white/70">
              {showIosGuide ? "點分享按鈕，再選加入主畫面。" : "用 App 模式開啟，自選與提醒更快進入。"}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="min-h-[44px] rounded-lg px-3 text-xs text-white/70"
            >
              稍後
            </button>
            {!showIosGuide && <button
              type="button"
              onClick={install}
              className="min-h-[44px] rounded-lg bg-white px-4 text-xs font-semibold text-ink"
            >
              安裝
            </button>}
          </div>
        </div>
      </div>
    </div>
  );
}
