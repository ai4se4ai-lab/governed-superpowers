"use client";

import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import {
  createTokenAction,
  deleteTokenAction,
  revokeTokenAction,
  type CreateTokenState,
  type RevokeState,
} from "@/app/actions/tokens";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { CopyButton } from "@/components/ui/copy-button";
import { useToast } from "@/components/ui/toast";
import { maskedToken } from "@/lib/format";

export type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

const LIFETIMES = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "", label: "No expiry" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Status = { text: string; tone: "live" | "muted" | "alarm" };

function statusOf(token: TokenRow): Status {
  if (token.revokedAt) return { text: "revoked", tone: "alarm" };
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) {
    return { text: "expired", tone: "muted" };
  }
  return { text: "active", tone: "live" };
}

export function TokenConsole({ initialTokens }: { initialTokens: TokenRow[] }) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [minted, setMinted] = useState<{ plaintext: string; name: string } | null>(null);

  // The server component re-renders this list after revalidatePath; the
  // optimistic layer only covers the gap between click and that re-render.
  const [optimistic, applyOptimistic] = useOptimistic(
    initialTokens,
    (state, action: { type: "revoke" | "delete"; id: string }) =>
      action.type === "delete"
        ? state.filter((t) => t.id !== action.id)
        : state.map((t) =>
            t.id === action.id ? { ...t, revokedAt: new Date().toISOString() } : t,
          ),
  );

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-4">
        <p className="label">
          {optimistic.filter((t) => statusOf(t).tone === "live").length} active ·{" "}
          {optimistic.length} total
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          + New token
        </button>
      </section>

      {optimistic.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <ul className="flex flex-col gap-px" style={{ background: "var(--line)" }}>
          {optimistic.map((token) => (
            <TokenItem
              key={token.id}
              token={token}
              onOptimistic={applyOptimistic}
              onToast={toast}
            />
          ))}
        </ul>
      )}

      {creating ? (
        <NewTokenDialog
          onClose={() => setCreating(false)}
          onMinted={(plaintext, name) => {
            setCreating(false);
            setMinted({ plaintext, name });
          }}
        />
      ) : null}

      {minted ? (
        <MintedDialog
          plaintext={minted.plaintext}
          name={minted.name}
          onClose={() => setMinted(null)}
        />
      ) : null}
    </>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="panel ticked flex flex-col items-start gap-4 p-8">
      <p className="label">No tokens yet</p>
      <p className="max-w-md text-[13px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
        Nothing can authenticate against <code style={{ color: "var(--ink)" }}>/mcp</code> until you
        mint one. Create a separate token per machine so you can revoke just that machine later.
      </p>
      <button type="button" className="btn btn-primary" onClick={onCreate}>
        Mint your first token
      </button>
    </div>
  );
}

function TokenItem({
  token,
  onOptimistic,
  onToast,
}: {
  token: TokenRow;
  onOptimistic: (action: { type: "revoke" | "delete"; id: string }) => void;
  onToast: (message: string, kind?: "ok" | "error") => void;
}) {
  const [, startTransition] = useTransition();
  const status = statusOf(token);
  const dead = status.tone !== "live";

  const toneColor =
    status.tone === "live" ? "var(--live)" : status.tone === "alarm" ? "var(--alarm)" : "var(--ink-faint)";

  function act(kind: "revoke" | "delete") {
    startTransition(async () => {
      onOptimistic({ type: kind, id: token.id });
      const data = new FormData();
      data.set("tokenId", token.id);
      const result: RevokeState =
        kind === "revoke"
          ? await revokeTokenAction({}, data)
          : await deleteTokenAction({}, data);

      if (result.error) onToast(result.error, "error");
      else onToast(kind === "revoke" ? `“${token.name}” revoked.` : `“${token.name}” deleted.`);
    });
  }

  return (
    <li
      className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5 transition-opacity"
      style={{ background: "var(--bg-raised)", opacity: dead ? 0.55 : 1 }}
    >
      <div className="min-w-48 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span
            aria-hidden
            className={status.tone === "live" ? "dot-live h-[6px] w-[6px]" : "h-[6px] w-[6px]"}
            style={{ background: toneColor }}
          />
          <span className="label" style={{ color: toneColor }}>
            {status.text}
          </span>
        </div>
        <p className="truncate text-[15px] font-medium">{token.name}</p>
        <p className="mt-1 truncate text-[12px]" style={{ color: "var(--ink-faint)" }}>
          {maskedToken(token.prefix)}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-[12px] sm:grid-cols-3">
        {(
          [
            ["Created", formatDate(token.createdAt)],
            ["Last used", token.lastUsedAt ? formatDate(token.lastUsedAt) : "never"],
            ["Expires", token.expiresAt ? formatDate(token.expiresAt) : "never"],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="label mb-1">{label}</dt>
            <dd style={{ color: "var(--ink-dim)" }}>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex gap-2">
        {token.revokedAt ? (
          <button type="button" className="btn btn-ghost" onClick={() => act("delete")}>
            Delete
          </button>
        ) : (
          <button type="button" className="btn btn-danger" onClick={() => act("revoke")}>
            Revoke
          </button>
        )}
      </div>
    </li>
  );
}

/** Shared modal chrome: backdrop, escape-to-close, focus on open. */
function Dialog({
  title,
  onClose,
  children,
  dismissible = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    if (!dismissible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, dismissible]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-5"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
      onClick={dismissible ? onClose : undefined}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="panel ticked rise w-full max-w-lg p-7 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function NewTokenDialog({
  onClose,
  onMinted,
}: {
  onClose: () => void;
  onMinted: (plaintext: string, name: string) => void;
}) {
  const [state, formAction] = useActionState<CreateTokenState, FormData>(createTokenAction, {});

  useEffect(() => {
    if (state.plaintext && state.name) onMinted(state.plaintext, state.name);
  }, [state, onMinted]);

  return (
    <Dialog title="Create a token" onClose={onClose}>
      <p className="label">New credential</p>
      <h2
        className="mb-6 mt-2 text-[1.4rem] font-bold tracking-[-0.02em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Mint an MCP token
      </h2>

      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <Field
          label="Name"
          name="name"
          placeholder="work laptop"
          autoFocus
          required
          error={state.errors?.name}
          hint="Something you'll recognise in this list a year from now."
        />

        <Field label="Expires" name="expiresInDays" error={state.errors?.expiresInDays}>
          <select name="expiresInDays" className="input" defaultValue="90">
            {LIFETIMES.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="mt-1 flex gap-3">
          <SubmitButton className="btn btn-primary flex-1" pendingLabel="Minting">
            Create token
          </SubmitButton>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function MintedDialog({
  plaintext,
  name,
  onClose,
}: {
  plaintext: string;
  name: string;
  onClose: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  // Not dismissible by backdrop or Escape: closing is the only way to see this
  // value again, and there is no again.
  return (
    <Dialog title="Copy your token" onClose={onClose} dismissible={false}>
      <div className="mb-4 flex items-center gap-2.5">
        <span
          aria-hidden
          className="dot-live h-[7px] w-[7px]"
          style={{ background: "var(--live)" }}
        />
        <p className="label">Token created</p>
      </div>

      <h2
        className="mb-3 text-[1.4rem] font-bold tracking-[-0.02em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        “{name}”
      </h2>

      <p
        className="mb-5 border-l-2 px-3 py-2 text-[12px] leading-relaxed"
        style={{ borderColor: "var(--signal)", background: "var(--signal-wash)" }}
      >
        This is the only time the full token is shown. We store a hash, not the value — if you lose
        it, revoke this one and mint another.
      </p>

      <div
        className="mb-5 flex items-start gap-3 border p-4"
        style={{ background: "var(--bg-sunken)", borderColor: "var(--line)" }}
      >
        <code className="min-w-0 flex-1 break-all text-[12.5px] leading-relaxed">{plaintext}</code>
        <CopyButton value={plaintext} className="btn btn-ghost shrink-0" />
      </div>

      <label className="mb-5 flex cursor-pointer items-start gap-2.5 text-[13px]">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-[3px]"
        />
        <span style={{ color: "var(--ink-dim)" }}>
          I&apos;ve stored this token somewhere safe.
        </span>
      </label>

      <button type="button" className="btn btn-primary w-full" disabled={!acknowledged} onClick={onClose}>
        Done
      </button>
    </Dialog>
  );
}
