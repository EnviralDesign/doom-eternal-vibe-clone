#!/usr/bin/env python3
"""Generate and stage static Meshy environment prefabs for Hellrush."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

from finalize_character_asset import resize_image, strip_embedded_images_from_glb, write_json


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

MAP_SPECS = {
    "baseColor": ("base_color.png", "textures/base_color.webp", "srgb", "WEBP", 84),
    "normal": ("normal.png", "textures/normal.png", "linear", "PNG", None),
    "roughness": ("roughness.png", "textures/roughness.webp", "linear", "WEBP", 82),
    "metallic": ("metallic.png", "textures/metallic.webp", "linear", "WEBP", 82),
    "emissive": ("emission.png", "textures/emission.webp", "srgb", "WEBP", 88),
}

ASSETS = [
    {
        "id": "jump-pad",
        "name": "Jump Pad",
        "prompt": "single sci fi hell jump pad game environment prop, circular launch platform, chunky blackened metal base, demonic orange lava cracks, bright green energy ring, no floor, no background, centered standalone asset, physically based material, game ready",
        "polycount": 36000,
        "collision": {"type": "cylinder", "radius": 1.35, "height": 0.32, "center": [0, 0.16, 0], "topY": 0.32},
    },
    {
        "id": "hook-node",
        "name": "Meat Hook Node",
        "prompt": "floating demonic traversal hook node game prop, purple energy crystal core inside metal claw rings, readable grapple target, glowing cyan and violet emissive accents, no stand, no background, centered standalone asset, physically based material",
        "polycount": 30000,
        "collision": {"type": "sphere", "radius": 0.9, "center": [0, 0, 0]},
    },
    {
        "id": "catwalk-center-hub",
        "name": "Catwalk Center Hub",
        "prompt": "square modular hell tech catwalk center hub, 6 meter square platform tile, black gunmetal panels, cyan argent circuitry grooves, orange molten seams, beveled industrial border, top surface walkable, no legs, no background, game environment asset",
        "polycount": 46000,
        "collision": {"type": "box", "center": [0, -0.18, 0], "size": [6.2, 0.36, 6.2], "topY": 0},
    },
    {
        "id": "catwalk-straight-arm",
        "name": "Catwalk Straight Arm",
        "prompt": "long modular hell tech catwalk bridge segment, rectangular 19 by 5 meter platform, black worn metal plates, cyan glowing grooves, orange heat cracks along seams, beveled rails integrated into sides, no supports, no background, game ready",
        "polycount": 52000,
        "collision": {"type": "box", "center": [0, -0.18, 0], "size": [19.1, 0.36, 5.4], "topY": 0},
    },
    {
        "id": "low-hell-cover",
        "name": "Low Hell Cover",
        "prompt": "low rectangular hell arena cover block, jagged obsidian and fused industrial armor, waist high, chipped beveled corners, red lava glowing cracks, readable cover silhouette, no floor, no background, standalone game prop",
        "polycount": 32000,
        "collision": {"type": "box", "center": [0, 0.59, 0], "size": [5.0, 1.18, 2.2], "topY": 1.18},
    },
    {
        "id": "rune-pillar",
        "name": "Rune Pillar",
        "prompt": "octagonal demonic rune pillar environment prop, black obsidian stone and metal bands, vertical purple runes, chipped gothic sci fi edges, about five meters tall, no floor, no background, standalone game asset",
        "polycount": 34000,
        "collision": {"type": "box", "center": [0, 2.35, 0], "size": [1.9, 4.7, 1.9], "topY": 4.7},
    },
    {
        "id": "hell-torch",
        "name": "Hell Torch",
        "prompt": "hell arena torch prop, black metal and bone tripod sconce, orange flame crystal core, emissive lava vents, compact vertical silhouette, no floor, no background, standalone game environment asset",
        "polycount": 28000,
        "collision": {"type": "box", "center": [0, 1.2, 0], "size": [0.8, 2.4, 0.8], "topY": 2.4},
    },
    {
        "id": "moving-lift",
        "name": "Moving Lift",
        "prompt": "square demonic elevator lift platform, 5 meter game platform, heavy black metal slab, orange molten edge vents, blue rune arrows, thick beveled underside machinery, no background, standalone game environment asset",
        "polycount": 44000,
        "collision": {"type": "box", "center": [0, -0.24, 0], "size": [5.5, 0.48, 5.5], "topY": 0},
    },
    {
        "id": "sliding-bridge",
        "name": "Sliding Bridge",
        "prompt": "small sliding bridge platform segment, rectangular 6 by 4 meter hell tech slab, armored metal panels, orange heat seams, cyan edge lights, underside rails, no background, standalone game prop",
        "polycount": 38000,
        "collision": {"type": "box", "center": [0, -0.2, 0], "size": [6.0, 0.4, 4.2], "topY": 0},
    },
    {
        "id": "lava-trench-module",
        "name": "Lava Trench Module",
        "prompt": "rectangular lava trench insert module for arena floor, molten orange lava channel surrounded by broken black stone and metal rim, emissive liquid center, top-down readable, shallow no background standalone game environment asset",
        "polycount": 36000,
        "collision": {"type": "box", "center": [0, -0.08, 0], "size": [8.0, 0.16, 2.8], "topY": 0},
    },
]


def session() -> requests.Session:
    s = requests.Session()
    s.trust_env = False
    return s


def get_api_key() -> str:
    key = os.environ.get("MESHY_API_KEY", "")
    if not key:
        for env_name in [".env", ".env.local"]:
            env_file = Path(env_name)
            if not env_file.exists():
                continue
            for line in env_file.read_text(encoding="utf-8").splitlines():
                if line.strip().startswith("MESHY_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"')
                    break
            if key:
                break
    if not key.startswith("msy_"):
        sys.exit("ERROR: MESHY_API_KEY is missing or invalid.")
    return key


def headers(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}"}


def slugify(value: str, fallback: str = "asset") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return (slug or fallback)[:52]


def balance(api_key: str) -> int:
    resp = session().get(f"{BASE}/openapi/v1/balance", headers=headers(api_key), timeout=30)
    resp.raise_for_status()
    return int(resp.json().get("balance", 0))


def create_project_dir(asset: dict, task_id: str) -> Path:
    OUTPUT_ROOT.mkdir(exist_ok=True)
    project_dir = OUTPUT_ROOT / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{slugify(asset['id'])}_{task_id[:8]}"
    project_dir.mkdir(parents=True, exist_ok=True)
    return project_dir


def update_history(project_dir: Path, asset: dict, preview_task_id: str, refine_task_id: str | None = None) -> None:
    history = json.loads(HISTORY_FILE.read_text(encoding="utf-8")) if HISTORY_FILE.exists() else {"version": 1, "projects": []}
    now = datetime.now().isoformat()
    history["projects"].append({
        "folder": project_dir.name,
        "prompt": asset["prompt"],
        "task_type": "text-to-3d-environment",
        "asset_id": asset["id"],
        "root_task_id": preview_task_id,
        "refine_task_id": refine_task_id,
        "created_at": now,
        "updated_at": now,
    })
    write_json(HISTORY_FILE, history)


def create_task(api_key: str, payload: dict) -> str:
    resp = session().post(f"{BASE}/openapi/v2/text-to-3d", headers=headers(api_key), json=payload, timeout=60)
    if resp.status_code == 402:
        sys.exit(f"ERROR: Insufficient Meshy credits. Current balance: {balance(api_key)}.")
    resp.raise_for_status()
    task_id = resp.json()["result"]
    print(f"TASK_CREATED {payload.get('mode')}: {task_id}", flush=True)
    return task_id


def poll_task(api_key: str, task_id: str, timeout: int = 1500) -> dict:
    elapsed = 0
    delay = 5
    while elapsed < timeout:
        resp = session().get(f"{BASE}/openapi/v2/text-to-3d/{task_id}", headers=headers(api_key), timeout=60)
        resp.raise_for_status()
        task = resp.json()
        status = task.get("status", "UNKNOWN")
        progress = int(task.get("progress", 0) or 0)
        print(f"[{'#' * (progress // 5):<20}] {progress:3d}% {status} {task_id[:8]} ({elapsed}s)", flush=True)
        if status == "SUCCEEDED":
            return task
        if status in {"FAILED", "CANCELED"}:
            message = task.get("task_error", {}).get("message") or task.get("message") or "unknown task error"
            raise RuntimeError(f"task {task_id} {status}: {message}")
        current_delay = 15 if progress >= 95 else delay
        time.sleep(current_delay)
        elapsed += current_delay
        if progress < 95:
            delay = min(int(delay * 1.5), 30)
    raise TimeoutError(f"timed out waiting for {task_id}")


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


def rel(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def portable(value, repo_root: Path):
    if isinstance(value, dict):
        return {k: portable(v, repo_root) for k, v in value.items()}
    if isinstance(value, list):
        return [portable(v, repo_root) for v in value]
    if isinstance(value, str):
        try:
            p = Path(value)
            if p.is_absolute():
                return rel(p, repo_root)
        except Exception:
            pass
    return value


def first_existing(folder: Path, filename: str) -> Path | None:
    direct = folder / filename
    if direct.exists():
        return direct
    lower = {p.name.lower(): p for p in folder.glob("*") if p.is_file()}
    return lower.get(filename.lower())


def promote_asset(asset: dict, project_dir: Path, refine_task: dict, repo_root: Path) -> dict:
    asset_dir = repo_root / "assets" / "environment" / asset["id"]
    source_dir = asset_dir / "source"
    runtime_dir = asset_dir / "runtime"
    source_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir.mkdir(parents=True, exist_ok=True)

    source_glb = project_dir / "refined.glb"
    source_dst = source_dir / f"{asset['id']}-meshy-refined.glb"
    shutil.copy2(source_glb, source_dst)
    pre = project_dir / "preview.glb"
    if pre.exists():
        shutil.copy2(pre, source_dir / f"{asset['id']}-meshy-preview.glb")
    if (project_dir / "thumbnail.png").exists():
        shutil.copy2(project_dir / "thumbnail.png", source_dir / f"{asset['id']}-thumbnail.png")
    for filename in TEXTURE_FILES.values():
        src = project_dir / "textures" / filename
        if src.exists():
            dst = source_dir / "textures" / filename
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)

    model_dst = runtime_dir / "models" / f"{asset['id']}.glb"
    model_report = strip_embedded_images_from_glb(source_dst, model_dst)
    material_maps = {}
    texture_report = {}
    texture_dir = source_dir / "textures"
    for key, (src_name, runtime_name, color_space, fmt, quality) in MAP_SPECS.items():
        src = first_existing(texture_dir, src_name)
        if not src:
            continue
        dst = runtime_dir / runtime_name
        texture_report[key] = resize_image(src, dst, 2048, fmt, quality)
        entry = {"file": f"../{rel(dst, runtime_dir)}", "colorSpace": color_space}
        if key == "emissive":
            entry["intensity"] = 1.35
        material_maps[key] = entry

    sidecar = {
        "materialName": "EnvironmentRuntimeMaterial",
        "source": "Finalized Meshy environment runtime texture set.",
        "maps": material_maps,
        "notes": [
            "External PBR/emissive maps restored by runtime/lab sidecar loading.",
            "Roughness and metalness scalar multipliers should remain 1.0 when maps are present.",
        ],
    }
    write_json(runtime_dir / "models" / "material-overrides.json", sidecar)

    manifest = {
        "version": f"{asset['id']}-runtime-v1",
        "id": asset["id"],
        "name": asset["name"],
        "model": f"models/{asset['id']}.glb",
        "source": f"../source/{asset['id']}-meshy-refined.glb",
        "thumbnail": f"../source/{asset['id']}-thumbnail.png",
        "previewTaskId": refine_task.get("preview_task_id"),
        "refineTaskId": refine_task.get("id"),
        "materialOverride": "models/material-overrides.json",
        "prefab": {
            "visual": {
                "position": [0, 0, 0],
                "rotation": [0, 0, 0],
                "scale": 1,
            },
            "collision": asset["collision"],
        },
        "modelSize": {
            "sourceBytes": model_report.get("source_bytes"),
            "runtimeBytes": model_report.get("runtime_bytes"),
            "removedImages": model_report.get("removed_images", 0),
        },
        "textures": {
            key: rel(runtime_dir / MAP_SPECS[key][1], runtime_dir)
            for key in material_maps
        },
        "maxTexture": 2048,
        "notes": [
            "Generated by tools/meshy_environment_batch.py.",
            "Collision is an initial gameplay proxy; calibrate in runtime_asset_lab.html before final placement.",
        ],
    }
    write_json(runtime_dir / "runtime-manifest.json", manifest)

    report = {
        "asset": asset["id"],
        "runtimeDir": str(runtime_dir),
        "model": model_report,
        "textures": texture_report,
        "manifest": str(runtime_dir / "runtime-manifest.json"),
    }
    write_json(runtime_dir / "finalize-report.json", portable(report, repo_root))
    return report


def run_asset(api_key: str, asset: dict, repo_root: Path) -> dict:
    print(f"\n=== {asset['id']} ===", flush=True)
    preview_payload = {
        "mode": "preview",
        "prompt": asset["prompt"],
        "negative_prompt": "character, creature, person, weapon, hands, text, logo, watermark, background scene, floor plane",
        "art_style": "realistic",
        "should_remesh": True,
        "topology": "triangle",
        "target_polycount": asset.get("polycount", 40000),
        "ai_model": "latest",
        "target_formats": ["glb"],
        "symmetry_mode": "auto",
    }
    preview_task_id = create_task(api_key, preview_payload)
    project_dir = create_project_dir(asset, preview_task_id)
    preview_task = poll_task(api_key, preview_task_id)
    preview_glb = preview_task.get("model_urls", {}).get("glb")
    if not preview_glb:
        raise RuntimeError(f"{asset['id']} preview had no GLB URL")
    download(preview_glb, project_dir / "preview.glb")

    refine_payload = {
        "mode": "refine",
        "preview_task_id": preview_task_id,
        "enable_pbr": True,
        "texture_prompt": "game ready PBR material, blackened metal, obsidian stone, molten orange cracks, cyan or purple emissive accents where appropriate, rough believable surfaces, no baked dramatic lighting",
        "remove_lighting": True,
        "ai_model": "latest",
        "target_formats": ["glb"],
    }
    refine_task_id = create_task(api_key, refine_payload)
    update_history(project_dir, asset, preview_task_id, refine_task_id)
    refine_task = poll_task(api_key, refine_task_id)
    refine_task["preview_task_id"] = preview_task_id
    refined_glb = refine_task.get("model_urls", {}).get("glb")
    if not refined_glb:
        raise RuntimeError(f"{asset['id']} refine had no GLB URL")
    download(refined_glb, project_dir / "refined.glb")
    texture_files = download_texture_set((refine_task.get("texture_urls") or [{}])[0], project_dir / "textures")
    if refine_task.get("thumbnail_url"):
        download(refine_task["thumbnail_url"], project_dir / "thumbnail.png")

    metadata = {
        "id": asset["id"],
        "name": asset["name"],
        "prompt": asset["prompt"],
        "previewTaskId": preview_task_id,
        "refineTaskId": refine_task_id,
        "meshyProject": str(project_dir),
        "createdAt": datetime.now().isoformat(),
        "previewPayload": preview_payload,
        "refinePayload": refine_payload,
        "textures": texture_files,
        "rawPreviewTask": preview_task,
        "rawRefineTask": refine_task,
    }
    write_json(project_dir / "metadata.json", metadata)
    report = promote_asset(asset, project_dir, refine_task, repo_root)
    metadata["promoted"] = portable(report, repo_root)
    write_json(project_dir / "metadata.json", metadata)
    write_json(repo_root / "assets" / "environment" / asset["id"] / "source" / f"{asset['id']}-meshy.metadata.json", portable(metadata, repo_root))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a batch of Meshy environment prefabs.")
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--limit", type=int, default=len(ASSETS))
    parser.add_argument("--only", nargs="*", default=[])
    args = parser.parse_args()

    api_key = get_api_key()
    selected = [a for a in ASSETS if not args.only or a["id"] in args.only][: args.limit]
    estimated = len(selected) * 30
    current_balance = balance(api_key)
    print("Meshy environment batch:")
    for asset in selected:
        print(f"  - {asset['id']}: {asset['name']}")
    print(f"Estimated total: {estimated} credits")
    print(f"Current balance: {current_balance} credits")
    if not args.yes:
        sys.exit("Refusing paid calls without --yes.")
    if current_balance < estimated:
        sys.exit("ERROR: balance is lower than estimated batch cost.")

    repo_root = Path.cwd()
    reports = []
    failures = []
    for asset in selected:
        try:
            reports.append(run_asset(api_key, asset, repo_root))
        except Exception as exc:
            print(f"ERROR {asset['id']}: {exc}", flush=True)
            failures.append({"asset": asset["id"], "error": str(exc)})
    summary = {
        "createdAt": datetime.now().isoformat(),
        "assets": [portable(r, repo_root) for r in reports],
        "failures": failures,
    }
    write_json(repo_root / "assets" / "environment" / "meshy-batch-summary.json", summary)
    print(json.dumps(summary, indent=2), flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
