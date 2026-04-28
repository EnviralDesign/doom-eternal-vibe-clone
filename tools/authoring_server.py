from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8066


class SaveJsonRequest(BaseModel):
    path: str = Field(min_length=1)
    json_data: dict[str, Any] | None = Field(default=None, alias="json")


app = FastAPI(title="Hellrush Authoring Server", docs_url="/api/docs", redoc_url=None)


def resolve_repo_path(raw_path: str) -> tuple[str, Path]:
    clean = raw_path.replace("\\", "/").lstrip("/")
    resolved = (REPO_ROOT / clean).resolve()
    if resolved != REPO_ROOT and REPO_ROOT not in resolved.parents:
        raise HTTPException(status_code=400, detail="Path escapes repository root.")
    return clean, resolved


def allowed_json_save_path(clean: str) -> bool:
    return bool(
        re.fullmatch(r"assets/(environment|weapons|characters)/.+/runtime-manifest\.json", clean)
        or re.fullmatch(r"assets/textures/.+/material\.json", clean)
        or clean == "assets/textures/manifest.json"
        or re.fullmatch(r"assets/levels/[A-Za-z0-9_.-]+\.json", clean)
    )


@app.middleware("http")
async def no_store_static_authoring(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(("/api/", "/__hellrush/")) or request.url.path.endswith((".html", ".js", ".json")):
        response.headers["cache-control"] = "no-store"
    return response


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "repoRoot": str(REPO_ROOT),
        "server": "hellrush-authoring-fastapi",
    }


@app.post("/api/save-json")
@app.post("/__hellrush/save-json")
async def save_json(payload: SaveJsonRequest) -> JSONResponse:
    data = payload.json_data
    if data is None:
        raise HTTPException(status_code=400, detail="Expected request body field 'json'.")
    clean, target = resolve_repo_path(payload.path)
    if not allowed_json_save_path(clean):
        raise HTTPException(status_code=400, detail="Save path is not an allowed authoring JSON target.")

    target.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, indent=2) + "\n"
    target.write_text(text, encoding="utf-8")
    return JSONResponse({"ok": True, "path": clean, "json": data})


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(REPO_ROOT / "index.html")


app.mount("/", StaticFiles(directory=REPO_ROOT, html=True), name="static")


def main() -> None:
    import uvicorn

    host = os.environ.get("HELLRUSH_HOST", DEFAULT_HOST)
    port = int(os.environ.get("HELLRUSH_PORT", DEFAULT_PORT))
    uvicorn.run(
        "tools.authoring_server:app",
        host=host,
        port=port,
        reload=True,
        reload_dirs=[str(REPO_ROOT)],
    )


if __name__ == "__main__":
    main()
