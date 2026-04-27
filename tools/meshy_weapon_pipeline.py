#!/usr/bin/env python3
"""Generate a Meshy weapon asset from a concept image and stage it for runtime finalization."""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

import requests


BASE = "https://api.meshy.ai"
OUTPUT_ROOT = Path.cwd() / "meshy_output"
HISTORY_FILE = OUTPUT_ROOT / "history.json"
TEXTURE_FILES = {
    "base_color": "base_color.png",
    "normal": "normal.png",
    "roughness": "roughness.png",
    "metallic": "metallic.png",
    "emission": "emission.png",
}


def session() -> requests.Session:
    s = requests.Session()
    s.trust_env = False
    return s


def get_api_key() -> str:
    key = os.environ.get("MESHY_API_KEY", "")
    if not key:
        env_file = Path(".env")
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                if line.strip().startswith("MESHY_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"')
                    break
    if not key.startswith("msy_"):
        sys.exit("ERROR: MESHY_API_KEY is missing or invalid.")
    return key


def headers(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}"}


def slugify(value: str, fallback: str = "weapon") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return (slug or fallback)[:46]


def image_data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def balance(api_key: str) -> int:
    resp = session().get(f"{BASE}/openapi/v1/balance", headers=headers(api_key), timeout=30)
    resp.raise_for_status()
    return int(resp.json().get("balance", 0))


def create_project_dir(name: str, task_id: str) -> Path:
    OUTPUT_ROOT.mkdir(exist_ok=True)
    project_dir = OUTPUT_ROOT / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{slugify(name)}_{task_id[:8]}"
    project_dir.mkdir(parents=True, exist_ok=True)
    return project_dir


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def update_history(project_dir: Path, prompt: str, task_id: str) -> None:
    history = json.loads(HISTORY_FILE.read_text(encoding="utf-8")) if HISTORY_FILE.exists() else {"version": 1, "projects": []}
    now = datetime.now().isoformat()
    history["projects"].append({
        "folder": project_dir.name,
        "prompt": prompt,
        "task_type": "image-to-3d-weapon",
        "root_task_id": task_id,
        "created_at": now,
        "updated_at": now,
    })
    write_json(HISTORY_FILE, history)


def create_task(api_key: str, endpoint: str, payload: dict) -> str:
    resp = session().post(f"{BASE}{endpoint}", headers=headers(api_key), json=payload, timeout=60)
    if resp.status_code == 402:
        sys.exit(f"ERROR: Insufficient Meshy credits. Current balance: {balance(api_key)}.")
    resp.raise_for_status()
    task_id = resp.json()["result"]
    print(f"TASK_CREATED {endpoint}: {task_id}", flush=True)
    return task_id


def poll_task(api_key: str, endpoint: str, task_id: str, timeout: int = 1200) -> dict:
    elapsed = 0
    delay = 5
    while elapsed < timeout:
        resp = session().get(f"{BASE}{endpoint}/{task_id}", headers=headers(api_key), timeout=60)
        resp.raise_for_status()
        task = resp.json()
        status = task.get("status", "UNKNOWN")
        progress = int(task.get("progress", 0) or 0)
        print(f"[{'#' * (progress // 5):<20}] {progress:3d}% {status} ({elapsed}s)", flush=True)
        if status == "SUCCEEDED":
            return task
        if status in {"FAILED", "CANCELED"}:
            message = task.get("task_error", {}).get("message") or task.get("message") or "unknown task error"
            sys.exit(f"ERROR: task {status}: {message}")
        current_delay = 15 if progress >= 95 else delay
        time.sleep(current_delay)
        elapsed += current_delay
        if progress < 95:
            delay = min(int(delay * 1.5), 30)
    sys.exit(f"ERROR: timed out waiting for {task_id}")


def download(url: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with session().get(url, stream=True, timeout=300) as resp:
        resp.raise_for_status()
        with path.open("wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 512):
                if chunk:
                    f.write(chunk)
    print(f"DOWNLOADED {path} ({path.stat().st_size / (1024 * 1024):.1f} MB)", flush=True)


def download_texture_set(texture_urls: dict, out_dir: Path) -> dict[str, str]:
    files = {}
    for key, filename in TEXTURE_FILES.items():
        url = texture_urls.get(key)
        if not url:
            continue
        path = out_dir / filename
        download(url, path)
        files[key] = str(path)
    return files


def copy_if_exists(src: Path, dst: Path) -> None:
    if src.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def portable(value, repo_root: Path):
    if isinstance(value, dict):
        return {k: portable(v, repo_root) for k, v in value.items()}
    if isinstance(value, list):
        return [portable(v, repo_root) for v in value]
    if isinstance(value, str):
        try:
            p = Path(value)
            if p.is_absolute():
                return p.relative_to(repo_root).as_posix()
        except Exception:
            pass
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a Meshy weapon from a concept image.")
    parser.add_argument("--image", required=True)
    parser.add_argument("--weapon-dir", required=True, help="assets/weapons/<id>")
    parser.add_argument("--id", default="")
    parser.add_argument("--name", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--target-polycount", type=int, default=50000)
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()

    api_key = get_api_key()
    current_balance = balance(api_key)
    estimated = 30
    print("Meshy plan:")
    print("  Image to 3D standard textured GLB with PBR and HD texture: 30 credits")
    print(f"  Estimated total: {estimated} credits")
    print(f"  Current balance: {current_balance} credits")
    if not args.yes:
        sys.exit("Refusing paid calls without --yes.")

    concept = Path(args.image).resolve()
    if not concept.exists():
        sys.exit(f"ERROR: concept not found: {concept}")
    weapon_dir = Path(args.weapon_dir).resolve()
    repo_root = weapon_dir.parents[2]
    weapon_id = args.id or weapon_dir.name

    payload = {
        "image_url": image_data_uri(concept),
        "model_type": "standard",
        "ai_model": "latest",
        "topology": "triangle",
        "target_polycount": args.target_polycount,
        "should_remesh": True,
        "save_pre_remeshed_model": True,
        "should_texture": True,
        "enable_pbr": True,
        "hd_texture": True,
        "image_enhancement": False,
        "remove_lighting": True,
        "target_formats": ["glb"],
    }

    task_id = create_task(api_key, "/openapi/v1/image-to-3d", payload)
    project_dir = create_project_dir(args.name, task_id)
    update_history(project_dir, args.prompt, task_id)
    references_dir = project_dir / "references"
    references_dir.mkdir(parents=True, exist_ok=True)
    project_reference = references_dir / f"source{concept.suffix.lower() or '.png'}"
    shutil.copy2(concept, project_reference)

    task = poll_task(api_key, "/openapi/v1/image-to-3d", task_id)
    model_urls = task.get("model_urls", {})
    glb_url = model_urls.get("glb")
    if not glb_url:
        sys.exit(f"ERROR: task succeeded without glb URL. model_urls={model_urls}")
    authoring_glb = project_dir / "authoring.glb"
    download(glb_url, authoring_glb)
    pre_remeshed = project_dir / "pre-remeshed.glb"
    if model_urls.get("pre_remeshed_glb"):
        download(model_urls["pre_remeshed_glb"], pre_remeshed)

    texture_files = download_texture_set((task.get("texture_urls") or [{}])[0], project_dir / "textures")
    if task.get("thumbnail_url"):
        download(task["thumbnail_url"], project_dir / "thumbnail.png")

    authoring_dir = weapon_dir / "authoring"
    reference_dir = weapon_dir / "references"
    authoring_dir.mkdir(parents=True, exist_ok=True)
    reference_dir.mkdir(parents=True, exist_ok=True)
    copy_if_exists(project_reference, reference_dir / concept.name)
    copy_if_exists(authoring_glb, authoring_dir / f"{weapon_id}-meshy-authoring.glb")
    copy_if_exists(pre_remeshed, authoring_dir / f"{weapon_id}-meshy-pre-remeshed.glb")
    for filename in TEXTURE_FILES.values():
        copy_if_exists(project_dir / "textures" / filename, authoring_dir / "textures" / filename)

    metadata = {
        "id": weapon_id,
        "name": args.name,
        "prompt": args.prompt,
        "concept": str(concept),
        "imageTo3dTaskId": task_id,
        "meshyProject": str(project_dir),
        "createdAt": datetime.now().isoformat(),
        "generationPayload": {**payload, "image_url": "<reference image embedded as data URI>"},
        "authoringGlb": str(authoring_dir / f"{weapon_id}-meshy-authoring.glb"),
        "preRemeshedGlb": str(authoring_dir / f"{weapon_id}-meshy-pre-remeshed.glb") if pre_remeshed.exists() else None,
        "textures": {k: str(v) for k, v in texture_files.items()},
        "rawTask": task,
        "notes": [
            "Weapon generated from a square concept image. Finalize into runtime with tools/finalize_weapon_asset.py.",
        ],
    }
    write_json(project_dir / "metadata.json", metadata)
    write_json(authoring_dir / f"{weapon_id}-meshy.metadata.json", portable(metadata, repo_root))
    print(json.dumps(portable(metadata, repo_root), indent=2), flush=True)


if __name__ == "__main__":
    main()
