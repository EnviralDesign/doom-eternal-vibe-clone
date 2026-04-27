#!/usr/bin/env python3
"""Promote a base texture image into the project PBR texture folder layout.

This wraps the Comfy/Chord runner so the normal flow is:
1. Generate or choose a base image.
2. Run this script with --slug and --base-image.
3. Inspect the result in texture_lab.html.
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKFLOW = ROOT / ".tmp" / "chord_image_to_material.json"
DEFAULT_MANIFEST = ROOT / "assets" / "textures" / "manifest.json"


def save_base_image(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as img:
        img = img.convert("RGB")
        img.save(dst, "PNG", optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a repo-local PBR texture set from a base image.")
    parser.add_argument("--slug", required=True, help="Material id and folder name, e.g. cracked-argent-stone")
    parser.add_argument("--name", help="Display name for texture_lab.html")
    parser.add_argument("--base-image", required=True, type=Path, help="Generated/selected base texture image")
    parser.add_argument("--workflow", type=Path, default=DEFAULT_WORKFLOW, help="Comfy API workflow JSON")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST, help="Texture lab manifest")
    parser.add_argument("--timeout", type=float, default=900)
    parser.add_argument("--keep-workflow-copy", action="store_true")
    args = parser.parse_args()

    slug = args.slug.strip().replace(" ", "-").lower()
    source_dir = ROOT / "assets" / "textures" / slug / "source"
    base_path = source_dir / f"{slug}_base.png"
    save_base_image(args.base_image, base_path)

    cmd = [
        str(Path(__import__("sys").executable)),
        str(ROOT / "tools" / "comfy_pbr_texture.py"),
        "--workflow", str(args.workflow),
        "--input", str(base_path),
        "--output-dir", str(source_dir),
        "--slug", slug,
        "--name", args.name or slug.replace("-", " ").title(),
        "--update-manifest", str(args.manifest),
        "--timeout", str(args.timeout),
    ]
    if args.keep_workflow_copy:
        cmd.append("--keep-workflow-copy")
    return subprocess.call(cmd, cwd=ROOT)


if __name__ == "__main__":
    raise SystemExit(main())
