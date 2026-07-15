"use client";

import { useEffect, useRef } from "react";

export default function DeleteStockDialog({
  open,
  stockName,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  stockName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);
  busyRef.current = busy;
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)"
      );
      if (!buttons || buttons.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (open && busy) dialogRef.current?.focus();
  }, [busy, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 backdrop-blur-[2px] sm:place-items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby="delete-stock-title"
        aria-describedby="delete-stock-description"
        className="sheet-pop w-full overscroll-contain rounded-t-2xl bg-surface p-5 shadow-lift ring-1 ring-line sm:max-w-sm sm:rounded-card"
      >
        <h2 id="delete-stock-title" className="font-serif text-lg font-bold text-ink">
          確定刪除 {stockName}？
        </h2>
        <p id="delete-stock-description" className="mt-2 text-sm leading-relaxed text-muted">
          這檔股票會從自選清單移除。取消即可保留，不會變更任何資料。
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-lg bg-app px-4 text-sm font-semibold text-ink ring-1 ring-line transition-colors hover:bg-primary-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-11 rounded-lg bg-up px-4 text-sm font-semibold text-white transition-colors hover:bg-up-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-up focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 dark:text-app"
          >
            {busy ? "刪除中…" : "確認刪除"}
          </button>
        </div>
      </div>
    </div>
  );
}
