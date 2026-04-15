import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";

export interface CaptionProps {
  text: string;
  subtext?: string;
  startFrame: number;
  endFrame: number;
  fontSize?: number;
  color?: string;
  bottomOffset?: number;
}

/**
 * A centered caption that fades in at startFrame and fades out before endFrame.
 * Sits at the bottom of the composition by default.
 */
export const Caption: React.FC<CaptionProps> = ({
  text,
  subtext,
  startFrame,
  endFrame,
  fontSize = 32,
  color = "#E8E8E8",
  bottomOffset = 60,
}) => {
  const frame = useCurrentFrame();

  const fadeDuration = 12;

  const opacity = interpolate(
    frame,
    [
      startFrame,
      startFrame + fadeDuration,
      endFrame - fadeDuration,
      endFrame,
    ],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  if (opacity === 0) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: bottomOffset,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          opacity,
          fontSize,
          fontFamily: "'SF Pro Display', 'Helvetica Neue', sans-serif",
          fontWeight: 500,
          color,
          textAlign: "center",
          letterSpacing: "0.02em",
          maxWidth: 1200,
          padding: "12px 32px",
          background: "rgba(13, 17, 23, 0.72)",
          borderRadius: 12,
          backdropFilter: "blur(4px)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div>{text}</div>
        {subtext && (
          <div style={{
            fontSize: fontSize * 0.62,
            color: "rgba(240,246,252,0.55)",
            marginTop: "6px",
            fontWeight: 400,
            letterSpacing: "0.01em",
          }}>
            {subtext}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ---- CaptionSequence: renders multiple captions from a list ----

export interface CaptionBeat {
  startFrame: number;
  endFrame: number;
  text: string;
  subtext?: string;
}

export const CaptionSequence: React.FC<{ beats: CaptionBeat[] }> = ({
  beats,
}) => {
  return (
    <>
      {beats.map((beat, i) => (
        <Caption
          key={i}
          text={beat.text}
          subtext={beat.subtext}
          startFrame={beat.startFrame}
          endFrame={beat.endFrame}
        />
      ))}
    </>
  );
};
