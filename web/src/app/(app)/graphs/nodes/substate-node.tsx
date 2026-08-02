"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { themeFor } from "@/lib/graph-color";
import { SUBSTATE_DIAMETER, type SubstateNodeData } from "@/lib/graph-layout";
import type { CSSProperties } from "react";

const HANDLE: CSSProperties = { opacity: 0 };

/** One task. Click it to see what grounded it and what it changed. */
export function SubstateNode({ data, selected }: NodeProps) {
  const { label, title, status, category } = data as unknown as SubstateNodeData;
  const theme = themeFor(category);

  return (
    <div
      className="flex items-center justify-center rounded-full border-2 transition-shadow"
      style={{
        width: SUBSTATE_DIAMETER,
        height: SUBSTATE_DIAMETER,
        background: "var(--bg-raised)",
        borderColor: theme.stroke,
        boxShadow: selected ? `0 0 0 3px var(--signal)` : undefined,
        cursor: "pointer",
      }}
      title={`${title}${status ? ` — ${status.replace(/_/g, " ").toLowerCase()}` : ""}`}
    >
      <Handle type="target" position={Position.Top} style={HANDLE} isConnectable={false} />
      <span className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
        {label}
      </span>
      <Handle type="source" position={Position.Bottom} style={HANDLE} isConnectable={false} />
    </div>
  );
}
