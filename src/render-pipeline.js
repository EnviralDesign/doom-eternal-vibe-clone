import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const HELL_SKY_URL = './assets/skies/deep-hell-panorama-2k.webp?v=2';

export const GAME_RENDER_PIPELINE = {
  clearColor: 0x070504,
  fallbackBackground: 0x0d0a0b,
  toneMappingExposure: 1.08,
  cinematicToneMappingExposure: 1.16,
  backgroundIntensity: 0.92,
  gameplayBackgroundIntensity: 0.82,
  environmentIntensity: 5,
  gameplayEnvironmentIntensity: 5,
  maxDpr: 1.5,
  bloom: {
    strength: 0.04,
    radius: 0.18,
    threshold: 1.35
  }
};

export function createGameRenderer({
  antialias = true,
  preserveDrawingBuffer = false,
  maxDpr = GAME_RENDER_PIPELINE.maxDpr,
  exposure = GAME_RENDER_PIPELINE.toneMappingExposure,
  shadowMap = false,
  shadowType = THREE.PCFShadowMap,
  clearColor = GAME_RENDER_PIPELINE.clearColor
} = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias, powerPreference: 'high-performance', preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(clearColor, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = shadowMap;
  if (shadowMap) renderer.shadowMap.type = shadowType;
  renderer.userData ||= {};
  renderer.userData.renderPipeline = {
    colorSpace: 'srgb',
    toneMapping: 'aces-filmic',
    exposure,
    maxDpr,
    shadowMap
  };
  return renderer;
}

export function createPmremGenerator(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  return pmrem;
}

export function createGameComposer(renderer, scene, camera, {
  strength = GAME_RENDER_PIPELINE.bloom.strength,
  radius = GAME_RENDER_PIPELINE.bloom.radius,
  threshold = GAME_RENDER_PIPELINE.bloom.threshold,
  width = window.innerWidth,
  height = window.innerHeight
} = {}) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), strength, radius, threshold);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  return { composer, bloomPass };
}

export async function loadEquirectSky(renderer, path = HELL_SKY_URL, { anisotropy = 4 } = {}) {
  const tex = await new THREE.TextureLoader().loadAsync(path);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(anisotropy, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

export function createPmremEnvironment(pmrem, texture, previousRenderTarget = null) {
  if (!texture || !pmrem) return { texture: texture || null, renderTarget: previousRenderTarget };
  try {
    if (previousRenderTarget) previousRenderTarget.dispose();
    const renderTarget = pmrem.fromEquirectangular(texture);
    const env = renderTarget.texture;
    env.name = 'pmrem-hell-environment';
    return { texture: env, renderTarget };
  } catch (err) {
    console.warn('PMREM environment generation failed; using direct environment texture.', err);
    return { texture, renderTarget: previousRenderTarget };
  }
}

export function applySceneEnvironment(scene, {
  background = null,
  environment = null,
  backgroundIntensity = GAME_RENDER_PIPELINE.backgroundIntensity,
  environmentIntensity = GAME_RENDER_PIPELINE.environmentIntensity
} = {}) {
  scene.background = background || new THREE.Color(GAME_RENDER_PIPELINE.fallbackBackground);
  scene.environment = environment || background || null;
  if ('backgroundIntensity' in scene) scene.backgroundIntensity = backgroundIntensity;
  if ('environmentIntensity' in scene) scene.environmentIntensity = environmentIntensity;
  scene.userData.renderPipeline = {
    sky: background?.isTexture ? background.name || 'equirect-sky' : 'fallback-color',
    environment: scene.environment?.name || (scene.environment?.isTexture ? 'environment-texture' : null),
    backgroundIntensity,
    environmentIntensity
  };
}

export async function loadAndApplyGameEnvironment({
  renderer,
  scene,
  pmrem,
  skyUrl = HELL_SKY_URL,
  previousRenderTarget = null,
  backgroundIntensity = GAME_RENDER_PIPELINE.backgroundIntensity,
  environmentIntensity = GAME_RENDER_PIPELINE.environmentIntensity
}) {
  const sky = await loadEquirectSky(renderer, skyUrl);
  const env = createPmremEnvironment(pmrem, sky, previousRenderTarget);
  applySceneEnvironment(scene, {
    background: sky,
    environment: env.texture,
    backgroundIntensity,
    environmentIntensity
  });
  return { sky, environment: env.texture, environmentRenderTarget: env.renderTarget };
}
