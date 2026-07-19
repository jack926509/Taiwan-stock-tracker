"use client";

import { useEffect, useRef, useState } from "react";

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown> | unknown;
  disabled?: boolean;
}

const TRIGGER_PX = 74;

export default function PullToRefresh({
  onRefresh,
  disabled = false,
}: PullToRefreshProps) {
  const startY = useRef<number | null>(null);
  const refreshing = useRef(false);
  const pullRef = useRef(0);
  const frame = useRef<number | null>(null);
  const [pull, setPull] = useState(0);

  function schedulePull(next: number) {
    pullRef.current = next;
    if (frame.current != null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      setPull(pullRef.current);
    });
  }

  useEffect(() => {
    if (disabled) return;

    const onTouchStart = (event: TouchEvent) => {
      if (window.scrollY > 0 || refreshing.current) return;
      startY.current = event.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (startY.current == null || window.scrollY > 0) return;
      const currentY = event.touches[0]?.clientY ?? startY.current;
      const distance = Math.max(0, currentY - startY.current);
      if (distance > 8) schedulePull(Math.min(distance * 0.55, 96));
    };

    const onTouchEnd = async () => {
      const shouldRefresh = pullRef.current >= TRIGGER_PX;
      startY.current = null;
      if (!shouldRefresh) {
        schedulePull(0);
        return;
      }
      refreshing.current = true;
      schedulePull(TRIGGER_PX);
      try {
        await onRefresh();
      } finally {
        refreshing.current = false;
        schedulePull(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      if (frame.current != null) {
        window.cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [disabled, onRefresh]);

  if (pull <= 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 flex justify-center md:hidden"
      style={{ transform: `translateY(${Math.max(0, pull - 48)}px)` }}
    >
      <div className="rounded-pill bg-ink px-3 py-1.5 text-xs font-semibold text-white shadow-card dark:text-app">
        {pull >= TRIGGER_PX ? "放開更新" : "下拉更新"}
      </div>
    </div>
  );
}
