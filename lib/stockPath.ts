export function stockIdFromPath(pathname: string): string {
  const match = /^\/stock\/([^/?#]+)$/.exec(pathname);
  return match?.[1]?.toUpperCase() ?? "";
}
