import { renderLaunchImage } from "@/lib/iconImage";
export const dynamic = "force-static";
export function GET() { return renderLaunchImage(750, 1334); }
