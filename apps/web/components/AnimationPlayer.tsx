"use client";
import React from "react";
import dynamic from "next/dynamic";
import type { RecursionTreeProps, ControlFlowBranchProps } from "@phantom/shared";

function PlayerSkeleton() {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "16/9",
        background: "rgba(13,19,32,0.8)",
        borderRadius: "12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid rgba(78,205,196,0.18)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-jetbrains, monospace)",
          fontSize: "12px",
          color: "#8B949E",
        }}
      >
        Loading player…
      </span>
    </div>
  );
}

export interface AnimationPlayerProps {
  compositionId?: string;
  durationInFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
  inputProps?: Record<string, unknown>;
  autoPlay?: boolean;
  loop?: boolean;
  controls?: boolean;
  playbackRate?: number;
  playerRef?: React.RefObject<{ getCurrentFrame: () => number; seekTo: (frame: number) => void } | null>;
}

// ---- RecursionTree player ----
const RecursionTreePlayer = dynamic(
  async () => {
    const [{ Player }, { RecursionTree, FIBONACCI_5_TREE }] = await Promise.all(
      [import("@remotion/player"), import("@phantom/animations")],
    );

    function Wrapper({
      durationInFrames = 280,
      fps = 30,
      width = 1920,
      height = 1080,
      inputProps,
      autoPlay = false,
      loop = false,
      controls = true,
      playbackRate = 1,
      playerRef,
    }: AnimationPlayerProps) {
      const props: RecursionTreeProps = {
        ...FIBONACCI_5_TREE,
        ...(inputProps as Partial<RecursionTreeProps>),
      };

      return (
        <div
          style={{
            width: "100%",
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid rgba(78,205,196,0.18)",
          }}
        >
          <Player
            ref={playerRef as React.RefObject<never>}
            component={RecursionTree}
            durationInFrames={durationInFrames}
            fps={fps}
            compositionWidth={width}
            compositionHeight={height}
            inputProps={props}
            autoPlay={autoPlay}
            loop={loop}
            controls={controls}
            playbackRate={playbackRate}
            style={{ width: "100%" }}
          />
        </div>
      );
    }

    return Wrapper;
  },
  { ssr: false, loading: () => <PlayerSkeleton /> },
);

// ---- ControlFlowBranch player ----
const ControlFlowBranchPlayer = dynamic(
  async () => {
    const [{ Player }, { ControlFlowBranch, CONTROL_FLOW_DEFAULT }] =
      await Promise.all([
        import("@remotion/player"),
        import("@phantom/animations"),
      ]);

    function Wrapper({
      durationInFrames,
      fps = 30,
      width = 1920,
      height = 1080,
      inputProps,
      autoPlay = false,
      loop = false,
      controls = true,
      playbackRate = 1,
      playerRef,
    }: AnimationPlayerProps) {
      const props: ControlFlowBranchProps = {
        ...CONTROL_FLOW_DEFAULT,
        ...(inputProps as Partial<ControlFlowBranchProps>),
      };
      const steps = props.steps?.length ?? 3;
      const dur = durationInFrames ?? Math.max(180, steps * 72);

      return (
        <div
          style={{
            width: "100%",
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid rgba(78,205,196,0.18)",
          }}
        >
          <Player
            ref={playerRef as React.RefObject<never>}
            component={ControlFlowBranch}
            durationInFrames={dur}
            fps={fps}
            compositionWidth={width}
            compositionHeight={height}
            inputProps={props}
            autoPlay={autoPlay}
            loop={loop}
            controls={controls}
            playbackRate={playbackRate}
            style={{ width: "100%" }}
          />
        </div>
      );
    }

    return Wrapper;
  },
  { ssr: false, loading: () => <PlayerSkeleton /> },
);

export function AnimationPlayer(props: AnimationPlayerProps) {
  const id = props.compositionId ?? "RecursionTree";
  if (id === "ControlFlowBranch" || id === "control_flow_branch") {
    return <ControlFlowBranchPlayer {...props} />;
  }
  return <RecursionTreePlayer {...props} />;
}
