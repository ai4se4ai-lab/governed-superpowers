"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastKind = "ok" | "error";
type Toast = { id: number; message: string; kind: ToastKind };

const ToastContext = createContext<((message: string, kind?: ToastKind) => void) | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: ToastKind = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <output
            key={toast.id}
            className="panel ticked rise pointer-events-auto flex items-start gap-3 px-4 py-3 text-[13px] leading-snug"
            style={{
              borderColor: toast.kind === "error" ? "var(--alarm)" : "var(--line-strong)",
              background: toast.kind === "error" ? "var(--alarm-wash)" : "var(--bg-raised)",
            }}
          >
            <span
              aria-hidden
              className="mt-[5px] h-[6px] w-[6px] shrink-0"
              style={{ background: toast.kind === "error" ? "var(--alarm)" : "var(--live)" }}
            />
            <span>{toast.message}</span>
          </output>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
