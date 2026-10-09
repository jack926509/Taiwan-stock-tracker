import { installClientDiagnostics } from "./lib/clientDiagnostics";

// Next.js 15.3 起支援，於 hydration 前同步建立監聽。
installClientDiagnostics();
