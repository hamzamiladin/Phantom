/**
 * ControlFlowBranch — Sebastian Lague-inspired flowing code animation.
 *
 * Design principles:
 * - SHAPES over text: connected nodes, flowing arrows, animated paths
 * - Progressive construction: elements build node-by-node
 * - Animated flow: glowing dots travel along bezier connections
 * - Dark bg with bright saturated accents on shapes
 */
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ControlFlowBranchProps } from "@phantom/shared";

const FRAMES_PER_STEP = 72;

// ---------------------------------------------------------------------------
// Color tokens
// ---------------------------------------------------------------------------
const C = {
  bg: "#0C0E15",
  bgCard: "#10141E",
  nodeDefault: "#151B2E",
  nodeActive: "#3D8EFF",
  nodeDone: "#3ECFA0",
  nodeWarn: "#FF8C54",
  accent2: "#A78BFA",  // purple
  accent3: "#FBBF24",  // amber
  edge: "rgba(255,255,255,0.08)",
  edgeActive: "rgba(61,142,255,0.35)",
  text: "#E4E8F0",
  textMuted: "rgba(228,232,240,0.38)",
  mono: "'JetBrains Mono','SF Mono','Fira Code',monospace",
  sans: "'SF Pro Display','Helvetica Neue',system-ui,sans-serif",
};

const PHASE_COLORS: Record<string, string> = {
  overview: C.nodeDone,
  mechanism: "#60A5FA",
  execution: C.nodeActive,
  insight: "#FBBF24",
};

const NODE_ACCENTS = [C.nodeActive, C.nodeDone, C.accent2, C.accent3, C.nodeWarn, "#60A5FA"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseNumericArray(s: string): number[] {
  try {
    const arr = JSON.parse(s.replace(/'/g, '"')) as unknown[];
    return arr.filter((x): x is number => typeof x === "number");
  } catch {
    const matches = s.match(/-?\d+(\.\d+)?/g);
    return matches ? matches.map(Number) : [];
  }
}

type VizMode = "array" | "numeric" | "boolean" | "flow" | "call_results" | "async_flow" | "sort_partition" | "label_only";

function detectVizMode(variables: Record<string, string>, codeType?: string): VizMode {
  const vals = Object.values(variables);
  const keys = Object.keys(variables);
  if (vals.length === 0) return "label_only";
  if (codeType === "recursive_function" && keys.some(k => /\w+\(\d+\)/.test(k))) return "call_results";
  if ((codeType === "async_flow" || codeType === "asynchronous") &&
      keys.some(k => ["status", "awaiting", "resolved", "running"].includes(k))) return "async_flow";
  if (codeType === "sorting_algorithm" &&
      (variables.pivot !== undefined || keys.some(k => k === "left" || k === "right"))) return "sort_partition";
  if (vals.some(v => v.trim().startsWith("["))) return "array";
  const numCount = vals.filter(v => /^-?\d+(\.\d+)?$/.test(v.trim())).length;
  if (numCount >= 2 && numCount === vals.length) return "numeric";
  if (vals.every(v => v === "true" || v === "false")) return "boolean";
  return "flow";
}

// ---------------------------------------------------------------------------
// Animated bezier path with traveling glow dot
// ---------------------------------------------------------------------------
function AnimatedEdge({
  x1, y1, x2, y2,
  color,
  progress,
  dotProgress,
}: {
  x1: number; y1: number; x2: number; y2: number;
  color: string;
  progress: number;
  dotProgress: number;
}) {
  // Bezier control points for a smooth curve
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const isVertical = Math.abs(dy) > Math.abs(dx);

  const cx1 = isVertical ? x1 : mx;
  const cy1 = isVertical ? my : y1;
  const cx2 = isVertical ? x2 : mx;
  const cy2 = isVertical ? my : y2;

  const d = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

  // Dot position along the curve
  const t = dotProgress;
  const dotX = (1-t)*(1-t)*(1-t)*x1 + 3*(1-t)*(1-t)*t*cx1 + 3*(1-t)*t*t*cx2 + t*t*t*x2;
  const dotY = (1-t)*(1-t)*(1-t)*y1 + 3*(1-t)*(1-t)*t*cy1 + 3*(1-t)*t*t*cy2 + t*t*t*y2;

  // Arrow head at end
  const angle = Math.atan2(y2 - cy2, x2 - cx2);
  const arrowLen = 10;
  const ax1 = x2 - arrowLen * Math.cos(angle - 0.35);
  const ay1 = y2 - arrowLen * Math.sin(angle - 0.35);
  const ax2 = x2 - arrowLen * Math.cos(angle + 0.35);
  const ay2 = y2 - arrowLen * Math.sin(angle + 0.35);

  return (
    <g opacity={progress}>
      {/* Path line */}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} opacity={0.3}
        strokeDasharray="6,4" />
      {/* Glow path overlay */}
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} opacity={0.08} />
      {/* Traveling glow dot */}
      {dotProgress > 0.01 && dotProgress < 0.99 && (
        <>
          <circle cx={dotX} cy={dotY} r={14} fill={color} opacity={0.08} />
          <circle cx={dotX} cy={dotY} r={5} fill={color} opacity={0.9} />
        </>
      )}
      {/* Arrow head */}
      <polygon points={`${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}`}
        fill={color} opacity={0.5 * progress} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Flow node — rounded rect with name + value
// ---------------------------------------------------------------------------
function FlowNode({
  x, y, name, value, accent, progress, isActive, width = 160, height = 64,
}: {
  x: number; y: number; name: string; value: string; accent: string;
  progress: number; isActive: boolean; width?: number; height?: number;
}) {
  const displayVal = value.length > 18 ? value.slice(0, 16) + "\u2026" : value;
  const glow = isActive ? 0.15 : 0;
  const strokeW = isActive ? 2.5 : 1.5;

  return (
    <g opacity={progress} transform={`translate(${x - width/2}, ${y - height/2})`}>
      {/* Glow */}
      {isActive && (
        <rect x={-8} y={-8} width={width + 16} height={height + 16}
          rx={18} fill={accent} opacity={glow * progress} />
      )}
      {/* Node body */}
      <rect x={0} y={0} width={width} height={height}
        rx={12} fill={C.nodeDefault} stroke={accent}
        strokeWidth={strokeW} opacity={0.95} />
      {/* Name label */}
      <text x={width / 2} y={height * 0.38} textAnchor="middle"
        fill={accent} opacity={0.85}
        style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.06em" }}>
        {name}
      </text>
      {/* Value */}
      <text x={width / 2} y={height * 0.72} textAnchor="middle"
        fill={C.text}
        style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 700 }}>
        {displayVal}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// VIZ: Flow diagram — connected nodes with animated paths
// ---------------------------------------------------------------------------
// StepViz — step-aware visualization that changes per step
// Uses stepIndex + totalSteps to show progressive animation state
// ---------------------------------------------------------------------------
function StepViz({
  variables, stepLocalFrame, fps, codeType, stepIndex, totalSteps,
}: {
  variables: Record<string, string>; stepLocalFrame: number; fps: number;
  codeType?: string; stepIndex: number; totalSteps: number;
}) {
  const entries = Object.entries(variables).slice(0, 6);
  const progress = stepIndex / Math.max(totalSteps - 1, 1); // 0..1 across all steps
  const entryAnim = (i: number) => spring({
    frame: stepLocalFrame - i * 3, fps,
    config: { damping: 22, stiffness: 140, mass: 0.6 }, durationInFrames: 20,
  });

  // --- HEAP / GRAPH: show a grid being explored ---
  if (codeType === "heap_graph") {
    const gridRows = 4;
    const gridCols = 6;
    const cellSize = 72;
    const gridW = gridCols * cellSize;
    const gridH = gridRows * cellSize;
    const originX = 960 - gridW / 2;
    const originY = 300;

    // How many cells have been "visited" based on step progress
    const visitedCount = Math.floor(progress * gridRows * gridCols);
    // Spiral order from edges inward
    const visitOrder: [number, number][] = [];
    for (let c = 0; c < gridCols; c++) visitOrder.push([0, c]);
    for (let r = 1; r < gridRows; r++) visitOrder.push([r, gridCols - 1]);
    for (let c = gridCols - 2; c >= 0; c--) visitOrder.push([gridRows - 1, c]);
    for (let r = gridRows - 2; r >= 1; r--) visitOrder.push([r, 0]);
    // Inner cells
    for (let r = 1; r < gridRows - 1; r++)
      for (let c = 1; c < gridCols - 1; c++) visitOrder.push([r, c]);

    // Water level from variables
    const waterVal = variables.water || variables.result || "0";
    const waterNum = parseInt(waterVal) || 0;

    // Height values (simulated)
    const heights = [
      [3, 3, 3, 3, 3, 3],
      [3, 0, 1, 0, 2, 3],
      [3, 1, 0, 2, 0, 3],
      [3, 3, 3, 3, 3, 3],
    ];

    return (
      <g>
        {/* Grid cells */}
        {Array.from({ length: gridRows }, (_, r) =>
          Array.from({ length: gridCols }, (_, c) => {
            const x = originX + c * cellSize;
            const y = originY + r * cellSize;
            const idx = visitOrder.findIndex(([vr, vc]) => vr === r && vc === c);
            const isVisited = idx >= 0 && idx < visitedCount;
            const isBoundary = r === 0 || r === gridRows - 1 || c === 0 || c === gridCols - 1;
            const h = heights[r]?.[c] ?? 1;
            const cellAnim = spring({
              frame: stepLocalFrame - (isVisited ? 0 : 10), fps,
              config: { damping: 24, stiffness: 130 }, durationInFrames: 20,
            });

            // Color based on height and visit status
            const baseColor = isBoundary ? C.nodeActive : (isVisited ? C.nodeDone : C.nodeDefault);
            const heightOpacity = 0.15 + (h / 4) * 0.4;

            // Water in this cell
            const maxH = isBoundary ? 0 : Math.max(0, 3 - h);
            const showWater = isVisited && !isBoundary && maxH > 0;

            return (
              <g key={`g${r}-${c}`} opacity={cellAnim}>
                {/* Cell background */}
                <rect x={x + 2} y={y + 2} width={cellSize - 4} height={cellSize - 4}
                  rx={8} fill={baseColor} opacity={heightOpacity}
                  stroke={isVisited ? baseColor : "rgba(255,255,255,0.05)"}
                  strokeWidth={isVisited ? 1.5 : 0.5} />
                {/* Height label */}
                <text x={x + cellSize / 2} y={y + cellSize / 2 - 6} textAnchor="middle"
                  fill={C.text} opacity={isVisited ? 0.8 : 0.25}
                  style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 700 }}>
                  {h}
                </text>
                {/* Water overlay */}
                {showWater && (
                  <>
                    <rect x={x + 6} y={y + cellSize - 10 - maxH * 10}
                      width={cellSize - 12} height={maxH * 10}
                      rx={4} fill="#60A5FA" opacity={0.25} />
                    <text x={x + cellSize / 2} y={y + cellSize / 2 + 14} textAnchor="middle"
                      fill="#60A5FA" opacity={0.6}
                      style={{ fontFamily: C.mono, fontSize: 10 }}>
                      +{maxH}
                    </text>
                  </>
                )}
                {/* Visit pulse */}
                {isVisited && idx === visitedCount - 1 && (
                  <rect x={x + 2} y={y + 2} width={cellSize - 4} height={cellSize - 4}
                    rx={8} fill="none" stroke={C.nodeDone} strokeWidth={2.5}
                    opacity={0.6 * (1 - stepLocalFrame / FRAMES_PER_STEP)} />
                )}
              </g>
            );
          })
        )}

        {/* Water counter */}
        <g opacity={entryAnim(0)}>
          <rect x={originX + gridW + 40} y={originY + 30} width={180} height={70}
            rx={12} fill={C.bgCard} stroke="rgba(96,165,250,0.3)" strokeWidth={1} />
          <text x={originX + gridW + 130} y={originY + 55} textAnchor="middle"
            fill="rgba(96,165,250,0.6)"
            style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em" }}>
            WATER
          </text>
          <text x={originX + gridW + 130} y={originY + 82} textAnchor="middle"
            fill="#60A5FA"
            style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 700 }}>
            {waterNum}
          </text>
        </g>

        {/* Max height indicator */}
        {variables.max_height && (
          <g opacity={entryAnim(1)}>
            <rect x={originX + gridW + 40} y={originY + 120} width={180} height={70}
              rx={12} fill={C.bgCard} stroke="rgba(62,207,160,0.3)" strokeWidth={1} />
            <text x={originX + gridW + 130} y={originY + 145} textAnchor="middle"
              fill="rgba(62,207,160,0.6)"
              style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em" }}>
              MAX HEIGHT
            </text>
            <text x={originX + gridW + 130} y={originY + 172} textAnchor="middle"
              fill={C.nodeDone}
              style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 700 }}>
              {variables.max_height}
            </text>
          </g>
        )}
      </g>
    );
  }

  // --- DYNAMIC PROGRAMMING: show table being filled ---
  if (codeType === "dynamic_programming") {
    const cols = 8;
    const cellW = 80;
    const cellH = 60;
    const startX = 960 - (cols * cellW) / 2;
    const startY = 320;
    const filledCount = Math.floor(progress * cols) + 1;

    return (
      <g>
        {Array.from({ length: cols }, (_, i) => {
          const x = startX + i * cellW;
          const isFilled = i < filledCount;
          const isCurrent = i === filledCount - 1;
          const cellAnim = spring({
            frame: stepLocalFrame - i * 2, fps,
            config: { damping: 22, stiffness: 130 }, durationInFrames: 18,
          });
          const dpVal = entries.find(([k]) => k.includes(`[${i}]`) || k.includes(`${i}`))?.[1] ?? (isFilled ? String(i) : "");

          return (
            <g key={`dp${i}`} opacity={cellAnim}>
              <rect x={x + 3} y={startY} width={cellW - 6} height={cellH}
                rx={10} fill={isFilled ? C.nodeDefault : "rgba(255,255,255,0.02)"}
                stroke={isCurrent ? C.nodeActive : isFilled ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)"}
                strokeWidth={isCurrent ? 2.5 : 1} />
              {isFilled && (
                <rect x={x + 3} y={startY} width={cellW - 6} height={cellH}
                  rx={10} fill={isCurrent ? C.nodeActive : C.nodeDone} opacity={isCurrent ? 0.12 : 0.06} />
              )}
              {isFilled && (
                <text x={x + cellW / 2} y={startY + cellH / 2 + 6} textAnchor="middle"
                  fill={isCurrent ? C.nodeActive : C.text}
                  style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 700 }}>
                  {dpVal}
                </text>
              )}
              {/* Index label */}
              <text x={x + cellW / 2} y={startY - 10} textAnchor="middle"
                fill={C.textMuted}
                style={{ fontFamily: C.mono, fontSize: 10 }}>
                [{i}]
              </text>
              {/* Arrow from previous */}
              {i > 0 && isFilled && (
                <AnimatedEdge
                  x1={x - 4} y1={startY + cellH / 2}
                  x2={x + 6} y2={startY + cellH / 2}
                  color={C.nodeActive} progress={cellAnim}
                  dotProgress={isCurrent ? interpolate(stepLocalFrame, [5, 30], [0, 1], {
                    extrapolateLeft: "clamp", extrapolateRight: "clamp",
                  }) : 0}
                />
              )}
            </g>
          );
        })}
        {/* Side panel with current vars */}
        {entries.length > 0 && (
          <DataOverlay variables={variables} stepLocalFrame={stepLocalFrame} fps={fps}
            accent={C.nodeActive} />
        )}
      </g>
    );
  }

  // --- DEFAULT: Progressive pipeline visualization ---
  // Shows variables as nodes in a flowing pipeline that builds step by step
  if (entries.length === 0) return null;

  const count = entries.length;
  // Layout: circular arrangement for ≤4, or two-row grid for more
  const isCircular = count <= 4;
  const centerX = 960;
  const centerY = 420;

  if (isCircular) {
    const radius = 160 + count * 20;
    return (
      <g>
        {/* Center pulse showing step progress */}
        <circle cx={centerX} cy={centerY} r={40 * progress}
          fill={C.nodeActive} opacity={0.04} />
        <circle cx={centerX} cy={centerY} r={20}
          fill={C.nodeActive} opacity={0.08} />
        <text x={centerX} y={centerY + 5} textAnchor="middle"
          fill={C.nodeActive} opacity={0.5}
          style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700 }}>
          {stepIndex + 1}
        </text>

        {/* Variables arranged around center */}
        {entries.map(([name, value], i) => {
          const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
          const nx = centerX + Math.cos(angle) * radius;
          const ny = centerY + Math.sin(angle) * radius;
          const nodeAnim = entryAnim(i);
          const accent = NODE_ACCENTS[i % NODE_ACCENTS.length];

          return (
            <g key={name}>
              {/* Connection to center */}
              <AnimatedEdge
                x1={centerX + Math.cos(angle) * 25} y1={centerY + Math.sin(angle) * 25}
                x2={nx - Math.cos(angle) * 45} y2={ny - Math.sin(angle) * 30}
                color={accent} progress={nodeAnim}
                dotProgress={interpolate(stepLocalFrame, [i * 4 + 5, i * 4 + 25], [0, 1], {
                  extrapolateLeft: "clamp", extrapolateRight: "clamp",
                })}
              />
              {/* Node */}
              <FlowNode
                x={nx} y={ny} name={name} value={value}
                accent={accent} progress={nodeAnim}
                isActive={i === count - 1}
                width={Math.max(140, Math.min(200, value.length * 10 + 40))}
                height={60}
              />
            </g>
          );
        })}
      </g>
    );
  }

  // Grid layout for 5+ variables
  const cols = Math.min(3, Math.ceil(count / 2));
  const rows = Math.ceil(count / cols);
  const spacingX = 280;
  const spacingY = 140;
  const totalW = (cols - 1) * spacingX;
  const totalH = (rows - 1) * spacingY;
  const originX = centerX - totalW / 2;
  const originY = centerY - totalH / 2;

  return (
    <g>
      {/* Edges between sequential nodes */}
      {entries.map((_, i) => {
        if (i >= count - 1) return null;
        const c1 = i % cols;
        const r1 = Math.floor(i / cols);
        const c2 = (i + 1) % cols;
        const r2 = Math.floor((i + 1) / cols);
        const x1 = originX + c1 * spacingX;
        const y1 = originY + r1 * spacingY;
        const x2 = originX + c2 * spacingX;
        const y2 = originY + r2 * spacingY;
        const edgeAnim = entryAnim(i);
        return (
          <AnimatedEdge key={`se${i}`}
            x1={x1 + 80} y1={y1} x2={x2 - 80} y2={y2}
            color={NODE_ACCENTS[i % NODE_ACCENTS.length]}
            progress={edgeAnim}
            dotProgress={interpolate(stepLocalFrame, [i * 4 + 8, i * 4 + 28], [0, 1], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp",
            })}
          />
        );
      })}
      {/* Nodes */}
      {entries.map(([name, value], i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return (
          <FlowNode key={name}
            x={originX + col * spacingX} y={originY + row * spacingY}
            name={name} value={value}
            accent={NODE_ACCENTS[i % NODE_ACCENTS.length]}
            progress={entryAnim(i)}
            isActive={i === count - 1}
          />
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// VIZ: Flow diagram — connected nodes with animated paths (fallback)
// ---------------------------------------------------------------------------
function FlowDiagramViz({
  variables,
  stepLocalFrame,
  fps,
}: {
  variables: Record<string, string>;
  stepLocalFrame: number;
  fps: number;
}) {
  const entries = Object.entries(variables).slice(0, 6);
  if (entries.length === 0) return null;

  const count = entries.length;
  // Layout: arrange in a flowing pattern
  const isWide = count <= 3;
  const cols = isWide ? count : Math.min(3, Math.ceil(count / 2));
  const rows = Math.ceil(count / cols);
  const spacingX = isWide ? 320 : 280;
  const spacingY = 140;
  const totalW = (cols - 1) * spacingX;
  const totalH = (rows - 1) * spacingY;
  const originX = 960 - totalW / 2;
  const originY = 440 - totalH / 2;

  // Position each node
  const positions = entries.map((_, i) => ({
    x: originX + (i % cols) * spacingX,
    y: originY + Math.floor(i / cols) * spacingY,
  }));

  // Animated dot travel progress (loops within the step)
  const dotCycle = interpolate(stepLocalFrame, [8, FRAMES_PER_STEP - 4], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <g>
      {/* Draw edges first (behind nodes) */}
      {entries.map((_, i) => {
        if (i === count - 1) return null;
        const p1 = positions[i];
        const p2 = positions[i + 1];
        const edgeProgress = spring({
          frame: stepLocalFrame - i * 4 - 2,
          fps,
          config: { damping: 24, stiffness: 120 },
          durationInFrames: 20,
        });
        // Dot travels along this edge during its segment
        const segStart = i / count;
        const segEnd = (i + 1) / count;
        const segDot = interpolate(dotCycle, [segStart, segEnd], [0, 1], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        });

        return (
          <AnimatedEdge
            key={`e${i}`}
            x1={p1.x + 80} y1={p1.y}
            x2={p2.x - 80} y2={p2.y}
            color={NODE_ACCENTS[i % NODE_ACCENTS.length]}
            progress={edgeProgress}
            dotProgress={segDot}
          />
        );
      })}

      {/* Draw nodes */}
      {entries.map(([name, value], i) => {
        const pos = positions[i];
        const nodeProgress = spring({
          frame: stepLocalFrame - i * 4,
          fps,
          config: { damping: 22, stiffness: 140, mass: 0.6 },
          durationInFrames: 20,
        });
        const accent = NODE_ACCENTS[i % NODE_ACCENTS.length];
        // Last node is "active"
        const isActive = i === count - 1;

        return (
          <FlowNode
            key={name}
            x={pos.x} y={pos.y}
            name={name} value={value}
            accent={accent}
            progress={nodeProgress}
            isActive={isActive}
          />
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// VIZ: Array bars with animated swaps
// ---------------------------------------------------------------------------
function ArrayBarsViz({
  variables, stepLocalFrame, fps,
}: {
  variables: Record<string, string>; stepLocalFrame: number; fps: number;
}) {
  const arrayEntry = Object.entries(variables).find(([, v]) => v.trim().startsWith("["));
  const nums = arrayEntry ? parseNumericArray(arrayEntry[1]) : [];
  const pivotVal = variables.pivot !== undefined ? Number(variables.pivot) : null;

  if (nums.length === 0) return <FlowDiagramViz variables={variables} stepLocalFrame={stepLocalFrame} fps={fps} />;

  const cx = 960; const baseY = 620;
  const maxVal = Math.max(...nums, 1);
  const maxH = 320;
  const barW = Math.min(68, Math.floor(860 / nums.length) - 6);
  const gap = 6;
  const totalW = nums.length * (barW + gap) - gap;
  const startX = cx - totalW / 2;

  return (
    <g>
      {nums.map((val, i) => {
        const barH = Math.max(8, (val / maxVal) * maxH);
        const progress = spring({
          frame: stepLocalFrame - i * 1.5, fps,
          config: { damping: 22, stiffness: 130, mass: 0.7 },
          durationInFrames: 24,
        });
        const animH = barH * progress;
        const isPivot = pivotVal !== null && val === pivotVal;
        const color = isPivot ? C.accent3 : C.nodeActive;

        return (
          <g key={i}>
            {/* Bar glow */}
            <rect x={startX + i * (barW + gap) - 2} y={baseY - animH - 2}
              width={barW + 4} height={Math.max(2, animH) + 4}
              rx={5} fill={color} opacity={isPivot ? 0.12 : 0.05} />
            {/* Bar */}
            <rect x={startX + i * (barW + gap)} y={baseY - animH}
              width={barW} height={Math.max(2, animH)}
              rx={4} fill={color} opacity={isPivot ? 0.95 : 0.5 + (val / maxVal) * 0.4} />
            {/* Value label */}
            {barW > 20 && (
              <text x={startX + i * (barW + gap) + barW / 2} y={baseY + 22}
                textAnchor="middle" fill={C.textMuted}
                style={{ fontFamily: C.mono, fontSize: Math.min(14, barW * 0.35) }}>
                {val}
              </text>
            )}
            {/* Connecting line to next bar */}
            {i < nums.length - 1 && (
              <line
                x1={startX + i * (barW + gap) + barW}
                y1={baseY - animH / 2}
                x2={startX + (i + 1) * (barW + gap)}
                y2={baseY - (Math.max(8, (nums[i + 1] / maxVal) * maxH) * progress) / 2}
                stroke={C.edgeActive} strokeWidth={1} opacity={0.2 * progress}
              />
            )}
          </g>
        );
      })}
      {/* Floor line */}
      <line x1={startX - 16} y1={baseY} x2={startX + totalW + 16} y2={baseY}
        stroke={C.edge} strokeWidth={1.5} />
      {pivotVal !== null && (
        <g>
          <line x1={cx} y1={baseY + 8} x2={cx} y2={baseY + 32}
            stroke={C.accent3} strokeWidth={1.5} opacity={0.5} />
          <text x={cx} y={baseY + 48} textAnchor="middle" fill={C.accent3}
            style={{ fontFamily: C.mono, fontSize: 13, letterSpacing: "0.06em" }}>
            pivot = {pivotVal}
          </text>
        </g>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// VIZ: Numeric circles with connecting arcs
// ---------------------------------------------------------------------------
function NumericCirclesViz({
  variables, stepLocalFrame, fps,
}: {
  variables: Record<string, string>; stepLocalFrame: number; fps: number;
}) {
  const entries = Object.entries(variables).filter(([, v]) => /^-?\d+(\.\d+)?$/.test(v.trim()));
  const maxVal = Math.max(...entries.map(([, v]) => Math.abs(Number(v))), 1);
  const count = entries.length;
  const spacing = Math.min(280, 1300 / (count + 1));
  const startX = 960 - (count - 1) * spacing / 2;
  const cy = 440;

  const dotCycle = interpolate(stepLocalFrame, [12, FRAMES_PER_STEP - 6], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <g>
      {/* Connecting arcs between circles */}
      {entries.map((_, i) => {
        if (i >= count - 1) return null;
        const x1 = startX + i * spacing;
        const x2 = startX + (i + 1) * spacing;
        const arcY = cy - 60;
        const progress = spring({
          frame: stepLocalFrame - (i + 1) * 4, fps,
          config: { damping: 24, stiffness: 120 }, durationInFrames: 22,
        });
        const segT = interpolate(dotCycle, [i / count, (i + 1) / count], [0, 1], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        });
        const dotX = x1 + (x2 - x1) * segT;
        const dotArcY = arcY + Math.sin(segT * Math.PI) * 20;

        return (
          <g key={`arc${i}`} opacity={progress}>
            <path
              d={`M ${x1} ${cy - 30} Q ${(x1 + x2) / 2} ${arcY - 30}, ${x2} ${cy - 30}`}
              fill="none" stroke={NODE_ACCENTS[i % NODE_ACCENTS.length]}
              strokeWidth={1.5} opacity={0.25} strokeDasharray="5,4"
            />
            {segT > 0.05 && segT < 0.95 && (
              <circle cx={dotX} cy={dotArcY - 30} r={4}
                fill={NODE_ACCENTS[i % NODE_ACCENTS.length]} opacity={0.8} />
            )}
          </g>
        );
      })}
      {entries.map(([name, value], i) => {
        const num = Number(value);
        const r = 34 + (Math.abs(num) / maxVal) * 80;
        const x = startX + i * spacing;
        const accent = NODE_ACCENTS[i % NODE_ACCENTS.length];
        const progress = spring({
          frame: stepLocalFrame - i * 4, fps,
          config: { damping: 22, stiffness: 130, mass: 0.7 }, durationInFrames: 24,
        });
        const animR = r * progress;

        return (
          <g key={name} opacity={progress}>
            {/* Outer ring */}
            <circle cx={x} cy={cy} r={animR + 12} fill="none"
              stroke={accent} strokeWidth={1} opacity={0.15} />
            {/* Main circle */}
            <circle cx={x} cy={cy} r={animR}
              fill={C.nodeDefault} stroke={accent} strokeWidth={2} />
            {/* Value */}
            <text x={x} y={cy + 6} textAnchor="middle" fill={C.text}
              style={{ fontFamily: C.mono, fontSize: Math.max(18, Math.min(36, animR * 0.55)), fontWeight: 700 }}>
              {value}
            </text>
            {/* Name */}
            <text x={x} y={cy + animR + 28} textAnchor="middle" fill={accent}
              style={{ fontFamily: C.mono, fontSize: 13, letterSpacing: "0.04em" }}>
              {name}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// VIZ: Boolean — toggle switches
// ---------------------------------------------------------------------------
function BooleanViz({
  variables, stepLocalFrame, fps,
}: {
  variables: Record<string, string>; stepLocalFrame: number; fps: number;
}) {
  const entries = Object.entries(variables);

  return (
    <g>
      {entries.map(([name, value], i) => {
        const isTrue = value === "true";
        const color = isTrue ? C.nodeDone : C.nodeWarn;
        const cx = 960 + (i - (entries.length - 1) / 2) * 240;
        const cy = 440;
        const progress = spring({
          frame: stepLocalFrame - i * 4, fps,
          config: { damping: 22, stiffness: 130 }, durationInFrames: 24,
        });
        // Draw as a toggle switch shape
        const switchW = 90;
        const switchH = 44;
        const knobR = 16;
        const knobX = isTrue ? cx + switchW / 2 - knobR - 6 : cx - switchW / 2 + knobR + 6;

        return (
          <g key={name} opacity={progress}>
            {/* Track */}
            <rect x={cx - switchW / 2} y={cy - switchH / 2}
              width={switchW} height={switchH}
              rx={switchH / 2} fill={C.nodeDefault} stroke={color} strokeWidth={2} />
            {/* Fill track */}
            <rect x={cx - switchW / 2} y={cy - switchH / 2}
              width={switchW} height={switchH}
              rx={switchH / 2} fill={color} opacity={isTrue ? 0.2 : 0.05} />
            {/* Knob */}
            <circle cx={knobX} cy={cy} r={knobR}
              fill={color} opacity={0.9} />
            <circle cx={knobX} cy={cy} r={knobR + 8}
              fill={color} opacity={0.08} />
            {/* Name */}
            <text x={cx} y={cy - switchH / 2 - 16} textAnchor="middle" fill={color}
              style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 600 }}>
              {name}
            </text>
            {/* Value */}
            <text x={cx} y={cy + switchH / 2 + 28} textAnchor="middle" fill={C.textMuted}
              style={{ fontFamily: C.mono, fontSize: 12 }}>
              {value}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// VIZ: Call results — tree-like recursive call visualization
// ---------------------------------------------------------------------------
function CallResultsViz({
  variables, stepLocalFrame, fps,
}: {
  variables: Record<string, string>; stepLocalFrame: number; fps: number;
}) {
  const callEntries = Object.entries(variables).filter(([k]) => /\w+\(\d+\)/.test(k));
  const otherEntries = Object.entries(variables).filter(([k]) => !/\w+\(\d+\)/.test(k));

  if (callEntries.length === 0) {
    return <FlowDiagramViz variables={variables} stepLocalFrame={stepLocalFrame} fps={fps} />;
  }

  const count = callEntries.length;
  // Tree-like layout: spread horizontally, stagger vertically
  const spacing = Math.min(220, 1100 / (count + 1));
  const startX = 960 - ((count - 1) * spacing) / 2;

  return (
    <g>
      {/* Return flow arrows between nodes */}
      {callEntries.map((_, i) => {
        if (i >= count - 1) return null;
        const x1 = startX + i * spacing;
        const x2 = startX + (i + 1) * spacing;
        const y1 = 440 + (i % 2) * 30;
        const y2 = 440 + ((i + 1) % 2) * 30;
        const progress = spring({
          frame: stepLocalFrame - i * 4, fps,
          config: { damping: 24, stiffness: 120 }, durationInFrames: 22,
        });

        return (
          <AnimatedEdge key={`re${i}`}
            x1={x1 + 40} y1={y1} x2={x2 - 40} y2={y2}
            color={C.nodeDone}
            progress={progress}
            dotProgress={interpolate(stepLocalFrame, [10 + i * 6, 30 + i * 6], [0, 1], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp",
            })}
          />
        );
      })}

      {callEntries.map(([callExpr, retVal], i) => {
        const x = startX + i * spacing;
        const cy = 440 + (i % 2) * 30; // slight wave
        const numVal = Number(retVal);
        const isBase = numVal === 0 || numVal === 1;
        const accent = isBase ? C.nodeDone : C.nodeActive;
        const r = 40 + Math.min(numVal, 8) * 3;

        const progress = spring({
          frame: stepLocalFrame - i * 4, fps,
          config: { damping: 22, stiffness: 130, mass: 0.7 }, durationInFrames: 24,
        });

        return (
          <g key={callExpr} opacity={progress}>
            {/* Outer glow */}
            <circle cx={x} cy={cy} r={r + 16} fill={accent} opacity={0.04 * progress} />
            {/* Node */}
            <circle cx={x} cy={cy} r={r * progress}
              fill={C.nodeDefault} stroke={accent} strokeWidth={isBase ? 2.5 : 1.5} />
            {/* Return value */}
            <text x={x} y={cy + 6} textAnchor="middle" fill={C.text}
              style={{ fontFamily: C.mono, fontSize: Math.max(18, Math.min(32, r * 0.6)), fontWeight: 700 }}>
              {retVal}
            </text>
            {/* Call label below */}
            <text x={x} y={cy + r + 18} textAnchor="middle" fill={accent}
              style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.04em" }}>
              {callExpr}
            </text>
            {isBase && (
              <text x={x} y={cy - r - 10} textAnchor="middle" fill={C.nodeDone}
                style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.12em" }}>
                BASE
              </text>
            )}
          </g>
        );
      })}

      {/* Other vars as small flow nodes at bottom */}
      {otherEntries.length > 0 && otherEntries.length <= 3 && (
        <g opacity={interpolate(stepLocalFrame, [18, 30], [0, 1], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        })}>
          {otherEntries.map(([k, v], i) => (
            <FlowNode key={k}
              x={960 + (i - (otherEntries.length - 1) / 2) * 200} y={640}
              name={k} value={v}
              accent={C.accent2} progress={1} isActive={false}
              width={150} height={52}
            />
          ))}
        </g>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// VIZ: Async flow — parallel lanes with animated runners
// ---------------------------------------------------------------------------
function AsyncFlowViz({
  variables, stepLocalFrame, fps,
}: {
  variables: Record<string, string>; stepLocalFrame: number; fps: number;
}) {
  const entries = Object.entries(variables);
  if (entries.length === 0) return null;

  const STATUS_COLORS: Record<string, string> = {
    pending: C.accent3, suspended: "#60A5FA", running: C.nodeActive,
    "in-flight": C.nodeActive, resumed: C.nodeDone, fulfilled: C.nodeDone,
    done: C.nodeDone, resolved: C.nodeDone,
  };

  const laneH = 52;
  const laneGap = 16;
  const laneW = 680;
  const totalH = entries.length * (laneH + laneGap) - laneGap;
  const originY = 430 - totalH / 2;
  const originX = 960 - laneW / 2;

  return (
    <g>
      {entries.map(([name, status], i) => {
        const laneY = originY + i * (laneH + laneGap);
        const color = STATUS_COLORS[status.toLowerCase()] ?? C.textMuted;
        const isDone = ["fulfilled", "done", "resolved", "resumed"].includes(status.toLowerCase());
        const isRunning = status === "running" || status === "in-flight";
        const fillRatio = isDone ? 1 : isRunning ? 0.65 : 0.2;

        const progress = spring({
          frame: stepLocalFrame - i * 4, fps,
          config: { damping: 24, stiffness: 130 }, durationInFrames: 24,
        });

        // Animated runner dot
        const runnerT = isRunning
          ? interpolate(stepLocalFrame, [0, FRAMES_PER_STEP], [0.3, 0.8], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp",
            })
          : fillRatio;

        return (
          <g key={name} opacity={progress}>
            {/* Lane track */}
            <rect x={originX} y={laneY + 8} width={laneW} height={laneH - 16}
              rx={6} fill="rgba(255,255,255,0.02)" stroke={C.edge} strokeWidth={0.8} />
            {/* Fill */}
            <rect x={originX} y={laneY + 8}
              width={laneW * fillRatio * progress} height={laneH - 16}
              rx={6} fill={color} opacity={0.18} />
            {/* Runner dot with trail */}
            <circle cx={originX + laneW * runnerT * progress}
              cy={laneY + laneH / 2} r={8}
              fill={color} opacity={0.85} />
            <circle cx={originX + laneW * runnerT * progress}
              cy={laneY + laneH / 2} r={18}
              fill={color} opacity={0.06} />
            {/* Trail line */}
            <line x1={originX + 4} y1={laneY + laneH / 2}
              x2={originX + laneW * runnerT * progress - 10} y2={laneY + laneH / 2}
              stroke={color} strokeWidth={2} opacity={0.12} />
            {/* Name */}
            <text x={originX - 12} y={laneY + laneH / 2 + 4} textAnchor="end" fill={C.textMuted}
              style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: "0.04em" }}>
              {name.length > 14 ? name.slice(0, 12) + "\u2026" : name}
            </text>
            {/* Status */}
            <text x={originX + laneW + 12} y={laneY + laneH / 2 + 4} textAnchor="start" fill={color}
              style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.06em" }}>
              {status.toUpperCase()}
            </text>
            {/* Done checkmark */}
            {isDone && (
              <circle cx={originX + laneW} cy={laneY + laneH / 2} r={10}
                fill={C.nodeDone} opacity={0.15} />
            )}
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// VIZ: Concept — animated shapes for overview/mechanism/insight phases
// ---------------------------------------------------------------------------
function ConceptViz({
  label, variables, phase, stepLocalFrame, fps, codeType, stepIndex, totalSteps,
}: {
  label: string; variables: Record<string, string>; phase: string;
  stepLocalFrame: number; fps: number; codeType?: string;
  stepIndex: number; totalSteps: number;
}) {
  const accentColor = PHASE_COLORS[phase] ?? C.nodeActive;

  const textProgress = spring({
    frame: stepLocalFrame, fps,
    config: { damping: 24, stiffness: 120, mass: 0.8 }, durationInFrames: 28,
  });

  const shapeProgress = spring({
    frame: stepLocalFrame - 3, fps,
    config: { damping: 18, stiffness: 90, mass: 1.2 }, durationInFrames: 36,
  });

  const phaseLabel = phase === "overview" ? "OVERVIEW"
    : phase === "mechanism" ? "HOW IT WORKS"
    : phase === "insight" ? "KEY INSIGHT"
    : "EXECUTION";

  return (
    <g>
      {/* Supporting shape illustration — behind text */}
      <ConceptShape
        codeType={codeType} phase={phase}
        progress={shapeProgress} accent={accentColor}
        stepIndex={stepIndex} totalSteps={totalSteps}
        stepLocalFrame={stepLocalFrame} fps={fps}
      />

      {/* Phase label — small, top */}
      <text x={960} y={160} textAnchor="middle"
        fill={accentColor} opacity={0.7 * textProgress}
        style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.18em", fontWeight: 600 }}>
        {phaseLabel}
      </text>

      {/* MAIN teaching text — the explanation */}
      <foreignObject x={160} y={180} width={1600} height={180}>
        <div style={{
          fontFamily: C.sans, fontSize: 28, fontWeight: 700,
          color: C.text, textAlign: "center", lineHeight: 1.35,
          letterSpacing: "-0.01em", opacity: textProgress,
          transform: `translateY(${(1 - textProgress) * 14}px)`,
        }}>
          {label}
        </div>
      </foreignObject>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Animated concept shapes — visual metaphors for code types
// ---------------------------------------------------------------------------
function ConceptShape({
  codeType, phase, progress, accent, stepIndex, totalSteps, stepLocalFrame, fps,
}: {
  codeType?: string; phase: string; progress: number; accent: string;
  stepIndex: number; totalSteps: number; stepLocalFrame: number; fps: number;
}) {
  // stepFraction: how far through the total animation this concept step is (0..1)
  const stepFraction = stepIndex / Math.max(totalSteps - 1, 1);
  const op = 0.55 * progress; // More visible — these ARE the animation

  // Animated pulse that cycles within each step for liveliness
  const pulse = interpolate(stepLocalFrame, [0, FRAMES_PER_STEP / 2, FRAMES_PER_STEP],
    [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  if (codeType === "recursive_function") {
    const cx = 960;
    const rootY = 280;
    const levelGap = 120;
    const nodeR = 26;
    const spreadFactor = 170;

    // All tree nodes
    const allNodes = [
      { x: cx, y: rootY, level: 0, label: "f(5)" },
      { x: cx - spreadFactor, y: rootY + levelGap, level: 1, label: "f(4)" },
      { x: cx + spreadFactor, y: rootY + levelGap, level: 1, label: "f(3)" },
      { x: cx - spreadFactor * 1.5, y: rootY + levelGap * 2, level: 2, label: "f(3)" },
      { x: cx - spreadFactor * 0.5, y: rootY + levelGap * 2, level: 2, label: "f(2)" },
      { x: cx + spreadFactor * 0.5, y: rootY + levelGap * 2, level: 2, label: "f(2)" },
      { x: cx + spreadFactor * 1.5, y: rootY + levelGap * 2, level: 2, label: "f(1)" },
    ];
    const allEdges: [number, number][] = [[0,1],[0,2],[1,3],[1,4],[2,5],[2,6]];

    // Progressive reveal: step 0 → root only, step 1 → +children, step 2 → +grandchildren, step 3+ → full + highlights
    const visibleLevel = phase === "overview" ? 0
      : phase === "insight" ? 2
      : Math.min(2, Math.floor(stepFraction * 4));
    const showDuplicates = stepFraction > 0.5; // Highlight duplicate subtrees later

    return (
      <g opacity={op}>
        {allEdges.map(([from, to], i) => {
          const a = allNodes[from];
          const b = allNodes[to];
          if (b.level > visibleLevel) return null;
          const drawProgress = spring({
            frame: stepLocalFrame - i * 3, fps,
            config: { damping: 20, stiffness: 100 }, durationInFrames: 24,
          });
          // Traveling dot along edge
          const dotT = interpolate(stepLocalFrame, [i * 3 + 5, i * 3 + 25], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          const dotX = a.x + (b.x - a.x) * dotT;
          const dotY = a.y + nodeR + (b.y - nodeR - a.y - nodeR) * dotT;
          return (
            <g key={`te${i}`} opacity={drawProgress}>
              <line x1={a.x} y1={a.y + nodeR} x2={b.x} y2={b.y - nodeR}
                stroke={accent} strokeWidth={2} strokeLinecap="round" opacity={0.45} />
              {dotT > 0.05 && dotT < 0.95 && (
                <>
                  <circle cx={dotX} cy={dotY} r={12} fill={accent} opacity={0.06} />
                  <circle cx={dotX} cy={dotY} r={4} fill={accent} opacity={0.85} />
                </>
              )}
            </g>
          );
        })}
        {allNodes.map((n, i) => {
          if (n.level > visibleLevel) return null;
          const nodeAnim = spring({
            frame: stepLocalFrame - n.level * 6, fps,
            config: { damping: 18, stiffness: 110, mass: 0.8 }, durationInFrames: 22,
          });
          const r = nodeR * nodeAnim;
          const isDuplicate = showDuplicates && (n.label === "f(3)" && i > 0 || n.label === "f(2)");
          const isActive = n.level === visibleLevel;
          const nodeColor = isDuplicate ? C.nodeWarn : (isActive ? accent : C.nodeDefault);
          return (
            <g key={`tn${i}`} opacity={nodeAnim}>
              {isActive && <circle cx={n.x} cy={n.y} r={r + 14 + pulse * 6} fill={accent} opacity={0.05} />}
              <circle cx={n.x} cy={n.y} r={r + 6} fill={isDuplicate ? C.nodeWarn : accent} opacity={isDuplicate ? 0.12 : 0.04} />
              <circle cx={n.x} cy={n.y} r={r}
                fill={nodeColor} stroke={accent}
                strokeWidth={isActive ? 2.5 : 1.5}
                opacity={isDuplicate ? 0.5 : 0.85} />
              {nodeAnim > 0.4 && (
                <text x={n.x} y={n.y + 5} textAnchor="middle"
                  fill={isDuplicate ? C.nodeWarn : C.text} opacity={nodeAnim}
                  style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700 }}>
                  {n.label}
                </text>
              )}
            </g>
          );
        })}
        {/* Duplicate highlight annotation */}
        {showDuplicates && progress > 0.5 && (
          <g opacity={(progress - 0.5) * 2}>
            <line x1={allNodes[3].x} y1={allNodes[3].y + nodeR + 8}
              x2={allNodes[5].x} y2={allNodes[5].y + nodeR + 8}
              stroke={C.nodeWarn} strokeWidth={1.5} strokeDasharray="6,4" opacity={0.4} />
            <text x={960} y={allNodes[3].y + nodeR + 30} textAnchor="middle"
              fill={C.nodeWarn} opacity={0.6}
              style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em" }}>
              DUPLICATE WORK
            </text>
          </g>
        )}
      </g>
    );
  }

  if (codeType === "sorting_algorithm" || codeType === "sorting_function") {
    // Progressive sort: each step shows a different phase of the sort
    const rawBars = [3, 7, 5, 9, 4, 8, 2, 6];
    // Interpolate toward sorted based on stepFraction
    const sorted = [...rawBars].sort((a, b) => a - b);
    const bars = rawBars.map((v, i) => {
      const targetIdx = sorted.indexOf(v);
      const t = Math.min(1, stepFraction * 1.5);
      return v + (sorted[Math.round(i + (targetIdx - i) * t)] - v) * t * 0.5;
    });
    // Which bars are being "compared" changes per step
    const compareA = stepIndex % rawBars.length;
    const compareB = Math.min(rawBars.length - 1, compareA + 1);

    const barW = 64;
    const maxH = 300;
    const maxVal = 10;
    const startX = 960 - (bars.length * (barW + 8)) / 2;
    return (
      <g opacity={op}>
        {bars.map((h, i) => {
          const x = startX + i * (barW + 8);
          const barH = (h / maxVal) * maxH * progress;
          const barAnim = spring({
            frame: stepLocalFrame - i * 2, fps,
            config: { damping: 20, stiffness: 120 }, durationInFrames: 20,
          });
          const isComparing = i === compareA || i === compareB;
          const color = isComparing ? accent : C.nodeDefault;
          return (
            <g key={i} opacity={barAnim}>
              {isComparing && (
                <rect x={x - 3} y={680 - barH - 3} width={barW + 6} height={barH + 6}
                  rx={8} fill={accent} opacity={0.08 + pulse * 0.04} />
              )}
              <rect x={x} y={680 - barH} width={barW} height={Math.max(4, barH)}
                rx={6} fill={color} stroke={accent}
                strokeWidth={isComparing ? 2 : 0.5} opacity={isComparing ? 0.9 : 0.5} />
              <text x={x + barW / 2} y={680 + 22} textAnchor="middle"
                fill={isComparing ? accent : C.textMuted}
                style={{ fontFamily: C.mono, fontSize: 14, fontWeight: isComparing ? 700 : 400 }}>
                {Math.round(h)}
              </text>
            </g>
          );
        })}
        {/* Swap arrow between compared bars */}
        {progress > 0.3 && (
          <g opacity={progress * 0.6}>
            <path d={`M ${startX + compareA * (barW + 8) + barW / 2} ${680 - (bars[compareA] / maxVal) * maxH * progress - 16} Q ${startX + ((compareA + compareB) / 2) * (barW + 8) + barW / 2} ${680 - maxH * progress - 30}, ${startX + compareB * (barW + 8) + barW / 2} ${680 - (bars[compareB] / maxVal) * maxH * progress - 16}`}
              fill="none" stroke={accent} strokeWidth={2} strokeDasharray="6,4" />
            <text x={startX + ((compareA + compareB) / 2) * (barW + 8) + barW / 2} y={680 - maxH * progress - 36}
              textAnchor="middle" fill={accent} opacity={0.5}
              style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em" }}>
              COMPARE
            </text>
          </g>
        )}
        <line x1={startX - 16} y1={680} x2={startX + bars.length * (barW + 8)} y2={680}
          stroke={C.edge} strokeWidth={1.5} />
      </g>
    );
  }

  if (codeType === "async_flow" || codeType === "async_function" || codeType === "asynchronous") {
    // Progressive async: lanes fill up as steps advance
    const lanes = ["Task A", "Task B", "Task C"];
    const laneH = 48;
    const laneGap = 32;
    const laneW = 800;
    const originX = 960 - laneW / 2;
    const originY = 320;
    return (
      <g opacity={op}>
        {lanes.map((name, i) => {
          const y = originY + i * (laneH + laneGap);
          const laneAnim = spring({
            frame: stepLocalFrame - i * 4, fps,
            config: { damping: 22, stiffness: 120 }, durationInFrames: 22,
          });
          // Each step advances the lanes differently
          const laneFill = Math.min(1, stepFraction * 1.5 + (i === 0 ? 0.2 : i === 1 ? 0.1 : 0));
          const isDone = laneFill >= 0.95;
          const isRunning = !isDone && laneFill > 0.1;
          const color = isDone ? C.nodeDone : accent;
          // Runner dot position animates within the step
          const runnerBase = laneFill * laneW;
          const runnerWobble = isRunning ? interpolate(stepLocalFrame, [0, FRAMES_PER_STEP], [0, laneW * 0.08], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          }) : 0;
          const runnerX = originX + Math.min(laneW, runnerBase + runnerWobble);

          return (
            <g key={i} opacity={laneAnim}>
              <rect x={originX} y={y} width={laneW} height={laneH}
                rx={laneH / 2} fill={C.nodeDefault} stroke={color} strokeWidth={1} opacity={0.35} />
              <rect x={originX} y={y}
                width={Math.max(0, runnerX - originX) * laneAnim} height={laneH}
                rx={laneH / 2} fill={color} opacity={0.15} />
              {isRunning && (
                <>
                  <circle cx={runnerX * laneAnim + originX * (1 - laneAnim)} cy={y + laneH / 2} r={10}
                    fill={color} opacity={0.9} />
                  <circle cx={runnerX * laneAnim + originX * (1 - laneAnim)} cy={y + laneH / 2} r={22}
                    fill={color} opacity={0.05 + pulse * 0.03} />
                </>
              )}
              {isDone && (
                <g>
                  <circle cx={originX + laneW - 20} cy={y + laneH / 2} r={12}
                    fill={C.nodeDone} opacity={0.2 * laneAnim} />
                  <text x={originX + laneW - 20} y={y + laneH / 2 + 4} textAnchor="middle"
                    fill={C.nodeDone} opacity={0.7}
                    style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700 }}>
                    ✓
                  </text>
                </g>
              )}
              <text x={originX - 14} y={y + laneH / 2 + 5} textAnchor="end"
                fill={color} opacity={0.6}
                style={{ fontFamily: C.mono, fontSize: 13, letterSpacing: "0.04em" }}>
                {name}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  if (codeType === "react_component") {
    const s = progress;
    // Progressive component tree: overview shows root, mechanism adds children
    const allNodes = [
      { x: 960, y: 260, w: 180, label: "<App />", level: 0 },
      { x: 760, y: 420, w: 150, label: "<Header />", level: 1 },
      { x: 1160, y: 420, w: 150, label: "<Content />", level: 1 },
      { x: 1060, y: 560, w: 130, label: "<Card />", level: 2 },
      { x: 1260, y: 560, w: 130, label: "<List />", level: 2 },
    ];
    const allEdges: [number, number][] = [[0,1],[0,2],[2,3],[2,4]];
    const visibleLevel = phase === "overview" ? 0 : phase === "insight" ? 2 : Math.min(2, Math.floor(stepFraction * 4));

    return (
      <g opacity={op}>
        {allEdges.map(([from, to], i) => {
          const a = allNodes[from];
          const b = allNodes[to];
          if (b.level > visibleLevel) return null;
          const eOp = spring({ frame: stepLocalFrame - i * 4, fps,
            config: { damping: 22, stiffness: 110 }, durationInFrames: 20 });
          const dotT = interpolate(stepLocalFrame, [i * 4 + 5, i * 4 + 22], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          return (
            <g key={`ce${i}`} opacity={eOp}>
              <line x1={a.x} y1={a.y + 28} x2={b.x} y2={b.y - 28}
                stroke={accent} strokeWidth={1.5} opacity={0.4} />
              {dotT > 0.05 && dotT < 0.95 && (
                <circle cx={a.x + (b.x - a.x) * dotT} cy={a.y + 28 + (b.y - 56) * dotT}
                  r={4} fill={accent} opacity={0.8} />
              )}
            </g>
          );
        })}
        {allNodes.map((n, i) => {
          if (n.level > visibleLevel) return null;
          const nOp = spring({ frame: stepLocalFrame - i * 3, fps,
            config: { damping: 20, stiffness: 130 }, durationInFrames: 20 });
          const isActive = n.level === visibleLevel;
          return (
            <g key={`cn${i}`} opacity={nOp}>
              {isActive && <rect x={n.x - n.w / 2 - 6} y={n.y - 30} width={n.w + 12} height={60}
                rx={16} fill={accent} opacity={0.05 + pulse * 0.03} />}
              <rect x={n.x - n.w / 2} y={n.y - 24} width={n.w * nOp} height={48}
                rx={12} fill={C.nodeDefault} stroke={accent}
                strokeWidth={isActive ? 2.5 : 1.5} />
              {nOp > 0.4 && (
                <text x={n.x} y={n.y + 5} textAnchor="middle" fill={accent} opacity={nOp}
                  style={{ fontFamily: C.mono, fontSize: 13, fontWeight: i === 0 ? 700 : 400 }}>
                  {n.label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    );
  }

  if (codeType === "heap_graph") {
    // Progressive grid exploration — each step reveals a different stage
    const gridRows = 4;
    const gridCols = 6;
    const cellSize = 68;
    const gridW = gridCols * cellSize;
    const gridH = gridRows * cellSize;
    const originX = 960 - gridW / 2;
    const originY = 280;

    const heights = [
      [3, 3, 3, 3, 3, 3],
      [3, 0, 1, 0, 2, 3],
      [3, 1, 0, 2, 0, 3],
      [3, 3, 3, 3, 3, 3],
    ];

    // Step-specific visualization stages
    // overview: show empty grid outline
    // mechanism step 1: highlight boundaries
    // mechanism step 2: show BFS arrows from boundaries inward
    // mechanism step 3: show neighbor exploration (4-dir arrows)
    // insight: show water filled in
    const showGrid = true;
    const showBoundaries = stepFraction > 0.05;
    const showBfsWave = stepFraction > 0.2;
    const showNeighbors = stepFraction > 0.35;
    const showWater = stepFraction > 0.6;

    // BFS wave front — which cells are "explored" based on step progress
    const waveRadius = Math.floor(stepFraction * 4); // 0..3 cells from boundary
    const exploreFocus = showNeighbors ? { r: 1, c: 2 } : null; // cell being explored

    return (
      <g opacity={op}>
        {/* Grid cells */}
        {Array.from({ length: gridRows }, (_, r) =>
          Array.from({ length: gridCols }, (_, c) => {
            const x = originX + c * cellSize;
            const y = originY + r * cellSize;
            const isBoundary = r === 0 || r === gridRows - 1 || c === 0 || c === gridCols - 1;
            const h = heights[r]?.[c] ?? 1;
            const distFromEdge = Math.min(r, gridRows - 1 - r, c, gridCols - 1 - c);
            const isExplored = showBfsWave && distFromEdge <= waveRadius;
            const isWaterCell = showWater && !isBoundary && h < 3;

            const cellAnim = spring({
              frame: stepLocalFrame - (r + c) * 2, fps,
              config: { damping: 24, stiffness: 130 }, durationInFrames: 18,
            });

            const baseColor = isBoundary && showBoundaries ? accent
              : isExplored ? C.nodeDone
              : "rgba(255,255,255,0.06)";

            return (
              <g key={`g${r}-${c}`} opacity={cellAnim}>
                {/* Cell */}
                <rect x={x + 2} y={y + 2} width={cellSize - 4} height={cellSize - 4}
                  rx={8} fill={C.nodeDefault}
                  stroke={baseColor}
                  strokeWidth={isBoundary && showBoundaries ? 2 : isExplored ? 1.5 : 0.5}
                  opacity={0.15 + (showBoundaries && isBoundary ? 0.3 : 0) + (isExplored ? 0.2 : 0)} />
                {/* Height value */}
                <text x={x + cellSize / 2} y={y + cellSize / 2 + (isWaterCell ? -6 : 0)}
                  textAnchor="middle" fill={C.text}
                  opacity={isExplored ? 0.7 : (showGrid ? 0.2 : 0)}
                  style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 700 }}>
                  {h}
                </text>
                {/* Water fill */}
                {isWaterCell && (
                  <g>
                    <rect x={x + 8} y={y + cellSize / 2 + 2}
                      width={cellSize - 16} height={(3 - h) * 8}
                      rx={4} fill="#60A5FA" opacity={0.3 * progress} />
                    <text x={x + cellSize / 2} y={y + cellSize / 2 + 16}
                      textAnchor="middle" fill="#60A5FA" opacity={0.6}
                      style={{ fontFamily: C.mono, fontSize: 10 }}>
                      +{3 - h}
                    </text>
                  </g>
                )}
                {/* Exploration pulse on current wavefront */}
                {isExplored && distFromEdge === waveRadius && !isBoundary && (
                  <rect x={x + 2} y={y + 2} width={cellSize - 4} height={cellSize - 4}
                    rx={8} fill={C.nodeDone} opacity={0.08 + pulse * 0.06} />
                )}
              </g>
            );
          })
        )}

        {/* Neighbor exploration arrows from focus cell */}
        {exploreFocus && showNeighbors && (
          <g>
            {[[0,-1],[0,1],[-1,0],[1,0]].map(([dr, dc], i) => {
              const fx = originX + exploreFocus.c * cellSize + cellSize / 2;
              const fy = originY + exploreFocus.r * cellSize + cellSize / 2;
              const tx = fx + dc * cellSize;
              const ty = fy + dr * cellSize;
              const arrowAnim = spring({
                frame: stepLocalFrame - 10 - i * 5, fps,
                config: { damping: 18, stiffness: 100 }, durationInFrames: 20,
              });
              return (
                <g key={`arr${i}`} opacity={arrowAnim * 0.7}>
                  <line x1={fx} y1={fy} x2={fx + (tx - fx) * 0.7} y2={fy + (ty - fy) * 0.7}
                    stroke={C.nodeDone} strokeWidth={2.5} strokeLinecap="round" />
                  <circle cx={fx + (tx - fx) * 0.7} cy={fy + (ty - fy) * 0.7} r={4}
                    fill={C.nodeDone} />
                </g>
              );
            })}
            {/* Focus cell highlight */}
            <rect x={originX + exploreFocus.c * cellSize + 2}
              y={originY + exploreFocus.r * cellSize + 2}
              width={cellSize - 4} height={cellSize - 4}
              rx={8} fill="none" stroke={C.nodeDone} strokeWidth={3}
              opacity={0.5 + pulse * 0.2} />
          </g>
        )}
      </g>
    );
  }

  if (codeType === "dynamic_programming") {
    // Progressive DP table: each step fills more cells
    const s = progress;
    const cols = 8;
    const cellW = 84;
    const cellH = 60;
    const startX = 960 - (cols * cellW) / 2;
    const startY = 340;
    // How many cells are filled depends on which concept step we're on
    const filledCount = Math.max(1, Math.floor(stepFraction * cols * 1.3));

    return (
      <g opacity={op}>
        {/* Header row */}
        {Array.from({ length: cols }, (_, i) => (
          <text key={`h${i}`} x={startX + i * cellW + cellW / 2} y={startY - 14}
            textAnchor="middle" fill={C.textMuted}
            style={{ fontFamily: C.mono, fontSize: 11 }}>
            [{i}]
          </text>
        ))}
        {Array.from({ length: cols }, (_, i) => {
          const x = startX + i * cellW;
          const isFilled = i < filledCount;
          const isCurrent = i === filledCount - 1;
          const cellAnim = spring({
            frame: stepLocalFrame - i * 2, fps,
            config: { damping: 22, stiffness: 130 }, durationInFrames: 18,
          });
          // Generate plausible DP values (fibonacci-like)
          const dpVals = [0, 1, 1, 2, 3, 5, 8, 13];

          return (
            <g key={`dp${i}`} opacity={cellAnim}>
              <rect x={x + 3} y={startY} width={cellW - 6} height={cellH}
                rx={10} fill={isFilled ? C.nodeDefault : "rgba(255,255,255,0.02)"}
                stroke={isCurrent ? accent : isFilled ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)"}
                strokeWidth={isCurrent ? 2.5 : 1} />
              {isFilled && (
                <rect x={x + 3} y={startY} width={cellW - 6} height={cellH}
                  rx={10} fill={isCurrent ? accent : C.nodeDone}
                  opacity={isCurrent ? 0.15 + pulse * 0.05 : 0.05} />
              )}
              {isFilled && (
                <text x={x + cellW / 2} y={startY + cellH / 2 + 6} textAnchor="middle"
                  fill={isCurrent ? accent : C.text}
                  style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700 }}>
                  {dpVals[i]}
                </text>
              )}
              {/* Arrow from previous showing dependency */}
              {i > 0 && isFilled && i >= 2 && (
                <g opacity={cellAnim * 0.5}>
                  <path d={`M ${x - cellW + cellW / 2} ${startY + cellH + 8} Q ${x} ${startY + cellH + 24}, ${x + cellW / 2} ${startY + cellH + 8}`}
                    fill="none" stroke={accent} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.3} />
                  <path d={`M ${x - 2 * cellW + cellW / 2} ${startY + cellH + 12} Q ${x - cellW / 2} ${startY + cellH + 34}, ${x + cellW / 2} ${startY + cellH + 12}`}
                    fill="none" stroke={C.nodeDone} strokeWidth={1} strokeDasharray="4,3" opacity={0.2} />
                </g>
              )}
            </g>
          );
        })}
        {/* Formula annotation */}
        {stepFraction > 0.3 && (
          <text x={960} y={startY + cellH + 54} textAnchor="middle"
            fill={accent} opacity={0.5 * progress}
            style={{ fontFamily: C.mono, fontSize: 13 }}>
            dp[i] = dp[i-1] + dp[i-2]
          </text>
        )}
      </g>
    );
  }

  if (codeType === "tree_traversal") {
    const cx = 960;
    const rootY = 280;
    const levelGap = 115;
    const nodeR = 24;
    const spread = 165;

    const nodes = [
      { x: cx, y: rootY, label: "1" },
      { x: cx - spread, y: rootY + levelGap, label: "2" },
      { x: cx + spread, y: rootY + levelGap, label: "3" },
      { x: cx - spread * 1.5, y: rootY + levelGap * 2, label: "4" },
      { x: cx - spread * 0.5, y: rootY + levelGap * 2, label: "5" },
      { x: cx + spread * 0.5, y: rootY + levelGap * 2, label: "6" },
      { x: cx + spread * 1.5, y: rootY + levelGap * 2, label: "7" },
    ];
    const edges: [number, number][] = [[0,1],[0,2],[1,3],[1,4],[2,5],[2,6]];
    const visitedCount = Math.max(1, Math.ceil(stepFraction * nodes.length));
    const activeIdx = visitedCount - 1;

    return (
      <g opacity={op}>
        {edges.map(([from, to], i) => {
          const a = nodes[from], b = nodes[to];
          if (to >= visitedCount + 1) return null;
          const eOp = spring({
            frame: stepLocalFrame - i * 3, fps,
            config: { damping: 20, stiffness: 100 }, durationInFrames: 22,
          });
          const dotT = interpolate(stepLocalFrame, [i * 3 + 5, i * 3 + 22], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          return (
            <g key={`e${i}`} opacity={eOp}>
              <line x1={a.x} y1={a.y + nodeR} x2={b.x} y2={b.y - nodeR}
                stroke={accent} strokeWidth={1.5} opacity={0.35} />
              {dotT > 0.05 && dotT < 0.95 && (
                <circle cx={a.x + (b.x - a.x) * dotT}
                  cy={a.y + nodeR + (b.y - nodeR - a.y - nodeR) * dotT}
                  r={4} fill={accent} opacity={0.8} />
              )}
            </g>
          );
        })}
        {nodes.map((n, i) => {
          if (i > visitedCount) return null;
          const nOp = spring({
            frame: stepLocalFrame - i * 4, fps,
            config: { damping: 18, stiffness: 110 }, durationInFrames: 20,
          });
          const isActive = i === activeIdx;
          const isVisited = i < activeIdx;
          const color = isActive ? accent : isVisited ? C.nodeDone : C.nodeDefault;
          return (
            <g key={i} opacity={nOp}>
              {isActive && <circle cx={n.x} cy={n.y} r={nodeR + 14 + pulse * 6}
                fill={accent} opacity={0.06} />}
              <circle cx={n.x} cy={n.y} r={nodeR * nOp}
                fill={color} stroke={accent}
                strokeWidth={isActive ? 2.5 : 1}
                opacity={isVisited ? 0.4 : 0.85} />
              {nOp > 0.4 && (
                <text x={n.x} y={n.y + 5} textAnchor="middle"
                  fill={isActive ? C.bg : C.text} opacity={nOp}
                  style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700 }}>
                  {n.label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    );
  }

  if (codeType === "hash_map" || codeType === "hash_table" || codeType === "dictionary") {
    const bucketCount = 6;
    const bucketW = 200;
    const bucketH = 44;
    const gap = 12;
    const originX = 960 - bucketW / 2 - 60;
    const originY = 250;

    const sampleData = [
      { key: '"name"', val: '"Alice"', bucket: 0 },
      { key: '"age"', val: "30", bucket: 1 },
      { key: '"city"', val: '"NYC"', bucket: 2 },
      { key: '"id"', val: "42", bucket: 4 },
      { key: '"role"', val: '"eng"', bucket: 2 },
    ];
    const visibleItems = Math.max(1, Math.ceil(stepFraction * sampleData.length));

    return (
      <g opacity={op}>
        {Array.from({ length: bucketCount }, (_, i) => {
          const y = originY + i * (bucketH + gap);
          const bOp = spring({
            frame: stepLocalFrame - i * 3, fps,
            config: { damping: 22, stiffness: 120 }, durationInFrames: 18,
          });
          return (
            <g key={i} opacity={bOp}>
              <text x={originX - 20} y={y + bucketH / 2 + 4} textAnchor="end"
                fill={C.textMuted} style={{ fontFamily: C.mono, fontSize: 11 }}>
                [{i}]
              </text>
              <rect x={originX} y={y} width={bucketW} height={bucketH}
                rx={8} fill={C.nodeDefault} stroke={C.edge} strokeWidth={1} />
            </g>
          );
        })}
        {sampleData.slice(0, visibleItems).map((item, i) => {
          const y = originY + item.bucket * (bucketH + gap);
          const isCollision = sampleData.slice(0, i).some(d => d.bucket === item.bucket);
          const xOffset = isCollision ? bucketW + 16 : 0;
          const iOp = spring({
            frame: stepLocalFrame - 8 - i * 5, fps,
            config: { damping: 18, stiffness: 100 }, durationInFrames: 22,
          });
          const isLatest = i === visibleItems - 1;
          return (
            <g key={`item${i}`} opacity={iOp}>
              {isCollision && (
                <line x1={originX + bucketW} y1={y + bucketH / 2}
                  x2={originX + bucketW + 12} y2={y + bucketH / 2}
                  stroke={C.nodeWarn} strokeWidth={2} opacity={0.5} />
              )}
              <rect x={originX + xOffset + 4} y={y + 4}
                width={bucketW - 8} height={bucketH - 8}
                rx={6} fill={isLatest ? accent : C.nodeDefault}
                stroke={isCollision ? C.nodeWarn : accent}
                strokeWidth={isLatest ? 2 : 1}
                opacity={isLatest ? 0.6 : 0.35} />
              <text x={originX + xOffset + 20} y={y + bucketH / 2 + 4}
                fill={isLatest ? C.bg : accent} opacity={0.8}
                style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600 }}>
                {item.key}: {item.val}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  if (codeType === "class_definition" || codeType === "class") {
    const boxW = 320;
    const boxX = 960 - boxW / 2;
    const boxY = 250;
    const headerH = 48;
    const rowH = 32;
    const fields = ["- name: string", "- age: number", "- items: List"];
    const methods = ["+ getName()", "+ addItem(item)", "+ toString()"];
    const visibleFields = Math.ceil(stepFraction * fields.length * 2);
    const shownFields = Math.min(fields.length, visibleFields);
    const shownMethods = Math.min(methods.length, Math.max(0, visibleFields - fields.length));
    const totalH = headerH + shownFields * rowH + (shownMethods > 0 ? 2 + shownMethods * rowH : 0) + 16;

    const boxOp = spring({
      frame: stepLocalFrame, fps,
      config: { damping: 22, stiffness: 110 }, durationInFrames: 24,
    });

    return (
      <g opacity={op}>
        <rect x={boxX} y={boxY} width={boxW} height={totalH * boxOp}
          rx={10} fill={C.nodeDefault} stroke={accent} strokeWidth={2} opacity={0.7} />
        <rect x={boxX} y={boxY} width={boxW} height={headerH}
          rx={10} fill={accent} opacity={0.12} />
        <text x={960} y={boxY + headerH / 2 + 6} textAnchor="middle"
          fill={accent} style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 700 }}>
          MyClass
        </text>
        <line x1={boxX + 8} y1={boxY + headerH} x2={boxX + boxW - 8} y2={boxY + headerH}
          stroke={accent} strokeWidth={1} opacity={0.2} />
        {fields.slice(0, shownFields).map((f, i) => {
          const fOp = spring({
            frame: stepLocalFrame - 6 - i * 3, fps,
            config: { damping: 20, stiffness: 120 }, durationInFrames: 18,
          });
          return (
            <text key={`f${i}`} x={boxX + 16} y={boxY + headerH + 24 + i * rowH}
              fill={C.text} opacity={0.7 * fOp}
              style={{ fontFamily: C.mono, fontSize: 13 }}>
              {f}
            </text>
          );
        })}
        {shownMethods > 0 && (
          <line x1={boxX + 8} y1={boxY + headerH + shownFields * rowH + 8}
            x2={boxX + boxW - 8} y2={boxY + headerH + shownFields * rowH + 8}
            stroke={accent} strokeWidth={1} opacity={0.2} />
        )}
        {methods.slice(0, shownMethods).map((m, i) => {
          const mOp = spring({
            frame: stepLocalFrame - 12 - i * 3, fps,
            config: { damping: 20, stiffness: 120 }, durationInFrames: 18,
          });
          return (
            <text key={`m${i}`} x={boxX + 16}
              y={boxY + headerH + shownFields * rowH + 28 + i * rowH}
              fill={C.nodeDone} opacity={0.7 * mOp}
              style={{ fontFamily: C.mono, fontSize: 13 }}>
              {m}
            </text>
          );
        })}
      </g>
    );
  }

  // Generic / python_function / js_function: progressive pipeline with animated flow
  const nodeCount = totalSteps;
  const maxVisible = Math.min(nodeCount, 7);
  const pipeY = 420;
  const pipeSpacing = Math.min(200, 1400 / maxVisible);
  const pipeStartX = 960 - ((maxVisible - 1) * pipeSpacing) / 2;
  // Which node is "active" — advances with each step
  const activeNode = Math.min(maxVisible - 1, stepIndex);

  return (
    <g opacity={op}>
      {/* Pipeline baseline */}
      <line x1={pipeStartX - 30} y1={pipeY}
        x2={pipeStartX + (maxVisible - 1) * pipeSpacing + 30} y2={pipeY}
        stroke={accent} strokeWidth={1.5} opacity={0.1} strokeDasharray="8,6" />

      {Array.from({ length: maxVisible }, (_, i) => {
        const cx = pipeStartX + i * pipeSpacing;
        const nodeAnim = spring({
          frame: stepLocalFrame - i * 3, fps,
          config: { damping: 20, stiffness: 120 }, durationInFrames: 20,
        });
        const r = 28;
        const isActive = i === activeNode;
        const isPast = i < activeNode;
        const isFuture = i > activeNode;

        // Traveling dot on edge to next node
        const dotT = isActive ? interpolate(stepLocalFrame, [8, FRAMES_PER_STEP - 8], [0, 1], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        }) : 0;

        return (
          <g key={i}>
            {/* Connection to next */}
            {i < maxVisible - 1 && (
              <g opacity={nodeAnim}>
                <line x1={cx + r + 4} y1={pipeY} x2={cx + pipeSpacing - r - 4} y2={pipeY}
                  stroke={isPast ? C.nodeDone : accent} strokeWidth={isPast ? 2 : 1.5}
                  opacity={isPast ? 0.3 : 0.15} />
                {isActive && dotT > 0.05 && dotT < 0.95 && (
                  <>
                    <circle cx={cx + r + 4 + (pipeSpacing - 2 * r - 8) * dotT}
                      cy={pipeY} r={12} fill={accent} opacity={0.05} />
                    <circle cx={cx + r + 4 + (pipeSpacing - 2 * r - 8) * dotT}
                      cy={pipeY} r={4.5} fill={accent} opacity={0.8} />
                  </>
                )}
              </g>
            )}
            {/* Node */}
            <g opacity={nodeAnim}>
              {isActive && (
                <circle cx={cx} cy={pipeY} r={r + 16 + pulse * 6}
                  fill={accent} opacity={0.04} />
              )}
              <circle cx={cx} cy={pipeY} r={r}
                fill={isActive ? accent : isPast ? C.nodeDone : C.nodeDefault}
                stroke={isFuture ? "rgba(255,255,255,0.1)" : accent}
                strokeWidth={isActive ? 0 : isPast ? 0 : 1.5}
                opacity={isActive ? 0.5 : isPast ? 0.25 : 0.6} />
              <text x={cx} y={pipeY + 5} textAnchor="middle"
                fill={isActive ? C.bg : isPast ? C.nodeDone : C.text}
                opacity={isFuture ? 0.3 : 0.8}
                style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700 }}>
                {i + 1}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Data overlay — small variable panel in upper-right during execution
// ---------------------------------------------------------------------------
function DataOverlay({
  variables, stepLocalFrame, fps, accent,
}: {
  variables: Record<string, string>; stepLocalFrame: number; fps: number; accent: string;
}) {
  const entries = Object.entries(variables).slice(0, 5);
  if (entries.length === 0) return null;

  const panelW = 280;
  const rowH = 32;
  const panelH = entries.length * rowH + 40;
  const px = 1920 - panelW - 60;
  const py = 80;

  return (
    <g>
      {/* Panel background */}
      <rect x={px} y={py} width={panelW} height={panelH}
        rx={10} fill={C.bgCard} stroke="rgba(255,255,255,0.06)" strokeWidth={1} opacity={0.9} />
      {/* Title */}
      <text x={px + 14} y={py + 20} fill={accent} opacity={0.5}
        style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.12em" }}>
        STATE
      </text>
      {/* Rows */}
      {entries.map(([key, val], i) => {
        const rowY = py + 32 + i * rowH;
        const rowProgress = spring({
          frame: stepLocalFrame - i * 3, fps,
          config: { damping: 24, stiffness: 140 }, durationInFrames: 16,
        });
        return (
          <g key={key} opacity={rowProgress}>
            <text x={px + 14} y={rowY + 14} fill={accent} opacity={0.6}
              style={{ fontFamily: C.mono, fontSize: 11 }}>
              {key.length > 12 ? key.slice(0, 10) + "\u2026" : key}
            </text>
            <text x={px + panelW - 14} y={rowY + 14} textAnchor="end" fill={C.text}
              style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600 }}>
              {val.length > 16 ? val.slice(0, 14) + "\u2026" : val}
            </text>
            {/* Separator */}
            {i < entries.length - 1 && (
              <line x1={px + 10} y1={rowY + rowH - 2} x2={px + panelW - 10} y2={rowY + rowH - 2}
                stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
            )}
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Code inset — always visible, bottom-left
// ---------------------------------------------------------------------------
function CodeInset({
  code, activeLine, language,
}: {
  code: string; activeLine: number; language: string;
}) {
  const lines = code.split("\n");
  const context = 3;
  const start = Math.max(0, activeLine - context - 1);
  const end = Math.min(lines.length, activeLine + context);
  const snippet = lines.slice(start, end);

  return (
    <div style={{
      position: "absolute", bottom: 28, left: 40, width: 420,
      background: C.bgCard,
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 10, padding: "12px 16px", overflow: "hidden",
    }}>
      <div style={{
        fontFamily: C.mono, fontSize: 9, color: "rgba(228,232,240,0.3)",
        letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase",
      }}>
        {language}
      </div>
      {snippet.map((line, i) => {
        const lineNum = start + i + 1;
        const isActive = lineNum === activeLine;
        return (
          <div key={i} style={{
            display: "flex", gap: 8, padding: "1px 6px", borderRadius: 4,
            background: isActive ? "rgba(61,142,255,0.10)" : "transparent",
            borderLeft: isActive ? "2px solid #3D8EFF" : "2px solid transparent",
            marginBottom: 1,
          }}>
            <span style={{
              fontFamily: C.mono, fontSize: 11,
              color: isActive ? C.nodeActive : "rgba(228,232,240,0.2)",
              width: 22, flexShrink: 0,
            }}>{lineNum}</span>
            <span style={{
              fontFamily: C.mono, fontSize: 11,
              color: isActive ? C.text : "rgba(228,232,240,0.4)",
              whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis",
            }}>{line || " "}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Caption bar — always visible, bottom-right
// ---------------------------------------------------------------------------
function CaptionBar({
  label, subtext, phase, stepLocalFrame,
}: {
  label: string; subtext?: string; phase?: string; stepLocalFrame: number;
}) {
  const captionOpacity = interpolate(
    stepLocalFrame, [0, 10, FRAMES_PER_STEP - 10, FRAMES_PER_STEP], [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const subtextOpacity = interpolate(
    stepLocalFrame, [14, 26, FRAMES_PER_STEP - 10, FRAMES_PER_STEP], [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const accentColor = PHASE_COLORS[phase ?? "execution"] ?? C.nodeActive;

  return (
    <div style={{
      position: "absolute", bottom: 28, right: 40, left: 500,
      background: C.bgCard,
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 10, padding: "14px 20px", overflow: "hidden",
    }}>
      {phase && (
        <div style={{
          fontFamily: C.mono, fontSize: 9, fontWeight: 700,
          letterSpacing: "0.14em", textTransform: "uppercase",
          color: accentColor, marginBottom: 6, opacity: 0.8,
        }}>
          {phase === "overview" ? "OVERVIEW" : phase === "mechanism" ? "HOW IT WORKS" : phase === "insight" ? "KEY INSIGHT" : "EXECUTION"}
        </div>
      )}
      <div style={{
        fontFamily: C.sans, fontSize: 17, fontWeight: 500,
        color: C.text, lineHeight: 1.35, opacity: captionOpacity,
      }}>
        {label}
      </div>
      {subtext && (
        <div style={{
          fontFamily: C.sans, fontSize: 12, color: "rgba(228,232,240,0.4)",
          fontStyle: "italic", marginTop: 5, lineHeight: 1.4, opacity: subtextOpacity,
        }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main composition
// ---------------------------------------------------------------------------
export const ControlFlowBranch: React.FC<ControlFlowBranchProps> = ({
  title = "Code Execution",
  code,
  language = "python",
  steps,
  code_type,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentStepIndex = Math.min(Math.floor(frame / FRAMES_PER_STEP), steps.length - 1);
  const currentStep = steps[currentStepIndex];
  const stepLocalFrame = frame % FRAMES_PER_STEP;

  const narrativePhase = (currentStep as (typeof currentStep) & { narrative_phase?: string })?.narrative_phase;
  const isConceptPhase = narrativePhase === "overview" || narrativePhase === "mechanism" || narrativePhase === "insight";
  const variables = currentStep?.variables ?? {};
  const vizMode = detectVizMode(variables, code_type);

  const headerY = spring({ frame, fps, config: { damping: 24, stiffness: 130 }, durationInFrames: 20 });

  // Step crossfade: fade in at start, hold, gentle fade at end
  const crossfade = interpolate(
    stepLocalFrame,
    [0, 8, FRAMES_PER_STEP - 8, FRAMES_PER_STEP],
    [0, 1, 1, 0.6],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const phaseColor = narrativePhase === "overview" ? C.nodeDone
    : narrativePhase === "mechanism" ? "#60A5FA"
    : narrativePhase === "insight" ? C.accent3
    : C.nodeActive;

  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      <svg style={{ position: "absolute", inset: 0 }}
        viewBox="0 0 1920 1080" width={1920} height={1080}>

        {/* Step transition pulse */}
        {stepLocalFrame < 6 && (
          <rect x={0} y={0} width={1920} height={1080}
            fill={phaseColor}
            opacity={interpolate(stepLocalFrame, [0, 6], [0.04, 0], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp",
            })}
          />
        )}

        <g opacity={crossfade}>
        {/* Concept phases: shape IS the visualization */}
        {isConceptPhase && (
          <ConceptViz
            label={currentStep?.label ?? ""}
            variables={variables}
            phase={narrativePhase!}
            codeType={code_type}
            stepLocalFrame={stepLocalFrame}
            fps={fps}
            stepIndex={currentStepIndex}
            totalSteps={steps.length}
          />
        )}

        {/* Execution phases: data-driven visualizations that change per step */}
        {!isConceptPhase && vizMode === "call_results" && (
          <CallResultsViz variables={variables} stepLocalFrame={stepLocalFrame} fps={fps} />
        )}
        {!isConceptPhase && vizMode === "sort_partition" && (
          <ArrayBarsViz variables={variables} stepLocalFrame={stepLocalFrame} fps={fps} />
        )}
        {!isConceptPhase && vizMode === "async_flow" && (
          <AsyncFlowViz variables={variables} stepLocalFrame={stepLocalFrame} fps={fps} />
        )}
        {!isConceptPhase && vizMode === "array" && (
          <ArrayBarsViz variables={variables} stepLocalFrame={stepLocalFrame} fps={fps} />
        )}
        {!isConceptPhase && vizMode === "numeric" && (
          <NumericCirclesViz variables={variables} stepLocalFrame={stepLocalFrame} fps={fps} />
        )}
        {!isConceptPhase && vizMode === "boolean" && (
          <BooleanViz variables={variables} stepLocalFrame={stepLocalFrame} fps={fps} />
        )}
        {!isConceptPhase && (vizMode === "flow" || vizMode === "label_only") && (
          <StepViz
            variables={variables} stepLocalFrame={stepLocalFrame} fps={fps}
            codeType={code_type} stepIndex={currentStepIndex} totalSteps={steps.length}
          />
        )}
        </g>
      </svg>

      {/* Header */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 48px",
        background: "rgba(12,14,21,0.8)", backdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        transform: `translateY(${(1 - headerY) * -40}px)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{
            fontFamily: C.mono, fontSize: 10, color: C.nodeActive,
            letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.7,
          }}>Phantom</span>
          <span style={{
            fontFamily: C.sans, fontWeight: 700, fontSize: 17, color: C.text,
          }}>{title}</span>
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.textMuted }}>
          Step <span style={{ color: C.nodeActive, fontWeight: 700 }}>{currentStepIndex + 1}</span> / {steps.length}
        </div>
      </div>

      <CodeInset code={code} activeLine={currentStep?.line_number ?? 1} language={language} />
      <CaptionBar label={currentStep?.label ?? ""} subtext={currentStep?.subtext}
        phase={narrativePhase} stepLocalFrame={stepLocalFrame} />
    </AbsoluteFill>
  );
};

// Default props
export const CONTROL_FLOW_DEFAULT: ControlFlowBranchProps = {
  title: "fibonacci(5)",
  code: `def fib(n):\n    if n <= 1:\n        return n\n    return fib(n-1) + fib(n-2)`,
  language: "python",
  steps: [
    { step_index: 0, line_number: 1, label: "fib(n) solves the problem by calling itself on a smaller input", variables: { strategy: "self-reference", pattern: "recursion" }, subtext: "The function delegates to a simpler version of itself", narrative_phase: "overview" },
    { step_index: 1, line_number: 1, label: "Each call asks: solve fib(n-1) and fib(n-2), then combine", variables: { call_tree: "binary branching", growth: "O(2^n)" }, subtext: "Every node spawns two children, doubling the work each level", narrative_phase: "mechanism" },
    { step_index: 2, line_number: 4, label: "The recurrence: fib(n-1) + fib(n-2)", variables: { formula: "fib(n-1) + fib(n-2)", pattern: "recurrence" }, subtext: "The return value is assembled from two sub-results", narrative_phase: "mechanism" },
    { step_index: 3, line_number: 2, label: "Base case: when n <= 1, return n immediately", variables: { base_case: "n <= 1", returns: "n" }, subtext: "Without this the function would call itself forever", narrative_phase: "mechanism" },
    { step_index: 4, line_number: 1, label: "fib(5) branches into fib(4) and fib(3)", variables: { n: "5", spawns: "fib(4), fib(3)" }, subtext: "fib(3) will be computed twice, fib(2) three times", narrative_phase: "execution" },
    { step_index: 5, line_number: 2, label: "fib(2) hits the base case: fib(1)=1, fib(0)=0", variables: { n: "2", "fib(1)": "1", "fib(0)": "0", result: "1" }, subtext: "Leaf calls return immediately — results bubble back up", narrative_phase: "execution" },
    { step_index: 6, line_number: 4, label: "Stack unwinds: 1+1=2, 2+1=3, 3+2=5", variables: { "fib(2)": "1", "fib(3)": "2", "fib(4)": "3", "fib(5)": "5" }, subtext: "Each frame adds its two sub-results — answer assembles bottom-up", narrative_phase: "execution" },
    { step_index: 7, line_number: 1, label: "fib(5) = 5 — memoization reduces 25 calls to 9", variables: { answer: "5", calls: "~25", with_memo: "~9", complexity: "O(n)" }, subtext: "Cache sub-results and the tree collapses to a linear pass", narrative_phase: "insight" },
  ],
};
