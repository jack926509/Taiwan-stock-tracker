"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "登入失敗");
      }
    } catch {
      setError("連線失敗，請再試一次");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-xs space-y-4 rounded-card border border-line bg-surface p-6 shadow-card"
      >
        <h1 className="text-center text-lg font-semibold text-ink">台股追蹤</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="輸入存取密碼"
          autoFocus
          className="w-full rounded-lg border border-line bg-app px-3 py-2 text-sm text-ink outline-none focus:border-primary"
        />
        {error && <p className="text-xs text-warn">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-white disabled:opacity-50 dark:text-app"
        >
          {busy ? "驗證中…" : "進入"}
        </button>
      </form>
    </main>
  );
}
