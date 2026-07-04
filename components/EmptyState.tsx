// 共用空狀態：emoji + 標題（可選）+ 說明文案。取代各分頁重複的空狀態視覺。
export default function EmptyState({
  emoji,
  title,
  description,
  dashed = true,
}: {
  emoji?: string;
  title?: string;
  description: string;
  dashed?: boolean;
}) {
  return (
    <div
      className={`rounded-card p-10 text-center ${
        dashed
          ? "border border-dashed border-line bg-surface/60"
          : "bg-surface shadow-card ring-1 ring-line"
      }`}
    >
      {emoji && (
        <div className="text-2xl" aria-hidden="true">
          {emoji}
        </div>
      )}
      {title && (
        <p className={`text-sm font-semibold text-ink ${emoji ? "mt-2" : ""}`}>{title}</p>
      )}
      <p className={`text-sm text-muted ${emoji || title ? "mt-1" : ""}`}>{description}</p>
    </div>
  );
}
