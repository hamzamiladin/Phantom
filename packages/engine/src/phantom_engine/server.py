"""
FastAPI HTTP server for the Phantom engine pipeline.
Exposes POST /analyze — takes code, returns scene plan + props.
"""
from __future__ import annotations
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

# Load .env from the package root (packages/engine/.env) before anything else
_env_path = Path(__file__).resolve().parents[2] / ".env"
if _env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path, override=False)
    except ImportError:
        # dotenv not installed — fall back to manual parse
        for line in _env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

from .pipeline import run
from .schemas import PipelineOutput
from .demo import detect_language
from .ask import answer_question

app = FastAPI(title="Phantom Engine", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    code: str
    language: Optional[str] = None
    intent: Optional[str] = "explain"


class AnalyzeResponse(BaseModel):
    template: str
    props: dict
    layout_nodes: list[dict]
    narration: dict
    title: str
    description: str = ""
    time_complexity: str = "O(?)"
    space_complexity: str = "O(?)"
    patterns: list[str] = []
    key_insight: str = ""


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    if not req.code.strip():
        raise HTTPException(status_code=400, detail="code is required")

    # Auto-detect language when not specified — never blindly default to "python"
    lang = req.language or detect_language(req.code)

    try:
        output: PipelineOutput = run(req.code, language=lang)
    except NotImplementedError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {e}")

    vi = getattr(output, "intent", None)
    return AnalyzeResponse(
        template=output.scene_plan.template,
        props=output.remotion_props.model_dump() if hasattr(output.remotion_props, "model_dump") else output.remotion_props,
        layout_nodes=output.layout_nodes,
        narration=output.narration.model_dump(),
        title=output.scene_plan.title,
        description=vi.description if vi else "",
        time_complexity=vi.time_complexity if vi else "O(?)",
        space_complexity=vi.space_complexity if vi else "O(?)",
        patterns=vi.notable_patterns if vi else [],
        key_insight=vi.key_insight if vi else "",
    )


# ---------------------------------------------------------------------------
# /ask — multi-provider AI question answering
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    code: str
    question: str
    context: str = ""


class AskResponse(BaseModel):
    answer: str


@app.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="question is required")
    try:
        answer = answer_question(req.code, req.question, req.context)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ask failed: {e}")
    return AskResponse(answer=answer)


def main():
    import uvicorn
    port = int(os.environ.get("ENGINE_PORT", "8000"))
    uvicorn.run("phantom_engine.server:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
