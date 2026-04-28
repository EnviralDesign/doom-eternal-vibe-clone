# Hellrush Environment Prefabs

Environment assets use an authoring/runtime split:

- `source/`: Meshy preview/refined GLBs, thumbnails, full-size PBR maps, and metadata.
- `runtime/`: stripped GLB, compressed runtime PBR maps, sidecar material overrides, and `runtime-manifest.json`.

Gameplay collision stays simple and manifest-driven. High-detail meshes are visual prefabs cloned into the level over box, sphere, cylinder, or slab collision proxies.
