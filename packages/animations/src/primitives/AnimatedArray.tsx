import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export interface ArrayElement {
  value: number;
  id: string;
  color?: string;
  isActive?: boolean;
  isPivot?: boolean;
  isSorted?: boolean;
  revealFrame?: number;
}

export interface AnimatedArrayProps {
  elements: ArrayElement[];
  x?: number;
  y?: number;
  elementSize?: number;
  gap?: number;
  label?: string;
  accentColor?: string;
  pivotColor?: string;
  sortedColor?: string;
  maxValue?: number;
}

/**
 * A horizontal array of animated colored boxes.
 * Each element can be highlighted as active, pivot, or sorted.
 * Supports bar-chart style (height proportional to value) or
 * uniform-size cells.
 */
export const AnimatedArray: React.FC<AnimatedArrayProps> = ({
  elements,
  x = 40,
  y = 40,
  elementSize = 64,
  gap = 8,
  label,
  accentColor = "#4ECDC4",
  pivotColor = "#FFD93D",
  sortedColor = "#69DB7C",
  maxValue,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const resolvedMax = maxValue ?? Math.max(...elements.map((e) => e.value), 1);

  const totalWidth = elements.length * (elementSize + gap) - gap;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
      }}
    >
      {label && (
        <div
          style={{
            fontSize: 16,
            color: "#8B949E",
            fontFamily: "'SF Mono', monospace",
            marginBottom: 10,
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </div>
      )}
      <div style={{ display: "flex", gap, alignItems: "flex-end" }}>
        {elements.map((el, i) => {
          const revealFrame = el.revealFrame ?? 0;

          const scale = spring({
            frame: frame - revealFrame,
            fps,
            config: { damping: 14, stiffness: 180, mass: 0.9 },
            durationInFrames: 25,
          });

          const opacity = interpolate(
            frame,
            [revealFrame, revealFrame + 6],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          const barHeight = (el.value / resolvedMax) * elementSize * 1.5 + elementSize * 0.4;

          let bg = "#1E3A5F";
          let border = "#2D5A8E";
          if (el.isPivot) { bg = "#3D3014"; border = pivotColor; }
          else if (el.isSorted) { bg = "#1A3D1A"; border = sortedColor; }
          else if (el.isActive) { bg = "#1C3A3A"; border = accentColor; }
          else if (el.color) { bg = el.color; border = el.color; }

          return (
            <div
              key={el.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                opacity,
                transform: `scaleY(${scale})`,
                transformOrigin: "bottom center",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: el.isPivot ? pivotColor : el.isSorted ? sortedColor : el.isActive ? accentColor : "#8B949E",
                  fontFamily: "'SF Mono', monospace",
                  fontWeight: 600,
                }}
              >
                {el.value}
              </span>
              <div
                style={{
                  width: elementSize,
                  height: barHeight,
                  background: bg,
                  border: `2px solid ${border}`,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: el.isActive || el.isPivot
                    ? `0 0 16px ${border}55`
                    : "none",
                  transition: "background 0.15s",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
