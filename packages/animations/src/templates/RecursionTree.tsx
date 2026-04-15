import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { RecursionTreeProps } from "@phantom/shared";
import { AnimatedTree, type TreeNodeLayout } from "../primitives/AnimatedTree";
import { CaptionSequence } from "../primitives/Caption";

// ---------------------------------------------------------------------------
// fibonacci(5) tree — proper binary-tree layout on 1920×1080.
// Each parent is centered exactly over its children.
// All sibling gaps ≥ 200px (with nodeRadius=36, that's 128px clearance).
//
// Positions verified:
//   depth 3 centers → fib(3b)=320, fib(2a)=800, fib(2b)=1200, fib(1a)=1520
//   depth 1 centers → fib(4)=560 [center of 320,800], fib(3a)=1360 [center of 1200,1520]
//   depth 0 center  → fib(5)=960 [center of 560,1360]
// ---------------------------------------------------------------------------

export const FIBONACCI_5_NODES: TreeNodeLayout[] = [
  // depth 0
  { id: "fib5",  label: "fib(5)", x: 960,  y: 160, isDuplicate: false, isBase: false, revealFrame: 7   },

  // depth 1
  { id: "fib4",  label: "fib(4)", x: 560,  y: 310, parentId: "fib5",  isDuplicate: false, isBase: false, revealFrame: 27  },
  { id: "fib3a", label: "fib(3)", x: 1360, y: 310, parentId: "fib5",  isDuplicate: true,  isBase: false, revealFrame: 38  },

  // depth 2
  { id: "fib3b", label: "fib(3)", x: 320,  y: 460, parentId: "fib4",  isDuplicate: false, isBase: false, revealFrame: 57  },
  { id: "fib2a", label: "fib(2)", x: 800,  y: 460, parentId: "fib4",  isDuplicate: true,  isBase: false, revealFrame: 68  },
  { id: "fib2b", label: "fib(2)", x: 1200, y: 460, parentId: "fib3a", isDuplicate: true,  isBase: false, revealFrame: 78  },
  { id: "fib1a", label: "fib(1)", x: 1520, y: 460, parentId: "fib3a", isDuplicate: true,  isBase: false, revealFrame: 89  },

  // depth 3
  { id: "fib2c", label: "fib(2)", x: 180,  y: 615, parentId: "fib3b", isDuplicate: false, isBase: false, revealFrame: 108 },
  { id: "fib1b", label: "fib(1)", x: 460,  y: 615, parentId: "fib3b", isDuplicate: true,  isBase: false, revealFrame: 119 },
  { id: "fib1c", label: "fib(1)", x: 700,  y: 615, parentId: "fib2a", isDuplicate: true,  isBase: false, revealFrame: 130 },
  { id: "fib0a", label: "fib(0)", x: 900,  y: 615, parentId: "fib2a", isDuplicate: true,  isBase: false, revealFrame: 140 },
  { id: "fib1d", label: "fib(1)", x: 1100, y: 615, parentId: "fib2b", isDuplicate: true,  isBase: false, revealFrame: 151 },
  { id: "fib0b", label: "fib(0)", x: 1300, y: 615, parentId: "fib2b", isDuplicate: true,  isBase: false, revealFrame: 162 },

  // depth 4 — only under fib(2c), the one non-duplicate fib(2)
  { id: "fib1e", label: "fib(1)", x: 100,  y: 775, parentId: "fib2c", isDuplicate: false, isBase: true, revealFrame: 181 },
  { id: "fib0c", label: "fib(0)", x: 260,  y: 775, parentId: "fib2c", isDuplicate: false, isBase: true, revealFrame: 192 },
];

// ---------------------------------------------------------------------------
// Default props (used by Root.tsx)
// ---------------------------------------------------------------------------
export const FIBONACCI_5_TREE: RecursionTreeProps = {
  title: "fibonacci(5)",
  functionName: "fib",
  rootNode: { id: "fib5", label: "fib(5)", isDuplicate: false, isBase: false, depth: 0, children: [] },
  highlightColor: "#FF8C54",   // warm orange — Lague-style duplicate highlight
  accentColor: "#3D8EFF",     // muted blue — Lague-style active node
  baseColor: "#3ECFA0",       // mint green — Lague-style base/resolved node
};

// ---------------------------------------------------------------------------
// Caption beats — timed to the reveal sequence
// ---------------------------------------------------------------------------
const CAPTION_BEATS = [
  { startFrame: 0,   endFrame: 65,  text: "Tracing fibonacci(5)…",                                                    subtext: "The function calls itself recursively to compute each value" },
  { startFrame: 65,  endFrame: 149, text: "Each call branches into fib(n−1) and fib(n−2)",                            subtext: "This creates an exponential call tree — O(2ⁿ) without caching" },
  { startFrame: 149, endFrame: 219, text: "Red nodes are repeated sub-problems — computed multiple times",            subtext: "fib(3) is called twice, fib(2) three times, fib(1) five times" },
  { startFrame: 219, endFrame: 280, text: "Memoization collapses O(2ⁿ) to O(n) by caching each result once",        subtext: "Store each fib(k) after its first computation — never recompute" },
];

// ---------------------------------------------------------------------------
// Sparse starfield — tiny dots for depth (computed once, deterministic)
// ---------------------------------------------------------------------------
const STARS = Array.from({ length: 70 }, (_, i) => ({
  x: (i * 1237 + 89) % 1920,
  y: (i * 997 + 43) % 1080,
  r: 0.8 + ((i * 31) % 3) * 0.5,
  opacity: 0.03 + ((i % 6) * 0.012),
}));

// ---------------------------------------------------------------------------
// Animated title — slides in from above with spring
// ---------------------------------------------------------------------------
const AnimatedTitle: React.FC<{ title: string }> = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideY = spring({ frame, fps, config: { damping: 16, stiffness: 160, mass: 1 }, durationInFrames: 28 });
  const opacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 26,
        opacity,
        transform: `translateY(${(1 - slideY) * -28}px)`,
        pointerEvents: "none",
      }}
    >
      <div style={{
        fontSize: 13,
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        color: "#4ECDC4",
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        opacity: 0.7,
      }}>
        Phantom
      </div>
      <div style={{
        marginTop: 5,
        fontSize: 32,
        fontFamily: "'SF Pro Display', 'Helvetica Neue', Arial, sans-serif",
        fontWeight: 700,
        color: "#F0F6FC",
        letterSpacing: "-0.02em",
      }}>
        {title}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Color legend — fades in when duplicates start appearing (~frame 28)
// ---------------------------------------------------------------------------
const Legend: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [38, 65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{
      position: "absolute",
      bottom: 120,
      right: 44,
      opacity,
      display: "flex",
      flexDirection: "column",
      gap: 9,
      background: "rgba(13, 17, 23, 0.82)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10,
      padding: "12px 18px",
    }}>
      <LegendRow color="#4ECDC4" fill="#1E3A5F" label="Unique call" />
      <LegendRow color="#4ADE80" fill="#0F2E1A" label="Base case" />
      <LegendRow color="#FF6B6B" fill="#2A1010" label="Repeated sub-problem" />
    </div>
  );
};

const LegendRow: React.FC<{ color: string; fill: string; label: string }> = ({ color, fill, label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <div style={{ width: 18, height: 18, borderRadius: "50%", background: fill, border: `2px solid ${color}`, flexShrink: 0 }} />
    <span style={{ fontSize: 14, color: "#CDD9E5", fontFamily: "'SF Pro Text', 'Helvetica Neue', sans-serif" }}>
      {label}
    </span>
  </div>
);

// ---------------------------------------------------------------------------
// Redundant-calls counter badge — springs in when duplicates start appearing
// ---------------------------------------------------------------------------
const DuplicateBadge: React.FC = () => {
  const frame = useCurrentFrame();
  const count = FIBONACCI_5_NODES.filter((n) => n.isDuplicate).length;

  const triggerFrame = 38;
  const opacity = interpolate(frame, [triggerFrame, triggerFrame + 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = spring({ frame: frame - triggerFrame, fps: 30, config: { damping: 10, stiffness: 240, mass: 0.7 }, durationInFrames: 22 });

  if (frame < triggerFrame) return null;

  return (
    <div style={{
      position: "absolute",
      top: 26,
      right: 44,
      opacity,
      transform: `scale(${scale})`,
      transformOrigin: "top right",
      background: "rgba(42, 16, 16, 0.92)",
      border: "2px solid #FF6B6B",
      borderRadius: 12,
      padding: "8px 18px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>
      <span style={{ fontSize: 34, fontWeight: 800, color: "#FF6B6B", fontFamily: "system-ui, sans-serif", lineHeight: 1 }}>
        {count}
      </span>
      <span style={{ fontSize: 11, color: "#FF9999", fontFamily: "system-ui, sans-serif", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        redundant calls
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Radial spotlight that slowly pans across the tree as it builds
// ---------------------------------------------------------------------------
const Spotlight: React.FC = () => {
  const frame = useCurrentFrame();
  // Slowly drifts from center-left to center-right
  const x = interpolate(frame, [0, 280], [600, 1300], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });

  return (
    <div style={{
      position: "absolute",
      top: -300,
      left: x - 500,
      width: 1000,
      height: 700,
      background: "radial-gradient(ellipse at center, rgba(78,205,196,0.055) 0%, transparent 65%)",
      pointerEvents: "none",
    }} />
  );
};

// ---------------------------------------------------------------------------
// Main composition
// ---------------------------------------------------------------------------
export const RecursionTree: React.FC<RecursionTreeProps> = ({ title }) => {
  return (
    <AbsoluteFill style={{ background: "linear-gradient(170deg, #0C0E15 0%, #0E1220 55%, #0A0C14 100%)", overflow: "hidden" }}>

      {/* Starfield */}
      <svg style={{ position: "absolute", inset: 0 }} width={1920} height={1080}>
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#7ECFCD" opacity={s.opacity} />
        ))}
      </svg>

      {/* Moving spotlight */}
      <Spotlight />

      {/* Tree */}
      <AnimatedTree nodes={FIBONACCI_5_NODES} nodeRadius={36} fontSize={17} />

      {/* UI overlays */}
      <AnimatedTitle title={title ?? "fibonacci(5)"} />
      <DuplicateBadge />
      <Legend />

      {/* Captions */}
      <CaptionSequence beats={CAPTION_BEATS} />
    </AbsoluteFill>
  );
};
