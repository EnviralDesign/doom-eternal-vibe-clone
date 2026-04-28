import * as THREE from 'three';
import { GAME_RENDER_PIPELINE } from './render-pipeline.js';

export const LAB_LIGHTING_LEVEL = 'level';
export const LAB_LIGHTING_STUDIO = 'studio';

export function installLabLighting(scene, options = {}) {
  const {
    target = new THREE.Vector3(0, 0.8, 0),
    keyIntensity = 2.2,
    fillIntensity = 0.75,
    rimIntensity = 1.25
  } = options;

  const root = new THREE.Group();
  root.name = 'lab-studio-three-point-rig';

  const targetObject = new THREE.Object3D();
  targetObject.name = 'lab-studio-light-target';
  targetObject.position.copy(target);
  root.add(targetObject);

  const key = new THREE.DirectionalLight(0xffd7ad, keyIntensity);
  key.name = 'lab-studio-key';
  key.position.set(-4.8, 5.2, 4.2);
  key.target = targetObject;

  const fill = new THREE.DirectionalLight(0x8edcff, fillIntensity);
  fill.name = 'lab-studio-fill';
  fill.position.set(4.4, 3.0, 5.2);
  fill.target = targetObject;

  const rim = new THREE.DirectionalLight(0xb3efff, rimIntensity);
  rim.name = 'lab-studio-rim';
  rim.position.set(3.6, 4.4, -4.8);
  rim.target = targetObject;

  root.add(key, fill, rim);
  scene.add(root);

  function setMode(mode = LAB_LIGHTING_LEVEL) {
    const normalized = mode === LAB_LIGHTING_STUDIO ? LAB_LIGHTING_STUDIO : LAB_LIGHTING_LEVEL;
    root.visible = normalized === LAB_LIGHTING_STUDIO;
    if ('environmentIntensity' in scene) {
      scene.environmentIntensity = GAME_RENDER_PIPELINE.environmentIntensity;
    }
    return normalized;
  }

  function info() {
    return {
      mode: root.visible ? LAB_LIGHTING_STUDIO : LAB_LIGHTING_LEVEL,
      studioLights: root.visible ? 3 : 0,
      environmentIntensity: scene.environmentIntensity
    };
  }

  const api = { root, setMode, info };
  if (typeof window !== 'undefined') window.__hellrushLabLightingInfo = info;

  setMode(LAB_LIGHTING_LEVEL);
  return api;
}
