"""
Pydantic v2 models for every stage of the Phantom pipeline.
These are the single source of truth for inter-stage communication.
"""
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Stage 1: Parser output
# ---------------------------------------------------------------------------

class FunctionInfo(BaseModel):
    name: str
    params: list[str]
    is_recursive: bool
    calls: list[str]  # function names called within this function
    body_lines: int


class ParsedCode(BaseModel):
    language: Literal["python", "typescript", "javascript", "csharp", "rust"]
    raw_source: str
    functions: list[FunctionInfo]
    top_level_calls: list[str]  # function calls at module/script level


# ---------------------------------------------------------------------------
# Stage 2: Analyzer output (VisualizationIntent)
# ---------------------------------------------------------------------------

_VALID_CODE_TYPES = {
    "recursive_function",
    "sorting_algorithm",
    "sorting_function",
    "async_flow",
    "async_function",
    "state_machine",
    "data_pipeline",
    "tree_traversal",
    "hash_map",
    "linked_list",
    "event_loop",
    "react_component",
    "class_definition",
    "python_function",
    "js_function",
    "heap_graph",
    "dynamic_programming",
    "generic",
}


class VisualizationIntent(BaseModel):
    code_type: str  # validated below — unknown types fall back to "generic"

    @field_validator("code_type", mode="before")
    @classmethod
    def _normalize_code_type(cls, v: str) -> str:
        if v in _VALID_CODE_TYPES:
            return v
        return "generic"
    language: str
    entry_point: str                  # main function to visualize
    sample_input: str                 # e.g. "5" or "[3,1,4,1,5]"
    sample_input_value: int | list[int] | None = None
    notable_patterns: list[str]       # e.g. ["binary_recursion", "overlapping_subproblems"]
    description: str                  # 1-2 sentence human-readable description
    time_complexity: str = "O(?)"     # e.g. "O(2ⁿ)" or "O(n log n)"
    space_complexity: str = "O(?)"    # e.g. "O(n)" or "O(1)"
    key_insight: str = ""             # 1-2 sentences on the most important concept


# ---------------------------------------------------------------------------
# Stage 3: Planner output (ScenePlan)
# ---------------------------------------------------------------------------

class NarrationBeat(BaseModel):
    beat_index: int
    description: str          # what is happening at this moment
    emphasis: str             # key concept to highlight


class ScenePlan(BaseModel):
    template: Literal[
        "recursion_tree",
        "array_sort",
        "async_timeline",
        "state_machine",
        "data_pipeline",
        "tree_traversal",
        "hash_map",
        "linked_list",
        "event_loop",
        "control_flow_branch",
    ]
    title: str                              # e.g. "fibonacci(5)"
    function_name: str
    narration_beats: list[NarrationBeat]    # 3-5 beats
    # template-specific params are in template_params dict
    template_params: dict                   # free-form, validated by composer


# ---------------------------------------------------------------------------
# Stage 4: Composer output — RecursionTree Remotion props
# This is a Python mirror of the Zod RecursionTreeProps schema in packages/shared
# ---------------------------------------------------------------------------

class TreeNodeProps(BaseModel):
    id: str
    label: str
    isDuplicate: bool = False
    isBase: bool = False
    depth: int = 0
    children: list[TreeNodeProps] = Field(default_factory=list)

TreeNodeProps.model_rebuild()


class RecursionTreeRemotionProps(BaseModel):
    title: str
    functionName: str
    rootNode: TreeNodeProps
    highlightColor: str = "#FF6B6B"
    accentColor: str = "#4ECDC4"
    baseColor: str = "#4ADE80"


# ---------------------------------------------------------------------------
# Stage 5: Narrator output
# ---------------------------------------------------------------------------

class Caption(BaseModel):
    start_ms: int
    end_ms: int
    text: str
    subtext: str | None = None


class NarrationScript(BaseModel):
    captions: list[Caption]
    total_duration_ms: int


# ---------------------------------------------------------------------------
# Final pipeline output
# ---------------------------------------------------------------------------

class PipelineOutput(BaseModel):
    scene_plan: ScenePlan
    remotion_props: RecursionTreeRemotionProps | dict  # dict for control_flow_branch
    narration: NarrationScript
    # Layout nodes for AnimatedTree (flat list matching TreeNodeLayout in TS)
    layout_nodes: list[dict]
    intent: VisualizationIntent | None = None  # preserved for enrichment fields
