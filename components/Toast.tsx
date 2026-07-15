"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (text: string, opts?: { tone?: ToastTone }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必須在 <ToastProvider> 內使用");
  return ctx;
}

// 提示點顏色：成功＝靛藍（品牌點綴色）、失敗＝警示橘。
// 刻意不用紅/綠——在台股語境紅=漲、綠=跌，挪作成敗色會造成語意衝突。
const DOT_TONE: Record<ToastTone, string> = {
  success: "bg-primary",
  error: "bg-warn",
  info: "bg-line",
};

// 輕量吐司通知：深墨底、紙色字，最多同時兩則，3 秒自動消失。
// 容器本身是 aria-live 區域，取代原本 sr-only 的隱形回饋——明眼與讀屏使用者看/聽到同一份訊息。
export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback((text: string, opts?: { tone?: ToastTone }) => {
    const id = ++nextId.current;
    const tone = opts?.tone ?? "info";
    setToasts((prev) => [...prev.slice(-1), { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast-in flex max-w-sm items-center gap-2 rounded-pill bg-ink px-4 py-2.5 text-sm font-medium text-app shadow-lift"
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${DOT_TONE[t.tone]}`}
            />
            <span className="min-w-0 break-words">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
