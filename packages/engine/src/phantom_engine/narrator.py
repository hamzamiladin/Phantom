"""
Narration stage — generates timed captions from narration beats.
AI_PROVIDER=claude uses Claude Haiku. All other providers use providers.generate().
"""
from __future__ import annotations
import os
from .schemas import ScenePlan, NarrationScript, Caption


def _build_prompt(plan: ScenePlan, total_duration_ms: int) -> str:
    beat_count = len(plan.narration_beats)
    ms_per_beat = total_duration_ms // beat_count
    beats_text = "\n".join(
        f"Beat {b.beat_index} ({b.emphasis}): {b.description}"
        for b in plan.narration_beats
    )
    return f"""Write captions for a {total_duration_ms // 1000}-second code animation of: {plan.title}

BEATS TO CAPTION:
{beats_text}

RULES (strict):
- Exactly {beat_count} captions, one per beat
- Each caption: 1 sentence, 6-12 words, present tense
- NO two captions can start with the same word
- NO generic phrases: "This code", "The function", "Here we", "Now we", "This shows"
- Use the specific emphasis term from each beat
- Style: 3Blue1Brown — crisp, visual, memorable. Show don't tell.
- Bad: "The function recursively calls itself to compute the result"
- Good: "fib(5) splits into two smaller problems — fib(4) and fib(3)"

Return ONLY a JSON array (no markdown, no explanation):
[
  {{"start_ms": 0, "end_ms": {ms_per_beat}, "text": "caption"}},
  {{"start_ms": {ms_per_beat}, "end_ms": {ms_per_beat * 2}, "text": "caption"}},
  ...
]"""


def _parse_captions(raw: str, total_duration_ms: int) -> NarrationScript:
    from .providers import parse_json
    data = parse_json(raw)
    captions = [Caption(start_ms=c["start_ms"], end_ms=c["end_ms"], text=c["text"]) for c in data]
    return NarrationScript(captions=captions, total_duration_ms=total_duration_ms)


# ---------------------------------------------------------------------------
# Claude path
# ---------------------------------------------------------------------------

_CLAUDE_CLIENT = None


def _narrate_claude(plan: ScenePlan, total_duration_ms: int) -> NarrationScript:
    global _CLAUDE_CLIENT
    from anthropic import Anthropic
    if _CLAUDE_CLIENT is None:
        _CLAUDE_CLIENT = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    response = _CLAUDE_CLIENT.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": _build_prompt(plan, total_duration_ms)}],
    )
    return _parse_captions(response.content[0].text.strip(), total_duration_ms)


# ---------------------------------------------------------------------------
# Generic path — all other providers
# ---------------------------------------------------------------------------

def _narrate_generic(plan: ScenePlan, total_duration_ms: int, provider: str) -> NarrationScript:
    from .providers import generate
    raw = generate(_build_prompt(plan, total_duration_ms), provider=provider, max_tokens=512)
    return _parse_captions(raw.strip(), total_duration_ms)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def narrate(plan: ScenePlan, total_duration_ms: int = 7000) -> NarrationScript:
    """Generate timed captions via the configured AI provider."""
    provider = os.getenv("AI_PROVIDER", "groq").lower().strip()
    if provider == "claude":
        return _narrate_claude(plan, total_duration_ms)
    return _narrate_generic(plan, total_duration_ms, provider)
