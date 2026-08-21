function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export async function isAuthorizedHealthDetail(req: Request): Promise<boolean> {
  const token = process.env.HEALTH_DETAIL_TOKEN;
  const bearer = bearerToken(req.headers.get("authorization"));
  return Boolean(token && bearer === token);
}
