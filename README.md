# Hellrush: Meathook Arena

![Hellrush loading screen](assets/screenshots/loading-screen.png)

A browser FPS prototype built as a passion-code experiment around the kind of fast, push-forward arena combat I love: double jumps, dash chains, meat-hook movement, resource finishers, chunky weapons, and an arena that keeps asking you to move.

This is not trying to be a commercial clone. It is a small, original Three.js playground for studying that combat rhythm and seeing how far a lightweight browser game can be pushed with generated assets, pooled effects, and aggressive startup prewarming.

## Play

On Windows, double-click:

```text
run_server.bat
```

Then open:

```text
http://127.0.0.1:8066/index.html
```

Or run it manually:

```bash
npx --yes http-server . -p 8066 -a 127.0.0.1
```

The project vendors its local Three.js build under `vendor/three`, so it can run without pulling a CDN at startup.

## Controls And Mechanics

- `WASD`: ground movement, air control, strafe routing, and arena circle-strafing.
- Mouse: free-look aiming with pointer lock.
- `Space`: jump and double jump. Jump pads launch higher routes and can be chained into hooks/dashes.
- `Shift`: dash with two charges and quick recharge. Use it for dodges, aerial correction, and hook exits.
- `1`: Super Shotgun loadout. High close-range damage, pellet spread, pump timing, recoil, and the Meat Hook on RMB.
- `2`: Heavy Autorifle loadout. Full-auto pressure on LMB, accurate sustained fire, spinning barrels, and micro missiles on RMB.
- `Q`: quick swap between the two weapons.
- LMB: primary fire. SSG rewards close range; Autorifle rewards tracking and pressure.
- RMB with SSG: Meat Hook demons or purple hook nodes. Hold to pull, strafe during travel, release into momentum. Hooked demons ignite and become armor opportunities.
- RMB with Autorifle: micro missiles with homing and splash damage for clustered enemies.
- `F`: Flame Belch. Burns demons in a cone; burning enemies shed armor when damaged.
- `E`: Glory Kill. Executes green staggered enemies at close range, grants health, consumes/recharges glory charges, and gives brief invulnerability.
- `C`: Chainsaw. Executes close enemies for ammo, uses rechargeable fuel, grants brief invulnerability, and triggers a first-person saw finisher.
- `M`: minimap toggle with player, enemy, and traversal-node visibility.
- `H`: in-game help panel.
- `R`: restart after death.

Other mechanics bundled into the arena: finite staged waves, endless horde after stage 10, husks, imps, revenant jump troops, bruisers, fireballs, melee pressure, stagger windows, burn armor drops, health/armor/ammo pickups, lava damage ticks, moving platforms, vertical launch pads, hook nodes, resource meters, hit flashes, screen shake, synthesized weapon/enemy/UI audio, pooled particles, tracers, decals, explosions, and chainsaw/glory finisher animations.

## What Is In Here

- A single-page Three.js arena FPS in `index.html`, `style.css`, and `src/game.js`.
- Generated hell-material textures in `assets/textures`.
- Meshy-generated Ember Runt character source, reference art, PBR maps, and lean runtime GLBs in `assets/characters/ember-runt`.
- A local `asset_lab.html` for inspecting weapons, enemies, pickups, and finisher props.
- A local `character_lab.html` for inspecting animated GLB characters with runtime PBR/emissive sidecar textures.
- A startup loading phase that prepares textures, shaders, pooled enemies/projectiles/pickups, the Ember Runt husk asset, combat effects, finisher props, hook visuals, and common audio paths before gameplay begins.

## Character Asset Flow

Authoring files live beside each character so they can be revisited: source reference image, Meshy output GLBs, high-resolution PBR textures, and metadata. Runtime files live under `assets/characters/<name>/runtime` and are the only assets the game should load directly.

For Ember Runt, the game loads:

```text
assets/characters/ember-runt/runtime/models/ember-runt-walking.glb
assets/characters/ember-runt/runtime/models/material-overrides.json
assets/characters/ember-runt/runtime/textures/*
```

The runtime GLB has embedded texture images stripped out; `material-overrides.json` reattaches the base color, normal, roughness, metallic, and emissive maps. Use `character_lab.html?model=assets/characters/ember-runt/runtime/models/ember-runt-walking.glb%3Fv=ember-runt-v2` to inspect the exact runtime path with cache-busted sidecar textures.

## Current Focus

The project is in a vibe-code prototype phase: feel first, then architecture. The current baseline is tuned around keeping Firefox smooth by avoiding first-use GPU stalls during combat. New effects should be created and drawn during loading, then animated at runtime with transforms, scale, opacity/uniforms, and light intensity.
