"""
Composer stage — fills RecursionTree Remotion props from a ScenePlan.
Builds the full call tree by tracing actual recursion, then maps it
to flat layout nodes for AnimatedTree.
"""
from __future__ import annotations
from .schemas import ScenePlan, RecursionTreeRemotionProps, TreeNodeProps, PipelineOutput


# ---------------------------------------------------------------------------
# Build the recursion call tree from a simple recursive function
# (works for any binary-recursive function like fib, climbing stairs, etc.)
# ---------------------------------------------------------------------------

def _build_call_tree(
    func_name: str,
    n: int,
    max_depth: int = 6,
    depth: int = 0,
    counter: list[int] | None = None,
    seen: dict[int, int] | None = None,
) -> TreeNodeProps:
    if counter is None:
        counter = [0]
    if seen is None:
        seen = {}

    node_id = f"{func_name}{n}_{counter[0]}"
    counter[0] += 1

    is_base = n <= 1
    is_dup = n in seen and seen[n] > 0

    seen[n] = seen.get(n, 0) + 1

    children: list[TreeNodeProps] = []
    if not is_base and depth < max_depth:
        left = _build_call_tree(func_name, n - 1, max_depth, depth + 1, counter, seen)
        right = _build_call_tree(func_name, n - 2, max_depth, depth + 1, counter, seen)
        children = [left, right]

    return TreeNodeProps(
        id=node_id,
        label=f"{func_name}({n})",
        isDuplicate=is_dup,
        isBase=is_base,
        depth=depth,
        children=children,
    )


# ---------------------------------------------------------------------------
# Lay out tree nodes on a 1920x1080 canvas
# Using Reingold-Tilford style: leaves get min spacing, parents centered
# ---------------------------------------------------------------------------

CANVAS_W = 1920
CANVAS_H = 1080
TOP_MARGIN = 160      # y for root
LEVEL_HEIGHT = 155    # vertical gap between levels
MIN_SPACING = 200     # minimum horizontal spacing between leaf nodes
SIDE_MARGIN = 80      # left/right margin

def _assign_x_positions(node: TreeNodeProps) -> dict[str, float]:
    """
    Assign x positions using a simple post-order traversal.
    Leaves get sequential x positions; parents center over children.
    Returns {node_id: x}
    """
    positions: dict[str, float] = {}
    leaf_counter = [0]

    def assign(n: TreeNodeProps):
        if not n.children:
            # Leaf node
            x = SIDE_MARGIN + leaf_counter[0] * MIN_SPACING + MIN_SPACING / 2
            leaf_counter[0] += 1
            positions[n.id] = x
        else:
            for child in n.children:
                assign(child)
            # Center over children
            child_xs = [positions[c.id] for c in n.children]
            positions[n.id] = (min(child_xs) + max(child_xs)) / 2

    assign(node)

    # Scale x to fit canvas width
    all_x = list(positions.values())
    min_x, max_x = min(all_x), max(all_x)
    span = max(max_x - min_x, 1)
    usable_width = CANVAS_W - 2 * SIDE_MARGIN

    # Scale and center
    for nid in positions:
        raw_x = positions[nid]
        scaled = (raw_x - min_x) / span * usable_width + SIDE_MARGIN
        positions[nid] = scaled

    return positions


def _flatten_tree(
    node: TreeNodeProps,
    parent_id: str | None,
    x_positions: dict[str, float],
    depth: int,
    result: list[dict],
    reveal_counter: list[int],
):
    """Convert tree to flat list of layout node dicts for AnimatedTree."""
    x = x_positions.get(node.id, CANVAS_W / 2)
    y = TOP_MARGIN + depth * LEVEL_HEIGHT

    reveal_frame = 5 + depth * 18 + (reveal_counter[0] % 4) * 7
    reveal_counter[0] += 1

    layout_node = {
        "id": node.id,
        "label": node.label,
        "x": round(x),
        "y": round(y),
        "isDuplicate": node.isDuplicate,
        "isBase": node.isBase,
        "revealFrame": reveal_frame,
    }
    if parent_id:
        layout_node["parentId"] = parent_id

    result.append(layout_node)

    for child in node.children:
        _flatten_tree(child, node.id, x_positions, depth + 1, result, reveal_counter)


def compose(plan: ScenePlan) -> tuple[RecursionTreeRemotionProps, list[dict]]:
    """
    Build Remotion props + layout nodes for the RecursionTree template.
    Returns (RemotionProps, layout_nodes_list)
    """
    if plan.template != "recursion_tree":
        raise ValueError(f"Composer only handles recursion_tree, got: {plan.template}")

    # Get sample input value from template_params
    sample_input = plan.template_params.get("sample_input", 5)
    try:
        n = int(sample_input)
    except (TypeError, ValueError):
        n = 5

    # Cap at 7 to avoid runaway trees
    n = min(n, 7)

    # Build call tree
    root = _build_call_tree(plan.function_name, n)

    # Lay out positions
    x_positions = _assign_x_positions(root)

    # Flatten to layout nodes
    layout_nodes: list[dict] = []
    _flatten_tree(root, None, x_positions, 0, layout_nodes, [0])

    # Build RecursionTreeRemotionProps (just uses root TreeNodeProps)
    props = RecursionTreeRemotionProps(
        title=plan.title,
        functionName=plan.function_name,
        rootNode=root,
    )

    return props, layout_nodes
