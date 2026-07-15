"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const THRESHOLD = 72; // 左滑超過此距離（px）放開即刪除
const MAX = 110; // 最大可滑距離

// 手機左滑刪除：以 Pointer 事件實作、僅作用於觸控（pointerType === "touch"），
// 桌機滑鼠不受影響（桌機仍用卡片 hover 出現的 ✕）。
// touch-action: pan-y → 垂直照常捲動、水平交給本元件，毋須 preventDefault。
export default function SwipeToDelete({
  onDelete,
  children,
}: {
  onDelete: () => void;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const dxRef = useRef(0);
  const frame = useRef<number | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<"none" | "horizontal" | "vertical">("none");
  const swiped = useRef(false);

  function scheduleDx(next: number) {
    dxRef.current = next;
    if (frame.current != null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      setDx(dxRef.current);
    });
  }

  useEffect(() => {
    return () => {
      if (frame.current != null) {
        window.cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "touch") return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    axis.current = "none";
    swiped.current = false;
    setAnimating(false);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (e.pointerType !== "touch") return;
    const ddx = e.clientX - startX.current;
    const ddy = e.clientY - startY.current;
    if (axis.current === "none") {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
      axis.current = Math.abs(ddx) > Math.abs(ddy) ? "horizontal" : "vertical";
      if (axis.current === "horizontal") {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* 部分瀏覽器對未啟用的 pointer 會丟錯，忽略不影響滑動 */
        }
      }
    }
    if (axis.current !== "horizontal") return;
    swiped.current = true;
    scheduleDx(Math.max(-MAX, Math.min(0, ddx)));
  }

  function finish(e: React.PointerEvent) {
    if (e.pointerType !== "touch") return;
    setAnimating(true);
    if (axis.current === "horizontal" && dxRef.current <= -THRESHOLD) {
      onDelete();
    }
    setDx(0);
    dxRef.current = 0;
    axis.current = "none";
  }

  // 剛完成水平滑動時，吞掉隨後的 click，避免誤觸卡片連結跳轉
  function onClickCapture(e: React.MouseEvent) {
    if (swiped.current) {
      e.preventDefault();
      e.stopPropagation();
      swiped.current = false;
    }
  }

  return (
    <div className="relative overflow-hidden rounded-card md:overflow-visible">
      {/* 滑動時露出的紅色刪除底層 */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-end rounded-card bg-up px-6 text-white dark:text-app">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6h18M8 6V4h8v2m-9 0v14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6" />
          </svg>
          刪除
        </span>
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={onClickCapture}
        style={{
          transform: `translateX(${dx}px)`,
          transition: animating ? "transform 0.18s ease-out" : "none",
          touchAction: "pan-y",
          willChange: dx !== 0 || animating ? "transform" : "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}
