"""
Shared AI provider routing for the Phantom engine.

Also exposes `parse_json(raw)` — a robust JSON parser that fixes common AI output
issues like invalid escape sequences (e.g. \\( in O\\(n\\) math notation).

Supports AI_PROVIDER = groq | cerebras | openrouter | deepseek | openai | gemini | mistral | claude

All OpenAI-compatible providers (groq, cerebras, openrouter, deepseek, openai) share a single
code path via the openai SDK with a custom base_url. Gemini and Mistral use their own SDKs.
Claude is handled separately in analyzer/planner/narrator for tool_use structured output.

Usage:
    from .providers import generate
    text = generate(prompt, system="You are a helpful assistant.")
"""
from __future__ import annotations
import json
import os
import re

# ---------------------------------------------------------------------------
# Robust JSON parser — handles common AI output issues
# ---------------------------------------------------------------------------

def parse_json(raw: str) -> dict | list:
    """
    Parse JSON from AI output, handling common formatting issues:
    - Markdown code fences (```json ... ```)
    - Invalid escape sequences (\\( \\s \\e etc. from math notation)
    """
    # Strip markdown fences
    s = raw.strip()
    if s.startswith("```"):
        s = s.split("```")[1]
        if s.startswith("json"):
            s = s[4:]
        s = s.strip()

    # First try: parse as-is
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass

    # Second try: fix invalid backslash escapes
    # JSON only allows: \" \\ \/ \b \f \n \r \t \uXXXX
    # Strip backslashes before any other character
    fixed = re.sub(r'\\([^"\\/bfnrtu])', r'\1', s)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # Third try: extract JSON object/array from surrounding text
    for pattern in (r'\{[\s\S]*\}', r'\[[\s\S]*\]'):
        m = re.search(pattern, s)
        if m:
            candidate = m.group(0)
            candidate_fixed = re.sub(r'\\([^"\\/bfnrtu])', r'\1', candidate)
            try:
                return json.loads(candidate_fixed)
            except json.JSONDecodeError:
                pass

    raise ValueError(f"Could not parse JSON from AI response: {raw[:200]}")


# ---------------------------------------------------------------------------
# Provider registry — all OpenAI-compatible providers
# ---------------------------------------------------------------------------

OPENAI_COMPAT = {
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "key_env": "GROQ_API_KEY",
        "model_env": "GROQ_MODEL",
        "default_model": "llama-3.3-70b-versatile",
    },
    "cerebras": {
        "base_url": "https://api.cerebras.ai/v1",
        "key_env": "CEREBRAS_API_KEY",
        "model_env": "CEREBRAS_MODEL",
        "default_model": "llama-3.3-70b",
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "key_env": "OPENROUTER_API_KEY",
        "model_env": "OPENROUTER_MODEL",
        "default_model": "deepseek/deepseek-r1:free",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "key_env": "DEEPSEEK_API_KEY",
        "model_env": "DEEPSEEK_MODEL",
        "default_model": "deepseek-chat",
    },
    "openai": {
        "base_url": None,  # uses default openai endpoint
        "key_env": "OPENAI_API_KEY",
        "model_env": "OPENAI_MODEL",
        "default_model": "gpt-4o-mini",
    },
}

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate(
    prompt: str,
    system: str | None = None,
    provider: str | None = None,
    max_tokens: int = 1024,
) -> str:
    """
    Send a prompt to the configured AI provider and return the text response.

    Args:
        prompt: The user message.
        system: Optional system prompt.
        provider: Override the AI_PROVIDER env var for this call.
        max_tokens: Max tokens in response.

    Returns:
        The raw text response from the model.

    Raises:
        Exception on API failure (caller should catch and fall back as needed).
    """
    p = (provider or os.getenv("AI_PROVIDER", "groq")).lower().strip()

    if p in OPENAI_COMPAT:
        return _call_openai_compat(p, prompt, system, max_tokens)
    elif p == "gemini":
        return _call_gemini(prompt, system, max_tokens)
    elif p == "mistral":
        return _call_mistral(prompt, system, max_tokens)
    else:
        raise ValueError(f"Unknown provider '{p}'. Use: {list(OPENAI_COMPAT)} + gemini, mistral, claude")


# ---------------------------------------------------------------------------
# OpenAI-compatible path (groq, cerebras, openrouter, deepseek, openai)
# ---------------------------------------------------------------------------

def _call_openai_compat(provider: str, prompt: str, system: str | None, max_tokens: int) -> str:
    from openai import OpenAI

    cfg = OPENAI_COMPAT[provider]
    api_key = os.environ.get(cfg["key_env"], "")
    if not api_key:
        raise EnvironmentError(f"{cfg['key_env']} is not set")

    model = os.getenv(cfg["model_env"], cfg["default_model"])

    kwargs: dict = {"base_url": cfg["base_url"]} if cfg["base_url"] else {}
    client = OpenAI(api_key=api_key, **kwargs)

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    resp = client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        messages=messages,
        frequency_penalty=0.5,  # reduces repetitive phrasing
        presence_penalty=0.3,   # encourages covering new topics
    )
    return str(resp.choices[0].message.content)


# ---------------------------------------------------------------------------
# Gemini path
# ---------------------------------------------------------------------------

def _call_gemini(prompt: str, system: str | None, max_tokens: int) -> str:
    import google.generativeai as genai
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    full_prompt = f"{system}\n\n{prompt}" if system else prompt
    model = genai.GenerativeModel(model_name)
    resp = model.generate_content(full_prompt)
    return str(resp.text)


# ---------------------------------------------------------------------------
# Mistral path
# ---------------------------------------------------------------------------

def _call_mistral(prompt: str, system: str | None, max_tokens: int) -> str:
    from mistralai import Mistral
    client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])
    model_name = os.getenv("MISTRAL_MODEL", "mistral-large-latest")

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    resp = client.chat.complete(model=model_name, max_tokens=max_tokens, messages=messages)
    return str(resp.choices[0].message.content)
