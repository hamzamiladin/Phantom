"""
Multi-provider AI question answering for the Phantom code tutor.

Set AI_PROVIDER in .env to choose the backend:
  AI_PROVIDER=demo       — no API key needed, keyword-based answers
  AI_PROVIDER=groq       — Groq Llama 3.3 70B (GROQ_API_KEY required)
  AI_PROVIDER=cerebras   — Cerebras Llama 3.3 70B (CEREBRAS_API_KEY required)
  AI_PROVIDER=openrouter — OpenRouter free models (OPENROUTER_API_KEY required)
  AI_PROVIDER=deepseek   — DeepSeek Chat (DEEPSEEK_API_KEY required)
  AI_PROVIDER=mistral    — Mistral Large (MISTRAL_API_KEY required)
  AI_PROVIDER=claude     — Anthropic Claude Haiku (ANTHROPIC_API_KEY required)
  AI_PROVIDER=openai     — OpenAI GPT-4o-mini (OPENAI_API_KEY required)
  AI_PROVIDER=gemini     — Google Gemini (GEMINI_API_KEY required)
"""
from __future__ import annotations
import os

SYSTEM_PROMPT = (
    "You are a CS tutor explaining code to students. "
    "Answer in 2-3 sentences using plain English and one concrete example. "
    "Avoid jargon unless you immediately explain it."
)

# ---------------------------------------------------------------------------
# Demo answers — no API needed
# ---------------------------------------------------------------------------

_DEMO_ANSWERS: list[tuple[list[str], str]] = [
    (
        ["base case", "stopping condition", "when does it stop"],
        "The base case is the stopping condition in a recursive function — when the input is so small that we already know the answer (like fib(0)=0 or fib(1)=1). Without it, the function would call itself forever and crash with a stack overflow. Think of it as the bottom of a staircase: you stop climbing down when you hit the floor.",
    ),
    (
        ["memoization", "cache", "caching", "store results", "remember"],
        "Memoization means storing the result of a function call so if the same input appears again, we return the cached answer instantly. For fibonacci(5), instead of recomputing fibonacci(3) twice, we compute it once and save it. This collapses O(2ⁿ) exponential time to O(n) linear time.",
    ),
    (
        ["time complexity", "o(", "big o", "performance", "how fast", "runtime"],
        "Time complexity describes how the number of operations grows as the input size grows. O(n) means if the input doubles, the work doubles. O(2ⁿ) means each extra input item doubles the work — that's why memoization matters so much for recursive functions.",
    ),
    (
        ["recursion", "recursive", "calls itself", "why recursion"],
        "Recursion is when a function solves a problem by calling a simpler version of itself. It's useful when a problem has a natural self-similar structure — like a family tree (each person has parents, who also have parents). The trick is to always move toward a base case so the chain eventually terminates.",
    ),
    (
        ["async", "await", "asynchronous", "promise", "concurrent"],
        "async/await lets a function pause at an await point and give control back to the event loop while waiting for something (like a network request). Other code can run in the meantime — the browser stays responsive. It's like submitting a form and doing other work while waiting for the server to reply, instead of freezing until it does.",
    ),
    (
        ["usestate", "state", "reactive", "re-render"],
        "useState stores a value that React watches. When you call the setter (like setCount), React re-runs the component function and updates only the parts of the DOM that changed. It's React's way of keeping the UI in sync with your data without you manually touching the DOM.",
    ),
    (
        ["useeffect", "side effect", "effect", "after render"],
        "useEffect runs code after the component renders — it's the right place for side effects like fetching data, setting up subscriptions, or starting timers. The dependency array [dep] tells React to only re-run the effect when dep changes; an empty array [] means run once on mount.",
    ),
    (
        ["divide and conquer", "split", "quicksort", "mergesort", "pivot"],
        "Divide-and-conquer splits a big problem into smaller independent pieces, solves each, then combines the results. Quicksort picks a pivot, puts smaller items left and larger items right, then recursively sorts each side. This achieves O(n log n) because each level of recursion does O(n) work and there are O(log n) levels.",
    ),
    (
        ["class", "object", "oop", "instance", "self"],
        "A class is a blueprint — it defines what data (attributes) and behavior (methods) all objects of that type will have. When you write obj = MyClass(), Python creates a new instance with its own copy of the attributes. 'self' is how a method refers to its own instance — like 'this' in JavaScript.",
    ),
    (
        ["space complexity", "memory", "extra space"],
        "Space complexity measures how much extra memory an algorithm uses as input grows. O(1) space means constant memory regardless of input size. Recursive functions often use O(n) space because each call adds a frame to the call stack — the stack depth equals the recursion depth.",
    ),
]


def _demo_answer(question: str, context: str) -> str:
    low = question.lower()
    for keywords, answer in _DEMO_ANSWERS:
        if any(kw in low for kw in keywords):
            return answer
    ctx = context[:200].strip() if context else ""
    if ctx:
        return f"Based on this code: {ctx}… The key thing to understand is that each step builds on the previous one. Try watching the animation again and focus on how the variables change — that usually makes it click."
    return "Great question! Try watching the animation step by step and pay attention to the variable panel — it shows exactly what the code is tracking at each moment. If something is still unclear, ask about a specific step."


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def answer_question(code: str, question: str, context: str = "") -> str:
    """Answer a question about code using the configured AI provider."""
    provider = os.getenv("AI_PROVIDER", "demo").lower().strip()

    if provider == "demo":
        return _demo_answer(question, context)

    # Claude path uses Anthropic SDK directly (different interface)
    if provider == "claude":
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=320,
                system=SYSTEM_PROMPT,
                messages=[{
                    "role": "user",
                    "content": f"Code:\n```\n{code[:800]}\n```\n\nContext: {context}\n\nQuestion: {question}",
                }],
            )
            return str(msg.content[0].text)
        except Exception as e:
            return f"[Claude unavailable: {e}] " + _demo_answer(question, context)

    # All other providers via shared routing
    try:
        from .providers import generate
        prompt = f"Code:\n```\n{code[:800]}\n```\n\nContext: {context}\n\nQuestion: {question}"
        return generate(prompt, system=SYSTEM_PROMPT, provider=provider, max_tokens=320)
    except Exception as e:
        return f"[{provider} unavailable: {e}] " + _demo_answer(question, context)
