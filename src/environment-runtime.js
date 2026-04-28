import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const ENVIRONMENT_ASSET_IDS = [
  'floating-hell-platform',
  'jump-pad',
  'hook-node',
  'catwalk-center-hub',
  'catwalk-straight-arm',
  'low-hell-cover',
  'rune-pillar',
  'hell-torch',
  'moving-lift',
  'sliding-bridge',
  'lava-trench-module'
];

const runtimeCache = new Map();
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

export async function fetchJsonOptional(url) {
  try {
    const resp = await fetch(url, { cache: 'no-store' });
    if (resp.ok) return await resp.json();
  } catch {
    // Runtime sidecars are optional while assets are under construction.
  }
  return null;
}

function urlDirectory(url) {
  const clean = url.split('?')[0].replace(/\\/g, '/');
  return clean.includes('/') ? clean.slice(0, clean.lastIndexOf('/') + 1) : './';
}

function cacheSuffix(url) {
  const marker = url.indexOf('?');
  return marker === -1 ? '' : `?${url.slice(marker + 1)}`;
}

function loadTextureUrl(url, colorSpace = THREE.NoColorSpace, renderer = null) {
  return new Promise((resolve, reject) => {
    textureLoader.load(url, (tex) => {
      tex.flipY = false;
      tex.colorSpace = colorSpace;
      if (renderer?.capabilities) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      resolve(tex);
    }, undefined, reject);
  });
}

export function loadGltf(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function collectMaterials(object) {
  const mats = [];
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (Array.isArray(child.material)) mats.push(...child.material);
    else mats.push(child.material);
  });
  return mats;
}

export function cloneMaterialInstances(object) {
  const remap = new Map();
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const cloneMat = (mat) => {
      if (!mat) return mat;
      if (!remap.has(mat)) remap.set(mat, mat.clone());
      return remap.get(mat);
    };
    child.material = Array.isArray(child.material) ? child.material.map(cloneMat) : cloneMat(child.material);
  });
}

function materialOverrideKey(mat, index) {
  return mat.name || `material-${index + 1}`;
}

export function applyScalarMaterialOverrides(object, overrides = {}) {
  if (!overrides || !Object.keys(overrides).length) return;
  const seen = new Set();
  let index = 0;
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat || seen.has(mat.uuid)) continue;
      seen.add(mat.uuid);
      const key = materialOverrideKey(mat, index++);
      const spec = overrides[key] || overrides[mat.name];
      if (!spec) continue;
      if (Number.isFinite(spec.roughness)) mat.roughness = THREE.MathUtils.clamp(spec.roughness, 0, 1);
      if (Number.isFinite(spec.metalness)) mat.metalness = THREE.MathUtils.clamp(spec.metalness, 0, 1);
      if (Number.isFinite(spec.envMapIntensity)) mat.envMapIntensity = THREE.MathUtils.clamp(spec.envMapIntensity, 0, 2);
      mat.needsUpdate = true;
    }
  });
}

export async function applySidecarMaterialOverrides(modelUrl, object, renderer = null) {
  const bust = cacheSuffix(modelUrl);
  const dir = urlDirectory(modelUrl);
  const candidates = [`${dir}material-overrides.json${bust}`, `${dir}../material-overrides.json${bust}`];
  let found = null;
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      if (resp.ok) {
        found = { url, manifest: await resp.json() };
        break;
      }
    } catch {
      // Try the next sidecar location.
    }
  }
  if (!found) return null;
  const manifestDir = urlDirectory(found.url);
  const loaded = {};
  for (const [key, spec] of Object.entries(found.manifest.maps || {})) {
    if (!spec?.file) continue;
    const space = spec.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    loaded[key] = await loadTextureUrl(`${manifestDir}${spec.file}${bust}`, space, renderer);
  }
  for (const mat of collectMaterials(object)) {
    if (loaded.baseColor) mat.map = loaded.baseColor;
    if (loaded.normal) mat.normalMap = loaded.normal;
    if (loaded.roughness) {
      mat.roughnessMap = loaded.roughness;
      mat.roughness = 1;
    }
    if (loaded.metallic) {
      mat.metalnessMap = loaded.metallic;
      mat.metalness = 1;
    }
    if (loaded.emissive) {
      mat.emissiveMap = loaded.emissive;
      mat.emissive?.set(0xffffff);
      mat.emissiveIntensity = found.manifest.maps?.emissive?.intensity || mat.emissiveIntensity || 1;
    }
    mat.userData.baseEmissiveIntensity = mat.emissiveIntensity || 1;
    mat.needsUpdate = true;
  }
  return loaded;
}

export function prepareEnvironmentRuntimeDefaults(root, manifest) {
  applyScalarMaterialOverrides(root, manifest.materialOverrides);
  root.traverse((child) => {
    child.frustumCulled = false;
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      if (mat.emissiveMap) {
        mat.emissive?.set(0xffffff);
        mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 0, 1.35);
      }
      mat.userData.baseEmissiveIntensity = mat.emissiveIntensity || 1;
      mat.needsUpdate = true;
    }
  });
}

export async function loadEnvironmentRuntimeAsset(id, { renderer = null, version = 'environment-runtime-1' } = {}) {
  const cacheKey = `${id}:${version}`;
  if (runtimeCache.has(cacheKey)) return runtimeCache.get(cacheKey);

  const base = `./assets/environment/${id}/runtime/`;
  const manifest = await fetchJsonOptional(`${base}runtime-manifest.json?v=${version}`);
  if (!manifest?.model) return null;
  const modelUrl = `${base}${manifest.model}?v=${manifest.version || version}`;
  const gltf = await loadGltf(modelUrl);
  const root = gltf.scene;
  if (manifest.materialOverride) await applySidecarMaterialOverrides(modelUrl, root, renderer);
  prepareEnvironmentRuntimeDefaults(root, manifest);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  const collisionType = manifest.prefab?.collision?.type || manifest.collision?.type || 'box';
  if (collisionType !== 'sphere') root.position.y += size.y * 0.5;
  const normalizedSize = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const asset = {
    id,
    name: manifest.name || id,
    scene: root,
    size: normalizedSize,
    source: modelUrl,
    manifest
  };
  runtimeCache.set(cacheKey, asset);
  return asset;
}

export async function loadEnvironmentAssets({
  ids = ENVIRONMENT_ASSET_IDS,
  renderer = null,
  target = {},
  version = 'environment-runtime-1'
} = {}) {
  await Promise.all(ids.map(async (id) => {
    try {
      const asset = await loadEnvironmentRuntimeAsset(id, { renderer, version });
      if (asset) target[id] = asset;
    } catch (err) {
      console.warn(`Runtime environment asset unavailable for ${id}; using fallback if available.`, err);
    }
  }));
  if (target['floating-hell-platform']) target.floatingHellPlatform = target['floating-hell-platform'];
  return target;
}

export function cloneEnvironmentPrefab(assetOrId, assets = null) {
  const asset = typeof assetOrId === 'string' ? assets?.[assetOrId] : assetOrId;
  if (!asset?.scene || !asset.size) return null;
  const visual = SkeletonUtils.clone(asset.scene);
  cloneMaterialInstances(visual);
  visual.traverse((child) => {
    child.frustumCulled = false;
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return visual;
}

export function assetCollisionConfig(asset) {
  const manifest = asset?.manifest || {};
  const prefab = manifest.prefab || null;
  const collision = prefab?.collision || manifest.collision || {};
  const size = collision.size || [asset?.size?.x || 1, asset?.size?.y || 1, asset?.size?.z || 1];
  const center = collision.center || [0, -size[1] * 0.5, 0];
  return {
    prefab,
    collision,
    visual: prefab?.visual || manifest.placement || {},
    size,
    center,
    localTop: center[1] + size[1] * 0.5
  };
}
