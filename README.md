# Phantom

**AI-generated animated explanations of code.** Paste any function and Phantom produces a cinematic [Remotion](https://remotion.dev) animation of what it actually does when it runs — recursion trees unfolding, control flow branching, variables mutating step by step.

Built for engineers who learn visually. Inspired by [3Blue1Brown](https://www.3blue1brown.com/).

https://github.com/user-attachments/assets/placeholder

---

## How it works

Phantom is a multi-stage pipeline that transforms source code into narrated animations:

```
  Your code
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  1. Parser         tree-sitter AST + metadata           │
│  2. Analyzer       Claude Opus reasons about the code   │
│  3. Planner        picks template + fills parameters    │
│  4. Composer       generates validated Remotion props   │
│  5. Narrator       Claude Haiku writes timed captions   │
│  6. Renderer       Remotion produces MP4 + poster       │
└─────────────────────────────────────────────────────────┘
    │
    ▼
  Animated explanation with step-by-step narration
```

**The key design decision:** the LLM never generates Remotion code from scratch. Instead, Phantom ships hand-crafted animation templates (recursion trees, control flow, sorting, etc.) and the LLM's job is to *pick a template and fill in its parameters* — a constrained, structured task it does reliably.

If no template matches the code, it falls back to `ControlFlowBranch` — a generic step-through animation with variable state panels. Never a blank screen.

---

## Project structure

```
phantom/
├── apps/
│   ├── web/                     # Next.js web app (paste code, watch animation)
│   │   ├── app/
│   │   │   ├── page.tsx         # Landing page with code editor
│   │   │   ├── v/[id]/         # Shareable animation viewer
│   │   │   └── api/            # Generate + status endpoints
│   │   └── components/         # UI components
│   └── renderer/               # Node.js rendering worker (BullMQ + Remotion)
│
├── packages/
│   ├── animations/             # Remotion templates + primitives
│   │   └── src/
│   │       ├── templates/      # RecursionTree, ControlFlowBranch, ...
│   │       └── primitives/     # AnimatedTree, Caption, CodeHighlight, ...
│   ├── engine/                 # Python AI pipeline (parser → analyzer → planner → composer → narrator)
│   │   └── src/phantom_engine/
│   └── shared/                 # TypeScript types shared across packages
│
├── turbo.json                  # Turborepo config
├── pnpm-workspace.yaml         # pnpm workspaces
└── package.json
```

---

## Animation templates

Each template is a hand-crafted Remotion composition with typed props. The AI pipeline selects and parameterizes them.

| Template | What it visualizes | Code types |
|---|---|---|
| **RecursionTree** | Binary tree unfolding with duplicate-call highlighting | Recursive functions (fibonacci, factorial, tree traversal) |
| **ControlFlowBranch** | Step-by-step execution with variable state, code highlighting, and concept shapes | Everything else — generic fallback that works for any code |

### Concept shapes (within ControlFlowBranch)

The ControlFlowBranch template renders specialized SVG visualizations based on what the code does:

- **Recursive function** — nested call frames stacking
- **Sorting algorithm** — bars swapping and comparing
- **Async/concurrent** — parallel timeline lanes
- **React/components** — component tree hierarchy
- **Tree traversal** — binary tree with progressive node visits
- **Hash map / dictionary** — bucket slots with collision chaining
- **Class definition** — UML-style class box with fields and methods
- **Heap / graph** — connected nodes with weighted edges
- **Dynamic programming** — grid/table filling progressively

### Reusable primitives

| Primitive | Purpose |
|---|---|
| `AnimatedTree` | Renders tree structures with spring animations and edge drawing |
| `AnimatedArray` | Array visualization with element highlighting and swaps |
| `Caption` | Timed narration text with optional subtext |
| `CodeHighlight` | Syntax-highlighted code block with active line indicator |
| `VariablePanel` | Key-value display of variable state at each step |

---

## Tech stack

| Layer | Technology |
|---|---|
| **Monorepo** | Turborepo + pnpm workspaces |
| **Web app** | Next.js 15, React 19, Tailwind CSS v4, TypeScript |
| **Animations** | Remotion 4, React, SVG |
| **AI pipeline** | Python 3.12, Anthropic SDK, Pydantic v2 |
| **Models** | Claude Opus 4.6 (analysis + planning), Claude Haiku 4.5 (narration) |
| **Rendering** | `@remotion/renderer`, BullMQ job queue |
| **Playback** | `@remotion/player` (browser-side) |

---

## Getting started

### Prerequisites

- **Node.js** 20+
- **pnpm** 9+
- **Python** 3.12+
- **uv** (Python package manager) — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **Anthropic API key** — get one at [console.anthropic.com](https://console.anthropic.com)

### 1. Clone and install

```bash
git clone https://github.com/your-username/phantom.git
cd phantom
pnpm install
```

### 2. Set up the Python engine

```bash
cd packages/engine
uv sync
```

### 3. Configure environment

Create `apps/web/.env.local`:

```env
ANTHROPIC_API_KEY=sk-ant-...
ENGINE_URL=http://localhost:8000
RENDERER_URL=http://localhost:3001
```

### 4. Run the development servers

In separate terminals:

```bash
# Terminal 1: Engine (Python API)
cd packages/engine
uv run uvicorn phantom_engine.server:app --reload --port 8000

# Terminal 2: Renderer worker
cd apps/renderer
pnpm dev

# Terminal 3: Web app
cd apps/web
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), paste a function, and click Generate.

---

## How the AI pipeline works

### Stage 1 — Parser

Uses [tree-sitter](https://tree-sitter.github.io/) to parse source code into an AST. Extracts function signatures, control flow patterns, recursive calls, and metadata. Supports Python, TypeScript, JavaScript, C#, and Rust.

### Stage 2 — Semantic Analyzer

Sends the parsed AST + raw source to **Claude Opus 4.6** with structured output. The model reasons about *what the code conceptually does* and produces a `VisualizationIntent`:

```json
{
  "code_type": "recursive_function",
  "language": "python",
  "entry_point": "fibonacci",
  "sample_input": 5,
  "notable_patterns": ["binary_recursion", "overlapping_subproblems"],
  "time_complexity": "O(2^n)",
  "space_complexity": "O(n)",
  "key_insight": "Each call branches into two subcalls, creating exponential work"
}
```

### Stage 3 — Scene Planner

Takes the `VisualizationIntent` and selects the best animation template from the registry. Outputs a `ScenePlan` with the template ID and structured parameters. Falls back to `ControlFlowBranch` if no specialized template matches.

### Stage 4 — Composer

Validates the planner output against the template's Zod schema (shared between Python and TypeScript via `packages/shared`). Produces the final Remotion props JSON. This catches AI hallucinations before they reach the renderer.

### Stage 5 — Narrator

Sends the scene plan to **Claude Haiku 4.5** to generate timed narration captions. Each caption has a start time, end time, phase label, and text that syncs with the animation beats.

### Stage 6 — Renderer

A Node.js worker picks up the job from a BullMQ queue, runs `@remotion/renderer` to produce an MP4 and poster PNG, and uploads to cloud storage. The web app polls for completion and displays the result.

---

## The viewer page

The `/v/[id]` viewer is a three-zone layout designed for learning:

**Left (60%)** — Remotion Player with speed controls (0.5x / 1x / 1.5x / 2x)

**Right (40%)** — Interactive explanation panel:
- Step-by-step timeline synced to animation frames (click any step to jump there)
- Variable state table showing current values at each step
- Code snippet with highlighted active line
- Complexity badges and key insight card
- AI chat for follow-up questions about the code

The panel uses frame-math sync (`currentFrame / FRAMES_PER_STEP`) for precise animation-to-explanation alignment.

---


## Architecture decisions

**Why Remotion over Motion Canvas?**
Remotion has active maintenance (2026), Lambda parallel rendering, a React-based API, and a large ecosystem. Motion Canvas is effectively unmaintained.

**Why templates instead of LLM-generated code?**
LLMs are unreliable at generating complex Remotion compositions from scratch. Templates are hand-crafted for quality, and the LLM fills in parameters — a constrained task it does consistently well.

**Why two Claude models?**
Opus for analysis and planning (needs deep reasoning about code semantics). Haiku for narration (fast, cheap, good enough for caption text). This keeps costs ~$0.05-0.15 per generation.

**Why frame-math sync instead of timestamps?**
The animation runs at 30fps with a fixed `FRAMES_PER_STEP = 72` (2.4s per step). Deriving the active step from `Math.floor(currentFrame / 72)` is frame-perfect and doesn't depend on narration timing data, which can drift.

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run type checks: `npx tsc --noEmit` in both `apps/web` and `packages/animations`
5. Submit a pull request

### Adding a new animation template

1. Create a new file in `packages/animations/src/templates/`
2. Export the component and a default props constant
3. Add the Zod schema to `packages/shared/src/types.ts`
4. Register the composition in `packages/animations/src/Root.tsx`
5. Add a player wrapper in `apps/web/components/AnimationPlayer.tsx`
6. Update the engine's planner to recognize the new code type

---

## License

MIT
