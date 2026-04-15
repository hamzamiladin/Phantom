import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export interface VariableEntry {
  key: string;
  value: string | number | boolean | null;
  highlight?: boolean;
  revealFrame?: number;
}

export interface VariablePanelProps {
  entries: VariableEntry[];
  title?: string;
  x?: number;
  y?: number;
  width?: number;
  accentColor?: string;
}

const VALUE_COLORS: Record<string, string> = {
  number: "#79C0FF",
  string: "#A5D6FF",
  boolean: "#FF7B72",
  object: "#D2A8FF",
};

function valueColor(v: VariableEntry["value"]): string {
  if (v === null) return "#8B949E";
  return VALUE_COLORS[typeof v] ?? "#E8E8E8";
}

/**
 * A dark-themed panel showing key → value entries with animated reveals.
 */
export const VariablePanel: React.FC<VariablePanelProps> = ({
  entries,
  title = "Variables",
  x = 40,
  y = 40,
  width = 320,
  accentColor = "#4ECDC4",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        background: "rgba(22, 27, 34, 0.92)",
        border: `1px solid rgba(78, 205, 196, 0.25)`,
        borderRadius: 14,
        padding: "16px 20px",
        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
        backdropFilter: "blur(8px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: accentColor,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 12,
          borderBottom: `1px solid rgba(78, 205, 196, 0.15)`,
          paddingBottom: 8,
        }}
      >
        {title}
      </div>

      {entries.map((entry, i) => {
        const revealFrame = entry.revealFrame ?? 0;
        const opacity = interpolate(
          frame,
          [revealFrame, revealFrame + 10],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        const slideX = interpolate(
          frame,
          [revealFrame, revealFrame + 10],
          [-8, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );

        const scale = spring({
          frame: frame - revealFrame,
          fps,
          config: { damping: 18, stiffness: 200, mass: 0.8 },
          durationInFrames: 20,
        });

        return (
          <div
            key={entry.key}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "5px 0",
              opacity,
              transform: `translateX(${slideX}px) scale(${0.9 + 0.1 * scale})`,
              background: entry.highlight
                ? "rgba(78, 205, 196, 0.08)"
                : "transparent",
              borderRadius: 6,
              paddingLeft: entry.highlight ? 6 : 0,
              paddingRight: entry.highlight ? 6 : 0,
            }}
          >
            <span style={{ color: "#8B949E", fontSize: 14 }}>
              {entry.key}
            </span>
            <span
              style={{
                color: valueColor(entry.value),
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {String(entry.value ?? "null")}
            </span>
          </div>
        );
      })}
    </div>
  );
};
