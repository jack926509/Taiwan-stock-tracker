export function stockIdFromPath(pathname: string): string {
  const match = /^\/stock\/([^/?#]+)\/?$/.exec(pathname);
  return match?.[1]?.toUpperCase() ?? "";
}

export function stockIdForRender(
  hydrated: boolean,
  paramId: string | undefined,
  pathname: string,
): string {
  if (!hydrated) return "";
  return (paramId || stockIdFromPath(pathname)).toUpperCase();
}
