# Hellrush Weapon Asset Pipeline

Weapons are split into authoring and runtime layers:

- `assets/weapons/<weapon>/references/`: concept images and screenshots used to generate or critique the model.
- `assets/weapons/<weapon>/authoring/`: full Meshy downloads, source GLBs, and full-size maps.
- `assets/weapons/<weapon>/runtime/`: stripped GLB, compressed PBR maps, `runtime-manifest.json`, and `models/material-overrides.json`.

The game always keeps procedural first-person weapons as a fallback. If `runtime/runtime-manifest.json` exists and points at a runtime GLB, `src/game.js` loads it during the explicit boot phase, applies sidecar PBR maps, warms it with the rest of the scene, and hides the procedural mesh.

## Meshy Strategy

Generate weapons as non-character hard-surface assets. Do not rig them. For best first-person results:

- Use high-resolution square concept/reference images for each weapon, ideally showing a clean 3/4 top-front view and a side silhouette.
- Prefer Meshy standard/high-detail generation with PBR enabled and HD texture enabled.
- Keep the prompt focused on structure, material layers, emissive details, and first-person readability.
- Avoid asking Meshy to include hands, UI, muzzle flash, projectiles, or background lighting in the weapon asset.
- Download GLB only for runtime. Keep OBJ/FBX only if a later editing tool needs them.

## Runtime Contract

`runtime/runtime-manifest.json` should look like:

```json
{
  "version": "ssg-runtime-v1",
  "id": "ssg",
  "name": "Twin Anvil + Meat Hook",
  "model": "models/viewmodel.glb",
  "materialOverride": "models/material-overrides.json",
  "attach": {
    "position": [0, 0, 0],
    "rotation": [0, 0, 0],
    "scale": 1
  },
  "muzzle": [0, 0.02, -1.08],
  "spinTargets": ["barrel", "rotor", "gatling"]
}
```

The scalar roughness/metalness defaults should stay at `1.0` when corresponding maps exist; Three multiplies the scalar by the texture.
