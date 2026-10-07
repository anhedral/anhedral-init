import { componentResources } from "../../../src/progress-view.js";
import {
  currentProgress,
  componentState,
  ComponentProgress,
} from "./build-progress.js";
import { useState } from "react";
import { ArrowRight, Monitor, Server, Database } from "lucide-react";
import type { Architecture } from "../shared/architecture.js";
import type { Controller } from "./use-control-panel.js";
import { Button } from "./components/ui/button.js";
import { Badge } from "./components/ui/badge.js";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "./components/ui/sheet.js";
import { Empty } from "./components.js";

const layers = ["interface", "application", "service"] as const;
const labels = {
  interface: "Interfaces",
  application: "Application",
  service: "Services",
};
const icons = { interface: Monitor, application: Server, service: Database };
const states = {
  planned: "Planned",
  building: "Building",
  configured: "Configured",
  verified: "Verified",
  blocked: "Blocked",
};
const pieceStates = {
  planned: "planned",
  starter: "building",
  configured: "configured",
  "locally-verified": "verified",
  "preview-verified": "verified",
  released: "verified",
  blocked: "blocked",
} as const;
export function ArchitectureView({
  assembly,
  resources,
  request,
  context,
  busy,
  ...controller
}: Controller) {
  const [selected, select] = useState<string>();
  const progress = currentProgress({
    assembly,
    resources,
    request,
    context,
    busy,
    ...controller,
  });
  const graph: Architecture = assembly?.architecture || {
    nodes: (assembly?.selected || []).map((id) => {
      const piece = assembly?.pieces[id];
      return {
        id,
        capability: id,
        label: id,
        kind: "Selected stack piece",
        layer: ["next", "expo", "electron", "wxt"].includes(id)
          ? "interface"
          : ["hono"].includes(id)
            ? "application"
            : "service",
        status: piece ? pieceStates[piece.status] : "planned",
        evidence: piece?.evidence || [],
      };
    }),
    edges: [],
  };
  const node = graph.nodes.find((item) => item.id === selected);
  const connections = graph.edges.filter(
    (edge) => edge.from === selected || edge.to === selected,
  );
  const positions = new Map<string, { x: number; y: number }>();
  const headings = new Map<string, number>();
  let height = 24;
  for (const layer of layers) {
    const nodes = graph.nodes.filter((node) => node.layer === layer);
    if (!nodes.length) continue;
    headings.set(layer, height);
    nodes.forEach((node, index) =>
      positions.set(node.id, {
        x: 40 + (index % 4) * 240,
        y: height + 38 + Math.floor(index / 4) * 152,
      }),
    );
    height += 50 + Math.ceil(nodes.length / 4) * 152;
  }
  if (!graph.nodes.length)
    return (
      <Empty title="Your architecture starts here">
        <Button
          onClick={() =>
            request(
              `${context} Inspect the app and choose only the stack it needs. Save its plan and map its components and connections with anhedral_update_architecture.`,
            )
          }
        >
          Map with Codex
        </Button>
      </Empty>
    );
  return (
    <>
      <div
        className="architecture-scroll"
        tabIndex={0}
        role="region"
        aria-label="App architecture canvas"
      >
        <div className="architecture-canvas" style={{ height }}>
          <svg
            className="architecture-lines"
            preserveAspectRatio="none"
            viewBox={`0 0 1000 ${height}`}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="connection-arrow"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6" fill="var(--subtle)" />
              </marker>
            </defs>
            {graph.edges.map((edge) => {
              const from = positions.get(edge.from)!;
              const to = positions.get(edge.to)!;
              const sameRow = from.y === to.y;
              const forward = sameRow ? to.x > from.x : to.y > from.y;
              const x1 = sameRow ? from.x + (forward ? 200 : 0) : from.x + 100;
              const x2 = sameRow ? to.x + (forward ? 0 : 200) : to.x + 100;
              const y1 = sameRow ? from.y + 54 : from.y + (forward ? 108 : 0);
              const y2 = sameRow ? to.y + 54 : to.y + (forward ? 0 : 108);
              const midX = (x1 + x2) / 2,
                midY = (y1 + y2) / 2;
              const gutter = from.x + 220;
              const path =
                !sameRow && Math.abs(y2 - y1) > 200
                  ? `M ${x1} ${y1} L ${x1} ${y1 + (forward ? 18 : -18)} L ${gutter} ${y1 + (forward ? 18 : -18)} L ${gutter} ${y2 - (forward ? 18 : -18)} L ${x2} ${y2 - (forward ? 18 : -18)} L ${x2} ${y2}`
                  : sameRow
                    ? `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
                    : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
              return (
                <path
                  key={`${edge.from}:${edge.to}`}
                  className={`connection ${edge.status} ${selected && (edge.from === selected || edge.to === selected) ? "highlighted" : ""}`}
                  d={path}
                  markerEnd="url(#connection-arrow)"
                />
              );
            })}
          </svg>
          {layers
            .filter((layer) => headings.has(layer))
            .map((layer) => (
              <div
                key={layer}
                className="architecture-layer"
                style={{ left: "4%", top: headings.get(layer) }}
              >
                {labels[layer]}
              </div>
            ))}
          {graph.nodes.map((node) => {
            const Icon = icons[node.layer];
            const point = positions.get(node.id)!;
            const displayState = componentState(progress, node, resources);
            return (
              <Button
                key={node.id}
                variant="outline"
                className={`architecture-node ${displayState}`}
                style={{ left: `${point.x / 10}%`, top: point.y }}
                onClick={() => select(node.id)}
                aria-label={`${node.label}, ${states[displayState]}`}
              >
                <span className="node-top">
                  <Icon size={18} />
                  <span
                    className={`status-dot ${componentState(progress, node, resources)}`}
                  />
                </span>
                <strong>{node.label}</strong>
                <span className="node-kind">{node.kind}</span>
              </Button>
            );
          })}
        </div>
      </div>
      <div className="architecture-caption">
        <span>
          {assembly?.architecture
            ? "Updated by Codex"
            : "Selected stack · connections not mapped"}
        </span>
        <div className="architecture-legend">
          {["planned", "building", "configured", "verified", "blocked"].map(
            (state) => (
              <span key={state}>
                <i className={`status-dot ${state}`} />
                {states[state as keyof typeof states]}
              </span>
            ),
          )}
        </div>
      </div>
      <Sheet
        open={!!node}
        onOpenChange={(open) => {
          if (!open) select(undefined);
        }}
      >
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{node?.label}</SheetTitle>
            <SheetDescription>{node?.kind}</SheetDescription>
          </SheetHeader>
          {node && (
            <div className="node-details">
              <Badge variant="outline">
                <i
                  className={`status-dot ${componentState(progress, node, resources)}`}
                />
                {states[componentState(progress, node, resources)]}
              </Badge>
              <p className="muted-copy">
                Architecture and product evidence · provider checks below
              </p>
              <ComponentProgress progress={progress} node={node} />
              {node.evidence.length > 0 && (
                <section>
                  <h3>Evidence</h3>
                  {node.evidence.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </section>
              )}
              {connections.length > 0 && (
                <section>
                  <h3>Connections</h3>
                  {connections.map((edge) => (
                    <div
                      key={`${edge.from}:${edge.to}`}
                      className="edge-detail"
                    >
                      <strong>
                        {
                          graph.nodes.find(
                            (item) =>
                              item.id ===
                              (edge.from === node.id ? edge.to : edge.from),
                          )?.label
                        }
                      </strong>
                      <span>
                        {edge.from === node.id ? "Outgoing" : "Incoming"} ·{" "}
                        {edge.label} · {states[edge.status]}
                      </span>
                      {edge.evidence.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  ))}
                </section>
              )}
              {componentResources(node, resources).map((resource) => (
                <section key={resource.id}>
                  <h3>Provider check</h3>
                  <p>
                    {resource.status} · {resource.detail}
                  </p>
                </section>
              ))}
              <Button
                disabled={busy}
                onClick={() =>
                  request(
                    `${context} Work on the ${node.label} component (${node.id}). Inspect its state and connections, resolve the next gap, and update its architecture and anhedral_report_project_progress with non-secret evidence, blockers and next action. Recheck stale discovery and use saved resource references before creating anything. Respect existing scope and approvals.`,
                  )
                }
              >
                Work on this <ArrowRight />
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
