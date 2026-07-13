"use client";

import { useMemo } from "react";
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Readiness } from "@/lib/types";
import type { NotebookDetail } from "./Workspace";

// Knowledge graph: sections as nodes colored by effective mastery, laid out in
// module columns, with prerequisite edges. Gaps and dependencies at a glance.

export default function MapPanel({
  detail,
  readiness,
}: {
  detail: NotebookDetail;
  readiness: Readiness | null;
}) {
  const { nodes, edges } = useMemo(() => {
    const effective = new Map(
      (readiness?.modules ?? []).flatMap((m) => m.sections).map((s) => [s.section_id, s.effective])
    );

    const COL_W = 300;
    const ROW_H = 96;
    const nodes: Node[] = [];

    detail.modules.forEach((m, mi) => {
      nodes.push({
        id: `module-${m.id}`,
        position: { x: mi * COL_W, y: 0 },
        data: { label: m.name },
        draggable: false,
        selectable: false,
        style: {
          background: "transparent",
          border: "none",
          fontWeight: 700,
          fontSize: 13,
          width: COL_W - 40,
          textAlign: "left" as const,
          color: "#57534e",
        },
      });
      detail.sections
        .filter((s) => s.module_id === m.id)
        .forEach((s, si) => {
          const eff = effective.get(s.id) ?? 0;
          const excluded = !!s.excluded;
          nodes.push({
            id: s.id,
            position: { x: mi * COL_W, y: 60 + si * ROW_H },
            data: {
              label: excluded ? `${s.name}\n(excluded)` : `${s.name}\n${Math.round(eff * 100)}%`,
            },
            style: excluded
              ? {
                  background: "#f5f5f4",
                  border: "2px dashed #d6d3d1",
                  color: "#a8a29e",
                  borderRadius: 12,
                  fontSize: 12,
                  width: COL_W - 40,
                  padding: 10,
                  whiteSpace: "pre-line" as const,
                }
              : {
                  background: `hsl(${8 + eff * 100} 70% ${95 - eff * 25}%)`,
                  border: `2px solid hsl(${8 + eff * 100} 60% 45%)`,
                  borderRadius: 12,
                  fontSize: 12,
                  width: COL_W - 40,
                  padding: 10,
                  whiteSpace: "pre-line" as const,
                },
          });
        });
    });

    const edges: Edge[] = detail.edges.map((e) => ({
      id: `${e.from_section}->${e.to_section}`,
      source: e.from_section,
      target: e.to_section,
      animated: true,
      style: { stroke: "#a8a29e" },
      label: "prereq",
      labelStyle: { fontSize: 9, fill: "#78716c" },
    }));

    return { nodes, edges };
  }, [detail, readiness]);

  if (detail.sections.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
        Build the study set first — the knowledge graph appears here, colored by mastery.
      </p>
    );
  }

  return (
    <div className="h-[calc(100vh-290px)] overflow-hidden rounded-2xl border border-line bg-white">
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
        <Background color="#e7e5e0" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
