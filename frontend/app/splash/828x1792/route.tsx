import { renderLaunchImage } from "@/lib/iconImage";
export const dynamic = "force-static";
export function GET() { return renderLaunchImage(828, 1792); }
