export function publicErrorBody(
  message: string,
  err: unknown
): { error: string; detail?: string } {
  if (process.env.NODE_ENV === "production") {
    return { error: message };
  }
  return { error: message, detail: String(err) };
}

export function logApiError(scope: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "unknown";
  const kind = ["Error", "TypeError", "TimeoutError", "AbortError", "SyntaxError"].includes(name) ? name : "unknown";
  console.error(`[${scope}]`, { kind });
}
