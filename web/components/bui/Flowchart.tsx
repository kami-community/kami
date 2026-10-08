"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck } from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * FLOWCHART — an agent workflow on a dotted editor canvas.
 * Step cards (with a kind pill above) joined by measured
 * bezier connectors. Kami renders its gated workflows here:
 * each node carries a state, and the active one is ringed.
 * ───────────────────────────────────────────────────────── */

const PAD_Y = 24;
const ROW_GAP = 48;
const PILL_OFFSET = 30;

export type FlowNode = {
  id: string;
  kind: { label: string; hue: string };
  title: string;
  caption?: string;
  icon: ReactNode;
  state?: "done" | "active" | "todo" | "blocked";
  /** extra content under the caption (chips, counts) */
  body?: ReactNode;
  onClick?: () => void;
};

const mix = (hue: string, pct: number, base = "var(--surface)") =>
  `color-mix(in srgb, ${hue} ${pct}%, ${base})`;

export default function Flowchart({
  nodes,
  width = 320,
  label,
}: {
  nodes: FlowNode[];
  /** card width (clamped to the canvas) */
  width?: number;
  label: string;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [canvasW, setCanvasW] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      setCanvasW(canvas.clientWidth);
      setHeights((prev) => {
        const next = { ...prev };
        let changed = false;
        nodeRefs.current.forEach((el, id) => {
          const h = el.offsetHeight;
          if (h && Math.abs(h - (next[id] ?? 0)) > 0.5) {
            next[id] = h;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    nodeRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [nodes.length]);

  const cw = canvasW || 480;
  const w = Math.min(width, cw * 0.92);
  const tops: number[] = [];
  nodes.forEach((n, i) => {
    tops[i] = i === 0 ? PAD_Y : tops[i - 1] + (heights[nodes[i - 1].id] ?? 92) + ROW_GAP;
  });
  const last = nodes.length - 1;
  const canvasH = last >= 0 ? tops[last] + (heights[nodes[last].id] ?? 92) + PAD_Y : 120;
  const cx = cw / 2;

  const edge = (i: number) => {
    const fromY = tops[i] + (heights[nodes[i].id] ?? 92);
    const toY = tops[i + 1] + PILL_OFFSET;
    const k = Math.min(Math.max(Math.abs(toY - fromY) * 0.55, 24), 84);
    return `M ${cx} ${fromY} C ${cx} ${fromY + k}, ${cx} ${toY - k}, ${cx} ${toY}`;
  };

  return (
    <div className="flowchart card" role="list" aria-label={label}>
      <div ref={canvasRef} className="flowchart__canvas" style={{ height: canvasH }}>
        <svg className="flowchart__edges" width={cw} height={canvasH} aria-hidden>
          {nodes.slice(0, -1).map((n, i) => (
            <path
              key={n.id}
              d={edge(i)}
              fill="none"
              stroke={nodes[i].state === "done" ? "var(--ink-3)" : "var(--line-strong)"}
              strokeWidth="1.5"
              strokeDasharray={
                nodes[i + 1].state === "todo" || nodes[i + 1].state === "blocked"
                  ? "4 4"
                  : undefined
              }
            />
          ))}
        </svg>
        {nodes.map((n, i) => {
          const Tag = n.onClick ? "button" : "div";
          return (
            <div
              key={n.id}
              role="listitem"
              ref={(el) => {
                if (el) nodeRefs.current.set(n.id, el);
                else nodeRefs.current.delete(n.id);
              }}
              className="flow-node"
              data-state={n.state ?? "todo"}
              style={{ top: tops[i], left: cx - w / 2, width: w }}
            >
              <span
                className="flow-node__kind"
                style={{
                  background: mix(n.kind.hue, 14),
                  color: n.kind.hue,
                  boxShadow: `0 0 0 1px ${mix(n.kind.hue, 24)}`,
                }}
              >
                {n.kind.label}
              </span>
              <Tag
                type={n.onClick ? "button" : undefined}
                onClick={n.onClick}
                className="flow-node__card"
                aria-current={n.state === "active" ? "step" : undefined}
              >
                <span
                  className="flow-node__icon"
                  style={{
                    background: mix(n.kind.hue, 12),
                    color: n.kind.hue,
                    boxShadow: `0 0 0 1px ${mix(n.kind.hue, 20)}`,
                  }}
                >
                  {n.icon}
                </span>
                <span className="flow-node__copy">
                  <span className="flow-node__title">{n.title}</span>
                  {n.caption && <span className="flow-node__caption">{n.caption}</span>}
                  {n.body}
                </span>
                {n.state === "done" && (
                  <span className="flow-node__done" aria-label="Done">
                    <IconCheck size={11} strokeWidth={3} />
                  </span>
                )}
              </Tag>
            </div>
          );
        })}
      </div>
    </div>
  );
}
