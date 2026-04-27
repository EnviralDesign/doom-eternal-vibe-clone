#!/usr/bin/env python3
"""Run a ComfyUI PBR texture workflow from a base texture image.

Expected workflow shape:
- one Load Image node, or pass --load-node-id
- Save Image nodes for basecolor, normal, roughness, metalness, height

Export the workflow from ComfyUI with "Save (API Format)" / dev mode enabled.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_SERVER = "http://127.0.0.1:8188"
DEFAULT_PREFIXES = {
    "basecolor": "pbr/basecolor",
    "normal": "pbr/normal",
    "roughness": "pbr/roughness",
    "metalness": "pbr/metalness",
    "height": "pbr/height",
}


def http_json(url: str, payload: dict | None = None) -> dict:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def upload_image(server: str, image_path: Path, overwrite: bool) -> str:
    boundary = "----hellrush-comfy-boundary"
    mime = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
    fields = [
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="image"; filename="{image_path.name}"\r\n'
            f"Content-Type: {mime}\r\n\r\n"
        ).encode("utf-8"),
        image_path.read_bytes(),
        f"\r\n--{boundary}\r\n".encode("utf-8"),
        b'Content-Disposition: form-data; name="type"\r\n\r\ninput\r\n',
        f"--{boundary}\r\n".encode("utf-8"),
        f'Content-Disposition: form-data; name="overwrite"\r\n\r\n{"true" if overwrite else "false"}\r\n'.encode("utf-8"),
        f"--{boundary}--\r\n".encode("utf-8"),
    ]
    body = b"".join(fields)
    req = urllib.request.Request(
        f"{server}/upload/image",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read().decode("utf-8"))
    return result.get("name") or image_path.name


def load_workflow(path: Path) -> dict:
    workflow = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(workflow, dict):
        raise ValueError("Comfy API workflow must be a JSON object keyed by node id")
    return workflow


def node_class(node: dict) -> str:
    return str(node.get("class_type") or node.get("_meta", {}).get("title") or "")


def find_nodes(workflow: dict, class_name: str) -> list[tuple[str, dict]]:
    return [(node_id, node) for node_id, node in workflow.items() if node_class(node) == class_name]


def patch_load_image(workflow: dict, image_name: str, load_node_id: str | None) -> str:
    if load_node_id:
        node = workflow[load_node_id]
    else:
        matches = find_nodes(workflow, "LoadImage")
        if len(matches) != 1:
            raise ValueError(f"Expected one LoadImage node, found {len(matches)}. Pass --load-node-id.")
        load_node_id, node = matches[0]
    node.setdefault("inputs", {})["image"] = image_name
    return load_node_id


def infer_map_name_from_node(node: dict) -> str | None:
    inputs = node.get("inputs", {})
    haystack = f"{inputs.get('filename_prefix', '')} {node.get('_meta', {}).get('title', '')}".lower()
    for key in ["basecolor", "normal", "roughness", "metalness", "height"]:
        if key in haystack:
            return key
    if "base color" in haystack:
        return "basecolor"
    return None


def patch_save_nodes(workflow: dict, slug: str, mapping: dict[str, str], mode: str, prefix_root: str) -> dict[str, dict]:
    patched = {}
    save_nodes = find_nodes(workflow, "SaveImage")
    for node_id, node in save_nodes:
        map_name = infer_map_name_from_node(node)
        if not map_name:
            continue
        inputs = node.setdefault("inputs", {})
        if mode == "preview":
            node["class_type"] = "PreviewImage"
            inputs.pop("filename_prefix", None)
            patched[node_id] = {"map": map_name, "mode": "preview"}
        else:
            prefix = mapping.get(map_name, f"pbr/{map_name}")
            final_prefix = f"{prefix_root.rstrip('/')}/{prefix.strip('/')}/{slug}"
            inputs["filename_prefix"] = final_prefix
            patched[node_id] = {"map": map_name, "mode": "output", "filename_prefix": final_prefix}
    return patched


def queue_prompt(server: str, workflow: dict) -> str:
    result = http_json(f"{server}/prompt", {"prompt": workflow})
    prompt_id = result.get("prompt_id")
    if not prompt_id:
        raise RuntimeError(f"Comfy did not return prompt_id: {result}")
    return prompt_id


def poll_history(server: str, prompt_id: str, timeout: float, interval: float) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        history = http_json(f"{server}/history/{urllib.parse.quote(prompt_id)}")
        if prompt_id in history:
            return history[prompt_id]
        time.sleep(interval)
    raise TimeoutError(f"Timed out waiting for Comfy prompt {prompt_id}")


def download_output(server: str, info: dict, destination: Path) -> Path:
    params = urllib.parse.urlencode({
        "filename": info["filename"],
        "subfolder": info.get("subfolder", ""),
        "type": info.get("type", "output"),
    })
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(f"{server}/view?{params}", timeout=60) as resp:
        destination.write_bytes(resp.read())
    return destination


def collect_images(history_entry: dict) -> list[tuple[str, dict]]:
    images = []
    for node_id, node_output in history_entry.get("outputs", {}).items():
        for image in node_output.get("images", []):
            images.append((node_id, image))
    return images


def infer_map_name(filename: str, subfolder: str) -> str:
    text = f"{subfolder}/{filename}".lower()
    for key in ["basecolor", "normal", "roughness", "metalness", "height"]:
        if key in text:
            return key
    return Path(filename).stem


def rel_url(path: Path, base_dir: Path) -> str:
    return path.resolve().relative_to(base_dir.resolve()).as_posix()


def update_material_manifest(manifest_path: Path, material_id: str, name: str, output_dir: Path, outputs: list[dict]) -> dict:
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {"materials": []}
    materials = manifest.setdefault("materials", [])
    entry = next((item for item in materials if item.get("id") == material_id), None)
    if not entry:
        entry = {"id": material_id}
        materials.append(entry)

    root = manifest_path.parent
    by_map = {item["map"]: Path(item["path"]) for item in outputs}
    entry.update({
        "id": material_id,
        "name": name,
        "tile": entry.get("tile", 3),
    })
    if "basecolor" in by_map:
        entry["baseColor"] = rel_url(by_map["basecolor"], root)
    if "normal" in by_map:
        entry["normal"] = rel_url(by_map["normal"], root)
    if "roughness" in by_map:
        entry["roughnessMap"] = rel_url(by_map["roughness"], root)
        entry["roughness"] = 1.0
    else:
        entry.setdefault("roughness", 0.72)
    if "metalness" in by_map:
        entry["metalnessMap"] = rel_url(by_map["metalness"], root)
        entry["metalness"] = 1.0
    else:
        entry.setdefault("metalness", 0.0)
    if "height" in by_map:
        entry["heightMap"] = rel_url(by_map["height"], root)
        entry.setdefault("displacementScale", 0.012)

    materials.sort(key=lambda item: item.get("name") or item.get("id") or "")
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description="Run local ComfyUI PBR texture workflow.")
    parser.add_argument("--server", default=DEFAULT_SERVER, help="ComfyUI server URL")
    parser.add_argument("--workflow", required=True, type=Path, help="Comfy API-format workflow JSON")
    parser.add_argument("--input", required=True, type=Path, help="Base texture image to upload")
    parser.add_argument("--output-dir", required=True, type=Path, help="Directory for downloaded PBR maps")
    parser.add_argument("--slug", help="Output asset slug; defaults to input stem")
    parser.add_argument("--load-node-id", help="Specific LoadImage node id if workflow has more than one")
    parser.add_argument("--timeout", type=float, default=600)
    parser.add_argument("--poll", type=float, default=1.0)
    parser.add_argument("--save-mode", choices=["preview", "output"], default="preview", help="preview uses Comfy temp files; output writes to Comfy output folders")
    parser.add_argument("--comfy-prefix-root", default="_hellrush_pbr", help="Comfy output root when --save-mode output")
    parser.add_argument("--keep-workflow-copy", action="store_true", help="Save patched workflow beside outputs")
    parser.add_argument("--update-manifest", type=Path, default=Path("assets/textures/manifest.json"), help="Update texture lab material manifest JSON")
    parser.add_argument("--name", help="Display name for manifest entry")
    args = parser.parse_args()

    image_path = args.input.resolve()
    if not image_path.exists():
        raise FileNotFoundError(image_path)

    slug = args.slug or image_path.stem
    workflow = load_workflow(args.workflow)
    uploaded_name = upload_image(args.server.rstrip("/"), image_path, overwrite=True)
    load_node_id = patch_load_image(workflow, uploaded_name, args.load_node_id)
    patched_saves = patch_save_nodes(workflow, slug, DEFAULT_PREFIXES, args.save_mode, args.comfy_prefix_root)

    if args.keep_workflow_copy:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        (args.output_dir / f"{slug}.comfy-api-workflow.json").write_text(json.dumps(workflow, indent=2), encoding="utf-8")

    prompt_id = queue_prompt(args.server.rstrip("/"), workflow)
    history = poll_history(args.server.rstrip("/"), prompt_id, args.timeout, args.poll)
    outputs = []
    for node_id, image in collect_images(history):
        map_name = patched_saves.get(node_id, {}).get("map") or infer_map_name(image["filename"], image.get("subfolder", ""))
        ext = Path(image["filename"]).suffix or ".png"
        dst = args.output_dir / f"{slug}_{map_name}{ext}"
        download_output(args.server.rstrip("/"), image, dst)
        outputs.append({"map": map_name, "path": str(dst), "source": image})

    report = {
        "prompt_id": prompt_id,
        "input": str(image_path),
        "uploaded_name": uploaded_name,
        "load_node_id": load_node_id,
        "patched_save_nodes": patched_saves,
        "outputs": outputs,
    }
    if args.update_manifest:
      report["manifest_entry"] = update_material_manifest(
          args.update_manifest,
          slug,
          args.name or slug.replace("-", " ").replace("_", " ").title(),
          args.output_dir,
          outputs,
      )
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / f"{slug}.comfy-pbr-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
