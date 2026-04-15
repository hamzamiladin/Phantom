import { z } from "zod";

// Explicit TypeScript type for a recursive tree node.
export type TreeNode = {
  id: string;
  label: string;
  value?: number;
  children: TreeNode[];
  isDuplicate: boolean;
  isBase: boolean;
  depth: number;
};

// In zod v4, z.ZodType is the correct annotation for a recursive schema.
// Using z.ZodType<TreeNode> (single generic = output type) is idiomatic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string(),
    value: z.number().optional(),
    children: z.array(TreeNodeSchema as z.ZodType<TreeNode>),
    isDuplicate: z.boolean(),
    isBase: z.boolean(),
    depth: z.number(),
  })
);

export const RecursionTreePropsSchema = z.object({
  title: z.string().default("Recursion Tree"),
  functionName: z.string(),
  rootNode: TreeNodeSchema,
  highlightColor: z.string().default("#FF6B6B"),
  accentColor: z.string().default("#4ECDC4"),
  baseColor: z.string().default("#69DB7C"),
});

export type RecursionTreeProps = z.infer<typeof RecursionTreePropsSchema>;

// ---- ArraySort ----

export const ArraySortPropsSchema = z.object({
  title: z.string().default("Array Sort"),
  initialArray: z.array(z.number()),
  algorithm: z.enum(["quicksort", "mergesort", "bubblesort"]).default("quicksort"),
  accentColor: z.string().default("#4ECDC4"),
  pivotColor: z.string().default("#FFD93D"),
  swapColor: z.string().default("#FF6B6B"),
});

export type ArraySortProps = z.infer<typeof ArraySortPropsSchema>;

// ---- AsyncTimeline ----

export const AsyncLaneSchema = z.object({
  id: z.string(),
  label: z.string(),
  startMs: z.number(),
  durationMs: z.number(),
  color: z.string().optional(),
});

export const AsyncTimelinePropsSchema = z.object({
  title: z.string().default("Async Timeline"),
  lanes: z.array(AsyncLaneSchema),
  totalMs: z.number(),
  accentColor: z.string().default("#4ECDC4"),
});

export type AsyncTimelineProps = z.infer<typeof AsyncTimelinePropsSchema>;

// ---- ControlFlowBranch ----

export const ExecutionStepSchema = z.object({
  step_index: z.number(),
  line_number: z.number(),
  label: z.string(),
  variables: z.record(z.string(), z.string()),
  subtext: z.string().optional(),
  narrative_phase: z.enum(["overview", "mechanism", "execution", "insight"]).optional(),
});
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

export const ControlFlowBranchPropsSchema = z.object({
  title: z.string().default("Code Execution"),
  code: z.string(),
  language: z.string().default("python"),
  steps: z.array(ExecutionStepSchema),
  code_type: z.string().optional(), // e.g. "recursive_function", "sorting_algorithm", "async_flow", "react_component"
});
export type ControlFlowBranchProps = z.infer<typeof ControlFlowBranchPropsSchema>;
