// 統一 SVG 線條圖示：取代散落各頁的文字符號（←、↻、⌄、✕、✓）與功能性 emoji（📊、⚠️），
// 與底部導覽既有的線條圖示同語彙（stroke、round cap）。裝飾用 emoji（空狀態插圖）不在此列。

interface IconProps {
  className?: string;
  strokeWidth?: number;
}

function makeIcon(children: React.ReactNode) {
  return function Icon({ className = "h-4 w-4", strokeWidth = 2 }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };
}

export const IconArrowLeft = makeIcon(<path d="M19 12H5m7-7-7 7 7 7" />);

export const IconRefresh = makeIcon(
  <>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </>
);

export const IconChevronDown = makeIcon(<path d="m6 9 6 6 6-6" />);

export const IconX = makeIcon(<path d="M18 6 6 18M6 6l12 12" />);

export const IconCheck = makeIcon(<path d="m4 12 5 5L20 7" />);

export const IconChartBar = makeIcon(
  <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />
);

export const IconAlertTriangle = makeIcon(
  <>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4m0 4h.01" />
  </>
);
