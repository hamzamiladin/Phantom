"""
Integration test: run the full pipeline on a fibonacci function.
Requires ANTHROPIC_API_KEY in environment.
Asserts:
  - Pipeline runs without error
  - Output JSON passes RecursionTreeRemotionProps validation
  - template == "recursion_tree"
  - rootNode.label contains "fib"
"""
import os
import pytest
from phantom_engine.pipeline import run
from phantom_engine.schemas import RecursionTreeRemotionProps

FIB_SOURCE = """
def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)

result = fib(5)
"""


@pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set"
)
def test_fibonacci_pipeline():
    output = run(FIB_SOURCE, language="python")

    # Template selection
    assert output.scene_plan.template == "recursion_tree", (
        f"Expected recursion_tree template, got: {output.scene_plan.template}"
    )

    # Props are valid
    props = output.remotion_props
    assert isinstance(props, RecursionTreeRemotionProps)
    assert "fib" in props.rootNode.label.lower()
    assert props.functionName.lower().startswith("fib")

    # Tree has children
    assert len(props.rootNode.children) == 2, "fib should have 2 recursive children"

    # Layout nodes
    assert len(output.layout_nodes) >= 3, "Should have at least 3 layout nodes"
    for node in output.layout_nodes:
        assert "id" in node
        assert "x" in node
        assert "y" in node
        assert "revealFrame" in node

    # Narration
    assert len(output.narration.captions) >= 3
    assert output.narration.total_duration_ms > 0

    print(f"Template: {output.scene_plan.template}")
    print(f"Root node: {props.rootNode.label}")
    print(f"Layout nodes: {len(output.layout_nodes)}")
    print(f"Captions: {len(output.narration.captions)}")


def test_composer_without_api():
    """Test composer in isolation — no API key needed."""
    from phantom_engine.schemas import ScenePlan, NarrationBeat
    from phantom_engine.composer import compose

    plan = ScenePlan(
        template="recursion_tree",
        title="fibonacci(5)",
        function_name="fib",
        narration_beats=[
            NarrationBeat(beat_index=0, description="Start", emphasis="recursion"),
            NarrationBeat(beat_index=1, description="Branch", emphasis="sub-problems"),
            NarrationBeat(beat_index=2, description="Overlap", emphasis="duplicates"),
            NarrationBeat(beat_index=3, description="Result", emphasis="memoization"),
        ],
        template_params={"sample_input": 5},
    )

    props, layout_nodes = compose(plan)

    assert props.functionName == "fib"
    assert "fib" in props.rootNode.label
    assert len(props.rootNode.children) == 2
    assert len(layout_nodes) >= 3

    # All layout nodes have required fields
    for node in layout_nodes:
        assert "id" in node and "x" in node and "y" in node
        assert node["x"] > 0 and node["y"] > 0
        assert 0 <= node["x"] <= 1920
        assert 0 <= node["y"] <= 1080

    print(f"Composer test: {len(layout_nodes)} nodes, root={props.rootNode.label}")
