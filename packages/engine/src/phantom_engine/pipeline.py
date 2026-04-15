"""
Main pipeline orchestrator.
Supports recursion_tree and control_flow_branch (all other templates fall back here).
Set DEMO_MODE=true to skip all Claude API calls (uses local heuristics instead).
"""
from __future__ import annotations
import os
from pathlib import Path
from .schemas import PipelineOutput
from .parser import parse_file, parse_source
from .analyzer import analyze
from .planner import plan
from .composer import compose
from .control_flow_composer import compose_control_flow
from .narrator import narrate
from .demo import run_demo


def run(source: str | Path, language: str | None = None) -> PipelineOutput:
    """
    Run the full pipeline.

    Args:
        source: Path to a source file, or raw source code string.
        language: Required if source is a string. Ignored if source is a Path.

    Returns:
        PipelineOutput with scene_plan, remotion_props, narration, layout_nodes
    """
    # Stage 1: Parse
    def _looks_like_path(s: str) -> bool:  # noqa: E306
        if len(s) > 1024:
            return False
        try:
            return Path(s).exists()
        except (OSError, ValueError):
            return False

    if isinstance(source, Path) or (isinstance(source, str) and _looks_like_path(source)):
        parsed = parse_file(source)
    else:
        if not language:
            raise ValueError("language must be provided when source is a string")
        parsed = parse_source(source, language)

    # Demo mode: skip all AI API calls (use local heuristics)
    demo_mode = os.environ.get("DEMO_MODE", "").lower() in ("1", "true", "yes")
    provider = os.environ.get("AI_PROVIDER", "claude").lower().strip()
    if demo_mode or provider == "demo":
        return run_demo(parsed)

    try:
        # Stage 2: Analyze
        intent = analyze(parsed)

        # Stage 3: Plan
        scene_plan = plan(intent)

        # Stage 4: Compose
        if scene_plan.template == "recursion_tree":
            remotion_props, layout_nodes = compose(scene_plan)
        else:
            scene_plan = scene_plan.model_copy(update={"template": "control_flow_branch"})
            remotion_props, layout_nodes = compose_control_flow(scene_plan, parsed, code_type=intent.code_type)

        # Stage 5: Narrate
        narration = narrate(scene_plan)

        return PipelineOutput(
            scene_plan=scene_plan,
            remotion_props=remotion_props,
            narration=narration,
            layout_nodes=layout_nodes,
            intent=intent,
        )

    except Exception as e:
        err = str(e)
        # Gracefully fall back to demo mode on quota / auth errors
        if any(kw in err for kw in ("429", "quota", "rate limit", "credit balance", "billing", "401", "403")):
            return run_demo(parsed)
        raise
