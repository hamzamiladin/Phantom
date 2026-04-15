import React from "react";
import { Composition } from "remotion";
import { RecursionTree, FIBONACCI_5_TREE } from "./templates/RecursionTree";
import {
  ControlFlowBranch,
  CONTROL_FLOW_DEFAULT,
} from "./templates/ControlFlowBranch";

export const RemotionRoot: React.FC = () => {
  const cfSteps = CONTROL_FLOW_DEFAULT.steps.length;
  return (
    <>
      <Composition
        id="RecursionTree"
        component={RecursionTree}
        durationInFrames={280}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={FIBONACCI_5_TREE}
      />
      <Composition
        id="ControlFlowBranch"
        component={ControlFlowBranch}
        durationInFrames={Math.max(180, cfSteps * 72)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={CONTROL_FLOW_DEFAULT}
      />
    </>
  );
};
