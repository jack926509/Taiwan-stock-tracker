"use client";

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// 把卡片包成可拖曳：拖曳把手位於卡片左上角內側，避免遮住內容或超出螢幕。
// 把手帶 touch-none，手機長按拖曳時不會誤觸頁面捲動。
export default function SortableCard({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      id={`stock-${id}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group/sort relative scroll-mt-24 ${
        isDragging ? "z-20 opacity-80" : ""
      }`}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label="拖曳排序"
        className="absolute left-2 top-2 z-10 flex h-11 w-11 cursor-grab touch-none items-center justify-center rounded-lg text-muted transition-colors hover:bg-app hover:text-ink active:cursor-grabbing focus-visible:bg-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:h-8 md:w-8 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/sort:opacity-100"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>
      {children}
    </div>
  );
}
