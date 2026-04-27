#!/usr/bin/env python3
"""Finalize a Meshy weapon authoring folder into the Hellrush runtime layout."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from finalize_character_asset import resize_image, strip_embedded_images_from_glb, write_json


MAP_SPECS = {
    "baseColor": {
        "candidates": ["base_color.png", "basecolor.png", "albedo.png", "diffuse.png"],
        "runtime": "textures/base_color.webp",
        "colorSpace": "srgb",
        "format": "WEBP",
        "quality": 84,
    },
    "normal": {
        "candidates": ["normal.png", "normal_map.png"],
        "runtime": "textures/normal.png",
        "colorSpace": "linear",
        "format": "PNG",
        "quality": None,
    },
    "roughness": {
        "candidates": ["roughness.png", "rough.png"],
        "runtime": "textures/roughness.webp",
        "colorSpace": "linear",
        "format": "WEBP",
        "quality": 82,
    },
    "metallic": {
        "candidates": ["metallic.png", "metalness.png", "metal.png"],
        "runtime": "textures/metallic.webp",
        "colorSpace": "linear",
        "format": "WEBP",
        "quality": 82,
    },
    "emissive": {
        "candidates": ["emission.png", "emissive.png", "emit.png"],
        "runtime": "textures/emission.webp",
        "colorSpace": "srgb",
        "format": "WEBP",
        "quality": 88,
        "intensity": 1.6,
    },
}


def rel(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def first_existing(folder: Path, names: list[str]) -> Path | None:
    for name in names:
        direct = folder / name
        if direct.exists():
            return direct
    lower = {p.name.lower(): p for p in folder.glob("*") if p.is_file()}
    for name in names:
        if name.lower() in lower:
            return lower[name.lower()]
    return None


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
        except ValueError:
            pass
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a lean runtime weapon asset folder.")
    parser.add_argument("--weapon-dir", required=True, help="assets/weapons/<id>")
    parser.add_argument("--source-glb", default="", help="Authoring GLB. Defaults to first *.glb in authoring/.")
    parser.add_argument("--texture-dir", default="", help="Folder containing Meshy PBR maps. Defaults to authoring/textures then authoring/.")
    parser.add_argument("--id", default="")
    parser.add_argument("--name", default="")
    parser.add_argument("--max-texture", type=int, default=2048)
    parser.add_argument("--keep-embedded-images", action="store_true")
    parser.add_argument("--scale", type=float, default=1.0)
    parser.add_argument("--position", default="0,0,0")
    parser.add_argument("--rotation", default="0,0,0")
    parser.add_argument("--muzzle", default="0,0.02,-1.08")
    parser.add_argument("--spin-target", action="append", default=[])
    args = parser.parse_args()

    weapon_dir = Path(args.weapon_dir).resolve()
    authoring_dir = weapon_dir / "authoring"
    runtime_dir = weapon_dir / "runtime"
    repo_root = weapon_dir.parents[2]
    weapon_id = args.id or weapon_dir.name
    weapon_name = args.name or weapon_id

    source_glb = Path(args.source_glb).resolve() if args.source_glb else next(authoring_dir.glob("*.glb"), None)
    if not source_glb or not source_glb.exists():
        raise SystemExit(f"source GLB not found. Put one in {authoring_dir} or pass --source-glb")

    texture_dir = Path(args.texture_dir).resolve() if args.texture_dir else authoring_dir / "textures"
    if not texture_dir.exists():
        texture_dir = authoring_dir

    model_dst = runtime_dir / "models" / "viewmodel.glb"
    model_dst.parent.mkdir(parents=True, exist_ok=True)
    if args.keep_embedded_images:
        shutil.copy2(source_glb, model_dst)
        model_report = {"source": str(source_glb), "runtime": str(model_dst), "source_bytes": source_glb.stat().st_size, "runtime_bytes": model_dst.stat().st_size, "removed_images": 0}
    else:
        model_report = strip_embedded_images_from_glb(source_glb, model_dst)

    material_maps = {}
    texture_report = {}
    for key, spec in MAP_SPECS.items():
      src = first_existing(texture_dir, spec["candidates"])
      if not src:
          continue
      dst = runtime_dir / spec["runtime"]
      texture_report[key] = resize_image(src, dst, args.max_texture, spec["format"], spec["quality"])
      entry = {"file": f"../{rel(dst, runtime_dir)}", "colorSpace": spec["colorSpace"]}
      if "intensity" in spec:
          entry["intensity"] = spec["intensity"]
      material_maps[key] = entry

    sidecar = {
        "materialName": "WeaponRuntimeMaterial",
        "source": "Finalized Meshy weapon runtime texture set.",
        "maps": material_maps,
        "notes": [
            "Placed beside runtime model so weapon_lab.html and src/game.js can restore external PBR/emissive maps.",
            "Roughness and metalness scalar multipliers should remain 1.0 when maps are present."
        ],
    }
    write_json(runtime_dir / "models" / "material-overrides.json", sidecar)

    def floats(value: str) -> list[float]:
        parts = [float(x.strip()) for x in value.split(",")]
        if len(parts) != 3:
            raise SystemExit(f"expected 3 comma-separated numbers: {value}")
        return parts

    manifest = {
        "version": f"{weapon_id}-runtime-v1",
        "id": weapon_id,
        "name": weapon_name,
        "model": "models/viewmodel.glb",
        "materialOverride": "models/material-overrides.json",
        "attach": {
            "position": floats(args.position),
            "rotation": floats(args.rotation),
            "scale": args.scale,
        },
        "muzzle": floats(args.muzzle),
        "spinTargets": args.spin_target or (["barrel", "rotor", "gatling"] if weapon_id == "heavy" else []),
        "modelSize": {
            "sourceBytes": model_report.get("source_bytes"),
            "runtimeBytes": model_report.get("runtime_bytes"),
            "removedImages": model_report.get("removed_images", 0),
        },
        "textures": {
            key: rel(runtime_dir / MAP_SPECS[key]["runtime"], runtime_dir)
            for key in material_maps
        },
        "maxTexture": args.max_texture,
    }
    write_json(runtime_dir / "runtime-manifest.json", manifest)

    report = {
        "weapon": weapon_id,
        "runtime_dir": str(runtime_dir),
        "model": model_report,
        "textures": texture_report,
        "manifest": str(runtime_dir / "runtime-manifest.json"),
    }
    write_json(runtime_dir / "finalize-report.json", portable(report, repo_root))
    print(json.dumps(portable(report, repo_root), indent=2))


if __name__ == "__main__":
    main()
