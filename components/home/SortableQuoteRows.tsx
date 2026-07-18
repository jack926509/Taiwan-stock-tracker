"use client";

// 自選股表格／卡片列的拖曳排序：與舊版 DraggableGrid + SortableCard 邏輯相同
// （@dnd-kit + PointerSensor/KeyboardSensor + arrayMove），只是把「卡片格線」
// 換成「表格列的垂直清單」（verticalListSortingStrategy）。
// 直接（非 next/dynamic）匯入 @dnd-kit：QuoteBoard 現在是首頁必顯示的主要內容，
// 不像舊版「格線」可以先用骨架屏頂著、再等重量套件載完；為避免拖曳把手用
// next/dynamic 時 loading fallback 收不到 children 而讓整列瞬間消失，改直接匯入，
// 首次 JS 會略增（可接受的取捨，詳見 task-7-report.md）。
import type { ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export function SortableRow({ id, children }: { id: string; children: ReactNode }) {
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
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group/sort relative ${isDragging ? "z-20 opacity-80" : ""}`}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label="拖曳排序"
        className="absolute left-0.5 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-lg text-faint transition-[color,opacity] hover:text-muted active:cursor-grabbing focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:h-8 md:w-8 md:[@media(hover:hover)]:opacity-0 md:[@media(hover:hover)]:group-hover/sort:opacity-100"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <circle cx="9" cy="6" r="1.4" />
          <circle cx="15" cy="6" r="1.4" />
          <circle cx="9" cy="12" r="1.4" />
          <circle cx="15" cy="12" r="1.4" />
          <circle cx="9" cy="18" r="1.4" />
          <circle cx="15" cy="18" r="1.4" />
        </svg>
      </button>
      {children}
    </div>
  );
}

export default function SortableQuoteRows({
  ids,
  onReorder,
  children,
}: {
  ids: string[];
  onReorder: (next: string[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}
