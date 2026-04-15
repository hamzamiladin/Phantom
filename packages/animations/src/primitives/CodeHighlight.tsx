import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

export interface CodeLine {
  text: string;
  /** If true, render this line highlighted (active execution line) */
  isActive?: boolean;
  /** If true, dim this line */
  isDimmed?: boolean;
  revealFrame?: number;
}

export interface CodeHighlightProps {
  lines: CodeLine[];
  language?: string;
  title?: string;
  x?: number;
  y?: number;
  width?: number;
  fontSize?: number;
  accentColor?: string;
}

/**
 * A syntax-highlighted code block with animated line reveals and
 * a highlighted active line indicator. Designed to look like a
 * minimal VS Code dark theme panel.
 */
export const CodeHighlight: React.FC<CodeHighlightProps> = ({
  lines,
  title,
  x = 40,
  y = 40,
  width = 560,
  fontSize = 18,
  accentColor = "#4ECDC4",
}) => {
  const frame = useCurrentFrame();
  const lineHeight = fontSize * 1.7;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        background: "#161B22",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 8px 40px rgba(0,0,0,0.55)",
        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          background: "#1C2128",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF5F57" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FFBD2E" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28CA41" }} />
        {title && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 13,
              color: "#8B949E",
              fontFamily: "'SF Pro Text', sans-serif",
            }}
          >
            {title}
          </span>
        )}
      </div>

      {/* Code lines */}
      <div style={{ padding: "12px 0" }}>
        {lines.map((line, i) => {
          const revealFrame = line.revealFrame ?? 0;
          const opacity = interpolate(
            frame,
            [revealFrame, revealFrame + 8],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                height: lineHeight,
                opacity: line.isDimmed ? opacity * 0.4 : opacity,
                background: line.isActive
                  ? "rgba(78, 205, 196, 0.1)"
                  : "transparent",
                borderLeft: line.isActive
                  ? `3px solid ${accentColor}`
                  : "3px solid transparent",
                transition: "background 0.2s",
              }}
            >
              {/* Line number */}
              <span
                style={{
                  width: 44,
                  textAlign: "right",
                  paddingRight: 16,
                  fontSize: fontSize * 0.8,
                  color: "#3D4450",
                  userSelect: "none",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              {/* Code text — basic keyword coloring via spans */}
              <span
                style={{
                  fontSize,
                  color: line.isActive ? "#E8E8E8" : "#CDD9E5",
                  whiteSpace: "pre",
                }}
              >
                {line.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
