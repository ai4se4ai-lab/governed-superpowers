"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { deleteSpecAction, renameSpecAction } from "@/app/actions/graphs";
import type { SheetOption } from "./types";

/**
 * Spreadsheet-style tab strip along the bottom of the canvas: one tab per
 * spec. Double-click a tab to rename it - the title is the user's, and the MCP
 * publish path never writes over it.
 */
export function SheetTabs({
  sheets,
  selectedSheetId,
  projectId,
}: {
  sheets: SheetOption[];
  selectedSheetId: string | null;
  projectId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Renames and deletes land immediately; the server action revalidates behind
  // it. Same approach as the tokens console.
  const [optimisticSheets, applyOptimistic] = useOptimistic(
    sheets,
    (current, change: { id: string; title?: string; deleted?: true }) =>
      change.deleted
        ? current.filter((s) => s.id !== change.id)
        : current.map((s) => (s.id === change.id ? { ...s, title: change.title ?? s.title } : s)),
  );

  function commitRename(sheet: SheetOption, next: string) {
    setEditingId(null);
    const title = next.trim();
    if (!title || title === sheet.title) return;

    const formData = new FormData();
    formData.set("specId", sheet.id);
    formData.set("title", title);

    startTransition(async () => {
      applyOptimistic({ id: sheet.id, title });
      const result = await renameSpecAction({}, formData);
      if (result.error) setError(result.error);
      else setError(null);
    });
  }

  function remove(sheet: SheetOption) {
    const formData = new FormData();
    formData.set("specId", sheet.id);

    startTransition(async () => {
      applyOptimistic({ id: sheet.id, deleted: true });
      const result = await deleteSpecAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      // Deleting the open sheet leaves nothing selected; fall back to the
      // project's first remaining sheet.
      if (sheet.id === selectedSheetId) {
        const next = optimisticSheets.find((s) => s.id !== sheet.id);
        router.push(next ? sheetHref(projectId, next.id) : `/graphs?project=${projectId ?? ""}`);
      }
    });
  }

  if (optimisticSheets.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <div
        role="tablist"
        aria-label="Spec sheets"
        className="flex items-end gap-1 overflow-x-auto border-t pt-1"
        style={{ borderColor: "var(--line)" }}
      >
        {optimisticSheets.map((sheet) => {
          const active = sheet.id === selectedSheetId;
          return (
            <div
              key={sheet.id}
              role="tab"
              aria-selected={active}
              className="group relative flex shrink-0 items-center gap-1 rounded-b-[var(--radius-panel)] border border-t-0 px-3 py-1.5"
              style={{
                background: active ? "var(--bg-raised)" : "var(--bg-sunken)",
                borderColor: "var(--line)",
                borderTop: `2px solid ${active ? "var(--signal)" : "transparent"}`,
              }}
            >
              {editingId === sheet.id ? (
                <RenameInput
                  initial={sheet.title}
                  onCommit={(value) => commitRename(sheet, value)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <button
                  type="button"
                  title={`${sheet.specPath} · double-click to rename`}
                  onClick={() => startTransition(() => router.push(sheetHref(projectId, sheet.id)))}
                  onDoubleClick={() => setEditingId(sheet.id)}
                  disabled={pending}
                  className="max-w-[18ch] truncate text-[12px]"
                  style={{ color: active ? "var(--ink)" : "var(--ink-faint)", cursor: "pointer" }}
                >
                  {sheet.title}
                </button>
              )}

              <button
                type="button"
                aria-label={`Delete sheet ${sheet.title}`}
                onClick={() => remove(sheet)}
                disabled={pending}
                className="text-[12px] leading-none opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                style={{ color: "var(--ink-faint)", cursor: "pointer" }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="label" role="alert" style={{ color: "var(--alarm)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function sheetHref(projectId: string | null, sheetId: string): string {
  return `/graphs?project=${projectId ?? ""}&spec=${sheetId}`;
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);

  useEffect(() => {
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      maxLength={120}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit(value);
        // Escape reverts - a half-typed name should never be committed by
        // accident on a stray click away.
        if (event.key === "Escape") onCancel();
      }}
      className="w-[18ch] bg-transparent text-[12px] outline-none"
      style={{ color: "var(--ink)", fontFamily: "var(--font-mono)" }}
    />
  );
}
