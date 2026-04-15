import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export interface TreeNodeLayout {
  id: string;
  label: string;
  x: number;
  y: number;
  parentId?: string;
  isDuplicate?: boolean;
  isBase?: boolean;
  revealFrame: number;
}

export interface AnimatedTreeProps {
  nodes: TreeNodeLayout[];
  nodeRadius?: number;
  normalFill?: string;
  normalStroke?: string;
  duplicateFill?: string;
  duplicateStroke?: string;
  baseFill?: string;
  baseStroke?: string;
  textColor?: string;
  duplicateTextColor?: string;
  edgeColor?: string;
  fontSize?: number;
}

// ---------------------------------------------------------------------------
// Approximate cubic bezier path length via 20-point numerical integration.
// Works without DOM access — safe to call during Remotion render.
// ---------------------------------------------------------------------------
function bezierLength(
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  p3x: number, p3y: number,
): number {
  const N = 20;
  let len = 0;
  let px = p0x, py = p0y;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const mt = 1 - t;
    const qx = mt ** 3 * p0x + 3 * mt ** 2 * t * p1x + 3 * mt * t ** 2 * p2x + t ** 3 * p3x;
    const qy = mt ** 3 * p0y + 3 * mt ** 2 * t * p1y + 3 * mt * t ** 2 * p2y + t ** 3 * p3y;
    len += Math.hypot(qx - px, qy - py);
    px = qx;
    py = qy;
  }
  return len;
}

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// ---------------------------------------------------------------------------
// Animated tree — cubic bezier edges with stroke-dashoffset draw-on effect,
// overshoot spring pop for nodes, pulsing glow for duplicate sub-problems.
// ---------------------------------------------------------------------------
export const AnimatedTree: React.FC<AnimatedTreeProps> = ({
  nodes,
  nodeRadius = 36,
  normalFill = "#12192B",       // Lague: deep dark node
  normalStroke = "#3D8EFF",     // Lague: muted blue
  duplicateFill = "#1E1510",    // Lague: dark warm for duplicates
  duplicateStroke = "#FF8C54",  // Lague: warm orange — repeated subproblem
  baseFill = "#0D1E18",         // Lague: dark green tint for base cases
  baseStroke = "#3ECFA0",       // Lague: mint green
  textColor = "#E4E8F0",
  duplicateTextColor = "#FFA07A",
  edgeColor = "rgba(61,142,255,0.18)",  // subtle blue edge
  fontSize = 17,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nodeMap = React.useMemo(() => {
    const m: Record<string, TreeNodeLayout> = {};
    nodes.forEach((n) => { m[n.id] = n; });
    return m;
  }, [nodes]);

  // Pre-compute each edge's path data + length once (not per frame)
  const edgeMeta = React.useMemo(() => {
    return nodes
      .filter((n) => n.parentId && nodeMap[n.parentId])
      .map((node) => {
        const parent = nodeMap[node.parentId!];

        // Start at bottom of parent circle, end at top of child circle
        const sx = parent.x;
        const sy = parent.y + nodeRadius;
        const ex = node.x;
        const ey = node.y - nodeRadius;

        // Control points: sprout straight down from parent, straight up to child
        // Creates an elegant S-curve for any angle
        const tension = 55;
        const c1x = sx;
        const c1y = sy + tension;
        const c2x = ex;
        const c2y = ey - tension;

        const pathD = `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`;
        const length = bezierLength(sx, sy, c1x, c1y, c2x, c2y, ex, ey);

        return { nodeId: node.id, revealFrame: node.revealFrame, pathD, length };
      });
  }, [nodes, nodeMap, nodeRadius]);

  return (
    <svg
      style={{ position: "absolute", inset: 0, overflow: "visible" }}
      width="100%"
      height="100%"
    >
      <defs>
        {/* Shared glow filter for duplicate nodes */}
        <filter id="glow-dup" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Soft inner-glow filter for normal/base nodes */}
        <filter id="glow-normal" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ------------------------------------------------------------------ */}
      {/* EDGES — drawn on via stroke-dashoffset, cubic bezier curves         */}
      {/* ------------------------------------------------------------------ */}
      {edgeMeta.map(({ nodeId, revealFrame, pathD, length }) => {
        const progress = interpolate(
          frame,
          [revealFrame, revealFrame + 14],
          [0, 1],
          { ...clamp, easing: Easing.out(Easing.ease) },
        );
        if (progress <= 0) return null;

        const dashOffset = length * (1 - progress);
        const isDup = nodeMap[nodeId]?.isDuplicate;

        return (
          <path
            key={`edge-${nodeId}`}
            d={pathD}
            fill="none"
            stroke={isDup ? "rgba(255,107,107,0.35)" : edgeColor}
            strokeWidth={isDup ? 2.5 : 2}
            strokeLinecap="round"
            strokeDasharray={length}
            strokeDashoffset={dashOffset}
          />
        );
      })}

      {/* ------------------------------------------------------------------ */}
      {/* NODES — overshoot spring pop, label fade-in                         */}
      {/* ------------------------------------------------------------------ */}
      {nodes.map((node, i) => {
        const elapsed = frame - node.revealFrame;

        // Overshoot spring: snappy pop that overshoots to ~1.15× then settles
        const scale = spring({
          frame: elapsed,
          fps,
          config: { damping: 9, stiffness: 280, mass: 0.55, overshootClamping: false },
          durationInFrames: 20,
        });

        if (scale < 0.01) return null;

        // Label fades in slightly after the node pops
        const labelOpacity = interpolate(elapsed, [8, 20], [0, 1], clamp);

        const fill = node.isDuplicate ? duplicateFill : node.isBase ? baseFill : normalFill;
        const stroke = node.isDuplicate ? duplicateStroke : node.isBase ? baseStroke : normalStroke;
        const labelColor = node.isDuplicate ? duplicateTextColor : textColor;

        // Pulsing halo opacity for duplicates — sine wave tied to frame + offset per node
        const pulseOpacity = node.isDuplicate
          ? 0.35 + Math.sin(frame * 0.13 + i * 1.1) * 0.32
          : 0;

        // Subtle shimmer on the circle border (travels around the arc for unique nodes)
        const isVisible = elapsed >= 0;

        return (
          <g
            key={`node-${node.id}`}
            transform={`translate(${node.x}, ${node.y}) scale(${scale})`}
          >
            {/* Pulsing outer halo for duplicate nodes */}
            {node.isDuplicate && isVisible && (
              <circle
                r={nodeRadius + 10}
                fill="none"
                stroke={duplicateStroke}
                strokeWidth={1.5}
                opacity={pulseOpacity}
              />
            )}

            {/* Second (tighter) halo for extra glow on duplicates */}
            {node.isDuplicate && isVisible && (
              <circle
                r={nodeRadius + 4}
                fill="none"
                stroke={duplicateStroke}
                strokeWidth={1}
                opacity={pulseOpacity * 0.6}
              />
            )}

            {/* Main circle */}
            <circle
              r={nodeRadius}
              fill={fill}
              stroke={stroke}
              strokeWidth={node.isDuplicate ? 2.5 : 2}
              filter={node.isDuplicate ? "url(#glow-dup)" : "url(#glow-normal)"}
            />

            {/* Inner highlight arc — top-left, like a light reflection */}
            <path
              d={`M ${-nodeRadius * 0.5} ${-nodeRadius * 0.7} A ${nodeRadius * 0.9} ${nodeRadius * 0.9} 0 0 1 ${nodeRadius * 0.5} ${-nodeRadius * 0.7}`}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={2}
              strokeLinecap="round"
            />

            {/* Label */}
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              fontFamily="'SF Mono', 'Fira Code', 'Consolas', monospace"
              fontWeight="600"
              fill={labelColor}
              opacity={labelOpacity}
              style={{ userSelect: "none" }}
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
