#!/usr/bin/env python3
"""Finalize an authoring character folder into a smaller runtime folder.

The authoring folder keeps Meshy outputs and full-size texture maps. The runtime
folder gets resized/compressed maps, copied animation GLBs, a material override
sidecar for the lab, and a manifest for game integration.
"""

from __future__ import annotations

import argparse
import base64
import struct
import json
import shutil
from pathlib import Path

from PIL import Image


TEXTURE_SPECS = {
    "baseColor": {
        "source": "textures/base_color.png",
        "runtime": "textures/base_color.webp",
        "colorSpace": "srgb",
        "format": "WEBP",
        "quality": 82,
    },
    "normal": {
        "source": "textures/normal.png",
        "runtime": "textures/normal.png",
        "colorSpace": "linear",
        "format": "PNG",
        "quality": None,
    },
    "roughness": {
        "source": "textures/roughness.png",
        "runtime": "textures/roughness.webp",
        "colorSpace": "linear",
        "format": "WEBP",
        "quality": 80,
    },
    "metallic": {
        "source": "textures/metallic.png",
        "runtime": "textures/metallic.webp",
        "colorSpace": "linear",
        "format": "WEBP",
        "quality": 80,
    },
    "emissive": {
        "source": "textures/emission.png",
        "runtime": "textures/emission.webp",
        "colorSpace": "srgb",
        "format": "WEBP",
        "quality": 86,
        "intensity": 1.8,
    },
}

MODEL_SPECS = {
    "rigged": "ember-runt-rigged.glb",
    "walking": "ember-runt-walking.glb",
    "running": "ember-runt-running.glb",
}


GLB_MAGIC = b"glTF"
GLB_VERSION = 2
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def rel(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def align4(data: bytes, pad: bytes) -> bytes:
    extra = (-len(data)) % 4
    return data + pad * extra


def parse_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    if data[:4] != GLB_MAGIC:
        raise ValueError(f"{path} is not a GLB")
    version, _length = struct.unpack_from("<II", data, 4)
    if version != GLB_VERSION:
        raise ValueError(f"{path} uses unsupported GLB version {version}")
    offset = 12
    json_doc = None
    bin_chunk = b""
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset:offset + chunk_length]
        offset += chunk_length
        if chunk_type == JSON_CHUNK:
            json_doc = json.loads(chunk.decode("utf-8").rstrip(" \t\r\n\0"))
        elif chunk_type == BIN_CHUNK:
            bin_chunk = chunk
    if json_doc is None:
        raise ValueError(f"{path} has no JSON chunk")
    return json_doc, bin_chunk


def write_glb(path: Path, json_doc: dict, bin_chunk: bytes) -> None:
    json_bytes = align4(json.dumps(json_doc, separators=(",", ":")).encode("utf-8"), b" ")
    chunks = [
        struct.pack("<II", len(json_bytes), JSON_CHUNK) + json_bytes,
    ]
    if bin_chunk:
        bin_bytes = align4(bin_chunk, b"\0")
        chunks.append(struct.pack("<II", len(bin_bytes), BIN_CHUNK) + bin_bytes)
    total_length = 12 + sum(len(chunk) for chunk in chunks)
    header = GLB_MAGIC + struct.pack("<II", GLB_VERSION, total_length)
    path.write_bytes(header + b"".join(chunks))


def strip_embedded_images_from_glb(src: Path, dst: Path) -> dict:
    json_doc, bin_chunk = parse_glb(src)
    images = json_doc.get("images", [])
    removed_buffer_views = {
        image["bufferView"]
        for image in images
        if "bufferView" in image
    }

    for material in json_doc.get("materials", []):
        pbr = material.get("pbrMetallicRoughness")
        if pbr:
            pbr.pop("baseColorTexture", None)
            pbr.pop("metallicRoughnessTexture", None)
            pbr.setdefault("baseColorFactor", [1, 1, 1, 1])
            pbr.setdefault("metallicFactor", 0)
            pbr.setdefault("roughnessFactor", 1)
        material.pop("normalTexture", None)
        material.pop("occlusionTexture", None)
        material.pop("emissiveTexture", None)
        material.setdefault("emissiveFactor", [0, 0, 0])

    json_doc.pop("images", None)
    json_doc.pop("textures", None)
    json_doc.pop("samplers", None)

    old_views = json_doc.get("bufferViews", [])
    new_views = []
    view_remap = {}
    new_bin = bytearray()
    for old_index, view in enumerate(old_views):
        if old_index in removed_buffer_views:
            continue
        old_offset = int(view.get("byteOffset", 0))
        byte_length = int(view.get("byteLength", 0))
        while len(new_bin) % 4:
            new_bin.append(0)
        new_view = dict(view)
        new_view["byteOffset"] = len(new_bin)
        new_views.append(new_view)
        view_remap[old_index] = len(new_views) - 1
        new_bin.extend(bin_chunk[old_offset:old_offset + byte_length])

    def remap_holder(holder: dict, key: str = "bufferView") -> None:
        if key in holder:
            holder[key] = view_remap[holder[key]]

    for accessor in json_doc.get("accessors", []):
        remap_holder(accessor)
        sparse = accessor.get("sparse")
        if sparse:
            if "indices" in sparse:
                remap_holder(sparse["indices"])
            if "values" in sparse:
                remap_holder(sparse["values"])

    json_doc["bufferViews"] = new_views
    if json_doc.get("buffers"):
        json_doc["buffers"][0]["byteLength"] = len(new_bin)
        json_doc["buffers"][0].pop("uri", None)

    dst.parent.mkdir(parents=True, exist_ok=True)
    write_glb(dst, json_doc, bytes(new_bin))
    return {
        "source": str(src),
        "runtime": str(dst),
        "source_bytes": src.stat().st_size,
        "runtime_bytes": dst.stat().st_size,
        "removed_images": len(images),
        "removed_image_buffer_views": len(removed_buffer_views),
    }


def resize_image(src: Path, dst: Path, max_size: int, fmt: str, quality: int | None) -> dict:
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as img:
        original = img.size
        img = img.convert("RGBA" if img.mode in {"RGBA", "LA"} else "RGB")
        if max(img.size) > max_size:
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        save_kwargs = {}
        if fmt == "WEBP":
            save_kwargs.update({"quality": quality or 82, "method": 6})
        elif fmt == "PNG":
            save_kwargs.update({"optimize": True, "compress_level": 9})
        img.save(dst, fmt, **save_kwargs)
        return {
            "source": str(src),
            "runtime": str(dst),
            "original_size": f"{original[0]}x{original[1]}",
            "runtime_size": f"{img.size[0]}x{img.size[1]}",
            "source_bytes": src.stat().st_size,
            "runtime_bytes": dst.stat().st_size,
        }


def copy_model(src: Path, dst: Path, strip_embedded_images: bool) -> dict:
    if strip_embedded_images:
        return strip_embedded_images_from_glb(src, dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return {"source": str(src), "runtime": str(dst), "source_bytes": src.stat().st_size, "runtime_bytes": dst.stat().st_size}


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def portable_report_paths(report: dict, repo_root: Path) -> dict:
    def portable(value):
        if isinstance(value, dict):
            return {key: portable(item) for key, item in value.items()}
        if isinstance(value, list):
            return [portable(item) for item in value]
        if isinstance(value, str):
            try:
                path = Path(value)
                if path.is_absolute():
                    return rel(path, repo_root)
            except (ValueError, OSError):
                pass
        return value

    return portable(report)


def main() -> None:
    parser = argparse.ArgumentParser(description="Finalize a character asset folder for runtime use.")
    parser.add_argument("--character-dir", required=True)
    parser.add_argument("--runtime-dir", default="")
    parser.add_argument("--max-texture", type=int, default=1024)
    parser.add_argument("--keep-embedded-images", action="store_true")
    args = parser.parse_args()

    character_dir = Path(args.character_dir).resolve()
    runtime_dir = Path(args.runtime_dir).resolve() if args.runtime_dir else character_dir / "runtime"
    if not character_dir.exists():
        raise SystemExit(f"character directory not found: {character_dir}")

    source_meta = load_json(character_dir / "metadata.json")
    report = {
        "name": source_meta.get("name", character_dir.name),
        "authoring_dir": str(character_dir),
        "runtime_dir": str(runtime_dir),
        "references": source_meta.get("references", {}),
        "max_texture": args.max_texture,
        "models": {},
        "textures": {},
        "notes": [
            "Runtime GLBs have embedded Meshy rigging-export images stripped by default; external texture sidecars restore PBR/emissive maps in the lab/runtime loader.",
        ],
    }

    for key, filename in MODEL_SPECS.items():
        src = character_dir / filename
        if src.exists():
            report["models"][key] = copy_model(src, runtime_dir / "models" / filename, not args.keep_embedded_images)

    material_maps = {}
    for key, spec in TEXTURE_SPECS.items():
        src = character_dir / spec["source"]
        if not src.exists():
            continue
        dst = runtime_dir / spec["runtime"]
        report["textures"][key] = resize_image(src, dst, args.max_texture, spec["format"], spec["quality"])
        entry = {"file": f"../{rel(dst, runtime_dir)}", "colorSpace": spec["colorSpace"]}
        if "intensity" in spec:
            entry["intensity"] = spec["intensity"]
        material_maps[key] = entry

    sidecar = {
        "materialName": "Material_1",
        "source": "Finalized runtime texture set generated from authoring Meshy maps.",
        "maps": material_maps,
        "notes": [
            "Placed beside runtime models so character_lab.html can restore PBR/emissive maps for rigged/animated GLBs.",
        ],
    }
    write_json(runtime_dir / "models" / "material-overrides.json", sidecar)

    runtime_manifest = {
        "name": report["name"],
        "references": report["references"],
        "models": {key: rel(Path(value["runtime"]), runtime_dir) for key, value in report["models"].items()},
        "modelSizes": {
            key: {
                "sourceBytes": value.get("source_bytes"),
                "runtimeBytes": value.get("runtime_bytes"),
                "removedImages": value.get("removed_images", 0),
            }
            for key, value in report["models"].items()
        },
        "materialOverride": "models/material-overrides.json",
        "textures": {key: rel(Path(value["runtime"]), runtime_dir) for key, value in report["textures"].items()},
        "sourceMetadata": rel(character_dir / "metadata.json", character_dir.parent),
        "maxTexture": args.max_texture,
        "notes": report["notes"],
    }
    write_json(runtime_dir / "runtime-manifest.json", runtime_manifest)
    write_json(runtime_dir / "finalize-report.json", portable_report_paths(report, character_dir.parents[2]))

    print(json.dumps({
        "runtime_dir": str(runtime_dir),
        "models": list(report["models"].keys()),
        "model_sizes": {
            key: {
                "source_mb": round(value.get("source_bytes", 0) / 1048576, 2),
                "runtime_mb": round(value.get("runtime_bytes", 0) / 1048576, 2),
                "removed_images": value.get("removed_images", 0),
            }
            for key, value in report["models"].items()
        },
        "textures": {
            key: {
                "runtime_size": value["runtime_size"],
                "source_mb": round(value["source_bytes"] / 1048576, 2),
                "runtime_mb": round(value["runtime_bytes"] / 1048576, 2),
            }
            for key, value in report["textures"].items()
        },
    }, indent=2))


if __name__ == "__main__":
    main()
