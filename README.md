# Hellrush: Meathook Arena V6

A browser-delivered Three.js FPS prototype inspired by modern push-forward arena-shooter combat loops: Super Shotgun + Meat Hook, Heavy Autorifle + micro missiles, double jump, two-charge dash, high jump pads, hook nodes, Flame Belch armor drops, glory-kill health, chainsaw ammo, finite stages, and an endless horde finale.

The ZIP vendors a local lean Three.js module under `vendor/three`, so the main game can run without internet once unzipped. V6 adds generated bitmap material textures under `assets/textures` plus procedural fallback textures if image loading fails.

## Run

```bash
npx --yes http-server . -p 8066 -a 127.0.0.1
```

Open `http://127.0.0.1:8066`.

On Windows, double-click `run_server.bat` from the repo root to start the same local server. Close that command window or press `Ctrl+C` in it to stop the server.

You can also open `index.html` directly in some browsers, but a local server is more reliable for ES modules and pointer lock. The included vendor files mean the ZIP does not need a CDN connection.

## Controls

- `WASD`: move
- Mouse: look
- `Space`: jump / double jump
- `Shift`: dash; two charges, quick recharge
- `1`: Super Shotgun + Meat Hook
- `2`: Heavy Autorifle
- `Q`: quick swap
- LMB: fire
- RMB with SSG: Meat Hook demons or purple traversal nodes
- RMB with Autorifle: micro missiles
- `F`: Flame Belch; burning enemies shed armor when damaged
- `E`: Glory Kill green staggered demons for health; up to 3 charges; invulnerable during the finisher
- `C`: Chainsaw close demons for ammo; fuel recharges; invulnerable during the rip
- `M`: minimap toggle; it starts open by default
- `H`: help panel
- `R`: restart after death

## V6 changes

- Added an explicit loading/prewarm phase. The Start button stays disabled while materials, generated textures, pooled meshes, GPU shaders, and combat effects are created and rendered behind the overlay.
- Added generated texture assets for floor, wall, metal, and rune-metal level surfaces under `assets/textures`.
- Added enemy mesh pools and projectile pools so wave spawns, revenant volleys, fireballs, and micro missiles avoid first-use mesh allocation during play.
- Added revenant jump troops: skeletal midweight enemies with shoulder rockets, lateral pressure, and jump-jet movement.
- Reworked the arena lighting composition with cheap emissive light shafts, translucent argent-glass panels, richer generated floor materials, and perimeter landmarks while keeping runtime shadows and postprocessing off.
- Expanded stage compositions to introduce revenants from stage 5 onward and into endless horde.

## V5 carryover

- Added animated chainsaw and glory-kill execution windows instead of instant effects. Finishers briefly magnet the player into position, show a first-person blade/saw prop, trigger an impact frame, and prevent player damage during the animation.
- Chainsaw fuel now recharges over time up to three fuel, and glory kills now use a visible three-charge meter.
- Jump height is stronger, jump pads launch much higher, and lava now burns periodically instead of bouncing the player.
- Added a more noticeable red edge/fringe damage pulse.
- Minimap is open by default, and HUD now shows dash, jump, chainsaw fuel, glory charges, flame cooldown, stage, ammo, score, and kills.
- Reworked pickup objects with higher-fidelity procedural geometry and clearer color language: teal health, deep army-green armor, and fiery orange ammo.
- Took a sound-design pass: heavier SSG, cannon, missile/explosion, demon, chainsaw, glory, hurt, lava, pickup, stage-start, and stage-clear synthesis.
- Reduced likely hitch sources: shared particle/projectile/pickup geometries, tracer material reuse, particle hard cap, and throttled HUD/minimap DOM/canvas updates.

## Asset Lab

Open `asset_lab.html` from the same local server to inspect isolated gun, enemy, pickup, and finisher-prop models. It includes a turntable, drag-to-orbit, light control, and `Save PNG screenshot` button. This is the workflow page used to iterate on silhouettes and pickup readability without loading the full arena.


## Performance notes

This build keeps the V5 hotfix path and pushes startup work into the loading phase: pickups, enemies, projectiles, particles, tracers, decals, flash lights, image textures, shader programs, and audio noise data are precreated before gameplay starts. Runtime shadows and default bloom/postprocessing remain disabled to reduce frame cost and shader work.

The current Firefox-focused baseline also pre-draws rare visible states during loading: finisher props, chainsaw/glory spark lighting, hook chain line, all pooled enemy instances, both weapon models, and common first-use audio paths. New gameplay effects should follow the same rule: create and draw during loading, then only animate transforms, scale, opacity/uniforms, and light intensity during play.
