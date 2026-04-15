"""
Composer for the control_flow_branch template.
Uses Claude Haiku to generate execution steps for any code snippet.
"""
from __future__ import annotations
import json
import os
from anthropic import Anthropic
from .schemas import ScenePlan, ParsedCode

_CLIENT = None


def _client() -> Anthropic:
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    return _CLIENT


def compose_control_flow(plan: ScenePlan, parsed: ParsedCode, code_type: str = "generic") -> tuple[dict, list[dict]]:
    """
    Generate ControlFlowBranch Remotion props by tracing execution steps.
    Returns (props_dict, layout_nodes).
    layout_nodes is empty — ControlFlowBranch doesn't use the tree layout.
    """
    code = parsed.raw_source
    language = parsed.language

    prompt = f"""Trace through this {language} code step by step, as if you are a debugger.

CODE:
```{language}
{code}
```

For each meaningful step in execution, output a JSON object with:
- step_index: integer starting from 0
- line_number: 1-indexed line being executed
- label: short description of what happens (max 10 words, present tense)
- variables: dict of variable name to current value as string

Rules:
- 6-12 steps total (don't over-trace)
- Skip import statements and blank lines
- Show how key variables change
- For recursive functions, show the first 4-5 calls only

Return ONLY a JSON array, no markdown:
[
  {{"step_index": 0, "line_number": 1, "label": "...", "variables": {{}}}},
  ...
]"""

    response = _client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

    try:
        steps = json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: single step showing the code
        steps = [{"step_index": 0, "line_number": 1, "label": "Code loaded", "variables": {}}]

    props = {
        "title": plan.title,
        "code": code,
        "language": language,
        "steps": steps,
        "code_type": code_type,
    }

    return props, []  # no layout_nodes needed for control_flow_branch
