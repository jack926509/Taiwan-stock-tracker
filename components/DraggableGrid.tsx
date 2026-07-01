"use client";

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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import SortableCard from "@/components/SortableCard";

// 自選股拖曳排序格線。@dnd-kit 由此元件集中匯入，供上層 next/dynamic 拆出獨立 chunk。
export default function DraggableGrid({
  cards,
  onReorder,
}: {
  cards: { id: string; node: ReactNode }[];
  onReorder: (next: string[]) => void;
}) {
  const ids = cards.map((c) => c.id);

  // 觸控長按 / 滑鼠拖曳皆透過 Pointer 事件；鍵盤可及性用 KeyboardSensor
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((c) => (
            <SortableCard key={c.id} id={c.id}>
              {c.node}
            </SortableCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
