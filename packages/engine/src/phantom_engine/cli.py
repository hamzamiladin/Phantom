"""
CLI entry point.
Usage: python -m phantom_engine.cli <path-to-source-file>
Output: JSON file written to out/<name>_scene.json
"""
from __future__ import annotations
import json
import sys
from pathlib import Path


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m phantom_engine.cli <path-to-source-file>", file=sys.stderr)
        sys.exit(1)

    source_path = Path(sys.argv[1])
    if not source_path.exists():
        print(f"File not found: {source_path}", file=sys.stderr)
        sys.exit(1)

    try:
        from rich.console import Console
        console = Console()
        console.print(f"[bold cyan]Phantom[/bold cyan] analyzing [yellow]{source_path.name}[/yellow]...")
    except ImportError:
        console = None
        print(f"Analyzing {source_path.name}...")

    try:
        from .pipeline import run
        output = run(source_path)
    except Exception as e:
        msg = f"Pipeline failed: {e}"
        if console:
            console.print(f"[red]{msg}[/red]")
        else:
            print(msg, file=sys.stderr)
        sys.exit(1)

    # Write output
    out_dir = Path("out")
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"{source_path.stem}_scene.json"

    result = {
        "scene_plan": output.scene_plan.model_dump(),
        "remotion_props": output.remotion_props.model_dump(),
        "narration": output.narration.model_dump(),
        "layout_nodes": output.layout_nodes,
    }

    out_path.write_text(json.dumps(result, indent=2))

    if console:
        console.print(f"[green]Done.[/green] Output written to [bold]{out_path}[/bold]")
        console.print(f"[dim]Template: {output.scene_plan.template} | Nodes: {len(output.layout_nodes)}[/dim]")
    else:
        print(f"Output written to {out_path}")

    return 0


if __name__ == "__main__":
    main()
