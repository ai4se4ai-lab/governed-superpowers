"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { mixCaption, themeFor } from "@/lib/graph-color";
import type { StateNodeData } from "@/lib/graph-layout";

/**
 * A container: one coherent chunk of the spec, holding the tasks that
 * delivered it. Its wash is the provenance mix of everything inside.
 */
export function StateNode({ data }: NodeProps) {
  const { label, summary, category, mix } = data as unknown as StateNodeData;
  const theme = themeFor(category);

  return (
    <div
      className="h-full w-full rounded-2xl border px-3 pt-3"
      style={{ background: theme.wash, borderColor: theme.stroke }}
    >
      {/* Hidden but mounted: React Flow drops an edge whose handle isn't
          rendered, so these carry the container-to-container connections. */}
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} isConnectable={false} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} isConnectable={false} />

      <p
        className="truncate text-[12px] font-semibold leading-tight"
        style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}
        title={summary ? `${label} — ${summary}` : label}
      >
        {label}
      </p>
      {/* Colour never carries the meaning on its own. */}
      <p className="label mt-0.5 truncate" style={{ color: theme.stroke }} title={theme.label}>
        {mixCaption(mix)}
      </p>
    </div>
  );
}
