"""
Semantic analysis stage.
Input:  ParsedCode
Output: VisualizationIntent

AI_PROVIDER=claude uses tool_use for reliable structured output.
All other providers use JSON prompt via providers.generate().
"""
from __future__ import annotations
import json
import os
from .schemas import ParsedCode, VisualizationIntent


# ---------------------------------------------------------------------------
# Prompt builder (used by all non-Claude providers)
# ---------------------------------------------------------------------------

def _build_prompt(parsed: ParsedCode) -> str:
    func_summary = "\n".join(
        f"  - {f.name}({', '.join(f.params)}) — recursive={f.is_recursive}, calls={f.calls}"
        for f in parsed.functions
    )
    return f"""Analyze this {parsed.language} code and determine how to best visualize it.

CODE:
```{parsed.language}
{parsed.raw_source}
```

PARSED FUNCTIONS:
{func_summary or "  (none detected)"}

TOP-LEVEL CALLS: {parsed.top_level_calls}

Return a JSON object (no markdown fences, no explanation) with exactly these fields:
{{
  "code_type": one of: recursive_function | sorting_algorithm | async_flow | state_machine | data_pipeline | tree_traversal | hash_map | linked_list | event_loop | generic,
  "language": "detected language",
  "entry_point": "main function name to visualize",
  "sample_input": "small concrete input as a string e.g. '5' or '[3,1,4]'",
  "notable_patterns": ["pattern1", "pattern2"],
  "description": "1-2 sentence description of what the code does",
  "time_complexity": "Big-O e.g. O(2^n)",
  "space_complexity": "Big-O e.g. O(n)",
  "key_insight": "1-2 sentence insight — the most important thing to understand"
}}"""


def _parse_intent(d: dict, parsed: ParsedCode) -> VisualizationIntent:
    return VisualizationIntent(
        code_type=d.get("code_type", "generic"),
        language=d.get("language", parsed.language),
        entry_point=d.get("entry_point", ""),
        sample_input=d.get("sample_input", ""),
        notable_patterns=d.get("notable_patterns", []),
        description=d.get("description", ""),
        time_complexity=d.get("time_complexity", "O(?)"),
        space_complexity=d.get("space_complexity", "O(?)"),
        key_insight=d.get("key_insight", ""),
    )


# ---------------------------------------------------------------------------
# Claude path — tool_use for reliable structured output
# ---------------------------------------------------------------------------

_CLAUDE_CLIENT = None

ANALYZE_TOOL = {
    "name": "set_visualization_intent",
    "description": "Set the structured visualization intent for the code",
    "input_schema": {
        "type": "object",
        "properties": {
            "code_type": {
                "type": "string",
                "enum": [
                    "recursive_function", "sorting_algorithm", "async_flow",
                    "state_machine", "data_pipeline", "tree_traversal",
                    "hash_map", "linked_list", "event_loop", "generic",
                ],
            },
            "language": {"type": "string"},
            "entry_point": {"type": "string"},
            "sample_input": {"type": "string"},
            "notable_patterns": {"type": "array", "items": {"type": "string"}},
            "description": {"type": "string"},
            "time_complexity": {"type": "string"},
            "space_complexity": {"type": "string"},
            "key_insight": {"type": "string"},
        },
        "required": [
            "code_type", "language", "entry_point", "sample_input",
            "notable_patterns", "description", "time_complexity",
            "space_complexity", "key_insight",
        ],
    },
}


def _analyze_claude(parsed: ParsedCode) -> VisualizationIntent:
    global _CLAUDE_CLIENT
    from anthropic import Anthropic
    if _CLAUDE_CLIENT is None:
        _CLAUDE_CLIENT = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    func_summary = "\n".join(
        f"  - {f.name}({', '.join(f.params)}) — recursive={f.is_recursive}, calls={f.calls}"
        for f in parsed.functions
    )
    prompt = f"""Analyze this {parsed.language} code and determine how to best visualize it.

CODE:
```{parsed.language}
{parsed.raw_source}
```

PARSED FUNCTIONS:
{func_summary or "  (none detected)"}

TOP-LEVEL CALLS: {parsed.top_level_calls}

Call set_visualization_intent with your analysis."""

    response = _CLAUDE_CLIENT.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        tools=[ANALYZE_TOOL],
        tool_choice={"type": "tool", "name": "set_visualization_intent"},
        messages=[{"role": "user", "content": prompt}],
    )
    for block in response.content:
        if block.type == "tool_use" and block.name == "set_visualization_intent":
            return _parse_intent(block.input, parsed)
    raise RuntimeError(f"Analyzer did not return tool call. Response: {response}")


# ---------------------------------------------------------------------------
# Generic path — all other providers via providers.generate()
# ---------------------------------------------------------------------------

def _analyze_generic(parsed: ParsedCode, provider: str) -> VisualizationIntent:
    from .providers import generate, parse_json
    raw = generate(_build_prompt(parsed), provider=provider, max_tokens=1024)
    return _parse_intent(parse_json(raw), parsed)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze(parsed: ParsedCode) -> VisualizationIntent:
    """Run semantic analysis via the configured AI provider."""
    provider = os.getenv("AI_PROVIDER", "groq").lower().strip()
    if provider == "claude":
        return _analyze_claude(parsed)
    return _analyze_generic(parsed, provider)
