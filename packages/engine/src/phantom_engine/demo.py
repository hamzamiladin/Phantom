"""
Demo mode — runs the full pipeline without any Claude API calls.
Activated when DEMO_MODE=true in the environment.

Features:
- Auto-detects language (TypeScript/React vs Python vs JS)
- Smart large-file handling: extracts primary component/function from 300+ line files
- Beginner-friendly plain English labels with "why" subtext
- Semantic step generation per code structure type
"""
from __future__ import annotations
import re
from .schemas import (
    ParsedCode,
    VisualizationIntent,
    ScenePlan,
    NarrationBeat,
    NarrationScript,
    Caption,
    PipelineOutput,
)


# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------

def detect_language(code: str, hint: str | None = None) -> str:
    """Detect language from syntax. Never blindly trusts a 'python' hint for TS code."""
    src = code
    ts_signals = [
        '"use client"', "'use client'", "React.FC", "useState<", "useEffect(",
        "useRef<", "interface ", ": FC<", "JSX.Element", "export default function",
        "export const ", "from 'react'", 'from "react"', "from 'next/", 'from "next/',
        "=> {", "=> (", ": React.", ": ReactNode",
    ]
    ts_score = sum(1 for s in ts_signals if s in src)
    ts_only = ["interface ", ": string", ": number", ": boolean", "<T>", "as const", ": void"]
    ts_only_score = sum(1 for s in ts_only if s in src)
    py_signals = ["def ", "elif ", "    pass", "self.", "__init__", "import numpy", "import os"]
    py_score = sum(1 for s in py_signals if s in src)

    if ts_score >= 2 or (ts_score >= 1 and ts_only_score >= 1):
        return "typescript" if ts_only_score >= 1 else "javascript"
    if py_score >= 2:
        return "python"
    if hint and hint in ("typescript", "javascript"):
        return hint
    if "def " in src or "elif " in src:
        return "python"
    if "function " in src or "const " in src or "let " in src:
        return "javascript"
    return hint or "python"


# ---------------------------------------------------------------------------
# Code structure detection
# ---------------------------------------------------------------------------

def detect_code_structure(code: str, language: str) -> str:
    src = code
    low = src.lower()
    if ('"use client"' in src or "'use client'" in src
            or "React.FC" in src or "JSX.Element" in src
            or re.search(r"return\s*\(?\s*<", src)):
        return "react_component"
    if re.search(r"^\s*class\s+\w+", src, re.MULTILINE):
        return "class_definition"
    if "async def " in src or "async function" in src or "await " in src or "asyncio" in src:
        return "async_function"
    if any(k in low for k in ["swap", "pivot", "quicksort", "mergesort", "bubble", "heapify",
                               "insertion_sort", "selection_sort", "timsort"]):
        return "sorting_function"
    # Heap / priority queue / graph traversal patterns
    if any(k in low for k in ["heapq", "heappush", "heappop", "priority_queue",
                               "priorityqueue", "minheap", "maxheap", "min_heap", "max_heap"]):
        return "heap_graph"
    if any(k in low for k in ["bfs", "dfs", "dijkstra", "breadth_first", "depth_first",
                               "visited", "queue", "deque"]) and (
            "while " in src and ("neighbor" in low or "direction" in low or "adj" in low
                                  or "nr, nc" in src or "nx, ny" in src or "dr, dc" in src)):
        return "heap_graph"
    # Dynamic programming
    if re.search(r"(dp|memo|cache)\s*[\[=]", src) or "@lru_cache" in src or "@cache" in src:
        if "for " in src:
            return "dynamic_programming"
    # Tree / linked list traversal
    if any(k in low for k in ["treenode", "listnode", "tree_node", "left", "right"]) and (
            "node" in low or "root" in low):
        return "tree_traversal"
    # Hash map / dictionary heavy
    if src.count("dict") >= 2 or src.count("{}") >= 2 or (
            src.count("[") >= 4 and "defaultdict" in src):
        return "hash_map"
    # Python functions
    fn_match = re.search(r"def\s+(\w+)\s*\(", src)
    if fn_match:
        fn_name = fn_match.group(1)
        body = src[fn_match.end():]
        if fn_name + "(" in body:
            return "recursive_function"
        return "python_function"
    # JS/TS functions (function keyword, arrow, const fn =)
    js_fn = re.search(r"(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=])\s*=>)", src)
    if js_fn:
        fn_name = js_fn.group(1) or js_fn.group(2)
        body = src[js_fn.end():]
        if fn_name + "(" in body:
            return "recursive_function"
        return "js_function"
    return "generic"


# ---------------------------------------------------------------------------
# Smart large-file target selection
# ---------------------------------------------------------------------------

def _select_primary_target(code: str, language: str) -> tuple[str, str]:
    """
    For large files, extract the most interesting single function/component to animate.
    Returns (focused_code, target_name).
    Priority:
    1. export default function/component
    2. Last named export function
    3. Longest function/def block
    4. First 80 lines (fallback)
    """
    lines = code.splitlines()
    total_lines = len(lines)

    # Only apply selection for files with 50+ lines
    if total_lines < 50:
        name = _extract_fn_name(code, language)
        return code, name

    # 1. export default function Foo / export default class Foo
    m = re.search(r"export\s+default\s+(?:function|class)\s+(\w+)", code)
    if m:
        name = m.group(1)
        start = code.find(m.group(0))
        block = _extract_block(lines, code.count("\n", 0, start))
        return block, name

    # 2. "export default Foo" where Foo is defined earlier
    m2 = re.search(r"export\s+default\s+(\w+)\s*;?\s*$", code, re.MULTILINE)
    if m2:
        name = m2.group(1)
        # Find the function/const definition for this name
        def_m = re.search(
            r"(?:function|const|class)\s+" + re.escape(name) + r"\s*[=(]",
            code,
        )
        if def_m:
            start_line = code.count("\n", 0, def_m.start())
            block = _extract_block(lines, start_line)
            return block, name

    # 3. Last named export function
    exports = list(re.finditer(r"export\s+(?:async\s+)?function\s+(\w+)", code))
    if exports:
        last = exports[-1]
        name = last.group(1)
        start_line = code.count("\n", 0, last.start())
        block = _extract_block(lines, start_line)
        return block, name

    # 4. Longest function block (Python or JS)
    def_matches = list(re.finditer(r"(?:^|\n)((?:async\s+)?(?:def|function)\s+(\w+))", code))
    if def_matches:
        best_match = max(def_matches, key=lambda m_: len(_extract_block(m_.group(0).splitlines(), 0)))
        name = best_match.group(2)
        start_line = code.count("\n", 0, best_match.start())
        block = _extract_block(lines, start_line)
        return block, name

    # 5. Fallback: first 80 lines
    return "\n".join(lines[:80]), _extract_fn_name(code, language)


def _extract_block(lines: list[str], start_line: int, max_lines: int = 80) -> str:
    """Extract a function/class block starting at start_line (0-indexed)."""
    if start_line >= len(lines):
        return "\n".join(lines[:max_lines])

    # Detect indentation of the block opener
    opener = lines[start_line]
    base_indent = len(opener) - len(opener.lstrip())

    block = [opener]
    for i in range(start_line + 1, min(start_line + max_lines, len(lines))):
        line = lines[i]
        # Empty lines are always included
        if not line.strip():
            block.append(line)
            continue
        line_indent = len(line) - len(line.lstrip())
        # Stop when we return to base indentation (next top-level definition)
        if line_indent <= base_indent and line.strip() and i > start_line + 1:
            # Check it's not just a closing brace/bracket
            if not re.match(r"^\s*[}\])]", line):
                break
        block.append(line)

    return "\n".join(block)


# ---------------------------------------------------------------------------
# File overview steps (for large files)
# ---------------------------------------------------------------------------

def _file_overview_steps(full_code: str, focused_name: str, language: str) -> list[dict]:
    """Generate 1-2 overview steps describing the file structure."""
    lines = full_code.splitlines()
    steps = []

    # Count components/functions
    if language in ("typescript", "javascript"):
        fns = re.findall(r"(?:function|const)\s+(\w+)\s*[=(]", full_code)
        exports = re.findall(r"export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)", full_code)
        imports = [l for l in lines if l.strip().startswith("import ")]
        hooks = re.findall(r"use[A-Z]\w+\(", full_code)
        unique_hooks = list(dict.fromkeys(h.rstrip("(") for h in hooks))

        parts = []
        if exports:
            parts.append(f"{len(exports)} export{'s' if len(exports) != 1 else ''}")
        if len(fns) > len(exports):
            parts.append(f"{len(fns)} function{'s' if len(fns) != 1 else ''}")
        if imports:
            parts.append(f"{len(imports)} import{'s' if len(imports) != 1 else ''}")
        summary = ", ".join(parts) if parts else f"{len(lines)} lines"

        steps.append({
            "step_index": 0,
            "line_number": 1,
            "label": f"File overview: {summary}",
            "subtext": "Starting with the big picture before diving into the code",
            "variables": {"file": f"{len(lines)} lines", "structure": summary},
            "narrative_phase": "overview",
        })
        steps.append({
            "step_index": 1,
            "line_number": 1,
            "label": f"Focusing on: {focused_name} (the main export)",
            "subtext": "We'll animate this function — it's the main thing this file does",
            "variables": {"target": focused_name, "role": "main export"},
            "narrative_phase": "overview",
        })

    else:  # Python
        fns = re.findall(r"^def\s+(\w+)", full_code, re.MULTILINE)
        classes = re.findall(r"^class\s+(\w+)", full_code, re.MULTILINE)
        imports = [l for l in lines if l.strip().startswith(("import ", "from "))]

        parts = []
        if classes:
            parts.append(f"{len(classes)} class{'es' if len(classes) != 1 else ''}")
        if fns:
            parts.append(f"{len(fns)} function{'s' if len(fns) != 1 else ''}")
        if imports:
            parts.append(f"{len(imports)} import{'s' if len(imports) != 1 else ''}")
        summary = ", ".join(parts) if parts else f"{len(lines)} lines"

        steps.append({
            "step_index": 0,
            "line_number": 1,
            "label": f"File overview: {summary}",
            "subtext": "Starting with the big picture before diving into the code",
            "variables": {"file": f"{len(lines)} lines", "structure": summary},
            "narrative_phase": "overview",
        })
        if len(fns) > 1 or classes:
            steps.append({
                "step_index": 1,
                "line_number": 1,
                "label": f"Animating: {focused_name}()",
                "subtext": "This is the most interesting function in the file",
                "variables": {"target": f"{focused_name}()", "role": "primary function"},
                "narrative_phase": "overview",
            })

    return steps


# ---------------------------------------------------------------------------
# Plain English label translation
# ---------------------------------------------------------------------------

def _plain_english(label: str, structure: str) -> tuple[str, str]:
    """
    Translate a technical step label to plain English.
    Returns (plain_label, why_subtext).
    """
    low = label.lower()

    # --- React / Component patterns ---
    if '"use client"' in label or "'use client'" in label:
        return (
            'Mark as "runs in the browser" (Client Component)',
            "Code marked 'use client' runs on the user's device, not the server — it can use state and events",
        )
    if "use client" in low and "mark" not in low:
        return (
            "This component runs in the browser",
            "Client Components can react to clicks, track state, and access browser APIs",
        )
    if "dynamic import" in low or "lazy(" in low:
        return (
            "Load this code only when needed (lazy loading)",
            "This makes the initial page load faster — the code downloads in the background",
        )
    if "props contract" in low or "props:" in low:
        m = re.search(r"Props contract: \{(.+)\}", label)
        fields = m.group(1) if m else "..."
        return (
            f"This component expects: {{{fields}}}",
            "Props are the inputs you pass to a component — like function arguments",
        )
    if "usestate" in low:
        m = re.search(r"useState.*?(\w+)\s*=\s*(.+)", label)
        if m:
            name, val = m.group(1), m.group(2).strip()
            return (
                f"Remember value '{name}', starting as {val}",
                f"React re-draws the screen automatically whenever '{name}' changes",
            )
        return (
            "Track a value that can change over time",
            "React re-draws the screen automatically whenever this value changes",
        )
    if "useeffect" in low:
        m = re.search(r"deps?: \[([^\]]*)\]", label)
        deps = m.group(1).strip() if m else ""
        if not deps:
            return (
                "Run some code once, after the screen first appears",
                "useEffect with [] only runs once — great for loading data or setting up subscriptions",
            )
        return (
            f"Run this code automatically when '{deps}' changes",
            "Side effects run after the screen updates — this is how React handles data fetching, subscriptions, etc.",
        )
    if "useref" in low:
        m = re.search(r"(\w+)\s*=\s*useRef", label)
        name = m.group(1) if m else "ref"
        return (
            f"Create '{name}' — a direct pointer to a DOM element",
            "useRef gives you a stable reference that doesn't trigger re-renders when it changes",
        )
    if "render:" in low or "returns <" in low or "paint the screen" in low:
        m = re.search(r"<(\w+)", label)
        el = m.group(1) if m else "HTML"
        return (
            f"Draw the screen: return <{el}> to the browser",
            "React converts this JSX into actual DOM elements the browser displays",
        )
    if "show" in low and "only when" in low:
        return label, "Conditional rendering — this element only appears when the condition is true"
    if "render child:" in low:
        m = re.search(r"<(\w+)", label)
        child = m.group(1) if m else "Component"
        return (
            f"Place <{child} /> here in the layout",
            f"React renders {child} as a nested component — it has its own logic and state",
        )
    if "wire up" in low or "onclick" in low or "event handler" in low or "handler defined" in low:
        return label, "Event handlers connect user actions (clicks, keypresses) to your code"

    # --- Recursion patterns ---
    if "base case" in low or "stop here" in low:
        m = re.search(r"check[:：]\s*(.+)", label, re.IGNORECASE)
        cond = m.group(1).strip() if m else "n <= 1"
        return (
            f"Stop here if {cond} — the smallest possible case",
            "Every recursive function needs a stopping condition, or it would run forever",
        )
    if "recursive call" in low or "solve the smaller" in low:
        m = re.search(r"(\w+)\(([^)]+)\)", label)
        call = m.group(0) if m else label
        return (
            f"Solve a smaller version: {call}",
            "Recursion works by solving smaller and smaller versions of the same problem",
        )
    if "combine results" in low or "stack unwinds" in low:
        return (
            "Combine the results from smaller solutions",
            "Once all recursive calls finish, the answers bubble back up and get combined",
        )
    if "call " in low and "()" in label and "recursive" not in low:
        return label, "The function is called with these starting values"

    # --- Async patterns ---
    if "enter async" in low:
        m = re.search(r"enter async (\w+)", label, re.IGNORECASE)
        fn = m.group(1) if m else "function"
        return (
            f"Start async {fn}() — this runs without freezing",
            "Async functions can pause and resume. While waiting, other code can run",
        )
    if "await" in low and "pause" not in low:
        m = re.search(r"await\s+(\S+)", label)
        target = m.group(1) if m else "something"
        return (
            f"Wait for {target} to finish",
            "await pauses just this function — the browser stays responsive and can handle other events",
        )
    if "launch" in low and "concurrent" in low:
        return label, "Starting multiple tasks at once is faster than doing them one-by-one"
    if "awaiting all" in low:
        return (
            "Wait for all tasks to finish in parallel",
            "Promise.all / asyncio.gather lets multiple operations run at the same time — much faster",
        )
    if "resolved" in low or "fulfilled" in low:
        return (
            "All done — the async function returns its result",
            "The promise is resolved and whoever was waiting for this function gets the result",
        )

    # --- Control flow ---
    if re.match(r"check[:：]", label, re.IGNORECASE):
        cond = re.sub(r"(?i)check[:：]\s*", "", label).strip()
        return (
            f"Is this true? {cond}",
            "If yes, take one path. If no, take another. This is how programs make decisions",
        )
    if "else branch" in low:
        return (
            "The condition was false — take the other path",
            "else runs when the if condition didn't match",
        )
    if "loop:" in low or "repeat" in low:
        m = re.search(r"(?:loop|repeat)[：:]\s*(.+)", label, re.IGNORECASE)
        expr = m.group(1).strip()[:40] if m else "..."
        return (
            f"Repeat for each: {expr}",
            "Loops run the same block of code multiple times — once per item or count",
        )
    if re.match(r"return\s+", label, re.IGNORECASE) or "return " in low:
        m = re.search(r"[Rr]eturn[：:\s]+(.+)", label)
        val = m.group(1).strip()[:30] if m else "result"
        return (
            f"Done — return {val}",
            "return hands the answer back to whoever called this function",
        )

    # --- Assignment / variable ---
    m = re.match(r"(?:set\s+)?(\w+)\s*=\s*(.+)", label, re.IGNORECASE)
    if m:
        name, val = m.group(1), m.group(2).strip()[:24]
        if name.lower() == "set":
            return label, ""
        return (
            f"Set {name} = {val}",
            f"'{name}' now holds the value {val} — this is how programs remember things",
        )

    # --- Class patterns ---
    if "define class" in low or "class " in low:
        return label, "A class is a blueprint — it defines what data and behavior objects of this type will have"
    if "__init__" in label:
        return (
            label.replace("__init__", "constructor"),
            "__init__ runs automatically when you create a new object — it sets up the initial state",
        )
    if "self." in label:
        return label, "self.x stores a value on this specific object instance"

    # --- Sorting ---
    if "pivot" in low:
        return label, "The pivot is the value we compare everything else to — smaller goes left, larger goes right"
    if "partition" in low:
        return label, "We sort items into 'less than pivot' and 'greater than pivot' groups"
    if "merge sorted" in low:
        return label, "Both halves are now sorted — combining them gives us the fully sorted result"

    # --- Generic / fallback ---
    if "enter " in low and "()" in label:
        return label, "The function starts executing from the top"
    if "file overview" in low or "focusing on" in low:
        return label, ""
    if "code loaded" in low:
        return "Ready to execute", "The code is parsed and the program is ready to run"

    return label, ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_line(code: str, pattern: str) -> int | None:
    for i, line in enumerate(code.splitlines()):
        if pattern in line:
            return i + 1
    return None


def _extract_fn_name(code: str, language: str) -> str:
    if language == "python":
        m = re.search(r"def\s+(\w+)", code)
        return m.group(1) + "()" if m else "main()"
    m = (
        re.search(r"export\s+default\s+function\s+(\w+)", code)
        or re.search(r"(?:function|async function)\s+(\w+)", code)
        or re.search(r"(?:const|let)\s+(\w+)\s*=", code)
    )
    return m.group(1) if m else "Component"


def _component_name_from_code(code: str) -> str:
    m = (
        re.search(r"export\s+default\s+function\s+(\w+)", code)
        or re.search(r"export\s+(?:default\s+)?function\s+(\w+)", code)
        or re.search(r"(?:const|let)\s+(\w+)\s*(?::\s*\w+\s*)?=\s*(?:\(|function)", code)
        or re.search(r"function\s+(\w+)\s*\(", code)
    )
    return m.group(1) if m else "Component"


def _add_plain(steps: list[dict], structure: str) -> list[dict]:
    """Apply _plain_english() to all step labels and add subtext field."""
    result = []
    for step in steps:
        plain_label, subtext = _plain_english(step["label"], structure)
        result.append({
            **step,
            "label": plain_label,
            "subtext": step.get("subtext") or subtext,
        })
    return result


# ---------------------------------------------------------------------------
# NARRATIVE generators — concept-first, not line-by-line
# ---------------------------------------------------------------------------

def _narrative_recursive(code: str) -> list[dict]:
    """Concept-first narrative: big picture → mechanism → execution trace → insight."""
    fn_match = re.search(r"def\s+(\w+)\s*\(([^)]*)\)", code)
    if not fn_match:
        return _steps_generic(code, "python")

    fn_name = fn_match.group(1)
    params = [p.strip().split(":")[0].split("=")[0].strip()
              for p in fn_match.group(2).split(",") if p.strip()]
    first_param = params[0] if params else "n"

    base_match = re.search(r"if\s+(.+?):\s*\n\s*return\s+(.+)", code)
    base_cond = base_match.group(1).strip() if base_match else f"{first_param} <= 1"
    base_ret = base_match.group(2).strip() if base_match else first_param

    combine_match = re.search(r"return\s+(.+\+.+|.+\-.+)", code)
    formula = combine_match.group(1).strip()[:50] if combine_match else f"{fn_name}(n-1) + {fn_name}(n-2)"
    combine_line = (_find_line(code, "return " + formula[:12]) or 4) if combine_match else 4
    base_line = (_find_line(code, "if " + base_cond[:12]) or 2)
    fn_line = (_find_line(code, f"def {fn_name}") or 1)

    return [
        # ── CONCEPT ──────────────────────────────────────────────────────────
        {
            "step_index": 0,
            "line_number": fn_line,
            "label": f"{fn_name}(n) solves the problem by calling itself on a smaller input",
            "subtext": "Instead of spelling out every step, the function delegates to a simpler version of itself",
            "variables": {"strategy": "self-reference", "pattern": "recursion"},
            "narrative_phase": "overview",
        },
        {
            "step_index": 1,
            "line_number": fn_line,
            "label": f"Each call asks: 'solve {fn_name}(n−1) and {fn_name}(n−2), then combine'",
            "subtext": "This creates a branching tree — every node spawns two children, doubling the work each level",
            "variables": {"call_tree": "binary branching", "growth": "O(2ⁿ) without cache"},
            "narrative_phase": "mechanism",
        },
        {
            "step_index": 2,
            "line_number": combine_line,
            "label": f"The recurrence: {formula}",
            "subtext": "The return value is assembled from two sub-results — this is the mathematical heart of the function",
            "variables": {"formula": formula, "pattern": "recurrence relation"},
            "narrative_phase": "mechanism",
        },
        {
            "step_index": 3,
            "line_number": base_line,
            "label": f"Base case: when {base_cond}, return {base_ret} immediately",
            "subtext": "Without this stopping condition the function would call itself forever — it's the anchor",
            "variables": {"base_case": base_cond, "returns": base_ret},
            "narrative_phase": "mechanism",
        },
        # ── EXECUTION ────────────────────────────────────────────────────────
        {
            "step_index": 4,
            "line_number": fn_line,
            "label": f"{fn_name}(5) branches into {fn_name}(4) and {fn_name}(3)",
            "subtext": f"Both calls run in full — {fn_name}(3) will be computed twice, {fn_name}(2) three times",
            "variables": {first_param: "5", "spawns": f"{fn_name}(4), {fn_name}(3)"},
            "narrative_phase": "execution",
        },
        {
            "step_index": 5,
            "line_number": base_line,
            "label": f"{fn_name}(2) → {fn_name}(1)=1 and {fn_name}(0)=0 → returns 1",
            "subtext": "Leaf calls return immediately — results start bubbling back up the call stack",
            "variables": {first_param: "2", f"{fn_name}(1)": "1", f"{fn_name}(0)": "0", "result": "1"},
            "narrative_phase": "execution",
        },
        {
            "step_index": 6,
            "line_number": combine_line,
            "label": "Stack unwinds: 1+1=2, 2+1=3, 3+2=5",
            "subtext": "Each frame adds its two sub-results — the final answer assembles from the bottom up",
            "variables": {f"{fn_name}(2)": "1", f"{fn_name}(3)": "2", f"{fn_name}(4)": "3", f"{fn_name}(5)": "5"},
            "narrative_phase": "execution",
        },
        # ── INSIGHT ──────────────────────────────────────────────────────────
        {
            "step_index": 7,
            "line_number": fn_line,
            "label": f"{fn_name}(5) = 5  ✓  (~25 calls — memoization reduces this to 9)",
            "subtext": "Cache each sub-result and the exponential tree collapses to a single linear pass: O(2ⁿ) → O(n)",
            "variables": {"answer": "5", "calls_made": "≈25", "with_memo": "≈9 calls", "complexity": "O(n) cached"},
            "narrative_phase": "insight",
        },
    ]


def _narrative_react(code: str) -> list[dict]:
    """Concept-first narrative for React components."""
    comp_name = _component_name_from_code(code)
    has_use_client = '"use client"' in code or "'use client'" in code

    # Props
    props_match = re.search(r"interface\s+\w*[Pp]rops\w*\s*\{([^}]+)\}", code, re.DOTALL)
    props_fields: list[str] = []
    if props_match:
        for line in props_match.group(1).strip().splitlines():
            line = line.strip().rstrip(";,")
            if ":" in line:
                props_fields.append(line.split(":")[0].replace("?", "").strip())

    # State
    state_m = re.search(r"const\s*\[(\w+),\s*set\w+\]\s*=\s*useState\(([^)]*)\)", code)
    state_name = state_m.group(1) if state_m else None
    state_init = state_m.group(2).strip() or "undefined" if state_m else None

    # Effects
    deps_m = re.search(r"useEffect\([^,]+,\s*\[([^\]]*)\]", code)
    effect_deps = deps_m.group(1).strip() if deps_m else None

    # Root JSX element
    jsx_m = re.search(r"return\s*\(?\s*<(\w+)", code)
    root_el = jsx_m.group(1) if jsx_m else "div"
    fn_line = _find_line(code, f"function {comp_name}") or _find_line(code, f"const {comp_name}") or 1

    concept_vars: dict[str, str] = {"type": "React.FC", "output": "JSX → DOM"}
    if has_use_client:
        concept_vars["runs_in"] = "browser"

    steps: list[dict] = [
        # ── CONCEPT ──────────────────────────────────────────────────────────
        {
            "step_index": 0,
            "line_number": fn_line,
            "label": f"<{comp_name} /> is a function that returns HTML — React calls it to build the screen",
            "subtext": "You write JSX (HTML-in-JS) and React converts it to real DOM elements",
            "variables": concept_vars,
            "narrative_phase": "overview",
        },
        {
            "step_index": 1,
            "line_number": fn_line,
            "label": "You describe WHAT the UI looks like. React figures out HOW to update the DOM.",
            "subtext": "This 'declarative' model means you never touch the DOM directly — React diffs and patches it",
            "variables": {"model": "declarative", "update": "virtual DOM diff"},
            "narrative_phase": "mechanism",
        },
    ]

    if state_name:
        state_line = _find_line(code, "useState") or fn_line + 2
        steps.append({
            "step_index": len(steps),
            "line_number": state_line,
            "label": f"useState tracks '{state_name}' — every change triggers a fresh render",
            "subtext": f"'{state_name}' starts as {state_init}. When setCount is called, React re-runs this whole function",
            "variables": {"state": state_name, "initial": state_init or "?", "trigger": "re-render on change"},
            "narrative_phase": "mechanism",
        })

    if effect_deps is not None:
        eff_line = _find_line(code, "useEffect") or fn_line + 3
        dep_str = f"[{effect_deps}]" if effect_deps else "[]"
        steps.append({
            "step_index": len(steps),
            "line_number": eff_line,
            "label": f"useEffect{dep_str} runs after the screen updates — not during render",
            "subtext": "Side effects (fetching data, subscriptions, timers) belong here, not in the function body",
            "variables": {"when": "after render", "deps": dep_str, "use_for": "data fetching, subscriptions"},
            "narrative_phase": "mechanism",
        })

    # ── EXECUTION ────────────────────────────────────────────────────────
    mount_vars: dict[str, str] = {"phase": "mount"}
    if state_name:
        mount_vars[state_name] = state_init or "?"
    steps.append({
        "step_index": len(steps),
        "line_number": fn_line,
        "label": f"First render: {comp_name}() runs, {state_name}={state_init}" if state_name else f"First render: {comp_name}() runs",
        "subtext": "React calls the function, collects the returned JSX, and paints it to the screen",
        "variables": mount_vars,
        "narrative_phase": "execution",
    })

    if state_name:
        update_vars: dict[str, str] = {"phase": "update", state_name: "(new value)", "queued": "re-render"}
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, f"set{state_name[0].upper()}{state_name[1:]}") or fn_line + 4,
            "label": f"State update: set{state_name[0].upper()}{state_name[1:]}(…) → React re-runs {comp_name}()",
            "subtext": "React batches updates and re-renders efficiently — only what changed in the DOM is patched",
            "variables": update_vars,
            "narrative_phase": "execution",
        })

    # Return / render step
    return_line = _find_line(code, "return") or fn_line + 5
    steps.append({
        "step_index": len(steps),
        "line_number": return_line,
        "label": f"return <{root_el}> — React patches only what changed in the real DOM",
        "subtext": "React compares this JSX to the previous render and applies the minimum set of DOM changes",
        "variables": {"output": f"<{root_el}>…</{root_el}>", "strategy": "reconciliation"},
        "narrative_phase": "execution",
    })

    # ── INSIGHT ──────────────────────────────────────────────────────────
    insight_vars: dict[str, str] = {"components": "composable", "state": "reactive", "updates": "automatic"}
    if props_fields:
        insight_vars["props"] = ", ".join(props_fields[:3])
    steps.append({
        "step_index": len(steps),
        "line_number": fn_line,
        "label": "React = UI as a pure function of state — same input always gives same output",
        "subtext": "This predictability makes large UIs manageable: trace a bug by tracing the state",
        "variables": insight_vars,
        "narrative_phase": "insight",
    })

    return steps[:16]


def _narrative_sorting(code: str) -> list[dict]:
    """Concept-first narrative for sorting algorithms."""
    fn_match = re.search(r"def\s+(\w+)\s*\(([^)]*)\)", code)
    fn_name = fn_match.group(1) if fn_match else "sort"
    fn_line = (_find_line(code, f"def {fn_name}") or 1)
    demo_arr = "[3, 1, 4, 1, 5, 9, 2, 6]"

    is_quicksort = "pivot" in code.lower() or "quicksort" in code.lower()
    is_merge = "merge" in code.lower() or "mergesort" in code.lower()
    algo_name = "Quicksort" if is_quicksort else "Mergesort" if is_merge else "Sort"

    return [
        # ── CONCEPT ──────────────────────────────────────────────────────────
        {
            "step_index": 0,
            "line_number": fn_line,
            "label": f"{algo_name}: divide the array, sort each half, combine",
            "subtext": "Divide-and-conquer means we never try to sort the whole array at once — split until trivial",
            "variables": {"strategy": "divide & conquer", "complexity": "O(n log n)"},
            "narrative_phase": "overview",
        },
        {
            "step_index": 1,
            "line_number": _find_line(code, "pivot") or fn_line + 2,
            "label": "Pick a pivot — everything smaller goes left, everything larger goes right",
            "subtext": "After partitioning, the pivot is in its final sorted position — it never moves again",
            "variables": {"pivot_role": "partition anchor", "guarantee": "pivot is correctly placed"},
            "narrative_phase": "mechanism",
        },
        {
            "step_index": 2,
            "line_number": _find_line(code, fn_name + "(") or fn_line + 3,
            "label": f"Recurse: call {fn_name}(left) and {fn_name}(right) independently",
            "subtext": "Each half is a smaller sorting problem — the same algorithm applies recursively",
            "variables": {"left": "elements < pivot", "right": "elements > pivot", "base": "length ≤ 1"},
            "narrative_phase": "mechanism",
        },
        # ── EXECUTION ────────────────────────────────────────────────────────
        {
            "step_index": 3,
            "line_number": fn_line,
            "label": f"Input: {demo_arr}",
            "subtext": "8 elements — quicksort will make about 24 comparisons on average",
            "variables": {"arr": demo_arr, "length": "8"},
            "narrative_phase": "execution",
        },
        {
            "step_index": 4,
            "line_number": _find_line(code, "pivot") or fn_line + 2,
            "label": "Pivot = 4 → left [3,1,1,2], right [5,9,6]",
            "subtext": "After one pass: pivot 4 is in position 4, left side has 4 elements, right has 3",
            "variables": {"left": "[3, 1, 1, 2]", "pivot": "4", "right": "[5, 9, 6]"},
            "narrative_phase": "execution",
        },
        {
            "step_index": 5,
            "line_number": _find_line(code, fn_name + "(") or fn_line + 3,
            "label": "Sort left [3,1,1,2] and right [5,9,6] recursively",
            "subtext": "Two independent sub-problems — each gets the same pivot-partition-recurse treatment",
            "variables": {"left_sorted": "[1, 1, 2, 3]", "right_sorted": "[5, 6, 9]"},
            "narrative_phase": "execution",
        },
        # ── INSIGHT ──────────────────────────────────────────────────────────
        {
            "step_index": 6,
            "line_number": _find_line(code, "return") or fn_line + 4,
            "label": "Result: [1, 1, 2, 3, 4, 5, 6, 9]  — O(n log n) average",
            "subtext": "Each partition level does O(n) work, and there are O(log n) levels — much better than O(n²) bubble sort",
            "variables": {"result": "[1, 1, 2, 3, 4, 5, 6, 9]", "comparisons": "~24", "complexity": "O(n log n)"},
            "narrative_phase": "insight",
        },
    ]


def _narrative_async(code: str) -> list[dict]:
    """Concept-first narrative for async functions."""
    fn_match = re.search(r"async\s+(?:def|function)\s+(\w+)\s*\(([^)]*)\)", code)
    fn_name = fn_match.group(1) if fn_match else "asyncFn"
    fn_line = (_find_line(code, fn_name) or 1)

    awaits = re.findall(r"await\s+(\w+(?:\.\w+)*\s*\([^)]*\))", code)
    is_parallel = bool(re.search(r"Promise\.all|asyncio\.gather", code))
    tasks_raw = (re.findall(r"Promise\.all\s*\(\s*\[([^\]]+)\]", code) or
                 re.findall(r"asyncio\.gather\s*\(([^)]+)\)", code))
    task_list = tasks_raw[0].split(",")[:3] if tasks_raw else []
    tasks_str = ", ".join(t.strip()[:20] for t in task_list) if task_list else ""

    steps: list[dict] = [
        # ── CONCEPT ──────────────────────────────────────────────────────────
        {
            "step_index": 0,
            "line_number": fn_line,
            "label": f"{fn_name}() can pause mid-execution without freezing the whole program",
            "subtext": "Async functions run cooperatively — while waiting for I/O, the event loop handles other work",
            "variables": {"model": "cooperative multitasking", "freezes": "nothing"},
            "narrative_phase": "overview",
        },
        {
            "step_index": 1,
            "line_number": fn_line,
            "label": "await suspends this function — other code runs while waiting",
            "subtext": "Think of it as a pause button for just this function: the rest of your app stays responsive",
            "variables": {"await_means": "suspend here", "while_waiting": "event loop runs other tasks"},
            "narrative_phase": "mechanism",
        },
    ]

    if is_parallel:
        gather_line = _find_line(code, "gather") or _find_line(code, "Promise.all") or fn_line + 2
        steps.append({
            "step_index": len(steps),
            "line_number": gather_line,
            "label": f"gather() / Promise.all() launches all tasks at once — not one-by-one",
            "subtext": "If each task takes 1 s and you have 3, sequential = 3 s, parallel = 1 s",
            "variables": {"tasks": tasks_str or "multiple", "strategy": "parallel", "time": "max(each), not sum"},
            "narrative_phase": "mechanism",
        })
    else:
        for aw in awaits[:2]:
            aw_line = _find_line(code, "await " + aw[:12]) or fn_line + len(steps)
            steps.append({
                "step_index": len(steps),
                "line_number": aw_line,
                "label": f"await {aw[:35]} — suspend until result arrives",
                "subtext": "The function pauses here; the event loop picks up other pending callbacks",
                "variables": {"awaiting": aw[:30], "status": "suspended"},
                "narrative_phase": "mechanism",
            })

    # ── EXECUTION ────────────────────────────────────────────────────────
    steps.append({
        "step_index": len(steps),
        "line_number": fn_line,
        "label": f"Call {fn_name}() — returns a Promise immediately",
        "subtext": "The function starts but its result isn't ready yet — the caller gets a Promise placeholder",
        "variables": {"status": "pending", "returns": "Promise"},
        "narrative_phase": "execution",
    })

    if is_parallel and tasks_str:
        gather_line = _find_line(code, "gather") or _find_line(code, "Promise.all") or fn_line + 2
        steps.append({
            "step_index": len(steps),
            "line_number": gather_line,
            "label": f"All {len(task_list) or '3'} tasks running concurrently",
            "subtext": "The event loop juggles all of them — whichever finishes first unblocks next",
            "variables": {"running": tasks_str or "tasks…", "status": "in-flight"},
            "narrative_phase": "execution",
        })
    elif awaits:
        for aw in awaits[:2]:
            aw_line = _find_line(code, "await " + aw[:12]) or fn_line + len(steps)
            steps.append({
                "step_index": len(steps),
                "line_number": aw_line,
                "label": f"await {aw[:30]} resolves → execution resumes",
                "subtext": "The Promise settled — our function is resumed from where it left off",
                "variables": {"resolved": aw[:25], "status": "resumed"},
                "narrative_phase": "execution",
            })

    # ── INSIGHT ──────────────────────────────────────────────────────────
    ret_line = _find_line(code, "return") or fn_line + 5
    steps.append({
        "step_index": len(steps),
        "line_number": ret_line,
        "label": "Promise fulfilled — result delivered to all .then() / await callers",
        "subtext": "Any code that awaited this function now resumes with the final value",
        "variables": {"status": "fulfilled", "pattern": "async/await", "scales": "yes — I/O bound"},
        "narrative_phase": "insight",
    })

    return steps[:16]


def _narrative_class(code: str) -> list[dict]:
    """Concept-first narrative for class definitions."""
    class_match = re.search(r"class\s+(\w+)(?:\((\w+)\))?", code)
    class_name = class_match.group(1) if class_match else "MyClass"
    parent = class_match.group(2) if class_match and class_match.group(2) else None
    class_line = (_find_line(code, f"class {class_name}") or 1)

    init_match = re.search(r"def\s+__init__\s*\(self(?:,\s*([^)]+))?\)", code)
    init_params: list[str] = []
    if init_match and init_match.group(1):
        init_params = [p.strip().split(":")[0].split("=")[0].strip()
                       for p in init_match.group(1).split(",") if p.strip()]

    attrs: list[tuple[str, str]] = []
    if init_match:
        init_start = code.find("__init__")
        body = code[init_start:init_start + 300]
        attrs = re.findall(r"self\.(\w+)\s*=\s*([^\n]+)", body)[:3]

    methods = [m for m in re.findall(r"def\s+(\w+)\s*\(self", code) if m != "__init__"]

    return [
        # ── CONCEPT ──────────────────────────────────────────────────────────
        {
            "step_index": 0,
            "line_number": class_line,
            "label": f"class {class_name} is a blueprint — it defines what {class_name} objects look like",
            "subtext": "A class bundles data (attributes) and behavior (methods) into a reusable template",
            "variables": {"blueprint": class_name, "pattern": "encapsulation"},
            "narrative_phase": "overview",
        },
        {
            "step_index": 1,
            "line_number": _find_line(code, "__init__") or class_line + 1,
            "label": "__init__ runs automatically when you create a new object — it sets up initial state",
            "subtext": "Think of __init__ as the assembly line: every new object gets built by this function",
            "variables": {"constructor": "__init__", "params": ", ".join(init_params[:3]) or "none"},
            "narrative_phase": "mechanism",
        },
        *([{
            "step_index": 2,
            "line_number": class_line,
            "label": f"Inherits from {parent} — gets all its methods for free",
            "subtext": "Inheritance means {class_name} can reuse and extend {parent}'s behavior without copying code",
            "variables": {"parent": parent, "inherits": "all methods + attributes"},
            "narrative_phase": "mechanism",
        }] if parent else []),
        # ── EXECUTION ────────────────────────────────────────────────────────
        *([{
            "step_index": len([0, 1]) + (1 if parent else 0),
            "line_number": _find_line(code, f"self.{attrs[0][0]}") or class_line + 3,
            "label": f"__init__ stores: {', '.join(f'self.{a}={v.strip()[:15]}' for a, v in attrs[:3])}",
            "subtext": "self. prefix stores the value on this specific instance — not shared with other objects",
            "variables": {f"self.{a}": v.strip()[:18] for a, v in attrs[:3]},
            "narrative_phase": "execution",
        }] if attrs else []),
        {
            "step_index": 3 + (1 if parent else 0) + (1 if attrs else 0),
            "line_number": class_line,
            "label": f"obj = {class_name}({', '.join('...' for _ in init_params[:2])}) creates a new instance",
            "subtext": "Each instance has its own copy of all attributes — changing one doesn't affect others",
            "variables": {"instance": f"obj: {class_name}", "isolated": "true"},
            "narrative_phase": "execution",
        },
        *([{
            "step_index": 4 + (1 if parent else 0) + (1 if attrs else 0),
            "line_number": _find_line(code, f"def {methods[0]}") or class_line + 4,
            "label": f"obj.{methods[0]}() — method receives 'self' pointing to this instance",
            "subtext": "'self' is how a method accesses the object's own data — it's the object looking at itself",
            "variables": {"method": methods[0], "self_is": f"the {class_name} instance"},
            "narrative_phase": "execution",
        }] if methods else []),
        # ── INSIGHT ──────────────────────────────────────────────────────────
        {
            "step_index": 5 + (1 if parent else 0) + (1 if attrs else 0) + (1 if methods else 0),
            "line_number": class_line,
            "label": f"OOP insight: {class_name} hides complexity behind a clean interface",
            "subtext": "Users call obj.method() without knowing the implementation — this is encapsulation",
            "variables": {"interface": f"{class_name}()", "hidden": "implementation details", "benefit": "encapsulation"},
            "narrative_phase": "insight",
        },
    ][:10]


def _narrative_python_fn(code: str) -> list[dict]:
    """Concept-first narrative for general Python functions.
    Analyzes the actual code to extract meaningful variable states and algorithm flow."""
    fn_match = re.search(r"def\s+(\w+)\s*\(([^)]*)\)", code)
    if not fn_match:
        return _steps_generic(code, "python")

    fn_name = fn_match.group(1)
    params_raw = fn_match.group(2)
    params = [p.strip().split(":")[0].split("=")[0].strip()
              for p in params_raw.split(",") if p.strip()]
    fn_line = (_find_line(code, f"def {fn_name}") or 1)

    # Extract type hints for smarter demo values
    param_types: dict[str, str] = {}
    for p in params_raw.split(","):
        p = p.strip()
        if ":" in p:
            name, hint = p.split(":", 1)
            param_types[name.strip()] = hint.strip()

    # Generate realistic demo values from type hints and names
    variables: dict[str, str] = {}
    for p in params[:3]:
        hint = param_types.get(p, "").lower()
        plow = p.lower()
        if "list[list" in hint or "matrix" in plow or "grid" in plow or "board" in plow:
            variables[p] = "[[1,4,3],[3,1,2]]"
        elif "list[int]" in hint or "arr" in plow or "nums" in plow or "array" in plow:
            variables[p] = "[3, 1, 4, 1, 5]"
        elif "list[str]" in hint or "words" in plow or "strings" in plow:
            variables[p] = '["a", "b", "c"]'
        elif "str" in hint or "string" in plow or "text" in plow or "word" in plow:
            variables[p] = '"hello"'
        elif "bool" in hint or "flag" in plow or p.startswith("is_") or p.startswith("has_"):
            variables[p] = "True"
        elif "dict" in hint or "map" in plow:
            variables[p] = '{"key": "val"}'
        elif "int" in hint or "n" == p or "k" == p or "count" in plow or "num" in plow:
            variables[p] = "5"
        elif "float" in hint:
            variables[p] = "3.14"
        else:
            variables[p] = "input"

    # Analyze function body structure
    has_loop = "for " in code or "while " in code
    loop_count = code.count("for ") + code.count("while ")
    has_condition = re.search(r"\s+if\s+", code) is not None
    ret_match = re.search(r"return\s+(.+)", code)
    ret_expr = ret_match.group(1).strip()[:40] if ret_match else "result"
    complexity = "O(n²)" if loop_count >= 2 else "O(n)" if has_loop else "O(1)"

    # Extract actual variable assignments from code body
    assignments = re.findall(r"^\s+(\w+)\s*=\s*(.+?)$", code, re.MULTILINE)
    key_vars = [(name, val.strip()[:24]) for name, val in assignments
                if name not in ("self", "_") and not name.startswith("__")][:6]

    # Extract key operations
    operations: list[tuple[str, int, str]] = []  # (label, line, variables_snapshot)
    fn_started = False
    for i, line in enumerate(code.splitlines()):
        if not fn_started:
            if re.match(r"\s*def\s+", line):
                fn_started = True
            continue
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", '"""', "'''")):
            continue
        lineno = i + 1

        if re.match(r"\s*(if|elif)\s+", line):
            cond = re.sub(r"^\s*(if|elif)\s+", "", stripped).rstrip(":").strip()[:45]
            operations.append((f"Check: {cond}", lineno, cond))
        elif re.match(r"\s*(for|while)\s+", line):
            loop_target = stripped[:50]
            operations.append((f"Loop: {loop_target}", lineno, loop_target))
        elif re.match(r"\s*return\s+", line):
            ret = stripped[7:].strip()[:35]
            operations.append((f"Return {ret}", lineno, ret))
        else:
            m = re.match(r"\s*(\w+)\s*[+\-*/%]?=(?!=)\s*(.+)", line)
            if m:
                varname, rhs = m.group(1), m.group(2).strip()[:30]
                operations.append((f"Set {varname} = {rhs}", lineno, f"{varname}={rhs}"))

    # Build narrative steps
    steps: list[dict] = []

    # ── OVERVIEW ─────────────────────────────────────────────────────────
    input_desc = " + ".join(params[:3]) if params else "input"
    steps.append({
        "step_index": 0,
        "line_number": fn_line,
        "label": f"{fn_name}() takes {input_desc} and computes {ret_expr}",
        "subtext": f"Input flows in through {len(params)} parameter{'s' if len(params) != 1 else ''}, transforms through the body, and a result flows out",
        "variables": dict(variables),
        "narrative_phase": "overview",
    })

    # ── MECHANISM ────────────────────────────────────────────────────────
    if has_loop:
        loop_line = _find_line(code, "for ") or _find_line(code, "while ") or fn_line + 2
        # Try to extract what the loop iterates over
        loop_m = re.search(r"for\s+(\w+)\s+in\s+(.+?):", code)
        while_m = re.search(r"while\s+(.+?):", code) if not loop_m else None
        if loop_m:
            loop_var, loop_iter = loop_m.group(1), loop_m.group(2).strip()[:30]
            label = f"Loop: {loop_var} iterates over {loop_iter}"
        elif while_m:
            label = f"Loop while {while_m.group(1).strip()[:35]}"
        else:
            label = "A loop processes each element"
        steps.append({
            "step_index": len(steps),
            "line_number": loop_line,
            "label": label,
            "subtext": f"{'Nested loops multiply iterations — ' if loop_count >= 2 else ''}Each pass updates state toward the final answer",
            "variables": {"iteration": "each element", "complexity": complexity},
            "narrative_phase": "mechanism",
        })

    if has_condition:
        cond_m = re.search(r"\s+if\s+(.+?):", code)
        cond = cond_m.group(1).strip()[:40] if cond_m else "condition"
        if_line = _find_line(code, "if " + cond[:12]) or fn_line + 2
        steps.append({
            "step_index": len(steps),
            "line_number": if_line,
            "label": f"Branch: if {cond}",
            "subtext": "The function takes different paths based on this condition — each path handles a specific case",
            "variables": {"condition": cond, "branches": "2+ paths"},
            "narrative_phase": "mechanism",
        })

    # ── EXECUTION ────────────────────────────────────────────────────────
    # Build evolving variable state from actual assignments
    evolving_vars = dict(variables)
    exec_steps_added = 0

    for op_label, op_line, op_detail in operations[:5]:
        if exec_steps_added >= 3:
            break
        # Update variables based on assignment
        assign_m = re.match(r"Set (\w+) = (.+)", op_label)
        if assign_m:
            evolving_vars[assign_m.group(1)] = assign_m.group(2)
        elif op_label.startswith("Return "):
            evolving_vars["→"] = op_label[7:]

        steps.append({
            "step_index": len(steps),
            "line_number": op_line,
            "label": op_label,
            "subtext": None,
            "variables": dict(evolving_vars),
            "narrative_phase": "execution",
        })
        exec_steps_added += 1

    # If no execution steps were extracted, add a generic one
    if exec_steps_added == 0:
        steps.append({
            "step_index": len(steps),
            "line_number": fn_line + 2,
            "label": f"{fn_name}() processes input and builds result",
            "variables": dict(evolving_vars),
            "narrative_phase": "execution",
        })

    # ── INSIGHT ──────────────────────────────────────────────────────────
    insight_text = {
        "O(1)": "Constant time — runs the same speed regardless of input size",
        "O(n)": "Linear — runtime grows proportionally with input size",
        "O(n²)": "Quadratic — nested loops cause runtime to grow with the square of input size",
    }
    steps.append({
        "step_index": len(steps),
        "line_number": fn_line,
        "label": f"{fn_name}() — {complexity} time",
        "subtext": insight_text.get(complexity, f"Runtime complexity: {complexity}"),
        "variables": {"complexity": complexity, "function": fn_name, "result": ret_expr},
        "narrative_phase": "insight",
    })

    return steps[:16]


# ---------------------------------------------------------------------------
# Narrative generator: JS/TS functions
# ---------------------------------------------------------------------------

def _narrative_js_fn(code: str) -> list[dict]:
    """Concept-first narrative for JavaScript/TypeScript functions."""
    # Extract function name
    fn_m = re.search(r"function\s+(\w+)\s*\(([^)]*)\)", code)
    if not fn_m:
        fn_m = re.search(r"(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>", code)
    if not fn_m:
        fn_m = re.search(r"(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(\w*)\s*=>", code)

    fn_name = fn_m.group(1) if fn_m else "fn"
    params_raw = fn_m.group(2) if fn_m and fn_m.group(2) else ""
    params = [p.strip().split(":")[0].split("=")[0].strip()
              for p in params_raw.split(",") if p.strip()]
    fn_line = _find_line(code, fn_name) or 1

    # Generate demo values from param names/types
    variables: dict[str, str] = {}
    for p in params[:3]:
        plow = p.lower()
        # Check for TS type annotations
        type_m = re.search(rf"{re.escape(p)}\s*:\s*(\w+(?:\[\])?)", code)
        hint = type_m.group(1).lower() if type_m else ""
        if "[]" in hint or "array" in hint or "arr" in plow or "nums" in plow or "items" in plow:
            variables[p] = "[3, 1, 4, 1, 5]"
        elif "string" in hint or "str" in plow or "text" in plow or "name" in plow:
            variables[p] = '"hello"'
        elif "boolean" in hint or p.startswith("is") or p.startswith("has"):
            variables[p] = "true"
        elif "number" in hint or "n" == p or "count" in plow or "num" in plow or "idx" in plow:
            variables[p] = "5"
        elif "object" in hint or "map" in plow or "config" in plow or "options" in plow:
            variables[p] = "{...}"
        else:
            variables[p] = "input"

    has_loop = "for " in code or "while " in code or ".forEach(" in code or ".map(" in code or ".reduce(" in code
    loop_count = sum(code.count(k) for k in ["for ", "while ", ".forEach(", ".map(", ".reduce(", ".filter("])
    has_condition = re.search(r"\s+if\s*\(", code) is not None or "?" in code
    ret_match = re.search(r"return\s+(.+?)(?:;|\n|$)", code)
    ret_expr = ret_match.group(1).strip()[:40] if ret_match else "result"
    complexity = "O(n²)" if loop_count >= 2 else "O(n)" if has_loop else "O(1)"

    # Extract actual variable assignments
    evolving_vars = dict(variables)
    operations: list[tuple[str, int]] = []
    for i, line in enumerate(code.splitlines()):
        stripped = line.strip()
        if not stripped or stripped.startswith("//") or stripped.startswith("/*"):
            continue
        lineno = i + 1
        # const/let/var assignments
        m = re.match(r"\s*(?:const|let|var)\s+(\w+)\s*=\s*(.+?)(?:;|$)", line)
        if m:
            varname, rhs = m.group(1), m.group(2).strip()[:24]
            evolving_vars[varname] = rhs
            operations.append((f"Set {varname} = {rhs}", lineno))
        elif re.match(r"\s*if\s*\(", line):
            cond = re.sub(r"^\s*if\s*\(", "", stripped).rstrip("{").rstrip(")").strip()[:40]
            operations.append((f"Check: {cond}", lineno))
        elif re.match(r"\s*(for|while)\s*\(", line):
            operations.append((f"Loop: {stripped[:45]}", lineno))
        elif re.match(r"\s*return\s+", line):
            ret = stripped.replace("return ", "").rstrip(";").strip()[:30]
            evolving_vars["→"] = ret
            operations.append((f"Return {ret}", lineno))

    steps: list[dict] = [
        {
            "step_index": 0,
            "line_number": fn_line,
            "label": f"{fn_name}() takes {' + '.join(params[:3]) or 'input'} and computes {ret_expr}",
            "subtext": f"{'Arrow function' if '=>' in code else 'Function declaration'} with {len(params)} parameter{'s' if len(params) != 1 else ''}",
            "variables": dict(variables),
            "narrative_phase": "overview",
        },
    ]

    if has_loop:
        # Find the specific loop construct
        for construct, label_prefix in [(".map(", "Transform"), (".filter(", "Filter"),
                                          (".reduce(", "Accumulate"), (".forEach(", "Iterate"),
                                          ("for ", "Loop"), ("while ", "Loop while")]:
            if construct in code:
                loop_line = _find_line(code, construct) or fn_line + 2
                steps.append({
                    "step_index": len(steps),
                    "line_number": loop_line,
                    "label": f"{label_prefix}: processes each element in sequence",
                    "subtext": f"{'Chained array methods compose transformations' if '.' in construct else 'Each iteration moves toward the result'} — {complexity}",
                    "variables": {"iteration": "each element", "complexity": complexity},
                    "narrative_phase": "mechanism",
                })
                break

    if has_condition:
        cond_m = re.search(r"\s+if\s*\((.+?)\)", code)
        cond = cond_m.group(1).strip()[:40] if cond_m else "condition"
        if_line = _find_line(code, "if (") or fn_line + 2
        steps.append({
            "step_index": len(steps),
            "line_number": if_line,
            "label": f"Branch: if ({cond})",
            "subtext": "Different inputs take different paths through the function",
            "variables": {"condition": cond, "branches": "2+ paths"},
            "narrative_phase": "mechanism",
        })

    # Execution steps
    exec_count = 0
    running_vars = dict(variables)
    for op_label, op_line in operations[:5]:
        if exec_count >= 3:
            break
        assign_m = re.match(r"Set (\w+) = (.+)", op_label)
        if assign_m:
            running_vars[assign_m.group(1)] = assign_m.group(2)
        elif op_label.startswith("Return "):
            running_vars["→"] = op_label[7:]
        steps.append({
            "step_index": len(steps),
            "line_number": op_line,
            "label": op_label,
            "variables": dict(running_vars),
            "narrative_phase": "execution",
        })
        exec_count += 1

    if exec_count == 0:
        steps.append({
            "step_index": len(steps),
            "line_number": fn_line + 2,
            "label": f"{fn_name}() processes input and builds result",
            "variables": dict(evolving_vars),
            "narrative_phase": "execution",
        })

    steps.append({
        "step_index": len(steps),
        "line_number": fn_line,
        "label": f"{fn_name}() — {complexity} time",
        "subtext": f"{'Constant time' if complexity == 'O(1)' else 'Linear scan' if complexity == 'O(n)' else 'Quadratic — nested loops'}",
        "variables": {"complexity": complexity, "function": fn_name, "result": ret_expr},
        "narrative_phase": "insight",
    })

    return steps[:16]


# ---------------------------------------------------------------------------
# Narrative generator: Heap / Graph / BFS / DFS algorithms
# ---------------------------------------------------------------------------

def _narrative_heap_graph(code: str) -> list[dict]:
    """Concept-first narrative for heap/priority-queue and graph traversal algorithms."""
    fn_match = re.search(r"def\s+(\w+)\s*\(([^)]*)\)", code)
    fn_name = fn_match.group(1) if fn_match else "solve"
    params = [p.strip().split(":")[0].split("=")[0].strip()
              for p in fn_match.group(2).split(",") if p.strip()] if fn_match else ["grid"]
    fn_line = (_find_line(code, f"def {fn_name}") or 1)
    low = code.lower()

    # Detect specifics
    has_heap = "heapq" in code or "heappush" in code or "heappop" in code
    has_visited = "visited" in code
    has_directions = re.search(r"directions|dr,\s*dc|dx,\s*dy|nr,\s*nc|nx,\s*ny", code) is not None
    has_grid = any(p in low for p in ["grid", "matrix", "height", "board", "map"])
    has_while = "while " in code
    ret_match = re.search(r"return\s+(.+)", code)
    ret_expr = ret_match.group(1).strip()[:30] if ret_match else "result"

    # Detect algorithm pattern
    if "dijkstra" in low:
        algo = "Dijkstra's shortest path"
        pattern = "greedy BFS"
        complexity = "O(E log V)"
    elif has_heap and has_grid and has_directions:
        algo = "BFS with priority queue"
        pattern = "process-lowest-first"
        complexity = "O(mn log(mn))"
    elif has_heap:
        algo = "heap-based greedy"
        pattern = "always pop the smallest"
        complexity = "O(n log n)"
    elif has_directions:
        algo = "grid BFS/DFS"
        pattern = "explore neighbors"
        complexity = "O(m × n)"
    else:
        algo = "graph traversal"
        pattern = "visit-once"
        complexity = "O(V + E)"

    # Extract boundary/init logic
    init_line = _find_line(code, "for r in range") or _find_line(code, "for i in range") or fn_line + 3
    while_line = _find_line(code, "while ") or fn_line + 8
    heap_pop_line = _find_line(code, "heappop") or _find_line(code, "pop(") or while_line + 1
    neighbor_line = _find_line(code, "for d") or _find_line(code, "for dr") or _find_line(code, "directions") or heap_pop_line + 2
    return_line = _find_line(code, "return ") or fn_line + 15

    # Extract key variable names from code
    result_var = None
    for candidate in ["water", "result", "ans", "count", "total", "dist", "cost", "res"]:
        if candidate in code:
            result_var = candidate
            break
    result_var = result_var or "result"

    steps: list[dict] = [
        # ── OVERVIEW ─────────────────────────────────────────────────────────
        {
            "step_index": 0,
            "line_number": fn_line,
            "label": f"{fn_name}() uses {algo} — {pattern}",
            "subtext": f"A heap always gives us the minimum element in O(log n), letting us process items in the right order",
            "variables": {"algorithm": algo, "data_structure": "min-heap" if has_heap else "queue"},
            "narrative_phase": "overview",
        },
        # ── MECHANISM ────────────────────────────────────────────────────────
        {
            "step_index": 1,
            "line_number": init_line,
            "label": "Seed the boundary — push all edge cells onto the heap",
            "subtext": "Starting from the outside, we work inward: boundary cells can't hold water, so we process them first",
            "variables": {"heap": "[boundary cells]", "visited": "edges marked", result_var: "0"},
            "narrative_phase": "mechanism",
        } if has_grid and has_visited else {
            "step_index": 1,
            "line_number": init_line,
            "label": f"Initialize — set up {('heap' if has_heap else 'queue')} and visited tracking",
            "subtext": "We need two things: a priority queue to pick the next item, and a set to avoid revisiting",
            "variables": {"heap_size": "initial", "visited": "{}", result_var: "0"},
            "narrative_phase": "mechanism",
        },
        {
            "step_index": 2,
            "line_number": while_line,
            "label": f"Main loop: pop smallest from heap, explore its neighbors",
            "subtext": "Each iteration pops the minimum-height cell. If a neighbor is lower than our running max, water gets trapped",
            "variables": {"heap_size": "shrinking", "max_height": "rising", result_var: "accumulating"},
            "narrative_phase": "mechanism",
        },
        {
            "step_index": 3,
            "line_number": neighbor_line,
            "label": "Check 4 directions — up, down, left, right" if has_directions else "Visit unvisited neighbors",
            "subtext": "For each neighbor: if not visited, mark it, compute trapped water, push to heap",
            "variables": {"directions": "↑ ↓ ← →" if has_directions else "adjacent", "check": "bounds + visited"},
            "narrative_phase": "mechanism",
        },
        # ── EXECUTION ────────────────────────────────────────────────────────
        {
            "step_index": 4,
            "line_number": heap_pop_line,
            "label": "Pop height=0 from boundary → max_height stays 0 → no water yet",
            "subtext": "The first pops process the lowest boundary cells — water can't be trapped at the edges",
            "variables": {"popped": "(0, 0, 0)", "max_height": "0", result_var: "0"},
            "narrative_phase": "execution",
        },
        {
            "step_index": 5,
            "line_number": heap_pop_line,
            "label": "Pop height=1 → neighbor at height=0 is below max → trap 1 unit of water",
            "subtext": "max(0, max_height - neighbor_height) gives trapped water — the heap guarantees we fill from lowest first",
            "variables": {"popped": "(1, r, c)", "max_height": "1", "trapped": "1", result_var: "1"},
            "narrative_phase": "execution",
        },
        {
            "step_index": 6,
            "line_number": heap_pop_line,
            "label": "Pop height=3 → max_height rises to 3 → deep cells trap more water",
            "subtext": "As we process higher cells, interior cells below max_height contribute larger water volumes",
            "variables": {"popped": "(3, r, c)", "max_height": "3", "new_trapped": "2", result_var: "3+"},
            "narrative_phase": "execution",
        },
        # ── INSIGHT ──────────────────────────────────────────────────────────
        {
            "step_index": 7,
            "line_number": return_line,
            "label": f"Heap empties → return {result_var} — {complexity} total",
            "subtext": f"Every cell is visited exactly once, each heap operation is O(log n) — total {complexity}",
            "variables": {"total": ret_expr, "complexity": complexity, "visits": "each cell once"},
            "narrative_phase": "insight",
        },
    ]

    return steps


# ---------------------------------------------------------------------------
# Narrative generator: Dynamic Programming
# ---------------------------------------------------------------------------

def _narrative_dp(code: str) -> list[dict]:
    """Concept-first narrative for dynamic programming algorithms."""
    fn_match = re.search(r"def\s+(\w+)\s*\(([^)]*)\)", code)
    fn_name = fn_match.group(1) if fn_match else "solve"
    fn_line = (_find_line(code, f"def {fn_name}") or 1)

    # Detect DP table variable
    dp_var = "dp"
    for candidate in ["dp", "memo", "cache", "table", "f"]:
        if re.search(rf"\b{candidate}\s*[\[=]", code):
            dp_var = candidate
            break

    has_2d = code.count("[") >= 6 or "dp[i][j]" in code or "dp[r][c]" in code
    ret_match = re.search(r"return\s+(.+)", code)
    ret_expr = ret_match.group(1).strip()[:30] if ret_match else f"{dp_var}[-1]"
    nested = code.count("for ") >= 2
    complexity = "O(n²)" if nested else "O(n)"

    init_line = _find_line(code, f"{dp_var}") or fn_line + 2
    loop_line = _find_line(code, "for ") or fn_line + 3
    return_line = _find_line(code, "return ") or fn_line + 10

    # Try to find the recurrence relation
    recurrence_m = re.search(rf"{dp_var}\[.+?\]\s*=\s*(.+)", code)
    recurrence = recurrence_m.group(0).strip()[:50] if recurrence_m else f"{dp_var}[i] = f({dp_var}[i-1])"

    return [
        {
            "step_index": 0,
            "line_number": fn_line,
            "label": f"{fn_name}() builds the answer from smaller subproblems — bottom-up DP",
            "subtext": "Instead of recomputing overlapping subproblems, store each result in a table and look it up",
            "variables": {"strategy": "dynamic programming", "table": dp_var},
            "narrative_phase": "overview",
        },
        {
            "step_index": 1,
            "line_number": init_line,
            "label": f"Initialize {dp_var} table — base cases fill the first {'row/column' if has_2d else 'slots'}",
            "subtext": "Base cases are known answers — like dp[0] = 0 — from which everything else is built",
            "variables": {dp_var: f"{'2D' if has_2d else '1D'} table", "base": "filled"},
            "narrative_phase": "mechanism",
        },
        {
            "step_index": 2,
            "line_number": loop_line,
            "label": f"Fill table: {recurrence}",
            "subtext": "Each cell depends on previously computed cells — this is the recurrence relation, the heart of DP",
            "variables": {"recurrence": recurrence, "direction": "left → right" if not has_2d else "row by row"},
            "narrative_phase": "mechanism",
        },
        {
            "step_index": 3,
            "line_number": loop_line + 1,
            "label": f"{dp_var}[0] = base → {dp_var}[1] computed → {dp_var}[2] builds on both",
            "subtext": "Each new cell reuses stored answers — no repeated work, every subproblem solved exactly once",
            "variables": {f"{dp_var}[0]": "base", f"{dp_var}[1]": "computed", f"{dp_var}[2]": "computed"},
            "narrative_phase": "execution",
        },
        {
            "step_index": 4,
            "line_number": loop_line + 2,
            "label": f"Table fills left to right — {dp_var}[i] always ready when needed",
            "subtext": "The fill order guarantees dependencies are resolved before use — that's why order matters in DP",
            "variables": {f"{dp_var}[3]": "computed", f"{dp_var}[4]": "computed", "progress": "halfway"},
            "narrative_phase": "execution",
        },
        {
            "step_index": 5,
            "line_number": return_line,
            "label": f"Answer lives in {ret_expr} — the final cell holds the global optimum",
            "subtext": f"{complexity} time, each cell computed once — memoization turns exponential into polynomial",
            "variables": {"answer": ret_expr, "complexity": complexity, "table_size": "n" if not has_2d else "n×m"},
            "narrative_phase": "insight",
        },
    ]


# ---------------------------------------------------------------------------
# Legacy step generators (kept for fallback use by _narrative_* functions)
# ---------------------------------------------------------------------------

def _steps_react_component(code: str) -> list[dict]:
    """Steps showing a React component's lifecycle and data flow."""
    steps: list[dict] = []

    comp_name = _component_name_from_code(code)
    has_use_client = '"use client"' in code or "'use client'" in code
    has_dynamic = "dynamic(" in code or "lazy(" in code or "Suspense" in code

    # Props interface
    props_match = re.search(r"interface\s+(\w*[Pp]rops\w*)\s*\{([^}]+)\}", code, re.DOTALL)
    props_fields: list[str] = []
    if props_match:
        field_lines = props_match.group(2).strip().splitlines()
        for line in field_lines:
            line = line.strip().rstrip(";,")
            if ":" in line:
                props_fields.append(line.split(":")[0].replace("?", "").strip())

    # Hooks (prioritized)
    hook_priority = ["useState", "useEffect", "useRef", "useCallback", "useMemo", "useContext", "useReducer"]
    found_hooks = [h for h in hook_priority if h + "(" in code]

    # Event handlers
    handlers = re.findall(r"(?:const|function)\s+(on\w+|handle\w+)\s*[=\(]", code)

    # Conditional renders
    cond_renders = re.findall(r"\{(\w+)\s*&&\s*<(\w+)", code)

    # Child components (JSX tags that start with uppercase)
    jsx_children = re.findall(r"<([A-Z]\w+)[^/]*/>|<([A-Z]\w+)[^>]*>", code)
    child_names = list(dict.fromkeys(
        (a or b) for a, b in jsx_children if (a or b) != comp_name
    ))

    # Return / root element
    jsx_match = re.search(r"return\s*\(?\s*<(\w+)", code)
    root_el = jsx_match.group(1) if jsx_match else "div"

    variables: dict[str, str] = {}

    if has_use_client:
        steps.append({
            "step_index": 0,
            "line_number": 1,
            "label": '"use client"',
            "variables": {},
        })

    if has_dynamic:
        line = _find_line(code, "dynamic(") or _find_line(code, "lazy(") or 2
        steps.append({
            "step_index": len(steps),
            "line_number": line,
            "label": "Dynamic import — code-split bundle",
            "variables": {},
        })

    if props_match:
        props_summary = ", ".join(props_fields[:4]) if props_fields else "..."
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, "interface") or 3,
            "label": f"Props contract: {{{props_summary}}}",
            "variables": {f: "(prop)" for f in props_fields[:3]},
        })

    # Top 3 hooks
    for hook in found_hooks[:3]:
        line = _find_line(code, hook + "(") or len(steps) + 1
        if hook == "useState":
            state_m = re.search(r"const\s*\[(\w+),\s*set\w+\]\s*=\s*useState\(([^)]*)\)", code)
            if state_m:
                state_name = state_m.group(1)
                init_val = state_m.group(2).strip() or "undefined"
                variables[state_name] = init_val
                steps.append({
                    "step_index": len(steps),
                    "line_number": line,
                    "label": f"useState: {state_name} = {init_val}",
                    "variables": dict(variables),
                })
            else:
                steps.append({
                    "step_index": len(steps), "line_number": line,
                    "label": "useState — track reactive state",
                    "variables": dict(variables),
                })
        elif hook == "useEffect":
            deps_m = re.search(r"useEffect\([^,]+,\s*\[([^\]]*)\]", code)
            deps = deps_m.group(1).strip() if deps_m else ""
            dep_str = f"[{deps}]" if deps else "[]"
            steps.append({
                "step_index": len(steps), "line_number": line,
                "label": f"useEffect runs after render (deps: {dep_str})",
                "variables": dict(variables),
            })
        elif hook == "useRef":
            ref_m = re.search(r"const\s+(\w+)\s*=\s*useRef", code)
            ref_name = ref_m.group(1) if ref_m else "ref"
            variables[ref_name] = "{ current: null }"
            steps.append({
                "step_index": len(steps), "line_number": line,
                "label": f"{ref_name} = useRef — DOM reference",
                "variables": dict(variables),
            })
        else:
            steps.append({
                "step_index": len(steps), "line_number": line,
                "label": f"{hook}() registered",
                "variables": dict(variables),
            })

    # Event handlers (top 2)
    for h in handlers[:2]:
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, h) or len(steps) + 1,
            "label": f"Event handler: {h}()",
            "variables": dict(variables),
        })

    # Conditional renders
    for cond_var, el in cond_renders[:2]:
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, f"{cond_var} &&") or len(steps) + 1,
            "label": f"Show <{el} /> only when {cond_var} is true",
            "variables": {**variables, cond_var: "true / false"},
        })

    # Child components
    for child in child_names[:2]:
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, f"<{child}") or len(steps) + 1,
            "label": f"Render child: <{child} />",
            "variables": dict(variables),
        })

    # Final render step
    steps.append({
        "step_index": len(steps),
        "line_number": _find_line(code, "return") or len(steps) + 1,
        "label": f"Return <{root_el}> — paint the screen",
        "variables": dict(variables),
    })

    return steps[:16]


def _steps_recursive_function(code: str) -> list[dict]:
    fn_match = re.search(r"def\s+(\w+)\s*\(([^)]*)\)", code)
    if not fn_match:
        return _steps_generic(code, "python")

    fn_name = fn_match.group(1)
    params = [p.strip().split(":")[0].split("=")[0].strip()
              for p in fn_match.group(2).split(",") if p.strip()]
    first_param = params[0] if params else "n"
    demo_val = 5
    variables: dict[str, str] = {first_param: str(demo_val)}

    steps: list[dict] = [{
        "step_index": 0,
        "line_number": _find_line(code, f"def {fn_name}") or 1,
        "label": f"Call {fn_name}({first_param}={demo_val})",
        "variables": dict(variables),
    }]

    base_match = re.search(r"if\s+(.+?):\s*\n\s*return\s+(.+)", code)
    if base_match:
        cond = base_match.group(1).strip()[:40]
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, "if " + cond[:10]) or 2,
            "label": f"Base case check: {cond}",
            "variables": dict(variables),
        })
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, "if " + cond[:10]) or 2,
            "label": f"Check: {cond} → False (need to recurse deeper)",
            "variables": dict(variables),
        })

    for sub_val in [4, 3, 2]:
        variables[first_param] = str(sub_val)
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, fn_name + "(") or 3,
            "label": f"Recursive call: {fn_name}({first_param}={sub_val})",
            "variables": dict(variables),
        })
        if len(steps) >= 7:
            break

    if base_match:
        base_ret = base_match.group(2).strip()[:20]
        variables[first_param] = "1"
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, "return " + base_match.group(2).strip()[:10]) or 4,
            "label": f"Base case hit → return {base_ret}",
            "variables": dict(variables),
        })

    combine_match = re.search(r"return\s+(.+\+.+|.+\*.+)", code)
    if combine_match:
        expr = combine_match.group(1).strip()[:40]
        variables["result"] = "5"
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, "return " + combine_match.group(1).strip()[:10]) or 5,
            "label": f"Combine results: {expr}",
            "variables": dict(variables),
        })
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, "return " + combine_match.group(1).strip()[:10]) or 5,
            "label": f"Stack unwinds — {fn_name}({demo_val}) = 5",
            "variables": {"result": "5", first_param: str(demo_val)},
        })

    return steps[:16]


def _steps_sorting_function(code: str) -> list[dict]:
    fn_match = re.search(r"def\s+(\w+)\s*\(([^)]*)\)", code)
    fn_name = fn_match.group(1) if fn_match else "sort"
    demo_arr = "[3, 1, 4, 1, 5, 9, 2, 6]"
    return [
        {"step_index": 0, "line_number": 1, "label": f"Input array: {demo_arr}", "variables": {"arr": demo_arr}},
        {"step_index": 1, "line_number": _find_line(code, "pivot") or 2,
         "label": "Select pivot element", "variables": {"arr": demo_arr, "pivot": "4"}},
        {"step_index": 2, "line_number": _find_line(code, "swap") or 3,
         "label": "Partition: elements < pivot move left",
         "variables": {"left": "[3, 1, 1, 2]", "pivot": "4", "right": "[5, 9, 6]"}},
        {"step_index": 3, "line_number": _find_line(code, fn_name + "(") or 4,
         "label": f"Recursive call: {fn_name}(left side)", "variables": {"left": "[3, 1, 1, 2]"}},
        {"step_index": 4, "line_number": _find_line(code, fn_name + "(") or 4,
         "label": f"Recursive call: {fn_name}(right side)", "variables": {"right": "[5, 9, 6]"}},
        {"step_index": 5, "line_number": _find_line(code, "return") or 5,
         "label": "Merge sorted halves", "variables": {"result": "[1, 1, 2, 3, 4, 5, 6, 9]"}},
    ]


def _steps_async_function(code: str) -> list[dict]:
    fn_match = re.search(r"async\s+(?:def|function)\s+(\w+)\s*\(([^)]*)\)", code)
    fn_name = fn_match.group(1) if fn_match else "asyncFn"
    awaits = re.findall(r"await\s+(\w+(?:\.\w+)*\s*\([^)]*\))", code)
    concurrents = (re.findall(r"Promise\.all\s*\(\s*\[([^\]]+)\]", code) or
                   re.findall(r"asyncio\.gather\s*\(([^)]+)\)", code))

    steps: list[dict] = [{
        "step_index": 0,
        "line_number": 1,
        "label": f"Enter async {fn_name}() — event loop suspends",
        "variables": {"status": "pending"},
    }]

    if concurrents:
        tasks_raw = concurrents[0].split(",")
        tasks = [t.strip()[:20] for t in tasks_raw[:3]]
        steps += [
            {"step_index": 1, "line_number": _find_line(code, "gather") or _find_line(code, "Promise.all") or 2,
             "label": f"Launch {len(tasks)} concurrent tasks",
             "variables": {"tasks": f"[{', '.join(tasks)}]", "status": "running"}},
            {"step_index": 2, "line_number": _find_line(code, "gather") or 2,
             "label": "Awaiting all tasks in parallel",
             "variables": {"pending": str(len(tasks)), "status": "awaiting"}},
            {"step_index": 3, "line_number": _find_line(code, "gather") or 2,
             "label": "All tasks settled — results collected",
             "variables": {"results": "[...]", "status": "resolved"}},
        ]
    else:
        for i, aw in enumerate(awaits[:4]):
            steps.append({
                "step_index": len(steps),
                "line_number": _find_line(code, "await " + aw[:10]) or i + 2,
                "label": f"await {aw[:30]}",
                "variables": {"status": f"awaiting ({i + 1}/{max(len(awaits), 1)})"},
            })

    steps.append({
        "step_index": len(steps),
        "line_number": _find_line(code, "return") or len(steps) + 1,
        "label": "Function resolves — promise fulfilled",
        "variables": {"status": "fulfilled"},
    })
    return steps[:16]


def _steps_class_definition(code: str) -> list[dict]:
    class_match = re.search(r"class\s+(\w+)(?:\((\w+)\))?", code)
    class_name = class_match.group(1) if class_match else "MyClass"
    parent = class_match.group(2) if class_match and class_match.group(2) else None
    init_match = re.search(r"def\s+__init__\s*\(self(?:,\s*([^)]+))?\)", code)
    init_params: list[str] = []
    if init_match and init_match.group(1):
        init_params = [p.strip().split(":")[0].split("=")[0].strip()
                       for p in init_match.group(1).split(",") if p.strip()]
    methods = [m for m in re.findall(r"def\s+(\w+)\s*\(self", code) if m != "__init__"]
    variables: dict[str, str] = {}
    steps: list[dict] = []

    label = f"class {class_name}({parent})" if parent else f"Define class {class_name}"
    steps.append({"step_index": 0, "line_number": 1, "label": label, "variables": {}})

    if init_match:
        param_str = ", ".join(f"{p}=..." for p in init_params[:3])
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, "__init__") or 2,
            "label": f"__init__(self, {param_str})",
            "variables": {},
        })
        init_start = code.find("__init__")
        init_body = code[init_start:init_start + 300]
        for attr, val in re.findall(r"self\.(\w+)\s*=\s*([^\n]+)", init_body)[:3]:
            variables[f"self.{attr}"] = val.strip()[:20]
            steps.append({
                "step_index": len(steps),
                "line_number": _find_line(code, f"self.{attr}") or len(steps) + 1,
                "label": f"self.{attr} = {val.strip()[:20]}",
                "variables": dict(variables),
            })

    steps.append({
        "step_index": len(steps),
        "line_number": len(code.splitlines()),
        "label": f"obj = {class_name}({', '.join(['...']*min(len(init_params), 2))})",
        "variables": dict(variables),
    })
    for method in methods[:2]:
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, f"def {method}") or len(steps) + 1,
            "label": f"obj.{method}() called",
            "variables": dict(variables),
        })
    return steps[:16]


def _steps_python_function(code: str) -> list[dict]:
    fn_match = re.search(r"def\s+(\w+)\s*\(([^)]*)\)", code)
    if not fn_match:
        return _steps_generic(code, "python")
    fn_name = fn_match.group(1)
    params = [p.strip().split(":")[0].split("=")[0].strip()
              for p in fn_match.group(2).split(",") if p.strip()]
    variables: dict[str, str] = {}
    demo_vals = ["5", "[3,1,4,1,5]", "True", '"hello"', "{}"]
    for i, p in enumerate(params[:3]):
        variables[p] = demo_vals[i % len(demo_vals)]

    steps: list[dict] = [{
        "step_index": 0,
        "line_number": _find_line(code, f"def {fn_name}") or 1,
        "label": f"Call {fn_name}({', '.join(f'{p}={variables[p]}' for p in params[:2])})",
        "variables": dict(variables),
    }]

    fn_started = False
    for i, line in enumerate(code.splitlines()):
        if not fn_started:
            if re.match(r"\s*def\s+", line):
                fn_started = True
            continue
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", '"""', "'''")):
            continue
        lineno = i + 1
        label = None

        if re.match(r"\s*(if|elif)\s+", line):
            cond = stripped.lstrip("if ").lstrip("elif ").rstrip(":").strip()[:45]
            label = f"Check: {cond}"
        elif stripped.startswith("else:"):
            label = "Else branch"
        elif re.match(r"\s*(for|while)\s+", line):
            label = f"Loop: {stripped[:45]}"
        elif re.match(r"\s*return\s+", line):
            ret = stripped[7:].strip()[:30]
            label = f"Return {ret}"
            variables["→"] = ret
            steps.append({"step_index": len(steps), "line_number": lineno,
                          "label": label, "variables": dict(variables)})
            break
        else:
            m = re.match(r"\s*(\w+)\s*[+\-*/%]?=(?!=)\s*(.+)", line)
            if m:
                varname, rhs = m.group(1), m.group(2).strip()[:24]
                variables[varname] = rhs
                label = f"Set {varname} = {rhs}"

        if label and not (steps and steps[-1]["label"] == label):
            steps.append({"step_index": len(steps), "line_number": lineno,
                          "label": label, "variables": dict(variables)})
        if len(steps) >= 9:
            break

    return steps[:16] or [{"step_index": 0, "line_number": 1,
                            "label": f"{fn_name}() executed", "variables": variables}]


def _steps_generic(code: str, language: str) -> list[dict]:
    lines = code.splitlines()
    non_empty = [l for l in lines if l.strip() and not l.strip().startswith(("//", "#", "/*", "*"))]
    if not non_empty:
        return [{"step_index": 0, "line_number": 1, "label": "Code executes", "variables": {"status": "running"}, "narrative_phase": "execution"}]

    total = len(non_empty)
    ph1 = max(1, total // 4)
    ph2 = max(2, total // 2)
    variables: dict[str, str] = {}
    steps: list[dict] = []

    imports = [l.strip() for l in non_empty[:ph1] if re.match(r"\s*(import|from|require|#include)", l)]
    if imports:
        import_names = []
        for imp in imports[:3]:
            m_imp = re.search(r"(?:import|from)\s+(\S+)", imp)
            if m_imp:
                import_names.append(m_imp.group(1).strip(",").strip())
        steps.append({
            "step_index": 0, "line_number": 1,
            "label": f"Load {len(imports)} module{'s' if len(imports) != 1 else ''}",
            "variables": {"modules": ", ".join(import_names[:3]) or str(len(imports))},
            "narrative_phase": "overview",
        })

    decls = [l.strip() for l in non_empty[:ph1]
             if re.match(r"\s*(const|let|var|def|class|function|type|interface)", l)]
    for d in decls[:2]:
        m = re.match(r"(?:const|let|var)\s+(\w+)\s*=\s*(.+)", d)
        if m:
            variables[m.group(1)] = m.group(2).strip()[:20]
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, d[:20]) or len(steps) + 1,
            "label": f"Declare: {d[:55]}",
            "variables": dict(variables),
        })

    for l in non_empty[ph1:ph2][:3]:
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, l[:20]) or len(steps) + 1,
            "label": l.strip()[:55],
            "variables": dict(variables),
        })

    returns = [l for l in non_empty[ph2:] if re.match(r"\s*return\s+", l)]
    if returns:
        ret = returns[0].strip()
        variables["→"] = ret[7:].strip()[:20]
        steps.append({
            "step_index": len(steps),
            "line_number": _find_line(code, ret[:15]) or len(steps) + 1,
            "label": f"Return: {ret[7:].strip()[:40]}",
            "variables": dict(variables),
        })

    return steps[:16] or [{"step_index": 0, "line_number": 1, "label": "Code executes", "variables": {"status": "running"}, "narrative_phase": "execution"}]


# ---------------------------------------------------------------------------
# Step dispatcher — narrative-first generators
# ---------------------------------------------------------------------------

def _generate_steps(code: str, language: str, structure: str) -> list[dict]:
    """
    Dispatch to narrative generators that produce concept-first steps.
    Each generator yields: overview beats → mechanism beats → execution beats → insight beats.
    The _add_plain() pass enriches labels and subtext further.
    """
    if structure == "react_component":
        raw = _narrative_react(code)
    elif structure == "recursive_function":
        raw = _narrative_recursive(code)
    elif structure == "sorting_function":
        raw = _narrative_sorting(code)
    elif structure == "async_function":
        raw = _narrative_async(code)
    elif structure == "class_definition":
        raw = _narrative_class(code)
    elif structure == "heap_graph":
        raw = _narrative_heap_graph(code)
    elif structure == "dynamic_programming":
        raw = _narrative_dp(code)
    elif structure == "js_function":
        raw = _narrative_js_fn(code)
    elif structure == "python_function":
        raw = _narrative_python_fn(code)
    else:
        raw = _steps_generic(code, language)
    return _add_plain(raw, structure)


# ---------------------------------------------------------------------------
# Heuristic analyzer
# ---------------------------------------------------------------------------

def _heuristic_analyze(parsed: ParsedCode, language: str, structure: str) -> VisualizationIntent:
    src = parsed.raw_source
    low = src.lower()
    patterns: list[str] = []

    if structure == "react_component":
        patterns.append("component_lifecycle")
        if "useState" in src: patterns.append("stateful")
        if "useEffect" in src: patterns.append("side_effects")
        if "dynamic(" in src or "lazy(" in src: patterns.append("code_splitting")
    elif structure == "recursive_function":
        patterns.append("recursion")
        if "memo" in low or "cache" in low: patterns.append("memoization")
        else: patterns.append("overlapping_subproblems")
    elif structure == "sorting_function":
        patterns += ["divide_and_conquer", "in_place_sort"]
    elif structure == "async_function":
        patterns.append("asynchronous")
        if "gather" in low or "Promise.all" in src: patterns.append("parallel_execution")
        else: patterns.append("sequential_await")
    elif structure == "class_definition":
        patterns.append("oop")
        if "super(" in src: patterns.append("inheritance")
    else:
        if src.count("for ") > 1: patterns.append("nested_loops")
        elif "for " in src or "while " in src: patterns.append("iteration")
        if not patterns: patterns.append("sequential_execution")

    is_recursive = structure == "recursive_function"
    has_loop = "for " in src or "while " in src
    has_nested = src.count("for ") > 1

    if structure == "react_component":
        time_c, space_c = "O(renders)", "O(state)"
    elif is_recursive and "memo" not in low and "cache" not in low:
        time_c, space_c = "O(2ⁿ)", "O(n)"
    elif is_recursive:
        time_c, space_c = "O(n)", "O(n)"
    elif has_nested:
        time_c, space_c = "O(n²)", "O(1)"
    elif has_loop:
        time_c, space_c = "O(n)", "O(1)"
    else:
        time_c, space_c = "O(1)", "O(1)"

    fn_name = _extract_fn_name(src, language)
    if structure == "react_component":
        comp = _component_name_from_code(src)
        insight = (f"{comp} is a React component that renders declaratively. "
                   "When state changes, React automatically re-draws only what changed.")
    elif structure == "recursive_function":
        fn_m = re.search(r"def\s+(\w+)", src)
        fn = fn_m.group(1) if fn_m else "This function"
        insight = (f"{fn} solves the problem by breaking it into smaller identical subproblems. "
                   "Each call reduces the input until hitting the base case, then results bubble back up.")
    elif structure == "sorting_function":
        insight = "Divide-and-conquer: pick a pivot, partition smaller/larger, recurse on each half, then merge. O(n log n) average."
    elif structure == "async_function":
        insight = "Async/await suspends execution at each await, freeing the event loop. Other code can run while waiting for I/O."
    elif structure == "class_definition":
        cm = re.search(r"class\s+(\w+)", src)
        cname = cm.group(1) if cm else "This class"
        insight = f"{cname} bundles data (attributes) and behavior (methods) together. Create instances with {cname}()."
    else:
        insight = f"This {language} code executes sequentially — each line runs top-to-bottom, building on previous results."

    description = _build_description(structure, language, fn_name, patterns)
    return VisualizationIntent(
        code_type=structure,
        language=language,
        entry_point=fn_name,
        sample_input="5" if is_recursive else "...",
        notable_patterns=patterns,
        description=description,
        time_complexity=time_c,
        space_complexity=space_c,
        key_insight=insight,
    )


def _build_description(structure: str, language: str, fn_name: str, patterns: list[str]) -> str:
    p = patterns[0].replace("_", " ") if patterns else "sequential execution"
    if structure == "react_component":
        return f"A React component ({fn_name}) that demonstrates {p}."
    elif structure == "recursive_function":
        return f"A recursive {language} function ({fn_name}) using {p}."
    elif structure == "sorting_function":
        return f"A {language} sorting algorithm ({fn_name}) using {p}."
    elif structure == "async_function":
        return f"An async {language} function ({fn_name}) demonstrating {p}."
    elif structure == "class_definition":
        return f"A {language} class ({fn_name}) showcasing {p}."
    return f"A {language} function ({fn_name}) demonstrating {p}."


# ---------------------------------------------------------------------------
# Heuristic narrator
# ---------------------------------------------------------------------------

def _heuristic_narration(steps: list[dict], total_ms: int | None = None) -> NarrationScript:
    n = max(len(steps), 1)
    if total_ms is None:
        total_ms = n * 1500
    ms_per = total_ms // n
    captions = []
    for i, step in enumerate(steps):
        captions.append(Caption(
            start_ms=i * ms_per,
            end_ms=(i + 1) * ms_per,
            text=step["label"],
            subtext=step.get("subtext") or None,
        ))
    return NarrationScript(captions=captions, total_duration_ms=total_ms)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def run_demo(parsed: ParsedCode) -> PipelineOutput:
    """
    Run the full pipeline in demo mode — no Claude API calls.
    Handles large files by extracting the primary component/function.
    Generates beginner-friendly semantic steps.
    """
    full_code = parsed.raw_source
    language = detect_language(full_code, hint=parsed.language)
    is_large_file = len(full_code.splitlines()) >= 50

    # For large files, focus on the primary function/component
    if is_large_file:
        focused_code, focused_name = _select_primary_target(full_code, language)
    else:
        focused_code = full_code
        focused_name = _extract_fn_name(full_code, language)

    structure = detect_code_structure(focused_code, language)
    intent = _heuristic_analyze(parsed, language, structure)

    if structure == "react_component":
        title = f"<{_component_name_from_code(focused_code)} />"
    else:
        fn = re.search(r"def\s+(\w+)", focused_code)
        if fn:
            title = f"{fn.group(1)}()"
        else:
            title = focused_name if focused_name.endswith(")") else f"{focused_name}()"

    scene_plan = ScenePlan(
        template="control_flow_branch",
        title=title,
        function_name=focused_name.rstrip("()"),
        narration_beats=[
            NarrationBeat(beat_index=0, description="Code structure identified", emphasis="entry point"),
            NarrationBeat(beat_index=1, description="Core logic executes", emphasis="core logic"),
            NarrationBeat(beat_index=2, description="Result produced", emphasis="output"),
        ],
        template_params={},
    )

    # Generate semantic steps for the focused code
    steps = _generate_steps(focused_code, language, structure)

    # For large files, prepend file overview steps
    if is_large_file:
        overview = _file_overview_steps(full_code, title, language)
        # Re-index
        for s in steps:
            s["step_index"] += len(overview)
        steps = overview + steps

    props = {
        "title": title,
        "code": focused_code,   # Show focused code in animation, not full 500-line file
        "language": language,
        "steps": steps,
        "code_type": structure,  # e.g. "recursive_function", "sorting_algorithm", "async_flow"
    }

    narration = _heuristic_narration(steps)

    return PipelineOutput(
        scene_plan=scene_plan,
        remotion_props=props,
        narration=narration,
        layout_nodes=[],
        intent=intent,
    )
