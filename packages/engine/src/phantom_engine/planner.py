"""
Scene planning stage.
Input:  VisualizationIntent
Output: ScenePlan

AI_PROVIDER=claude uses tool_use for reliable structured output.
All other providers use JSON prompt via providers.generate().
"""
from __future__ import annotations
import json
import os
from .schemas import VisualizationIntent, ScenePlan, NarrationBeat


TEMPLATE_REGISTRY = {
    "recursion_tree": "Visualizes recursive calls as a branching tree. Use when code_type is recursive_function.",
    "array_sort": "Animated array sorting with highlighted pivots/swaps. Use when code_type is sorting_algorithm.",
    "async_timeline": "Parallel timeline lanes for async/concurrent code. Use when code_type is async_flow.",
    "control_flow_branch": "Generic step-through animation. Use as fallback for anything else.",
}


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _registry_desc() -> str:
    return "\n".join(f"  - {k}: {v}" for k, v in TEMPLATE_REGISTRY.items())


def _build_prompt(intent: VisualizationIntent) -> str:
    return f"""You are planning a cinematic code education animation. Think like a teacher, not a documenter.

CODE ANALYSIS:
- code_type: {intent.code_type}
- language: {intent.language}
- function: {intent.entry_point}({intent.sample_input})
- patterns: {intent.notable_patterns}
- description: {intent.description}
- time_complexity: {intent.time_complexity}
- key_insight: {intent.key_insight}

AVAILABLE TEMPLATES:
{_registry_desc()}

TEMPLATE SELECTION RULES:
- recursion_tree → code_type is recursive_function
- array_sort → code_type is sorting_algorithm
- async_timeline → code_type is async_flow
- control_flow_branch → everything else

NARRATION REQUIREMENTS (critical — this determines animation quality):
- Write exactly 6 beats
- Each beat MUST cover a DIFFERENT concept — never repeat ideas
- Beat 0: Start with WHY. The conceptual big picture in one bold statement. Make it memorable.
- Beat 1: The mechanism — how this specific algorithm/pattern actually works
- Beats 2-4: Specific execution moments — use actual values like {intent.sample_input}, variable names
- Beat 5: The surprising insight or tradeoff students always miss
- Keep descriptions under 15 words — short, punchy, like 3Blue1Brown subtitles
- Be specific to THIS code, not generic programming wisdom

Return a JSON object (no markdown fences):
{{
  "template": "chosen template",
  "title": "specific title e.g. '{intent.entry_point}({intent.sample_input}) — {intent.code_type.replace('_', ' ')}'",
  "function_name": "{intent.entry_point}",
  "narration_beats": [
    {{"beat_index": 0, "description": "bold WHY statement", "emphasis": "core concept"}},
    {{"beat_index": 1, "description": "HOW the mechanism works", "emphasis": "mechanism"}},
    {{"beat_index": 2, "description": "execution detail with real values", "emphasis": "value"}},
    {{"beat_index": 3, "description": "different execution step", "emphasis": "step"}},
    {{"beat_index": 4, "description": "another distinct moment", "emphasis": "moment"}},
    {{"beat_index": 5, "description": "the non-obvious insight", "emphasis": "insight"}}
  ],
  "template_params": {{}}
}}

For recursion_tree, template_params MUST include: {{"sample_input": <integer>}}"""


def _parse_plan(d: dict) -> ScenePlan:
    beats = [
        NarrationBeat(
            beat_index=b["beat_index"],
            description=b["description"],
            emphasis=b["emphasis"],
        )
        for b in d["narration_beats"]
    ]
    return ScenePlan(
        template=d["template"],
        title=d["title"],
        function_name=d["function_name"],
        narration_beats=beats,
        template_params=d.get("template_params", {}),
    )


# ---------------------------------------------------------------------------
# Claude path — tool_use
# ---------------------------------------------------------------------------

_CLAUDE_CLIENT = None

PLAN_TOOL = {
    "name": "set_scene_plan",
    "description": "Set the structured scene plan for the animation",
    "input_schema": {
        "type": "object",
        "properties": {
            "template": {
                "type": "string",
                "enum": list(TEMPLATE_REGISTRY.keys()) + [
                    "state_machine", "data_pipeline", "tree_traversal",
                    "hash_map", "linked_list", "event_loop",
                ],
            },
            "title": {"type": "string"},
            "function_name": {"type": "string"},
            "narration_beats": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "beat_index": {"type": "integer"},
                        "description": {"type": "string"},
                        "emphasis": {"type": "string"},
                    },
                    "required": ["beat_index", "description", "emphasis"],
                },
            },
            "template_params": {"type": "object"},
        },
        "required": ["template", "title", "function_name", "narration_beats", "template_params"],
    },
}


def _plan_claude(intent: VisualizationIntent) -> ScenePlan:
    global _CLAUDE_CLIENT
    from anthropic import Anthropic
    if _CLAUDE_CLIENT is None:
        _CLAUDE_CLIENT = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    prompt = f"""Plan a Phantom animation scene for the following code analysis.

VISUALIZATION INTENT:
- code_type: {intent.code_type}
- language: {intent.language}
- entry_point: {intent.entry_point}
- sample_input: {intent.sample_input}
- patterns: {intent.notable_patterns}
- description: {intent.description}

AVAILABLE TEMPLATES:
{_registry_desc()}

SELECTION RULES:
- Use recursion_tree when code_type == "recursive_function"
- Use array_sort when code_type == "sorting_algorithm"
- Use async_timeline when code_type == "async_flow"
- Use control_flow_branch for everything else

Call set_scene_plan with your plan."""

    response = _CLAUDE_CLIENT.messages.create(
        model="claude-opus-4-6",
        max_tokens=2048,
        tools=[PLAN_TOOL],
        tool_choice={"type": "tool", "name": "set_scene_plan"},
        messages=[{"role": "user", "content": prompt}],
    )
    for block in response.content:
        if block.type == "tool_use" and block.name == "set_scene_plan":
            return _parse_plan(block.input)
    raise RuntimeError(f"Planner did not return tool call. Response: {response}")


# ---------------------------------------------------------------------------
# Generic path — all other providers via providers.generate()
# ---------------------------------------------------------------------------

def _plan_generic(intent: VisualizationIntent, provider: str) -> ScenePlan:
    from .providers import generate, parse_json
    raw = generate(_build_prompt(intent), provider=provider, max_tokens=2048)
    return _parse_plan(parse_json(raw))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def plan(intent: VisualizationIntent) -> ScenePlan:
    """Choose a template and fill in scene parameters via the configured AI provider."""
    provider = os.getenv("AI_PROVIDER", "groq").lower().strip()
    if provider == "claude":
        return _plan_claude(intent)
    return _plan_generic(intent, provider)
