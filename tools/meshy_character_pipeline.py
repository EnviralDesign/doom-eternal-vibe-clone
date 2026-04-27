#!/usr/bin/env python3
"""Meshy character pipeline for Hellrush assets.

Creates a high-fidelity textured character from a concept image, optionally rigs it,
downloads walking/running GLBs and PBR maps, and mirrors outputs into assets/characters.

Paid Meshy calls require --yes.
"""

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


def get_api_key() -> str:
    key = os.environ.get("MESHY_API_KEY", "")
    if not key:
        sys.exit("ERROR: MESHY_API_KEY is not set.")
    if not key.startswith("msy_"):
        sys.exit("ERROR: MESHY_API_KEY exists but does not start with msy_.")
    return key


def session() -> requests.Session:
    s = requests.Session()
    s.trust_env = False
    return s


def headers(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}"}


def slugify(value: str, fallback: str = "meshy-character") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return (slug or fallback)[:42]


def image_data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{data}"


def balance(api_key: str) -> int:
    resp = session().get(f"{BASE}/openapi/v1/balance", headers=headers(api_key), timeout=30)
    resp.raise_for_status()
    return int(resp.json().get("balance", 0))


def create_project_dir(name: str, task_id: str) -> Path:
    OUTPUT_ROOT.mkdir(exist_ok=True)
    folder = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{slugify(name)}_{task_id[:8]}"
    project_dir = OUTPUT_ROOT / folder
    project_dir.mkdir(parents=True, exist_ok=True)
    return project_dir


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def update_history(project_dir: Path, prompt: str, root_task_id: str) -> None:
    if HISTORY_FILE.exists():
        history = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    else:
        history = {"version": 1, "projects": []}
    folder = project_dir.name
    now = datetime.now().isoformat()
    existing = next((p for p in history["projects"] if p["folder"] == folder), None)
    if existing:
        existing["updated_at"] = now
    else:
        history["projects"].append(
            {
                "folder": folder,
                "prompt": prompt,
                "task_type": "image-to-3d-character",
                "root_task_id": root_task_id,
                "created_at": now,
                "updated_at": now,
            }
        )
    write_json(HISTORY_FILE, history)


def create_task(api_key: str, endpoint: str, payload: dict) -> str:
    resp = session().post(f"{BASE}{endpoint}", headers=headers(api_key), json=payload, timeout=60)
    if resp.status_code == 401:
        sys.exit("ERROR: Invalid Meshy API key.")
    if resp.status_code == 402:
        sys.exit(f"ERROR: Insufficient Meshy credits. Current balance: {balance(api_key)}.")
    if resp.status_code == 429:
        sys.exit("ERROR: Meshy rate limited this request. Wait and retry.")
    resp.raise_for_status()
    task_id = resp.json()["result"]
    print(f"TASK_CREATED {endpoint}: {task_id}", flush=True)
    return task_id


def poll_task(api_key: str, endpoint: str, task_id: str, timeout: int = 900) -> dict:
    elapsed = 0
    delay = 5
    poll = 0
    while elapsed < timeout:
        poll += 1
        resp = session().get(f"{BASE}{endpoint}/{task_id}", headers=headers(api_key), timeout=60)
        resp.raise_for_status()
        task = resp.json()
        status = task.get("status", "UNKNOWN")
        progress = int(task.get("progress", 0) or 0)
        bar = "#" * (progress // 5)
        print(f"[{bar:<20}] {progress:3d}% {status} ({elapsed}s, poll {poll})", flush=True)
        if status == "SUCCEEDED":
            return task
        if status in {"FAILED", "CANCELED"}:
            error = task.get("task_error", {}).get("message") or task.get("message") or "Unknown task error"
            sys.exit(f"ERROR: task {status}: {error}")
        current_delay = 15 if progress >= 95 else delay
        time.sleep(current_delay)
        elapsed += current_delay
        if progress < 95:
            delay = min(int(delay * 1.5), 30)
    sys.exit(f"ERROR: Timed out waiting for {task_id}")


def download(url: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with session().get(url, stream=True, timeout=300) as resp:
        resp.raise_for_status()
        with path.open("wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 512):
                if chunk:
                    f.write(chunk)
    print(f"DOWNLOADED {path} ({path.stat().st_size / (1024 * 1024):.1f} MB)", flush=True)


def copy_if_exists(src: Path, dst: Path) -> None:
    if src.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


TEXTURE_FILES = {
    "base_color": "base_color.png",
    "normal": "normal.png",
    "roughness": "roughness.png",
    "metallic": "metallic.png",
    "emission": "emission.png",
}


def download_texture_set(texture_urls: dict, out_dir: Path) -> dict:
    files = {}
    for key, filename in TEXTURE_FILES.items():
        url = texture_urls.get(key)
        if not url:
            continue
        path = out_dir / filename
        download(url, path)
        files[key] = str(path)
    return files


def write_material_overrides(root_dir: Path, texture_prefix: str = "textures") -> None:
    maps = {
        "baseColor": {"file": f"{texture_prefix}/base_color.png", "colorSpace": "srgb"},
        "normal": {"file": f"{texture_prefix}/normal.png", "colorSpace": "linear"},
        "roughness": {"file": f"{texture_prefix}/roughness.png", "colorSpace": "linear"},
        "metallic": {"file": f"{texture_prefix}/metallic.png", "colorSpace": "linear"},
        "emissive": {"file": f"{texture_prefix}/emission.png", "colorSpace": "srgb", "intensity": 1.8},
    }
    available = {}
    for key, spec in maps.items():
        if (root_dir / spec["file"]).exists():
            available[key] = spec
    write_json(
        root_dir / "material-overrides.json",
        {
            "materialName": "Material_1",
            "source": "Meshy image-to-3d texture_urls",
            "maps": available,
            "notes": [
                "Sidecar restores PBR/emissive maps for rigged/animated GLBs if Meshy rigging export flattens material bindings.",
            ],
        },
    )


def public_asset_metadata(metadata: dict, project_dir: Path) -> dict:
    files = metadata.get("files", {})
    raw = metadata.get("raw_tasks", {})
    image_task = raw.get("image_to_3d", {})
    rig_task = raw.get("rigging", {})
    payload = dict(metadata.get("generation_payload", {}))
    if "image_url" in payload:
        payload["image_url"] = "<stored in references/source image>"
    return {
        "name": metadata.get("name", "character"),
        "created_at": metadata.get("created_at"),
        "source_project_dir": str(project_dir),
        "concept": metadata.get("concept"),
        "references": metadata.get("references", {}),
        "image_to_3d_task_id": metadata.get("image_to_3d_task_id"),
        "rig_task_id": metadata.get("rig_task_id"),
        "target_polycount": metadata.get("target_polycount"),
        "model_type": metadata.get("model_type"),
        "generation_payload": payload,
        "source_files": {
            key: str(value) for key, value in files.items()
        },
        "consumed_credits": {
            "image_to_3d": image_task.get("consumed_credits"),
            "rigging": rig_task.get("consumed_credits"),
        },
        "mesh_summary": {
            "image_to_3d_status": image_task.get("status"),
            "rigging_status": rig_task.get("status"),
            "texture_maps": sorted((image_task.get("texture_urls") or [{}])[0].keys()),
            "animation_outputs": sorted((rig_task.get("result", {}).get("basic_animations") or {}).keys()),
        },
        "notes": metadata.get("notes", []),
    }


def run_character_pipeline(args: argparse.Namespace) -> None:
    api_key = get_api_key()
    current_balance = balance(api_key)
    concept = Path(args.image).resolve()
    if not concept.exists():
        sys.exit(f"ERROR: concept image not found: {concept}")

    estimated = 35 if args.rig else 30
    print("Meshy plan:")
    print(f"  Image to 3D {args.model_type} textured GLB: 30 credits")
    if args.rig:
        print("  Auto-rig, including walking/running animations: 5 credits")
    print(f"  Estimated total: {estimated} credits")
    print(f"  Current balance: {current_balance} credits")
    if not args.yes:
        sys.exit("Refusing paid calls without --yes.")

    payload = {
        "image_url": image_data_uri(concept),
        "model_type": args.model_type,
        "ai_model": "latest",
        "topology": "triangle",
        "target_polycount": args.target_polycount,
        "should_remesh": True,
        "save_pre_remeshed_model": True,
        "should_texture": True,
        "enable_pbr": True,
        "hd_texture": args.hd_texture,
        "image_enhancement": args.image_enhancement,
        "remove_lighting": True,
        "pose_mode": "a-pose",
        "symmetry_mode": args.symmetry_mode,
        "target_formats": ["glb"],
    }
    if args.texture_prompt:
        payload["texture_prompt"] = args.texture_prompt

    image_task_id = create_task(api_key, "/openapi/v1/image-to-3d", payload)
    project_dir = create_project_dir(args.name, image_task_id)
    references_dir = project_dir / "references"
    references_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(concept, references_dir / f"source{concept.suffix.lower() or '.png'}")
    update_history(project_dir, args.name, image_task_id)

    image_task = poll_task(api_key, "/openapi/v1/image-to-3d", image_task_id)
    glb_url = image_task.get("model_urls", {}).get("glb")
    if not glb_url:
        sys.exit(f"ERROR: Image task succeeded without model_urls.glb. Keys: {list(image_task.get('model_urls', {}).keys())}")
    model_path = project_dir / "authoring.glb"
    download(glb_url, model_path)
    pre_remeshed_url = image_task.get("model_urls", {}).get("pre_remeshed_glb")
    pre_remeshed_path = project_dir / "pre-remeshed.glb"
    if pre_remeshed_url:
        download(pre_remeshed_url, pre_remeshed_path)

    texture_files = {}
    texture_set = (image_task.get("texture_urls") or [{}])[0]
    if texture_set:
        texture_files = download_texture_set(texture_set, project_dir / "textures")
        write_material_overrides(project_dir)

    metadata = {
        "name": args.name,
        "created_at": datetime.now().isoformat(),
        "concept": str(concept),
        "references": {
            "source_image": str(references_dir / f"source{concept.suffix.lower() or '.png'}"),
        },
        "image_to_3d_task_id": image_task_id,
        "generation_payload": payload,
        "model_type": args.model_type,
        "target_polycount": args.target_polycount,
        "files": {"authoring": str(model_path)},
        "raw_tasks": {"image_to_3d": image_task},
        "notes": [
            "High-fidelity authoring path: generate standard/PBR/high-detail first, then optimize downstream in the runtime finalizer.",
        ],
    }
    if pre_remeshed_url:
        metadata["files"]["pre_remeshed"] = str(pre_remeshed_path)
    if texture_files:
        metadata["files"]["textures"] = texture_files
        metadata["files"]["material_overrides"] = str(project_dir / "material-overrides.json")

    if image_task.get("thumbnail_url"):
        try:
            download(image_task["thumbnail_url"], project_dir / "thumbnail.png")
            metadata["files"]["thumbnail"] = str(project_dir / "thumbnail.png")
        except Exception as exc:  # noqa: BLE001
            print(f"WARN thumbnail download failed: {exc}", flush=True)

    if args.rig:
        rig_id = create_task(
            api_key,
            "/openapi/v1/rigging",
            {"input_task_id": image_task_id, "height_meters": args.height_meters},
        )
        rig_task = poll_task(api_key, "/openapi/v1/rigging", rig_id)
        result = rig_task.get("result", {})

        rigged_url = result.get("rigged_character_glb_url")
        walking_url = result.get("basic_animations", {}).get("walking_glb_url")
        running_url = result.get("basic_animations", {}).get("running_glb_url")
        if rigged_url:
            rigged_path = project_dir / "rigged.glb"
            download(rigged_url, rigged_path)
            metadata["files"]["rigged"] = str(rigged_path)
        if walking_url:
            walking_path = project_dir / "walking.glb"
            download(walking_url, walking_path)
            metadata["files"]["walking"] = str(walking_path)
        if running_url:
            running_path = project_dir / "running.glb"
            download(running_url, running_path)
            metadata["files"]["running"] = str(running_path)
        metadata["rig_task_id"] = rig_id
        metadata["raw_tasks"]["rigging"] = rig_task

    write_json(project_dir / "metadata.json", metadata)

    if args.asset_dir:
        asset_dir = Path(args.asset_dir).resolve()
        asset_refs = asset_dir / "references"
        asset_refs.mkdir(parents=True, exist_ok=True)
        copy_if_exists(references_dir / f"source{concept.suffix.lower() or '.png'}", asset_refs / f"source{concept.suffix.lower() or '.png'}")
        copy_if_exists(model_path, asset_dir / "ember-runt-authoring.glb")
        copy_if_exists(pre_remeshed_path, asset_dir / "ember-runt-pre-remeshed.glb")
        copy_if_exists(project_dir / "rigged.glb", asset_dir / "ember-runt-rigged.glb")
        copy_if_exists(project_dir / "walking.glb", asset_dir / "ember-runt-walking.glb")
        copy_if_exists(project_dir / "running.glb", asset_dir / "ember-runt-running.glb")
        copy_if_exists(project_dir / "thumbnail.png", asset_dir / "thumbnail.png")
        if texture_files:
            for filename in TEXTURE_FILES.values():
                copy_if_exists(project_dir / "textures" / filename, asset_dir / "textures" / filename)
            write_material_overrides(asset_dir)
        write_json(asset_dir / "metadata.json", public_asset_metadata(metadata, project_dir))
        print(f"ASSET_DIR {asset_dir}", flush=True)

    print(f"PROJECT_DIR {project_dir}", flush=True)
    print(f"BALANCE_AFTER {balance(api_key)}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Meshy character generation for Hellrush.")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("balance", help="Check Meshy balance without spending credits.")

    character = sub.add_parser("image-character", help="Create a textured character from a concept image.")
    character.add_argument("--image", required=True)
    character.add_argument("--name", default="ember runt")
    character.add_argument("--model-type", choices=["standard", "lowpoly"], default="standard")
    character.add_argument("--target-polycount", type=int, default=100000)
    character.add_argument("--height-meters", type=float, default=1.75)
    character.add_argument("--texture-prompt", default="")
    character.add_argument("--symmetry-mode", choices=["auto", "on", "off"], default="auto")
    character.add_argument("--image-enhancement", action=argparse.BooleanOptionalAction, default=False)
    character.add_argument("--hd-texture", action=argparse.BooleanOptionalAction, default=True)
    character.add_argument("--asset-dir", default="")
    character.add_argument("--rig", action="store_true")
    character.add_argument("--yes", action="store_true", help="Allow paid Meshy API calls.")

    args = parser.parse_args()
    if args.command == "balance":
        print(json.dumps({"balance": balance(get_api_key())}, indent=2))
    elif args.command == "image-character":
        run_character_pipeline(args)


if __name__ == "__main__":
    main()
