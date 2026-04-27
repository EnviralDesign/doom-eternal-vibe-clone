import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/*
  Hellrush: Meathook Arena — original browser FPS prototype.
  Design goal: Doom Eternal-ish movement/resource/meathook loop with original procedural assets.
  Three.js is loaded from the local import map in index.html.
*/

const VERSION = 'threejs-eternalish-6.1-ember-runt';
const CDN_VERSION = 'three-local-r184-full';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const now = () => performance.now() * 0.001;
const TAU = Math.PI * 2;

const tmpV1 = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpV4 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3(0, 0, 0);

let renderer, scene, camera, composer, bloomPass;
let clockTime = 0;
let lastFrame = 0;
let running = false;
let pausedByLock = true;
let slowMo = 0;
let renderScale = 1;

const dom = {};
const world = {
  floors: [],
  boxes: [],
  jumpPads: [],
  hookNodes: [],
  spawnPoints: [],
  decorations: [],
  lavaPlanes: [],
  lights: [],
  movers: [],
  stagePickups: [],
  bounds: 36,
  mapScale: 76
};

const materials = {};
const textures = {};
const characterAssets = {};
const enemies = [];
const projectiles = [];
const pickups = [];
const particles = [];
const decals = [];
const activeLights = [];

const input = {
  keys: new Set(),
  buttons: new Set(),
  justPressed: new Set(),
  mouseDX: 0,
  mouseDY: 0,
  sensitivity: 0.00235,
  invertX: false,
  invertY: false,
  fireHeld: false,
  altHeld: false,
  lastMoveDX: 0,
  lastMoveDY: 0,
  lookIgnore: 0,
  lastLookAt: 0,
  lookDropNotice: 0
};

const player = {
  pos: new THREE.Vector3(0, 0.05, 11),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  radius: 0.48,
  height: 1.72,
  eye: 1.48,
  stepHeight: 0.62,
  grounded: false,
  coyote: 0,
  jumpsUsed: 0,
  dashCharges: 2,
  dashMax: 2,
  dashRegen: 0,
  dashCooldown: 0,
  padCooldown: 0,
  health: 100,
  armor: 40,
  maxHealth: 100,
  maxArmor: 150,
  ammo: { shells: 18, bullets: 110 },
  ammoMax: { shells: 24, bullets: 160 },
  chainsawFuel: 1,
  chainsawMax: 3,
  chainsawRegen: 0,
  gloryCharges: 3,
  gloryMax: 3,
  gloryRegen: 0,
  flameCd: 0,
  flameActive: 0,
  weapon: 0,
  previousWeapon: 1,
  bob: 0,
  recoil: 0,
  recoilYaw: 0,
  shake: 0,
  hurtFlash: 0,
  score: 0,
  kills: 0,
  alive: true,
  deathTimer: 0,
  inLava: false,
  lavaTick: 0
};

const hook = {
  active: false,
  target: null,
  targetKind: 'enemy',
  targetPoint: new THREE.Vector3(),
  cooldown: 0,
  chainT: 0,
  locked: null,
  lockStrength: 0,
  lastLockKind: null,
  scanTimer: 0,
  maxDistance: 30
};

const weaponState = {
  fireCd: 0,
  heavyCd: 0,
  missileCd: 0,
  switchT: 0,
  muzzleT: 0,
  ssgPumpT: 0,
  spin: 0
};

const enemyTypes = {
  husk: {
    label: 'Husk', hp: 58, speed: 4.8, radius: 0.58, height: 1.55, score: 50,
    melee: 13, cooldown: 1.0, staggerHp: 18, color: 0xe65a31, emissive: 0x601200,
    armorOnBurn: 2, dropHealth: 4, dropAmmo: 5, fuelCost: 1
  },
  imp: {
    label: 'Imp', hp: 96, speed: 3.4, radius: 0.72, height: 1.9, score: 90,
    melee: 17, projectile: 13, cooldown: 1.7, staggerHp: 28, color: 0xb68c52, emissive: 0xff5a11,
    armorOnBurn: 3, dropHealth: 5, dropAmmo: 7, fuelCost: 1
  },
  revenant: {
    label: 'Revenant', hp: 150, speed: 3.05, radius: 0.78, height: 2.18, score: 150,
    melee: 20, projectile: 15, cooldown: 1.45, staggerHp: 38, color: 0xcfc0a0, emissive: 0x36c8ff,
    armorOnBurn: 4, dropHealth: 6, dropAmmo: 9, fuelCost: 2
  },
  bruiser: {
    label: 'Bruiser', hp: 240, speed: 2.25, radius: 1.08, height: 2.55, score: 220,
    melee: 28, projectile: 18, cooldown: 2.4, staggerHp: 50, color: 0x8e2f2c, emissive: 0xff2410,
    armorOnBurn: 5, dropHealth: 8, dropAmmo: 12, fuelCost: 3
  }
};

const weapons = [
  {
    id: 'ssg', name: 'Twin Anvil + Meat Hook', kind: 'shells', ammoCost: 2,
    fireDelay: 0.78, pellets: 15, spread: 0.071, range: 21, baseDamage: 16,
    closeBonus: 1.48
  },
  {
    id: 'heavy', name: 'Heavy Autorifle', kind: 'bullets', ammoCost: 1,
    fireDelay: 0.061, spread: 0.012, range: 54, baseDamage: 10.5
  }
];

const finiteStages = [
  { name: 'Stage 1: First Blood', intro: 'Use movement first. Three fodder demons.', enemies: ['husk','husk','husk'], opening: 2, interval: 1.05 },
  { name: 'Stage 2: Fireline', intro: 'Imp caster introduced. Keep dashing laterally.', enemies: ['husk','husk','husk','husk','imp'], opening: 3, interval: 1.0 },
  { name: 'Stage 3: Balcony Pressure', intro: 'Vertical spawns. Hook nodes are escape routes.', enemies: ['husk','husk','husk','imp','imp','husk'], opening: 3, interval: 0.9 },
  { name: 'Stage 4: Bruiser Tease', intro: 'First heavy demon. Chainsaw fodder for ammo.', enemies: ['husk','husk','imp','husk','imp','bruiser'], opening: 3, interval: 0.92 },
  { name: 'Stage 5: Split Platforms', intro: 'Revenants enter: skeletal jump troops with fast shoulder rockets.', enemies: ['husk','husk','imp','revenant','imp','husk','husk'], opening: 4, interval: 0.82 },
  { name: 'Stage 6: Hook Circuit', intro: 'Use meat hook + double jump + dash to control height.', enemies: ['husk','husk','imp','revenant','bruiser','husk','imp','husk'], opening: 4, interval: 0.78 },
  { name: 'Stage 7: Crossfire', intro: 'Keep enemies burning for armor showers.', enemies: ['husk','imp','revenant','husk','bruiser','imp','husk','revenant','imp'], opening: 4, interval: 0.74 },
  { name: 'Stage 8: Heavy Steps', intro: 'Two heavies enter slowly. Revenants punish flat routes.', enemies: ['husk','husk','imp','bruiser','revenant','husk','bruiser','imp','husk','revenant'], opening: 4, interval: 0.72 },
  { name: 'Stage 9: Argent Rush', intro: 'Fast wave. Micro missiles clean clustered casters.', enemies: ['husk','husk','revenant','imp','imp','bruiser','imp','husk','revenant','bruiser','husk'], opening: 5, interval: 0.66 },
  { name: 'Stage 10: Final Lockdown', intro: 'Clear this to unlock the endless horde.', enemies: ['husk','imp','revenant','bruiser','imp','husk','revenant','bruiser','husk','imp','bruiser','husk','revenant'], opening: 5, interval: 0.62 }
];

const stageState = {
  index: 0,
  endless: false,
  pending: [],
  spawnTimer: 0,
  betweenTimer: 0,
  started: false,
  announceT: 0,
  killsAtStart: 0,
  stageKills: 0,
  endlessTimer: 2.4,
  endlessSpawnDelay: 2.4,
  spawnedThisStage: 0
};

const execution = {
  active: false,
  kind: null,
  target: null,
  t: 0,
  duration: 0,
  impactTime: 0,
  impactDone: false,
  startPos: new THREE.Vector3(),
  targetPos: new THREE.Vector3(),
  lookPos: new THREE.Vector3(),
  startYaw: 0,
  startPitch: 0
};

const sharedGeometries = {};
let hudRefreshTimer = 0;
let miniMapRefreshTimer = 0;

let weaponRoot, ssgModel, heavyModel, muzzleFlash, chainLine, flameGroup;
let finisherGroup, finisherBlade, finisherSaw, finisherArm, finisherSpark;
let sawSpin = 0;
let damageOverlay, vignetteOverlay;
let lavaMaterial;
let cameraBaseFov = 82;

// V5 hotfix: cut in-game allocation churn. The biggest stalls came from
// creating/removing hundreds of Meshes, geometries, lights, pickups, tracers,
// and audio nodes in a single shotgun/hook/gib event. These pools keep the
// presentation punchy while making those events mostly allocation-free.
const PERF = {
  postprocess: false,
  maxDpr: 1.15,
  glowParticles: 720,
  debrisParticles: 420,
  tracers: 72,
  flashLights: 5,
  decals: 30,
  maxPickups: 54,
  pickupPoolPerType: 24,
  enemyPool: { husk: 16, imp: 12, bruiser: 8, revenant: 9 },
  projectilePool: { playerMissile: 24, fireball: 42 }
};
let particleFX = null;
let tracerFX = null;
let lightFX = null;
let decalFX = null;
const pickupPools = { health: [], armor: [], ammo: [] };
const enemyPools = { husk: [], imp: [], bruiser: [], revenant: [] };
const projectilePools = { playerMissile: [], fireball: [] };
const tmpColor = new THREE.Color();
const warmup = { active: false, audio: false };
const browserInfo = {
  firefox: typeof navigator !== 'undefined' && /Firefox\//.test(navigator.userAgent)
};
const perfLog = {
  enabled: new URLSearchParams(location.search).has('debugPerf'),
  overlayEnabled: new URLSearchParams(location.search).has('debugPerf'),
  ttl: 30,
  max: 220,
  entries: [],
  dom: null,
  lastSave: 0,
  persist: false
};

function perfNowMs() {
  return performance.now();
}

function perfEvent(label, data = '') {
  if (!perfLog.enabled) return;
  const ms = perfNowMs();
  const text = `[${(ms / 1000).toFixed(3)}s f=${clockTime.toFixed(2)}] ${label}${data ? ' ' + data : ''}`;
  perfLog.entries.push({ ms, text });
  if (perfLog.entries.length > perfLog.max) perfLog.entries.splice(0, perfLog.entries.length - perfLog.max);
  updatePerfOverlay(ms);
  if (perfLog.persist && ms - perfLog.lastSave > 700) {
    perfLog.lastSave = ms;
    try { localStorage.setItem('hellrushPerfLog', perfLog.entries.map(e => e.text).join('\n')); } catch {}
  }
}

function perfSpan(label, fn, threshold = 3) {
  const t0 = perfNowMs();
  const result = fn();
  const dt = perfNowMs() - t0;
  if (dt >= threshold) perfEvent(label, `${dt.toFixed(1)}ms`);
  return result;
}

function updatePerfOverlay(ms = perfNowMs()) {
  if (!perfLog.dom) return;
  if (!perfLog.overlayEnabled) {
    perfLog.dom.classList.add('hidden');
    return;
  }
  const visible = perfLog.entries.filter(e => ms - e.ms <= perfLog.ttl * 1000);
  perfLog.dom.classList.toggle('hidden', visible.length === 0);
  if (visible.length) perfLog.dom.textContent = 'Hellrush perf log - last 30s (P toggles, window.__hellrushPerfDump() copies text)\n' + visible.map(e => e.text).join('\n');
}


class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.noiseBuffer = null;
    this.started = false;
    this.nextBeat = 0;
    this.silentWarmup = false;
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.82;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.045;
    this.musicGain.connect(this.master);
    this.noiseBuffer = this.makeNoiseBuffer(2.0);
    this.started = true;
    this.startDrone();
  }

  warmCombat() {
    this.ensure();
    if (!this.started) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.015;
    const gain = ctx.createGain();
    gain.gain.value = 0.00001;
    gain.connect(this.master);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 90;
    osc.connect(gain);
    osc.start(t0);
    osc.stop(t0 + 0.025);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 1.2;
    src.connect(filter);
    filter.connect(gain);
    src.start(t0, 0, 0.025);
    src.stop(t0 + 0.035);

    const panner = this.makePanner(tmpV1.set(0, 1, -3), 1.0, 4.5);
    if (panner) {
      const pg = ctx.createGain();
      pg.gain.value = 0.00001;
      pg.connect(panner);
      const po = ctx.createOscillator();
      po.frequency.value = 120;
      po.connect(pg);
      po.start(t0);
      po.stop(t0 + 0.02);
    }
  }

  runSilentWarmup(fn) {
    this.ensure();
    if (!this.started) return fn();
    this.silentWarmup = true;
    try {
      return fn();
    } finally {
      this.silentWarmup = false;
    }
  }

  makeNoiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (precomputedNoiseData) {
      for (let i = 0; i < len; i++) data[i] = precomputedNoiseData[i % precomputedNoiseData.length];
      return buffer;
    }
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.19;
    }
    return buffer;
  }

  ensure() {
    if (!this.started) this.start();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  startDrone() {
    const ctx = this.ctx;
    const root = ctx.createOscillator();
    const fifth = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    root.type = 'sawtooth';
    fifth.type = 'triangle';
    root.frequency.value = 45;
    fifth.frequency.value = 67.5;
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 420;
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.45;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    root.connect(filter);
    fifth.connect(filter);
    filter.connect(this.musicGain);
    root.start(); fifth.start(); lfo.start();
  }

  updateListener() {
    if (!this.started || !this.ctx.listener || !camera) return;
    const listener = this.ctx.listener;
    const p = camera.getWorldPosition(tmpV1);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const t = this.ctx.currentTime + 0.02;
    const props = ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'];
    if (listener.positionX) {
      listener.positionX.linearRampToValueAtTime(p.x, t);
      listener.positionY.linearRampToValueAtTime(p.y, t);
      listener.positionZ.linearRampToValueAtTime(p.z, t);
      listener.forwardX.linearRampToValueAtTime(f.x, t);
      listener.forwardY.linearRampToValueAtTime(f.y, t);
      listener.forwardZ.linearRampToValueAtTime(f.z, t);
      listener.upX.linearRampToValueAtTime(u.x, t);
      listener.upY.linearRampToValueAtTime(u.y, t);
      listener.upZ.linearRampToValueAtTime(u.z, t);
    } else if (listener.setPosition) {
      listener.setPosition(p.x, p.y, p.z);
      listener.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  makePanner(pos, rolloff = 1.2, refDistance = 4.5) {
    if (!this.started || !pos) return null;
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = refDistance;
    panner.maxDistance = 48;
    panner.rolloffFactor = rolloff;
    if (panner.positionX) {
      panner.positionX.value = pos.x;
      panner.positionY.value = pos.y;
      panner.positionZ.value = pos.z;
    } else panner.setPosition(pos.x, pos.y, pos.z);
    panner.connect(this.master);
    return panner;
  }

  envelope(gain, t0, peak, sustainTime, decayTime) {
    gain.gain.cancelScheduledValues(t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.35), t0 + sustainTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + sustainTime + decayTime);
  }

  noise({ duration = 0.2, volume = 0.25, filter = 1200, q = 0.8, type = 'lowpass', pos = null, detune = 1, delay = 0 }) {
    this.ensure();
    if (!this.started) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    if (this.silentWarmup) volume = 0.00001;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = detune;
    const gain = ctx.createGain();
    const biquad = ctx.createBiquadFilter();
    biquad.type = type;
    biquad.frequency.value = filter;
    biquad.Q.value = q;
    src.connect(biquad);
    biquad.connect(gain);
    gain.connect(pos ? this.makePanner(pos) : this.master);
    this.envelope(gain, t0, volume, duration * 0.28, duration * 0.72);
    src.start(t0, Math.random() * 1.2, duration + 0.05);
    src.stop(t0 + duration + 0.1);
  }

  tone({ freq = 440, duration = 0.15, volume = 0.16, type = 'sine', bend = 0, pos = null, delay = 0 }) {
    this.ensure();
    if (!this.started) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    if (this.silentWarmup) volume = 0.00001;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (bend) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * bend), t0 + duration);
    osc.connect(gain);
    gain.connect(pos ? this.makePanner(pos) : this.master);
    this.envelope(gain, t0, volume, duration * 0.15, duration * 0.85);
    osc.start(t0);
    osc.stop(t0 + duration + 0.04);
  }

  shotgun() {
    // Chunky transient + sub thump + metallic pump tail.
    this.noise({ duration: 0.36, volume: 0.82, filter: 620, q: 0.58, type: 'lowpass' });
    this.noise({ duration: 0.085, volume: 0.32, filter: 6200, q: 0.9, type: 'highpass' });
    this.noise({ duration: 0.12, volume: 0.18, filter: 1500, q: 2.8, type: 'bandpass', delay: 0.11 });
    this.tone({ freq: 58, duration: 0.24, volume: 0.42, type: 'triangle', bend: 0.42 });
    this.tone({ freq: 118, duration: 0.13, volume: 0.16, type: 'sawtooth', bend: 0.55, delay: 0.012 });
    this.tone({ freq: 840, duration: 0.045, volume: 0.055, type: 'square', bend: 0.62, delay: 0.23 });
  }

  cannon() {
    this.noise({ duration: 0.055, volume: 0.20, filter: 2600, q: 1.0, type: 'bandpass' });
    this.noise({ duration: 0.035, volume: 0.055, filter: 7400, q: 0.7, type: 'highpass' });
    this.tone({ freq: rand(78, 96), duration: 0.058, volume: 0.085, type: 'sawtooth', bend: 0.55 });
  }

  missile(pos = null) {
    this.noise({ duration: 0.11, volume: 0.16, filter: 2100, q: 1.4, type: 'bandpass', pos });
    this.tone({ freq: 440, duration: 0.15, volume: 0.085, type: 'sawtooth', bend: 2.0, pos });
    this.tone({ freq: 92, duration: 0.09, volume: 0.055, type: 'triangle', bend: 0.7, pos });
  }

  explosion(pos) {
    this.noise({ duration: 0.46, volume: 0.70, filter: 420, q: 0.48, type: 'lowpass', pos });
    this.noise({ duration: 0.12, volume: 0.18, filter: 3600, q: 0.7, type: 'highpass', pos });
    this.tone({ freq: 46, duration: 0.38, volume: 0.34, type: 'triangle', bend: 0.38, pos });
  }

  hookStart() {
    this.tone({ freq: 260, duration: 0.12, volume: 0.11, type: 'sawtooth', bend: 1.7 });
    this.noise({ duration: 0.16, volume: 0.12, filter: 3800, q: 2.2, type: 'bandpass' });
  }

  hookPull() {
    this.tone({ freq: 112, duration: 0.18, volume: 0.08, type: 'sawtooth', bend: 1.2 });
  }

  dash() {
    this.noise({ duration: 0.19, volume: 0.26, filter: 2600, q: 0.5, type: 'highpass' });
    this.tone({ freq: 150, duration: 0.12, volume: 0.105, type: 'triangle', bend: 0.48 });
  }

  jump(doubleJump = false) {
    this.noise({ duration: 0.08, volume: doubleJump ? 0.14 : 0.1, filter: doubleJump ? 1600 : 900, q: 0.7, type: 'bandpass' });
    this.tone({ freq: doubleJump ? 440 : 260, duration: 0.09, volume: 0.045, type: 'triangle', bend: 1.18 });
  }

  pad(pos) {
    this.tone({ freq: 145, duration: 0.25, volume: 0.20, type: 'sawtooth', bend: 2.65, pos });
    this.tone({ freq: 520, duration: 0.18, volume: 0.065, type: 'triangle', bend: 1.8, pos, delay: 0.03 });
    this.noise({ duration: 0.20, volume: 0.23, filter: 3300, q: 1.1, type: 'bandpass', pos });
  }

  pickup(type) {
    // Pickups are deliberately bright/rising; damage stays low/dissonant.
    if (type === 'health') {
      this.tone({ freq: 740, duration: 0.075, volume: 0.06, type: 'triangle', bend: 1.12 });
      this.tone({ freq: 988, duration: 0.082, volume: 0.05, type: 'sine', bend: 1.08, delay: 0.045 });
      this.tone({ freq: 1480, duration: 0.095, volume: 0.038, type: 'sine', bend: 1.03, delay: 0.095 });
    } else if (type === 'armor') {
      this.tone({ freq: 420, duration: 0.075, volume: 0.052, type: 'triangle', bend: 1.35 });
      this.tone({ freq: 840, duration: 0.06, volume: 0.035, type: 'sine', bend: 1.16, delay: 0.045 });
      this.noise({ duration: 0.06, volume: 0.04, filter: 4300, q: 2.2, type: 'bandpass' });
    } else if (type === 'ammo') {
      this.noise({ duration: 0.075, volume: 0.08, filter: 1800, q: 4.4, type: 'bandpass' });
      this.tone({ freq: 245, duration: 0.06, volume: 0.045, type: 'square', bend: 1.25, delay: 0.014 });
      this.tone({ freq: 490, duration: 0.052, volume: 0.035, type: 'triangle', bend: 1.12, delay: 0.073 });
    } else if (type === 'power') {
      this.tone({ freq: 620, duration: 0.08, volume: 0.055, type: 'triangle', bend: 1.45 });
      this.tone({ freq: 1240, duration: 0.08, volume: 0.032, type: 'sine', bend: 1.05, delay: 0.055 });
    } else {
      this.tone({ freq: 720, duration: 0.08, volume: 0.045, type: 'triangle', bend: 1.3 });
    }
  }

  stageStart() {
    this.tone({ freq: 110, duration: 0.22, volume: 0.08, type: 'sawtooth', bend: 1.55 });
    this.tone({ freq: 220, duration: 0.2, volume: 0.052, type: 'triangle', bend: 1.35, delay: 0.065 });
    this.noise({ duration: 0.16, volume: 0.09, filter: 1800, q: 1.4, type: 'bandpass', delay: 0.03 });
  }

  stageClear() {
    this.tone({ freq: 392, duration: 0.13, volume: 0.055, type: 'triangle', bend: 1.06 });
    this.tone({ freq: 523, duration: 0.14, volume: 0.05, type: 'triangle', bend: 1.04, delay: 0.09 });
    this.tone({ freq: 784, duration: 0.19, volume: 0.042, type: 'sine', bend: 1.02, delay: 0.18 });
    this.noise({ duration: 0.12, volume: 0.04, filter: 4200, q: 0.8, type: 'highpass', delay: 0.18 });
  }

  negativeClick() {
    this.tone({ freq: 130, duration: 0.085, volume: 0.05, type: 'square', bend: 0.55 });
    this.noise({ duration: 0.07, volume: 0.04, filter: 600, q: 1.2, type: 'lowpass' });
  }

  hit(pos, heavy = false) {
    this.noise({ duration: heavy ? 0.15 : 0.08, volume: heavy ? 0.28 : 0.15, filter: heavy ? 520 : 1250, q: 0.7, type: 'bandpass', pos });
    if (heavy) this.tone({ freq: 82, duration: 0.10, volume: 0.07, type: 'triangle', bend: 0.62, pos });
  }

  gore(pos) {
    this.noise({ duration: 0.24, volume: 0.30, filter: 620, q: 0.9, type: 'lowpass', pos, detune: 0.78 });
    this.noise({ duration: 0.09, volume: 0.08, filter: 2700, q: 1.1, type: 'bandpass', pos, delay: 0.035 });
    this.tone({ freq: 72, duration: 0.16, volume: 0.10, type: 'triangle', bend: 0.55, pos });
  }

  hurt() {
    this.noise({ duration: 0.28, volume: 0.34, filter: 360, q: 0.8, type: 'lowpass' });
    this.tone({ freq: 58, duration: 0.22, volume: 0.18, type: 'sawtooth', bend: 0.42 });
    this.tone({ freq: 111, duration: 0.12, volume: 0.07, type: 'square', bend: 0.55, delay: 0.026 });
  }

  flame() {
    this.noise({ duration: 0.32, volume: 0.24, filter: 1400, q: 0.4, type: 'lowpass' });
  }

  chainsaw() {
    this.noise({ duration: 0.72, volume: 0.34, filter: 860, q: 6.2, type: 'bandpass' });
    this.noise({ duration: 0.20, volume: 0.20, filter: 2800, q: 1.7, type: 'bandpass', delay: 0.34 });
    this.tone({ freq: 72, duration: 0.66, volume: 0.16, type: 'sawtooth', bend: 1.22 });
    this.tone({ freq: 46, duration: 0.22, volume: 0.11, type: 'triangle', bend: 0.62, delay: 0.36 });
  }

  glory() {
    this.noise({ duration: 0.24, volume: 0.32, filter: 620, q: 0.65, type: 'lowpass' });
    this.noise({ duration: 0.06, volume: 0.12, filter: 3600, q: 1.8, type: 'bandpass', delay: 0.06 });
    this.tone({ freq: 64, duration: 0.16, volume: 0.16, type: 'triangle', bend: 0.34 });
    this.tone({ freq: 520, duration: 0.07, volume: 0.055, type: 'square', bend: 0.62, delay: 0.06 });
  }

  enemyFire(pos) {
    this.tone({ freq: 250, duration: 0.22, volume: 0.11, type: 'sawtooth', bend: 0.58, pos });
    this.noise({ duration: 0.13, volume: 0.14, filter: 1500, q: 1.25, type: 'bandpass', pos });
  }

  spawn(pos) {
    this.tone({ freq: 86, duration: 0.38, volume: 0.105, type: 'sawtooth', bend: 2.05, pos });
    this.noise({ duration: 0.20, volume: 0.08, filter: 980, q: 2.0, type: 'bandpass', pos, delay: 0.06 });
  }

  lava() {
    this.noise({ duration: 0.18, volume: 0.13, filter: 510, q: 1.2, type: 'lowpass' });
    this.tone({ freq: 69, duration: 0.12, volume: 0.07, type: 'sawtooth', bend: 0.64 });
  }
}
const audio = new AudioBus();

async function main() {
  bindDom();
  setBootProgress(0.04, 'Preparing renderer');
  await nextFrame();
  initRenderer();
  setBootProgress(0.16, 'Forging materials');
  await nextFrame();
  await initMaterials();
  setBootProgress(0.25, 'Loading enemy assets');
  await nextFrame();
  await loadCharacterAssets();
  setBootProgress(0.30, 'Igniting arena lights');
  await nextFrame();
  initScene();
  setBootProgress(0.42, 'Allocating combat pools');
  await nextFrame();
  initPerformanceSystems();
  setBootProgress(0.56, 'Building level routes');
  await nextFrame();
  createLevel();
  setBootProgress(0.72, 'Mounting weapons');
  await nextFrame();
  createWeapons();
  resetPlayer();
  updateHUD();
  setBootProgress(0.84, 'Compiling shaders');
  await prewarmGpu();
  setupInput();
  setBootProgress(1, 'Ready');
  if (dom.startButton) dom.startButton.disabled = false;
  requestAnimationFrame(loop);
}

function bindDom() {
  for (const id of ['overlay','startButton','hud','health','armor','ammo','shells','bullets','weapon','dash','jump','fuel','glory','flame','stage','score','status','crosshair','lockHint','help','damage','vignette','minimap','version','bootFill','bootStatus','perfLog']) {
    dom[id] = document.getElementById(id);
  }
  if (dom.version) dom.version.textContent = `${VERSION} · ${CDN_VERSION}`;
  if (dom.startButton) dom.startButton.disabled = true;
  perfLog.dom = dom.perfLog;
  window.__hellrushPerfDump = () => {
    const text = perfLog.entries.map(e => e.text).join('\n');
    try { localStorage.setItem('hellrushPerfLog', text); } catch {}
    try { navigator.clipboard && navigator.clipboard.writeText(text); } catch {}
    return text;
  };
  window.__hellrushPerfEnable = () => {
    perfLog.enabled = true;
    perfLog.overlayEnabled = true;
    perfEvent('PERF_ENABLED');
    return 'Perf logging enabled';
  };
  window.__hellrushPerfClear = () => {
    perfLog.entries.length = 0;
    try { localStorage.removeItem('hellrushPerfLog'); } catch {}
    updatePerfOverlay();
  };
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

function setBootProgress(value, label) {
  if (dom.bootFill) dom.bootFill.style.transform = `scaleX(${clamp(value, 0, 1).toFixed(3)})`;
  if (dom.bootStatus) dom.bootStatus.textContent = label;
}

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PERF.maxDpr));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x070504, 1);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080607);
  scene.fog = new THREE.FogExp2(0x09070b, 0.021);

  camera = new THREE.PerspectiveCamera(cameraBaseFov, window.innerWidth / window.innerHeight, 0.025, 180);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  if (PERF.postprocess) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.08, 0.10, 1.48);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PERF.maxDpr));
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  });

  damageOverlay = dom.damage;
  vignetteOverlay = dom.vignette;
}

function makeCanvasTexture(draw, size = 256, repeatX = 1, repeatY = 1, color = true) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

async function loadGameTexture(path, repeatX, repeatY, color = true) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = path;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  canvas.getContext('2d').drawImage(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function urlDirectory(url) {
  const clean = url.split('?')[0].replace(/\\/g, '/');
  return clean.includes('/') ? clean.slice(0, clean.lastIndexOf('/') + 1) : './';
}

function cacheSuffix(url) {
  const marker = url.indexOf('?');
  return marker === -1 ? '' : `?${url.slice(marker + 1)}`;
}

function loadTextureUrl(url, colorSpace = THREE.NoColorSpace) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (tex) => {
      tex.flipY = false;
      tex.colorSpace = colorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      resolve(tex);
    }, undefined, reject);
  });
}

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, reject);
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

function cloneMaterialInstances(object) {
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

async function applySidecarMaterialOverrides(modelUrl, object) {
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
    loaded[key] = await loadTextureUrl(`${manifestDir}${spec.file}${bust}`, space);
  }
  for (const mat of collectMaterials(object)) {
    if (loaded.baseColor) mat.map = loaded.baseColor;
    if (loaded.normal) mat.normalMap = loaded.normal;
    if (loaded.roughness) mat.roughnessMap = loaded.roughness;
    if (loaded.metallic) mat.metalnessMap = loaded.metallic;
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

async function loadCharacterAssets() {
  const modelUrl = './assets/characters/ember-runt/runtime/models/ember-runt-walking.glb?v=ember-runt-v2';
  try {
    const gltf = await loadGltf(modelUrl);
    const root = gltf.scene;
    await applySidecarMaterialOverrides(modelUrl, root);
    root.traverse((child) => {
      child.frustumCulled = false;
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);
    root.position.y += size.y * 0.5;
    characterAssets.emberRunt = {
      name: 'Ember Runt',
      scene: root,
      animations: gltf.animations || [],
      height: size.y || 1.75
    };
  } catch (err) {
    console.warn('Ember Runt runtime asset unavailable; using procedural husk.', err);
  }
}

async function initMaterials() {
  textures.floor = makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = '#29241f'; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 64) {
      for (let x = 0; x < s; x += 64) {
        ctx.fillStyle = ((x + y) / 64) % 2 ? '#211c19' : '#332c26';
        ctx.fillRect(x + 2, y + 2, 60, 60);
        ctx.strokeStyle = '#5d4b39'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, 60, 60);
        ctx.strokeStyle = 'rgba(255,122,40,.14)'; ctx.beginPath(); ctx.moveTo(x + 10, y + 52); ctx.lineTo(x + 53, y + 12); ctx.stroke();
      }
    }
    for (let i = 0; i < 1200; i++) {
      const a = Math.random() * 45;
      ctx.fillStyle = `rgba(${70 + a},${55 + a * 0.4},${42},${Math.random() * 0.12})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    ctx.lineWidth = 2;
    for (let i = 0; i < 32; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 14 + Math.random() * 24;
      ctx.strokeStyle = Math.random() < .55 ? 'rgba(255,86,28,.18)' : 'rgba(80,220,255,.13)';
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + k * Math.PI / 3;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
    }
  }, 512, 8, 8);

  textures.wall = makeCanvasTexture((ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#2d2220'); g.addColorStop(0.45, '#4a3430'); g.addColorStop(1, '#151211');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 42) {
      ctx.strokeStyle = '#090606'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y + 13); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,96,32,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y + 2); ctx.lineTo(s, y + 15); ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = 'rgba(255,80,20,.2)';
      ctx.fillRect(Math.random() * s, Math.random() * s, 12 + Math.random() * 45, 2);
    }
    ctx.strokeStyle = 'rgba(120,210,255,.16)'; ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18 + Math.random() * 44, y + Math.random() * 18); ctx.lineTo(x + Math.random() * 24, y + 24 + Math.random() * 32); ctx.stroke();
    }
  }, 512, 3, 2);

  textures.metal = makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = '#1a1b1d'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? '#25282b' : '#121416';
      ctx.fillRect(0, i * s / 10, s, s / 11);
    }
    ctx.strokeStyle = '#555b62'; ctx.lineWidth = 3;
    for (let x = 0; x < s; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 18, s); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (let i = 0; i < 500; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
  }, 512, 4, 4);

  textures.normalRough = makeCanvasTexture((ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const nx = Math.sin(x * 0.16) * 0.5 + Math.sin((x + y) * 0.07) * 0.35 + (Math.random() - 0.5) * 0.3;
        const ny = Math.cos(y * 0.14) * 0.5 + Math.cos((x - y) * 0.05) * 0.35 + (Math.random() - 0.5) * 0.3;
        const i = (y * s + x) * 4;
        img.data[i] = clamp(128 + nx * 65, 0, 255);
        img.data[i + 1] = clamp(128 + ny * 65, 0, 255);
        img.data[i + 2] = 228;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, 256, 5, 5, false);

  try {
    const [floorTex, wallTex, metalTex, runeTex] = await Promise.all([
      loadGameTexture('./assets/textures/hell-floor.png', 8, 8),
      loadGameTexture('./assets/textures/hell-wall.png', 3, 2),
      loadGameTexture('./assets/textures/hell-metal.png', 4, 4),
      loadGameTexture('./assets/textures/hell-rune.png', 4, 4)
    ]);
    textures.floor = floorTex;
    textures.wall = wallTex;
    textures.metal = metalTex;
    textures.rune = runeTex;
  } catch (err) {
    console.warn('V6 image textures unavailable; using procedural fallback.', err);
  }

  materials.floor = new THREE.MeshStandardMaterial({
    map: textures.floor, normalMap: textures.normalRough, normalScale: new THREE.Vector2(0.32, 0.32),
    roughness: 0.68, metalness: 0.26, envMapIntensity: 0.55
  });
  materials.wall = new THREE.MeshStandardMaterial({
    map: textures.wall, normalMap: textures.normalRough, normalScale: new THREE.Vector2(0.18, 0.18),
    roughness: 0.78, metalness: 0.12, color: 0xffe1cf
  });
  materials.metal = new THREE.MeshStandardMaterial({
    map: textures.metal, normalMap: textures.normalRough, normalScale: new THREE.Vector2(0.26, 0.26),
    roughness: 0.36, metalness: 0.8, color: 0xb9c2c9
  });
  materials.darkMetal = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.42, metalness: 0.86 });
  materials.redMetal = new THREE.MeshStandardMaterial({ color: 0x5b1d1a, emissive: 0x280500, roughness: 0.48, metalness: 0.65 });
  materials.obsidian = new THREE.MeshStandardMaterial({ color: 0x0d0d12, emissive: 0x12040a, emissiveIntensity: 0.25, roughness: 0.62, metalness: 0.38, normalMap: textures.normalRough, normalScale: new THREE.Vector2(0.22, 0.22) });
  materials.runeMetal = new THREE.MeshStandardMaterial({ map: textures.rune || textures.metal, color: 0x91dcff, emissive: 0x06324b, emissiveIntensity: 0.24, roughness: 0.34, metalness: 0.78, normalMap: textures.normalRough, normalScale: new THREE.Vector2(0.18, 0.18) });
  materials.bone = new THREE.MeshStandardMaterial({ color: 0xd1b287, roughness: 0.64, metalness: 0.03, normalMap: textures.normalRough, normalScale: new THREE.Vector2(0.1, 0.1) });
  materials.enemyArmor = new THREE.MeshStandardMaterial({ color: 0x1a1b20, emissive: 0x210407, emissiveIntensity: 0.2, roughness: 0.36, metalness: 0.75 });
  materials.orangeGlow = new THREE.MeshStandardMaterial({ color: 0xff7430, emissive: 0xff4a10, emissiveIntensity: 1.15, roughness: 0.35 });
  materials.blueGlow = new THREE.MeshStandardMaterial({ color: 0x8ee7ff, emissive: 0x23bdff, emissiveIntensity: 1.35, roughness: 0.18 });
  materials.greenGlow = new THREE.MeshStandardMaterial({ color: 0x8cff5e, emissive: 0x38ff20, emissiveIntensity: 1.55, roughness: 0.2 });
  materials.purpleGlow = new THREE.MeshStandardMaterial({ color: 0xd096ff, emissive: 0x9e3dff, emissiveIntensity: 1.2, roughness: 0.18 });
  materials.blood = new THREE.MeshBasicMaterial({ color: 0x5d0702, transparent: true, opacity: 0.7, depthWrite: false });
  materials.health = new THREE.MeshStandardMaterial({ color: 0x43fff2, emissive: 0x18d7ff, emissiveIntensity: 1.15, roughness: 0.18, metalness: 0.08 });
  materials.healthDark = new THREE.MeshStandardMaterial({ color: 0x073942, emissive: 0x0c8fa0, emissiveIntensity: 0.55, roughness: 0.34, metalness: 0.18 });
  materials.armor = new THREE.MeshStandardMaterial({ color: 0x4d6f2f, emissive: 0x315f18, emissiveIntensity: 0.75, roughness: 0.36, metalness: 0.36 });
  materials.armorDark = new THREE.MeshStandardMaterial({ color: 0x1d2e16, roughness: 0.52, metalness: 0.42 });
  materials.ammo = new THREE.MeshStandardMaterial({ color: 0xff8b24, emissive: 0xff5e00, emissiveIntensity: 1.0, roughness: 0.28, metalness: 0.42 });
  materials.ammoDark = new THREE.MeshStandardMaterial({ color: 0x3b1a09, emissive: 0x522000, emissiveIntensity: 0.25, roughness: 0.52, metalness: 0.35 });
  materials.pickupWhite = new THREE.MeshStandardMaterial({ color: 0xfaffd6, emissive: 0xb6ffca, emissiveIntensity: 0.45, roughness: 0.24, metalness: 0.14 });
  materials.lightBeamOrange = new THREE.MeshBasicMaterial({ color: 0xff6b24, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: 2 });
  materials.lightBeamBlue = new THREE.MeshBasicMaterial({ color: 0x47d8ff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: 2 });
  materials.runeGlass = new THREE.MeshStandardMaterial({ color: 0x13232b, emissive: 0x0b8fc8, emissiveIntensity: 0.85, roughness: 0.22, metalness: 0.38, transparent: true, opacity: 0.72, depthWrite: false });

  // Shared geometry cuts allocation churn during firefights and helps avoid periodic GC hitches.
  sharedGeometries.particle = new THREE.SphereGeometry(1, 6, 4);
  sharedGeometries.fireball = new THREE.SphereGeometry(1, 12, 8);
  sharedGeometries.pickupHealthCore = new THREE.IcosahedronGeometry(0.22, 1);
  sharedGeometries.pickupArmorCore = new THREE.OctahedronGeometry(0.24, 0);
  sharedGeometries.pickupAmmoBox = new THREE.BoxGeometry(0.42, 0.24, 0.30);
  sharedGeometries.pickupBar = new THREE.BoxGeometry(0.09, 0.34, 0.09);
  sharedGeometries.pickupShell = new THREE.CylinderGeometry(0.045, 0.052, 0.30, 12);
  sharedGeometries.pickupPlate = new THREE.BoxGeometry(0.34, 0.11, 0.12);
  sharedGeometries.pickupHalo = new THREE.TorusGeometry(0.31, 0.018, 8, 28);
  sharedGeometries.pickupSmallHalo = new THREE.TorusGeometry(0.20, 0.014, 8, 20);
  sharedGeometries.missile = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.07, 0.28, 4, 8) : new THREE.SphereGeometry(0.12, 8, 8);

  lavaMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pulse: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; vec3 p=position; p.y += sin((position.x+position.z)*0.7)*0.035; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float time; uniform float pulse;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.)); vec2 u=f*f*(3.-2.*f); return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y; }
      void main(){ vec2 uv=vUv*5.0; float n=noise(uv+vec2(time*.55,-time*.25))*0.65 + noise(uv*2.2-vec2(time*.15,time*.45))*0.35; float veins=smoothstep(.48,.88,n); vec3 c=mix(vec3(.18,.025,.005), vec3(1.0,.28,.04), veins); c += vec3(1.0,.75,.25)*pow(veins,4.0)*1.25; gl_FragColor=vec4(c*pulse, .92); }`,
    transparent: true,
    depthWrite: false
  });
}

function initScene() {
  const hemi = new THREE.HemisphereLight(0x738aa8, 0x120709, 0.82);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffc99a, 1.18);
  sun.position.set(-11, 22, 8);
  sun.castShadow = false;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 70;
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38;
  sun.shadow.camera.bottom = -38;
  scene.add(sun);

  const weaponLight = new THREE.PointLight(0xffa66b, 0.55, 6, 2);
  weaponLight.position.set(0.3, -0.15, -0.8);
  camera.add(weaponLight);

  const skyGeo = new THREE.SphereGeometry(120, 32, 18);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vPos; uniform float time;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(41.7,289.3)))*49152.63); }
      float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.)); vec2 u=f*f*(3.-2.*f); return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y; }
      void main(){ vec3 n=normalize(vPos); float h=n.y; float az=atan(n.z,n.x); vec3 top=vec3(.018,.018,.04); vec3 low=vec3(.28,.035,.018); vec3 c=mix(low,top,smoothstep(-.18,.78,h));
      float cloud=noise(vec2(az*2.4+time*.015,h*5.5-time*.025))*0.8 + noise(vec2(az*5.0-time*.01,h*12.0))*0.22; c += vec3(.42,.04,.08)*smoothstep(.48,.86,cloud)*(1.0-smoothstep(.5,1.0,h));
      float aur=pow(abs(sin(az*3.0 + h*7.0 + time*.08)), 18.0)*(1.0-smoothstep(.65,1.0,h)); c += vec3(.03,.34,.52)*aur*.75;
      float star=step(.9975, hash(floor(vec2(az*90.0,h*80.0))))*smoothstep(.25,1.0,h); c += vec3(.8,.75,.65)*star*.55;
      float eclipse=smoothstep(.055,.0,length(n.xz-vec2(.18,-.42))) * smoothstep(.05,.35,h+.05); c += vec3(.9,.18,.06)*eclipse*1.2;
      gl_FragColor=vec4(c,1.0); }`
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.userData.sky = true;
  scene.add(sky);
  world.decorations.push({ mesh: sky, shader: skyMat });
}


function initPerformanceSystems() {
  particleFX = {
    glow: new PointParticlePool(PERF.glowParticles, true),
    debris: new PointParticlePool(PERF.debrisParticles, false),
    emit(pos, vel, color, life, size, emissive = false) {
      this.emitXYZ(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, color, life, size, emissive);
    },
    emitXYZ(x, y, z, vx, vy, vz, color, life, size, emissive = false) {
      (emissive ? this.glow : this.debris).emitXYZ(x, y, z, vx, vy, vz, color, life, size);
    },
    update(dt) { this.glow.update(dt); this.debris.update(dt); },
    clear() { this.glow.clear(); this.debris.clear(); }
  };
  tracerFX = new TracerPool(PERF.tracers);
  lightFX = new FlashLightPool(PERF.flashLights);
  decalFX = new DecalPool(PERF.decals);

  // Prewarm modeled pickups so SSG kills / chainsaw ammo payouts no longer
  // compile dozens of geometries/materials mid-combat.
  for (const type of ['health', 'armor', 'ammo']) {
    for (let i = 0; i < PERF.pickupPoolPerType; i++) {
      const mesh = createPickupMesh(type);
      mesh.visible = false;
      mesh.userData.poolType = type;
      mesh.position.set(0, -999, 0);
      mesh.scale.setScalar(1);
      scene.add(mesh);
      pickupPools[type].push(mesh);
    }
  }
  for (const type of Object.keys(enemyPools)) {
    const count = PERF.enemyPool[type] || 0;
    for (let i = 0; i < count; i++) {
      const mesh = createEnemyMesh(type, enemyTypes[type]);
      mesh.visible = false;
      mesh.position.set(0, -999, 0);
      mesh.userData.poolType = type;
      scene.add(mesh);
      enemyPools[type].push(mesh);
    }
  }
  for (const type of Object.keys(projectilePools)) {
    const count = PERF.projectilePool[type] || 0;
    for (let i = 0; i < count; i++) {
      const mesh = createProjectileMesh(type);
      mesh.visible = false;
      mesh.position.set(0, -999, 0);
      mesh.scale.setScalar(1);
      scene.add(mesh);
      projectilePools[type].push(mesh);
    }
  }
}

async function prewarmGpu() {
  precomputeAudioNoise();
  initGpuTextures();
  updateCameraTransform();

  const shown = [];
  let x = -10.5;
  let z = -7.2;
  for (const type of ['health', 'armor', 'ammo']) {
    const pool = pickupPools[type];
    for (let i = 0; i < pool.length; i++) {
      const mesh = pool[i];
      mesh.visible = true;
      mesh.position.set(x, 0.9 + (i % 3) * 0.18, z);
      mesh.rotation.set(0.35, i * 0.37, 0.2);
      mesh.scale.setScalar(1);
      shown.push(mesh);
      x += 0.82;
      if (x > 10.5) { x = -10.5; z -= 1.0; }
    }
  }
  x = -7.2;
  for (const type of Object.keys(enemyPools)) {
    const pool = enemyPools[type];
    for (let i = 0; i < pool.length; i++) {
      const mesh = pool[i];
      mesh.visible = true;
      mesh.position.set(x + (i % 4) * 1.2, 0.05, -10.2 - Math.floor(i / 4) * 1.6);
      mesh.rotation.y = Math.PI;
      mesh.scale.setScalar(mesh.userData.baseScale || 1);
      shown.push(mesh);
    }
    x += 4.8;
  }
  x = -1.2;
  for (const type of Object.keys(projectilePools)) {
    const pool = projectilePools[type];
    for (let i = 0; i < pool.length; i++) {
      const mesh = pool[i];
      mesh.visible = true;
      mesh.position.set(x + (i % 12) * 0.42, 1.3 + Math.floor(i / 12) * 0.28, -5.4);
      mesh.scale.setScalar(type === 'fireball' ? 0.22 : 1);
      shown.push(mesh);
    }
    x += 5.6;
  }
  warmCombatEffectBuffers();
  warmFirstHitPath(false);
  warmRareVisiblePaths();

  renderer.compile(scene, camera);
  for (let i = 0; i < 18; i++) {
    setBootProgress(0.80 + i * 0.011, i < 5 ? 'Warming pooled pickups' : i < 10 ? 'Warming enemies/projectiles' : i < 14 ? 'Priming finishers/hooks' : 'Priming combat effects');
    updateWorld(0.016, 0.016);
    updateParticles(0.016);
    updateWeapons(0.016);
    if (i < 8) warmRareVisiblePaths();
    renderer.render(scene, camera);
    await nextFrame();
  }

  for (const mesh of shown) {
    mesh.visible = false;
    mesh.position.set(0, -999, 0);
    mesh.scale.setScalar(mesh.userData.baseScale || 1);
  }
  if (particleFX) particleFX.clear();
  if (tracerFX) tracerFX.clear();
  if (lightFX) lightFX.clear();
  if (decalFX) decalFX.clear();
  weaponState.muzzleT = 0;
  if (muzzleFlash) for (const m of muzzleFlash.children) m.material.opacity = 0;
  if (chainLine) chainLine.visible = false;
  parkFinisherVisual();
}

function initGpuTextures() {
  if (!renderer || typeof renderer.initTexture !== 'function') return;
  for (const tex of Object.values(textures)) {
    if (tex && tex.isTexture) {
      try { renderer.initTexture(tex); } catch (err) { console.warn('Texture init failed', err); }
    }
  }
}

function warmCombatEffectBuffers() {
  const p = tmpV1.set(0, 1.2, -5.4);
  spawnMuzzleSparks(0x9fe7ff, 10);
  spawnRingParticles(p, 0x43fff2, 16, 2.2, 0.18);
  spawnRingParticles(tmpV2.set(1.2, 1.2, -5.4), 0xff8b24, 16, 2.2, 0.18);
  spawnGibs(tmpV3.set(-1.2, 1.2, -5.4), 0.7, 0xff4b21, 'gib');
  spawnExplosion(tmpV4.set(2.4, 1.2, -6.0), 0x85e8ff);
  spawnTracer(getCameraPos(tmpV1), getAimDir(), 10, 0xffd47a, 0.1);
  flashLight(tmpV2.set(0, 2.0, -5.5), 0xff6820, 1.2, 0.18, 6);
  weaponState.muzzleT = 0.07;
}

function warmRareVisiblePaths() {
  if (chainLine) {
    chainLine.visible = true;
    chainLine.geometry.setFromPoints([tmpV1.set(-0.3, 1.35, -1.2), tmpV2.set(0.8, 1.7, -8.0)]);
    chainLine.material.opacity = 0.8;
  }
  if (ssgModel) ssgModel.visible = true;
  if (heavyModel) heavyModel.visible = true;
  if (finisherGroup) {
    finisherGroup.visible = true;
    finisherGroup.position.set(-0.08, -0.08, -0.46);
    finisherGroup.rotation.set(-0.25, 0.3, -0.24);
    finisherGroup.scale.setScalar(1);
  }
  if (finisherArm) finisherArm.visible = true;
  if (finisherBlade) {
    finisherBlade.visible = true;
    finisherBlade.scale.set(1, 1, 1.25);
    finisherBlade.rotation.y = 0.28;
  }
  if (finisherSaw) {
    finisherSaw.visible = true;
    finisherSaw.scale.setScalar(1);
    finisherSaw.rotation.z = -0.02;
  }
  if (finisherSpark) {
    finisherSpark.visible = true;
    finisherSpark.intensity = 3.2;
    finisherSpark.distance = 3.5;
  }
}

function warmFirstHitPath(withAudio = false) {
  const savedScore = player.score;
  const savedKills = player.kills;
  const savedStatus = dom.status ? dom.status.textContent : '';
  const savedLastGore = lastGoreSoundAt;
  const type = 'husk';
  const data = enemyTypes[type];
  const mesh = acquireEnemyMesh(type, data);
  if (!mesh) return;
  const e = {
    type, data, mesh,
    pos: new THREE.Vector3(4.5, 0.05, -8.0),
    vel: new THREE.Vector3(),
    hp: 8, maxHp: data.hp,
    alive: true, dead: false, staggered: false, staggerT: 0, burning: 4.0, burnTick: 0,
    pain: 0, alert: 0, attackCd: 0, leapCd: 0, strafe: 1, grounded: true,
    spawnT: 0, lastGrowl: 9, armorDropCd: 0, lastHitSound: -99, emissiveMeshes: []
  };
  mesh.position.copy(e.pos);
  mesh.traverse(o => { if (o.isMesh && o.material && o.material.emissive) e.emissiveMeshes.push(o); });

  warmup.active = true;
  warmup.audio = withAudio;
  const runHit = () => {
    if (withAudio) audio.shotgun();
    damageEnemy(e, 160, getCameraPos(tmpV1), tmpV2.set(4, 2, -3), { source: 'ssg', close: true });
  };
  if (withAudio) audio.runSilentWarmup(runHit);
  else runHit();
  warmup.active = false;
  warmup.audio = false;

  releaseEnemyMesh(e);
  releaseAllPickups();
  if (particleFX) particleFX.clear();
  if (tracerFX) tracerFX.clear();
  if (lightFX) lightFX.clear();
  if (decalFX) decalFX.clear();
  projectiles.length = 0;
  player.score = savedScore;
  player.kills = savedKills;
  lastGoreSoundAt = savedLastGore;
  if (dom.status) dom.status.textContent = savedStatus;
}

function warmFirstHitAudioOnly() {
  audio.runSilentWarmup(() => {
    audio.shotgun();
    audio.hit(tmpV1.set(0, 1.2, -5.0), true);
    audio.gore(tmpV2.set(0, 1.2, -5.0));
    audio.chainsaw();
    audio.glory();
    audio.flame();
    audio.hookStart();
    audio.hookPull();
    audio.stageStart();
    audio.stageClear();
    audio.pickup('health');
    audio.pickup('armor');
    audio.pickup('ammo');
  });
}

let precomputedNoiseData = null;
function precomputeAudioNoise() {
  if (precomputedNoiseData) return;
  const len = 96000;
  precomputedNoiseData = new Float32Array(len);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.0990460;
    b1 = 0.96300 * b1 + white * 0.2965164;
    b2 = 0.57000 * b2 + white * 1.0526913;
    precomputedNoiseData[i] = (b0 + b1 + b2 + white * 0.1848) * 0.19;
  }
}

function createPointParticleMaterial(additive) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `
      attribute float size;
      attribute float alpha;
      attribute vec3 pcolor;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = pcolor;
        vAlpha = alpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, size * (190.0 / max(1.0, -mvPosition.z)));
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;
        float soft = smoothstep(0.5, 0.08, d);
        gl_FragColor = vec4(vColor, vAlpha * soft);
      }`
  });
}

class PointParticlePool {
  constructor(capacity, additive) {
    this.capacity = capacity;
    this.next = 0;
    this.active = new Uint8Array(capacity);
    this.inList = new Uint8Array(capacity);
    this.activeList = new Uint16Array(capacity);
    this.activeCount = 0;
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.gravity = additive ? -0.5 : 8.2;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('pcolor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(this.geometry, createPointParticleMaterial(additive));
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
    this.dirtyPosition = this.dirtyColor = this.dirtySize = this.dirtyAlpha = false;
    scene.add(this.points);
  }

  emitXYZ(x, y, z, vx, vy, vz, color, life, size) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    if (!this.inList[i]) {
      this.activeList[this.activeCount++] = i;
      this.inList[i] = 1;
    }
    const k = i * 3;
    this.positions[k] = x; this.positions[k + 1] = y; this.positions[k + 2] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.maxLife[i] = Math.max(0.001, life);
    this.baseSize[i] = Math.max(0.01, size);
    this.sizes[i] = this.baseSize[i];
    tmpColor.setHex(color);
    this.colors[k] = tmpColor.r; this.colors[k + 1] = tmpColor.g; this.colors[k + 2] = tmpColor.b;
    this.alphas[i] = 1;
    this.active[i] = 1;
    this.dirtyPosition = this.dirtyColor = this.dirtySize = this.dirtyAlpha = true;
  }

  update(dt) {
    let j = 0;
    while (j < this.activeCount) {
      const i = this.activeList[j];
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) {
        this.active[i] = 0;
        this.inList[i] = 0;
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        this.activeList[j] = this.activeList[--this.activeCount];
        this.dirtySize = this.dirtyAlpha = true;
        continue;
      }
      this.vy[i] -= this.gravity * dt;
      this.positions[k] += this.vx[i] * dt;
      this.positions[k + 1] += this.vy[i] * dt;
      this.positions[k + 2] += this.vz[i] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alphas[i] = t;
      this.sizes[i] = this.baseSize[i] * (0.15 + t * 0.85);
      this.dirtyPosition = this.dirtySize = this.dirtyAlpha = true;
      j++;
    }
    if (this.dirtyPosition) this.geometry.attributes.position.needsUpdate = true;
    if (this.dirtyColor) this.geometry.attributes.pcolor.needsUpdate = true;
    if (this.dirtySize) this.geometry.attributes.size.needsUpdate = true;
    if (this.dirtyAlpha) this.geometry.attributes.alpha.needsUpdate = true;
    this.dirtyPosition = this.dirtyColor = this.dirtySize = this.dirtyAlpha = false;
  }

  clear() {
    this.active.fill(0);
    this.inList.fill(0);
    this.activeCount = 0;
    this.alphas.fill(0);
    this.sizes.fill(0);
    this.geometry.attributes.alpha.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
  }
}

function createTracerMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 pcolor;
      attribute float alpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main(){ vColor=pcolor; vAlpha=alpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vColor; varying float vAlpha; void main(){ gl_FragColor=vec4(vColor, vAlpha); }`
  });
}

class TracerPool {
  constructor(capacity) {
    this.capacity = capacity;
    this.next = 0;
    this.active = new Uint8Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.positions = new Float32Array(capacity * 2 * 3);
    this.colors = new Float32Array(capacity * 2 * 3);
    this.alphas = new Float32Array(capacity * 2);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('pcolor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(this.geometry, createTracerMaterial());
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 12;
    scene.add(this.lines);
  }

  emit(origin, dir, length, color, life) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    const k = i * 6;
    const ax = origin.x, ay = origin.y, az = origin.z;
    const bx = ax + dir.x * length, by = ay + dir.y * length, bz = az + dir.z * length;
    this.positions[k] = ax; this.positions[k + 1] = ay; this.positions[k + 2] = az;
    this.positions[k + 3] = bx; this.positions[k + 4] = by; this.positions[k + 5] = bz;
    tmpColor.setHex(color);
    for (let v = 0; v < 2; v++) {
      const c = k + v * 3;
      this.colors[c] = tmpColor.r; this.colors[c + 1] = tmpColor.g; this.colors[c + 2] = tmpColor.b;
      this.alphas[i * 2 + v] = 0.72;
    }
    this.life[i] = life; this.maxLife[i] = Math.max(0.001, life); this.active[i] = 1;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.pcolor.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }

  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      this.life[i] -= dt;
      const a = Math.max(0, this.life[i] / this.maxLife[i]) * 0.72;
      this.alphas[i * 2] = this.alphas[i * 2 + 1] = a;
      if (this.life[i] <= 0) this.active[i] = 0;
      dirty = true;
    }
    if (dirty) this.geometry.attributes.alpha.needsUpdate = true;
  }

  clear() { this.active.fill(0); this.alphas.fill(0); this.geometry.attributes.alpha.needsUpdate = true; }
}

class FlashLightPool {
  constructor(capacity) {
    this.capacity = capacity;
    this.next = 0;
    this.items = [];
    for (let i = 0; i < capacity; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 6, 2);
      light.visible = true;
      light.castShadow = false;
      light.position.set(0, -999, 0);
      scene.add(light);
      this.items.push({ light, life: 0, maxLife: 1, base: 0 });
    }
  }
  flash(pos, color, intensity, life, distance = 7) {
    const item = this.items[this.next];
    this.next = (this.next + 1) % this.capacity;
    item.light.color.setHex(color);
    item.light.position.copy(pos);
    item.light.distance = distance;
    item.light.intensity = intensity;
    item.base = intensity;
    item.life = life;
    item.maxLife = Math.max(0.001, life);
  }
  update(dt) {
    for (const item of this.items) {
      if (item.life <= 0) continue;
      item.life -= dt;
      if (item.life <= 0) { item.light.intensity = 0; item.light.position.set(0, -999, 0); }
      else item.light.intensity = item.base * Math.max(0, item.life / item.maxLife);
    }
  }
  clear() { for (const item of this.items) { item.life = 0; item.light.intensity = 0; item.light.position.set(0, -999, 0); } }
}

class DecalPool {
  constructor(capacity) {
    this.capacity = capacity;
    this.next = 0;
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.centers = new Float32Array(capacity * 6 * 3);
    this.corners = new Float32Array(capacity * 6 * 2);
    this.radius = new Float32Array(capacity * 6);
    this.angle = new Float32Array(capacity * 6);
    this.alpha = new Float32Array(capacity * 6);
    const quad = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < capacity; i++) {
      for (let v = 0; v < 6; v++) {
        const k2 = (i * 6 + v) * 2;
        this.corners[k2] = quad[v][0];
        this.corners[k2 + 1] = quad[v][1];
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('center', new THREE.BufferAttribute(this.centers, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('corner', new THREE.BufferAttribute(this.corners, 2));
    this.geometry.setAttribute('radius', new THREE.BufferAttribute(this.radius, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('angle', new THREE.BufferAttribute(this.angle, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec3 center;
        attribute vec2 corner;
        attribute float radius;
        attribute float angle;
        attribute float alpha;
        varying vec2 vCorner;
        varying float vAlpha;
        void main() {
          float s = sin(angle), c = cos(angle);
          vec2 q = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * radius;
          vCorner = corner;
          vAlpha = alpha;
          vec3 pos = center + vec3(q.x, 0.0, q.y);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vCorner;
        varying float vAlpha;
        void main() {
          float d = length(vCorner);
          if (d > 1.0) discard;
          float edge = smoothstep(1.0, 0.72, d);
          float mottled = 0.74 + 0.26 * sin((vCorner.x * 19.0 + vCorner.y * 31.0) * 2.1);
          gl_FragColor = vec4(vec3(0.34, 0.018, 0.008) * mottled, vAlpha * edge);
        }`
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    this.dirty = true;
  }
  add(pos) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.life[i] = this.maxLife[i] = 14 + Math.random() * 8;
    const r = rand(0.35, 0.9);
    const a = rand(0, TAU);
    const x = pos.x + rand(-0.5, 0.5);
    const z = pos.z + rand(-0.5, 0.5);
    for (let v = 0; v < 6; v++) {
      const idx = i * 6 + v;
      const k3 = idx * 3;
      this.centers[k3] = x;
      this.centers[k3 + 1] = 0.057;
      this.centers[k3 + 2] = z;
      this.radius[idx] = r;
      this.angle[idx] = a;
      this.alpha[idx] = 0.62;
    }
    this.dirty = true;
  }
  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const a = this.life[i] <= 0 ? 0 : Math.min(0.62, this.life[i] / this.maxLife[i] * 0.62);
      for (let v = 0; v < 6; v++) this.alpha[i * 6 + v] = a;
      dirty = true;
    }
    this.dirty = this.dirty || dirty;
    this.flush();
  }
  flush() {
    if (!this.dirty) return;
    this.geometry.attributes.center.needsUpdate = true;
    this.geometry.attributes.radius.needsUpdate = true;
    this.geometry.attributes.angle.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
    this.dirty = false;
  }
  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.dirty = true;
    this.flush();
  }
}

function acquirePickupMesh(type) {
  const pool = pickupPools[type];
  const mesh = pool && pool.length ? pool.pop() : null;
  if (mesh) {
    mesh.visible = true;
    mesh.scale.setScalar(1);
  }
  return mesh;
}

function releasePickupMesh(mesh) {
  if (!mesh) return;
  const type = mesh.userData.poolType;
  mesh.visible = false;
  mesh.position.set(0, -999, 0);
  mesh.scale.setScalar(1);
  if (type && pickupPools[type]) pickupPools[type].push(mesh);
}

function releaseAllPickups() {
  for (const p of pickups) releasePickupMesh(p.mesh);
  pickups.length = 0;
}

function acquireEnemyMesh(type, data) {
  const pool = enemyPools[type];
  const mesh = pool && pool.length ? pool.pop() : null;
  if (!mesh) {
    perfEvent('POOL_EMPTY.enemy', `type=${type}`);
    return null;
  }
  mesh.visible = true;
  mesh.position.set(0, -999, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.setScalar(mesh.userData.baseScale || 1);
  if (mesh.userData.action) {
    mesh.userData.action.reset();
    mesh.userData.action.play();
  }
  mesh.traverse(o => {
    if (o.isMesh && o.material && o.material.emissiveIntensity !== undefined) {
      o.material.emissiveIntensity = o.material.userData.baseEmissiveIntensity || 0.22;
      if (o.material.emissive) o.material.emissive.setHex(data.emissive);
    }
  });
  if (!mesh.parent) scene.add(mesh);
  return mesh;
}

function releaseEnemyMesh(e) {
  if (!e || !e.mesh) return;
  const type = e.type || e.mesh.userData.poolType;
  e.mesh.visible = false;
  e.mesh.position.set(0, -999, 0);
  e.mesh.rotation.set(0, 0, 0);
  e.mesh.scale.setScalar(e.mesh.userData.baseScale || 1);
  if (e.mesh.userData.mixer) e.mesh.userData.mixer.setTime(0);
  e.mesh.traverse(o => { if (o.isMesh) o.visible = true; });
  if (type && enemyPools[type]) enemyPools[type].push(e.mesh);
  e.mesh = null;
}

function createProjectileMesh(type) {
  const geo = type === 'playerMissile' ? sharedGeometries.missile : sharedGeometries.fireball;
  const mat = type === 'playerMissile' ? materials.blueGlow : materials.orangeGlow;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.poolType = type;
  mesh.frustumCulled = false;
  return mesh;
}

function acquireProjectileMesh(type, scale) {
  const pool = projectilePools[type];
  const mesh = pool && pool.length ? pool.pop() : null;
  if (!mesh) {
    perfEvent('POOL_EMPTY.projectile', `type=${type}`);
    return null;
  }
  mesh.visible = true;
  mesh.scale.setScalar(scale);
  if (!mesh.parent) scene.add(mesh);
  return mesh;
}

function releaseProjectileMesh(mesh) {
  if (!mesh) return;
  const type = mesh.userData.poolType;
  mesh.visible = false;
  mesh.position.set(0, -999, 0);
  mesh.scale.setScalar(1);
  if (type && projectilePools[type]) projectilePools[type].push(mesh);
}

function addEdges(mesh, color = 0xff6a24, opacity = 0.18) {
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 24), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  edges.renderOrder = 2;
  // Parent edges to the mesh so dynamic platforms carry their outlines with them.
  mesh.add(edges);
  return edges;
}

function addBlock(name, cx, topY, cz, sx, h, sz, mat, opts = {}) {
  const geo = new THREE.BoxGeometry(sx, h, sz, Math.max(1, Math.floor(sx / 8)), 1, Math.max(1, Math.floor(sz / 8)));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.position.set(cx, topY - h / 2, cz);
  mesh.castShadow = !!opts.cast;
  mesh.receiveShadow = opts.receive !== false;
  scene.add(mesh);
  if (opts.edges !== false) addEdges(mesh, opts.edgeColor || 0xff6a24, opts.edgeOpacity ?? 0.12);

  const box = { name, min: { x: cx - sx / 2, y: topY - h, z: cz - sz / 2 }, max: { x: cx + sx / 2, y: topY, z: cz + sz / 2 }, mesh, step: !!opts.step, sx, h, sz };
  mesh.userData.box = box;
  if (opts.collide !== false) world.boxes.push(box);
  if (opts.walk !== false) {
    const floor = { name, minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, top: topY, box };
    box.floor = floor;
    world.floors.push(floor);
  }
  return mesh;
}

function addFloorPlate(name, cx, y, cz, sx, sz, mat = materials.floor, opts = {}) {
  return addBlock(name, cx, y, cz, sx, 0.25, sz, mat, { ...opts, collide: opts.collide ?? false, walk: true, receive: true });
}

function addCylinder(name, pos, radius, height, mat, radial = 24, opts = {}) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, radial, 1, false);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.position.copy(pos);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  scene.add(mesh);
  if (opts.edges) addEdges(mesh, opts.edgeColor || 0xff8844, 0.16);
  return mesh;
}

function addTorch(x, y, z, color = 0xff5a18, intensity = 2.2, dist = 13) {
  const light = new THREE.PointLight(color, intensity, dist, 2.0);
  light.position.set(x, y, z);
  scene.add(light);
  world.lights.push(light);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 2), materials.orangeGlow);
  core.position.set(x, y, z);
  core.castShadow = false;
  scene.add(core);
  world.decorations.push({ mesh: core, spin: rand(-1.5, 1.5), bob: rand(0, 10) });
  return light;
}

function addLightBeam(x, z, height = 11, radius = 2.8, mat = materials.lightBeamOrange, y = 0.08) {
  const geo = new THREE.CylinderGeometry(radius * 0.28, radius, height, 20, 1, true);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y + height * 0.5, z);
  mesh.renderOrder = 1;
  mesh.frustumCulled = true;
  scene.add(mesh);
  world.decorations.push({ mesh, spin: rand(-0.045, 0.045) });
  return mesh;
}

function addRuneGlassPanel(name, cx, topY, cz, sx, sz, rot = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sz, 0.12), materials.runeGlass);
  mesh.name = name;
  mesh.position.set(cx, topY - sz * 0.5, cz);
  mesh.rotation.y = rot;
  mesh.renderOrder = 2;
  scene.add(mesh);
  return mesh;
}

function addSlab(name, cx, topY, cz, sx, sz, mat = materials.floor, opts = {}) {
  return addBlock(name, cx, topY, cz, sx, opts.thickness ?? 0.34, sz, mat, { ...opts, collide: true, walk: true, receive: true });
}

function addMovingPlatform(name, cx, topY, cz, sx, sz, mat, opts = {}) {
  const mesh = addSlab(name, cx, topY, cz, sx, sz, mat, { ...opts, edgeColor: opts.edgeColor || 0x76f4ff, edgeOpacity: opts.edgeOpacity ?? 0.28 });
  const box = mesh.userData.box;
  world.movers.push({
    name, mesh, box, floor: box.floor, base: new THREE.Vector3(cx, topY, cz),
    axis: opts.axis || 'y', amp: opts.amp ?? 2.5, speed: opts.speed ?? 0.55,
    phase: opts.phase ?? Math.random() * TAU, sx, sz, h: box.h,
    carryEpsilon: 0.08, prevTop: topY
  });
  return mesh;
}

function addDistantSpire(x, z, height, radius, color = 0x08070a) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const mat = new THREE.MeshStandardMaterial({ color, emissive: 0x120207, emissiveIntensity: 0.25, roughness: 0.9, metalness: 0.05 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.42, radius, height, 7, 1), mat);
  shaft.position.y = height * 0.5 - 0.2;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.9, height * 0.34, 7), mat);
  cap.position.y = height * 1.02;
  group.add(shaft, cap);
  scene.add(group);
  world.decorations.push({ mesh: group, spin: 0, bob: rand(0, 10) });
}

function addRibArch(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0.08, z);
  group.rotation.y = rot;
  const ribMat = materials.bone;
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const rib = new THREE.Mesh(THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.08, 2.2 + Math.sin(t * Math.PI) * 2.2, 4, 8) : new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8), ribMat);
    rib.position.set((t - 0.5) * 5.2, 1.4 + Math.sin(t * Math.PI) * 1.6, 0);
    rib.rotation.z = (t - 0.5) * -0.95;
    group.add(rib);
  }
  scene.add(group);
  world.decorations.push({ mesh: group });
}

function createLevel() {
  // Larger four-tier arena: ground, mid bridges, high balconies, and tiny crown platforms.
  // Slabs are thin walkable geometry instead of solid columns so the space stays open and readable.
  world.bounds = 44;
  world.mapScale = 92;

  addFloorPlate('main-argent-floor', 0, 0, 0, 86, 86, materials.floor, { edges: false });
  addBlock('north-wall', 0, 8.4, -44.4, 89, 8.4, 1.6, materials.wall, { walk: false, edgeOpacity: 0.16 });
  addBlock('south-wall', 0, 8.4, 44.4, 89, 8.4, 1.6, materials.wall, { walk: false, edgeOpacity: 0.16 });
  addBlock('west-wall', -44.4, 8.4, 0, 1.6, 8.4, 89, materials.wall, { walk: false, edgeOpacity: 0.16 });
  addBlock('east-wall', 44.4, 8.4, 0, 1.6, 8.4, 89, materials.wall, { walk: false, edgeOpacity: 0.16 });

  // Texture-breaking ground plates and lava cuts; lanes are wide enough to dodge around, not maze-blockers.
  const lavaStrips = [
    { cx: 0, cz: -15.5, sx: 20, sz: 3.5 }, { cx: 0, cz: 15.5, sx: 20, sz: 3.5 },
    { cx: -15.5, cz: 0, sx: 3.5, sz: 20 }, { cx: 15.5, cz: 0, sx: 3.5, sz: 20 },
    { cx: -27, cz: -25, sx: 8, sz: 2.8 }, { cx: 27, cz: 25, sx: 8, sz: 2.8 }
  ];
  for (const l of lavaStrips) {
    const geo = new THREE.PlaneGeometry(l.sx, l.sz, Math.max(2, Math.floor(l.sx)), Math.max(2, Math.floor(l.sz)));
    const mesh = new THREE.Mesh(geo, lavaMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(l.cx, 0.045, l.cz);
    scene.add(mesh);
    world.lavaPlanes.push({ mesh, minX: l.cx - l.sx / 2, maxX: l.cx + l.sx / 2, minZ: l.cz - l.sz / 2, maxZ: l.cz + l.sz / 2 });
  }
  for (const [x, z, h, r, mat] of [
    [-37, -37, 10.5, 2.8, materials.lightBeamOrange], [37, 37, 10.5, 2.8, materials.lightBeamOrange],
    [-37, 37, 10.5, 2.8, materials.lightBeamOrange], [37, -37, 10.5, 2.8, materials.lightBeamOrange],
    [-22, -22, 9.0, 2.2, materials.lightBeamBlue], [22, 22, 9.0, 2.2, materials.lightBeamBlue]
  ]) addLightBeam(x, z, h, r, mat);

  // Ground landmarks and soft cover: deliberately chunky, leaving long sightlines and dash lanes.
  addSlab('central-combat-dais', 0, 1.05, 0, 12, 12, materials.obsidian, { edgeColor: 0xff7a32, edgeOpacity: 0.18, thickness: 1.05 });
  addRuneGlassPanel('north-argent-glass', 0, 4.6, -34.5, 20, 4.2, 0);
  addRuneGlassPanel('south-argent-glass', 0, 4.6, 34.5, 20, 4.2, 0);
  addRuneGlassPanel('west-argent-glass', -34.5, 4.6, 0, 20, 4.2, Math.PI / 2);
  addRuneGlassPanel('east-argent-glass', 34.5, 4.6, 0, 20, 4.2, Math.PI / 2);
  for (const [x, z, sx, sz] of [[-25,-25,8,5],[25,25,8,5],[-25,25,5,8],[25,-25,5,8],[-28,0,4,10],[28,0,4,10],[0,-28,10,4],[0,28,10,4]]) {
    addBlock('low-hell-cover', x, 1.18, z, sx, 1.18, sz, materials.wall, { edgeOpacity: 0.11 });
  }
  for (const [x, z] of [[-22,-12],[22,12],[-22,12],[22,-12],[-8,-26],[8,26]]) {
    const cyl = addCylinder('rune-pillar', new THREE.Vector3(x, 2.35, z), 0.9, 4.7, materials.obsidian, 8, { edges: true, edgeColor: 0x913dff });
    world.boxes.push({ name: 'pillar-collider', min: { x: x - 0.95, y: 0, z: z - 0.95 }, max: { x: x + 0.95, y: 4.7, z: z + 0.95 }, mesh: cyl });
  }

  // Mid tier: broad runways with gaps for hook/double-jump/dash routes.
  addSlab('mid-east-west-spine', 0, 3.2, 0, 44, 5.4, materials.runeMetal, { edgeColor: 0x79d6ff, edgeOpacity: 0.24 });
  addSlab('mid-north-south-spine', 0, 3.2, 0, 5.4, 44, materials.runeMetal, { edgeColor: 0x79d6ff, edgeOpacity: 0.24 });
  addSlab('mid-nw-platform', -23, 3.05, -19, 13, 9, materials.metal, { edgeColor: 0xff934b });
  addSlab('mid-se-platform', 23, 3.05, 19, 13, 9, materials.metal, { edgeColor: 0xff934b });
  addSlab('mid-ne-platform', 23, 3.05, -19, 9, 13, materials.metal, { edgeColor: 0xff934b });
  addSlab('mid-sw-platform', -23, 3.05, 19, 9, 13, materials.metal, { edgeColor: 0xff934b });

  // High balconies and crown perches; hook nodes let you chain through them without stairs.
  addSlab('north-high-balk', 0, 6.15, -30, 24, 7.0, materials.redMetal, { edgeColor: 0xff7a32, edgeOpacity: 0.26 });
  addSlab('south-high-balk', 0, 6.15, 30, 24, 7.0, materials.redMetal, { edgeColor: 0xff7a32, edgeOpacity: 0.26 });
  addSlab('west-high-balk', -30, 6.15, 0, 7.0, 24, materials.redMetal, { edgeColor: 0xff7a32, edgeOpacity: 0.26 });
  addSlab('east-high-balk', 30, 6.15, 0, 7.0, 24, materials.redMetal, { edgeColor: 0xff7a32, edgeOpacity: 0.26 });
  addSlab('crown-north', 0, 9.15, -12, 8, 5, materials.obsidian, { edgeColor: 0xa65cff, edgeOpacity: 0.3 });
  addSlab('crown-south', 0, 9.15, 12, 8, 5, materials.obsidian, { edgeColor: 0xa65cff, edgeOpacity: 0.3 });
  addSlab('crown-west', -12, 9.15, 0, 5, 8, materials.obsidian, { edgeColor: 0xa65cff, edgeOpacity: 0.3 });
  addSlab('crown-east', 12, 9.15, 0, 5, 8, materials.obsidian, { edgeColor: 0xa65cff, edgeOpacity: 0.3 });

  // New outer ring + sky islands: more room to dodge, and a fourth level of vertical routing.
  addSlab('outer-north-runway', 0, 7.65, -39.0, 32, 5.2, materials.metal, { edgeColor: 0x79d6ff, edgeOpacity: 0.22 });
  addSlab('outer-south-runway', 0, 7.65, 39.0, 32, 5.2, materials.metal, { edgeColor: 0x79d6ff, edgeOpacity: 0.22 });
  addSlab('outer-west-runway', -39.0, 7.65, 0, 5.2, 32, materials.metal, { edgeColor: 0x79d6ff, edgeOpacity: 0.22 });
  addSlab('outer-east-runway', 39.0, 7.65, 0, 5.2, 32, materials.metal, { edgeColor: 0x79d6ff, edgeOpacity: 0.22 });
  addSlab('sky-center-altar', 0, 12.35, 0, 7.4, 7.4, materials.obsidian, { edgeColor: 0xa65cff, edgeOpacity: 0.34 });
  addSlab('sky-nw-island', -22, 11.45, -22, 7.0, 7.0, materials.redMetal, { edgeColor: 0xff7a32, edgeOpacity: 0.28 });
  addSlab('sky-ne-island', 22, 11.45, -22, 7.0, 7.0, materials.redMetal, { edgeColor: 0xff7a32, edgeOpacity: 0.28 });
  addSlab('sky-sw-island', -22, 11.45, 22, 7.0, 7.0, materials.redMetal, { edgeColor: 0xff7a32, edgeOpacity: 0.28 });
  addSlab('sky-se-island', 22, 11.45, 22, 7.0, 7.0, materials.redMetal, { edgeColor: 0xff7a32, edgeOpacity: 0.28 });

  // Dynamic pieces: two vertical lifts and two sliding rune bridges create changing routes but never block the main loop.
  addMovingPlatform('blood-lift-west', -27.5, 3.1, -7.0, 5.5, 5.5, materials.runeMetal, { axis: 'y', amp: 2.75, speed: 0.52, phase: 0.0 });
  addMovingPlatform('blood-lift-east', 27.5, 3.1, 7.0, 5.5, 5.5, materials.runeMetal, { axis: 'y', amp: 2.75, speed: 0.52, phase: Math.PI });
  addMovingPlatform('sliding-bridge-north', -6, 6.15, -23.5, 6.0, 4.2, materials.metal, { axis: 'x', amp: 6.0, speed: 0.34, phase: 1.2, edgeColor: 0x79d6ff });
  addMovingPlatform('sliding-bridge-south', 6, 6.15, 23.5, 6.0, 4.2, materials.metal, { axis: 'x', amp: 6.0, speed: 0.34, phase: 4.0, edgeColor: 0x79d6ff });

  // Stairs/ramp-like chunks for ergonomic baseline access to mid tier.
  const stairMat = materials.darkMetal;
  for (let i = 0; i < 7; i++) {
    const top = 0.44 + i * 0.43;
    addBlock('southwest-stair-' + i, -7.5, top, 19.5 - i * 1.35, 3.0, top, 1.1, stairMat, { step: true, edgeOpacity: 0.13 });
    addBlock('northeast-stair-' + i, 7.5, top, -19.5 + i * 1.35, 3.0, top, 1.1, stairMat, { step: true, edgeOpacity: 0.13 });
    addBlock('northwest-stair-' + i, -19.5 + i * 1.35, top, -7.5, 1.1, top, 3.0, stairMat, { step: true, edgeOpacity: 0.13 });
    addBlock('southeast-stair-' + i, 19.5 - i * 1.35, top, 7.5, 1.1, top, 3.0, stairMat, { step: true, edgeOpacity: 0.13 });
  }

  // Jump pads: tuned to chain pad -> double-jump -> dash to balconies/crown.
  addJumpPad(new THREE.Vector3(-20.5, 0.18, 0), new THREE.Vector3(12.0, 14.2, 0.6), 'east mid/high route');
  addJumpPad(new THREE.Vector3(20.5, 0.18, 0), new THREE.Vector3(-12.0, 14.2, 0.6), 'west mid/high route');
  addJumpPad(new THREE.Vector3(0, 0.18, -20.5), new THREE.Vector3(0.5, 14.2, 12.0), 'south mid/high route');
  addJumpPad(new THREE.Vector3(0, 0.18, 20.5), new THREE.Vector3(0.5, 14.2, -12.0), 'north mid/high route');
  addJumpPad(new THREE.Vector3(-5.7, 3.38, 0), new THREE.Vector3(4.0, 12.8, -10.2), 'crown north');
  addJumpPad(new THREE.Vector3(5.7, 3.38, 0), new THREE.Vector3(-4.0, 12.8, 10.2), 'crown south');
  addJumpPad(new THREE.Vector3(0, 3.38, -5.7), new THREE.Vector3(-10.2, 12.8, 4.0), 'sky west');
  addJumpPad(new THREE.Vector3(0, 3.38, 5.7), new THREE.Vector3(10.2, 12.8, -4.0), 'sky east');
  addJumpPad(new THREE.Vector3(-34.0, 0.18, -34.0), new THREE.Vector3(12.0, 15.8, 12.0), 'outer corner launch');
  addJumpPad(new THREE.Vector3(34.0, 0.18, 34.0), new THREE.Vector3(-12.0, 15.8, -12.0), 'outer corner launch');

  // Meat hook navigation nodes. Purple = traversal targets; enemies are hook targets too.
  for (const p of [
    [0, 8.7, 0], [-24, 7.8, -23], [24, 7.8, -23], [-24, 7.8, 23], [24, 7.8, 23],
    [0, 10.8, -30], [0, 10.8, 30], [-30, 10.8, 0], [30, 10.8, 0],
    [0, 12.4, -12], [0, 12.4, 12], [-12, 12.4, 0], [12, 12.4, 0],
    [0, 15.0, 0], [-22, 14.1, -22], [22, 14.1, -22], [-22, 14.1, 22], [22, 14.1, 22],
    [0, 10.2, -39], [0, 10.2, 39], [-39, 10.2, 0], [39, 10.2, 0]
  ]) addHookNode(new THREE.Vector3(p[0], p[1], p[2]), 'hook node');

  // Spawn points on several elevations. Stage director uses farthest valid point for pressure without spawn-camping.
  for (const p of [
    [-30,0,-30], [30,0,-30], [-30,0,30], [30,0,30], [-30,0,8], [30,0,-8], [8,0,-30], [-8,0,30],
    [-23,3.05,-19], [23,3.05,19], [23,3.05,-19], [-23,3.05,19], [0,3.2,-15], [0,3.2,15], [-15,3.2,0], [15,3.2,0],
    [0,6.15,-30], [0,6.15,30], [-30,6.15,0], [30,6.15,0], [0,9.15,-12], [0,9.15,12],
    [0,7.65,-39], [0,7.65,39], [-39,7.65,0], [39,7.65,0], [-22,11.45,-22], [22,11.45,-22], [-22,11.45,22], [22,11.45,22], [0,12.35,0]
  ]) world.spawnPoints.push(new THREE.Vector3(p[0], p[1], p[2]));

  // Neon rails, ribs, torches, and silhouette spires for visual richness without extra assets.
  const railMat = materials.blueGlow;
  const rails = [
    [[-31,3.45,-2.8],[31,3.45,-2.8]], [[-31,3.45,2.8],[31,3.45,2.8]],
    [[-2.8,3.45,-31],[-2.8,3.45,31]], [[2.8,3.45,-31],[2.8,3.45,31]],
    [[-10,6.55,-30],[10,6.55,-30]], [[-10,6.55,30],[10,6.55,30]],
    [[-30,6.55,-10],[-30,6.55,10]], [[30,6.55,-10],[30,6.55,10]]
  ];
  for (const [a, b] of rails) addRail(new THREE.Vector3(...a), new THREE.Vector3(...b), railMat);
  for (const p of [[-33,4,-33],[33,4,-33],[-33,4,33],[33,4,33],[0,7.4,-34],[0,7.4,34],[-34,7.4,0],[34,7.4,0]]) addTorch(...p, 0xff5a18, 1.55, 13);
  for (const [x,z,r] of [[-48,-48,0.9],[48,-46,1.2],[-52,42,1.0],[50,48,1.3],[0,-54,1.1],[-54,0,0.95],[54,0,0.95]]) addDistantSpire(x, z, rand(12, 24), r);
  addRibArch(-13, -33, 0.05); addRibArch(13, 33, Math.PI); addRibArch(-33, 13, Math.PI / 2); addRibArch(33, -13, -Math.PI / 2);

  // First-run resource seeds; stage clears also add a few pickups near the center.
  spawnPickup('armor', new THREE.Vector3(-6.0, 3.65, 0), 14, false);
  spawnPickup('health', new THREE.Vector3(6.0, 3.65, 0), 18, false);
  spawnPickup('ammo', new THREE.Vector3(0, 6.55, -30), 26, false);
  spawnPickup('ammo', new THREE.Vector3(0, 0.35, 28), 22, false);
}

function addRail(a, b, mat) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(0.06, 0.06, len, 12, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(mid);
  const dir = b.clone().sub(a).normalize();
  mesh.quaternion.setFromUnitVectors(UP, dir);
  mesh.castShadow = false;
  scene.add(mesh);
}

function addJumpPad(pos, boost, label) {
  const group = new THREE.Group();
  group.position.copy(pos);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.22, 32), materials.darkMetal);
  base.castShadow = true; base.receiveShadow = true;
  group.add(base);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.87, 0.06, 8, 32), materials.greenGlow);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.16;
  group.add(ring);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 4), materials.greenGlow);
  arrow.rotation.x = Math.PI / 2;
  arrow.position.set(0, 0.28, -0.26);
  group.add(arrow);
  scene.add(group);
  const tunedBoost = boost.clone();
  tunedBoost.y *= 2.15;
  tunedBoost.x *= 1.08;
  tunedBoost.z *= 1.08;
  world.jumpPads.push({ pos: pos.clone(), boost: tunedBoost, radius: 1.42, label, group, ring });
}

function addHookNode(pos, label) {
  const group = new THREE.Group();
  group.position.copy(pos);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 2), materials.purpleGlow);
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.045, 8, 32), materials.blueGlow);
  const ringB = ringA.clone();
  ringA.rotation.x = Math.PI / 2;
  ringB.rotation.y = Math.PI / 2;
  group.add(core, ringA, ringB);
  const light = new THREE.PointLight(0x8f52ff, 1.05, 7, 2);
  group.add(light);
  scene.add(group);
  world.hookNodes.push({ pos: pos.clone(), label, group, core, radius: 0.8, alive: true, isHookNode: true });
}

function createWeapons() {
  weaponRoot = new THREE.Group();
  weaponRoot.position.set(0.38, -0.37, -0.76);
  camera.add(weaponRoot);

  const gunMetal = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.24, metalness: 0.94 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.42, metalness: 0.82 });
  const bright = new THREE.MeshStandardMaterial({ color: 0xbdc4ca, roughness: 0.18, metalness: 0.95 });
  const hot = new THREE.MeshStandardMaterial({ color: 0xff8a36, emissive: 0xff4015, emissiveIntensity: 0.8, roughness: 0.34, metalness: 0.25 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x31170e, roughness: 0.68, metalness: 0.12 });
  const armMat = new THREE.MeshStandardMaterial({ color: 0x11151a, roughness: 0.58, metalness: 0.32 });

  function box(parent, size, pos, mat, rot = [0, 0, 0]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(m);
    return m;
  }
  function cyl(parent, radius, height, pos, mat, rot = [Math.PI / 2, 0, 0], seg = 24) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, seg, 1), mat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(m);
    return m;
  }

  // Super Shotgun: compact, chunky, with visible meat-hook winch and glowing heated muzzles.
  ssgModel = new THREE.Group();
  ssgModel.position.set(0.01, 0.0, 0.0);
  for (const x of [-0.115, 0.115]) {
    cyl(ssgModel, 0.083, 0.96, [x, 0.045, -0.55], bright, [Math.PI / 2, 0, 0], 32);
    cyl(ssgModel, 0.054, 0.985, [x, 0.045, -0.565], darkMetal, [Math.PI / 2, 0, 0], 20);
    cyl(ssgModel, 0.092, 0.105, [x, 0.045, -1.05], hot, [Math.PI / 2, 0, 0], 24);
  }
  box(ssgModel, [0.53, 0.24, 0.44], [0, -0.02, -0.20], gunMetal);
  box(ssgModel, [0.46, 0.08, 0.82], [0, 0.19, -0.45], darkMetal);
  box(ssgModel, [0.18, 0.12, 0.64], [-0.32, 0.02, -0.38], darkMetal, [0, 0.08, 0.0]);
  box(ssgModel, [0.18, 0.12, 0.64], [0.32, 0.02, -0.38], darkMetal, [0, -0.08, 0.0]);
  box(ssgModel, [0.36, 0.20, 0.42], [0.06, -0.10, 0.20], gripMat, [0.05, 0.0, -0.08]);
  box(ssgModel, [0.19, 0.40, 0.16], [0.13, -0.33, 0.03], gripMat, [-0.36, 0, 0.05]);
  box(ssgModel, [0.42, 0.07, 0.16], [0, -0.22, -0.42], darkMetal, [0.16, 0, 0]);

  // Meat hook mechanism: spool, armature, and twin prongs under the barrels.
  const spool = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.024, 10, 28), darkMetal);
  spool.position.set(0, -0.165, -0.43);
  spool.rotation.x = Math.PI / 2;
  ssgModel.add(spool);
  cyl(ssgModel, 0.035, 0.31, [0, -0.165, -0.43], bright, [0, 0, Math.PI / 2], 14);
  box(ssgModel, [0.27, 0.07, 0.30], [0, -0.15, -0.55], darkMetal);
  for (const x of [-0.055, 0.055]) {
    const prong = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.34, 4), materials.orangeGlow);
    prong.rotation.x = -Math.PI / 2;
    prong.rotation.z = x < 0 ? 0.18 : -0.18;
    prong.position.set(x, -0.17, -0.86);
    ssgModel.add(prong);
  }
  for (let i = 0; i < 5; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 5, 10), bright);
    link.position.set(0, -0.18, -0.68 - i * 0.042);
    link.rotation.x = Math.PI / 2;
    link.rotation.z = i % 2 ? Math.PI / 2 : 0;
    ssgModel.add(link);
  }
  box(ssgModel, [0.42, 0.28, 0.17], [0.22, -0.47, 0.22], armMat, [-0.2, 0.2, -0.08]);
  weaponRoot.add(ssgModel);

  // Heavy Autorifle: compact gatling core with missile pods, belt feed, and illuminated coil.
  heavyModel = new THREE.Group();
  box(heavyModel, [0.52, 0.25, 0.66], [0, -0.02, -0.26], gunMetal);
  box(heavyModel, [0.40, 0.10, 0.84], [0, 0.17, -0.48], darkMetal);
  const barrelSmall = new THREE.CylinderGeometry(0.036, 0.043, 0.88, 14);
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(barrelSmall, bright);
    const ang = i / 6 * TAU;
    b.position.set(Math.cos(ang) * 0.117, Math.sin(ang) * 0.117 + 0.02, -0.76);
    b.rotation.x = Math.PI / 2;
    b.userData.spinBarrel = true;
    heavyModel.add(b);
  }
  cyl(heavyModel, 0.075, 0.95, [0, 0.02, -0.76], darkMetal, [Math.PI / 2, 0, 0], 18);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.027, 8, 32), materials.blueGlow);
  coil.position.set(0, 0.02, -0.58);
  coil.rotation.x = Math.PI / 2;
  heavyModel.add(coil);
  for (const sx of [-1, 1]) {
    box(heavyModel, [0.13, 0.16, 0.48], [sx * 0.37, 0.025, -0.48], darkMetal, [0, 0, sx * 0.04]);
    for (let i = 0; i < 3; i++) cyl(heavyModel, 0.027, 0.27, [sx * 0.37, 0.12 - i * 0.08, -0.82], materials.blueGlow, [Math.PI / 2, 0, 0], 10);
  }
  box(heavyModel, [0.20, 0.36, 0.25], [-0.32, -0.22, -0.20], darkMetal, [0.0, 0.0, 0.18]);
  for (let i = 0; i < 7; i++) box(heavyModel, [0.045, 0.06, 0.085], [-0.235 - i * 0.035, -0.06 - i * 0.005, 0.05 + i * 0.035], bright, [0.1, 0.0, 0.2]);
  box(heavyModel, [0.42, 0.26, 0.17], [0.23, -0.48, 0.24], armMat, [-0.18, 0.22, -0.08]);
  heavyModel.visible = false;
  weaponRoot.add(heavyModel);

  for (const group of [ssgModel, heavyModel]) group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  muzzleFlash = new THREE.Group();
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd47a, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
  const flashA = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.46, 7), flashMat);
  flashA.rotation.x = -Math.PI / 2;
  flashA.position.set(0, 0.02, -1.08);
  muzzleFlash.add(flashA);
  const flashB = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), flashMat);
  flashB.position.set(0, 0.02, -1.08);
  muzzleFlash.add(flashB);
  weaponRoot.add(muzzleFlash);

  const chainGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  chainLine = new THREE.Line(chainGeom, new THREE.LineBasicMaterial({ color: 0xffd194, transparent: true, opacity: 0.95 }));
  chainLine.visible = false;
  scene.add(chainLine);

  flameGroup = new THREE.Group();
  camera.add(flameGroup);

  // First-person finisher props stay drawable after load. Firefox/ANGLE can hitch
  // when a hidden material/light combo is first drawn during a kill animation.
  finisherGroup = new THREE.Group();
  finisherGroup.visible = true;
  finisherGroup.position.set(0, -999, 0);
  finisherGroup.scale.setScalar(0.0001);
  weaponRoot.add(finisherGroup);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xd7f6ff, emissive: 0x64d8ff, emissiveIntensity: 1.0, roughness: 0.18, metalness: 0.78 });
  const sawMat = new THREE.MeshStandardMaterial({ color: 0xff7b23, emissive: 0xff3e08, emissiveIntensity: 0.9, roughness: 0.34, metalness: 0.62 });
  const sawDark = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.38, metalness: 0.88 });
  finisherArm = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.72), armMat);
  finisherArm.position.set(-0.28, -0.18, -0.18);
  finisherArm.rotation.set(-0.12, 0.22, -0.22);
  finisherGroup.add(finisherArm);
  finisherBlade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.95), bladeMat);
  finisherBlade.position.set(-0.17, -0.06, -0.75);
  finisherBlade.rotation.set(-0.08, 0.02, -0.18);
  finisherGroup.add(finisherBlade);
  finisherSaw = new THREE.Group();
  const sawBody = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.10, 0.72), sawDark);
  sawBody.position.set(0.08, -0.05, -0.52);
  finisherSaw.add(sawBody);
  for (let i = 0; i < 9; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), sawMat);
    tooth.position.set(0.08, -0.06 + Math.sin(i * 0.7) * 0.02, -0.25 - i * 0.07);
    tooth.rotation.set(Math.PI / 2, 0, i % 2 ? 0.3 : -0.3);
    finisherSaw.add(tooth);
  }
  finisherSaw.position.set(-0.02, -0.10, -0.18);
  finisherSaw.rotation.set(-0.04, 0.14, -0.08);
  finisherGroup.add(finisherSaw);
  finisherSpark = new THREE.PointLight(0xff5b18, 0, 3.5, 2);
  finisherSpark.visible = true;
  finisherSpark.castShadow = false;
  finisherSpark.position.set(0, -0.02, -0.9);
  finisherGroup.add(finisherSpark);
  parkFinisherVisual();
}

function setupInput() {
  dom.startButton.addEventListener('click', startGame);
  renderer.domElement.addEventListener('click', () => {
    if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    pausedByLock = document.pointerLockElement !== renderer.domElement;
    if (running) dom.overlay.classList.toggle('hidden', !pausedByLock);
    input.lookIgnore = 4;
    input.lastMoveDX = 0;
    input.lastMoveDY = 0;
    input.mouseDX = 0;
    input.mouseDY = 0;
    if (pausedByLock) {
      input.buttons.clear();
      input.fireHeld = false;
      input.altHeld = false;
    }
    if (running && pausedByLock) {
      dom.overlay.querySelector('h1').textContent = 'Paused';
      dom.overlay.querySelector('p').textContent = 'Click to lock mouse and continue.';
      dom.startButton.textContent = 'Resume';
    }
  });

  window.addEventListener('keydown', e => {
    if (['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight','KeyQ','KeyE','KeyF','KeyC','Digit1','Digit2','KeyH','KeyM','KeyP','KeyR'].includes(e.code)) e.preventDefault();
    if (!input.keys.has(e.code)) input.justPressed.add(e.code);
    input.keys.add(e.code);
    if (e.code === 'Digit1') switchWeapon(0);
    if (e.code === 'Digit2') switchWeapon(1);
    if (e.code === 'KeyQ') switchWeapon(player.previousWeapon);
    if (e.code === 'KeyH') dom.help.classList.toggle('hidden');
    if (e.code === 'KeyM') dom.minimap.classList.toggle('hidden');
    if (e.code === 'KeyP' && dom.perfLog) dom.perfLog.classList.toggle('hidden');
    if (e.code === 'KeyR' && !player.alive) restartArena();
  });
  window.addEventListener('keyup', e => {
    input.keys.delete(e.code);
  });

  window.addEventListener('mousedown', e => {
    if (document.pointerLockElement !== renderer.domElement) return;
    e.preventDefault();
    input.buttons.add(e.button);
    if (execution.active) return;
    if (e.button === 0) input.fireHeld = true;
    if (e.button === 2) input.altHeld = true;
    if (e.button === 0 && player.weapon === 0) tryFireSSG();
    if (e.button === 2 && player.weapon === 0) startHook();
  });
  window.addEventListener('mouseup', e => {
    input.buttons.delete(e.button);
    if (e.button === 0) input.fireHeld = false;
    if (e.button === 2) input.altHeld = false;
  });
  window.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== renderer.domElement || document.hidden) return;
    // Pointer lock sometimes emits a bogus spike after focus changes or a long GC pause.
    // Ignore lock-transition events, long-gap first events, and very large raw deltas; then cap per event.
    const eventNow = performance.now();
    if (input.lookIgnore > 0) { input.lookIgnore--; input.lastLookAt = eventNow; return; }
    if (!Number.isFinite(e.movementX) || !Number.isFinite(e.movementY)) return;
    if (input.lastLookAt && eventNow - input.lastLookAt > 240) { input.lastLookAt = eventNow; return; }
    input.lastLookAt = eventNow;
    const rawLen = Math.hypot(e.movementX, e.movementY);
    if (rawLen > 155) { input.lookDropNotice = 0.25; return; }
    const mx = clamp(e.movementX, -46, 46);
    const my = clamp(e.movementY, -46, 46);
    const sx = input.invertX ? 1 : -1; // mouse right -> yaw decreases -> camera turns right in Three's YXZ convention.
    const sy = input.invertY ? 1 : -1;
    player.yaw += mx * input.sensitivity * sx;
    player.pitch += my * input.sensitivity * sy;
    player.pitch = clamp(player.pitch, -1.48, 1.48);
    input.mouseDX += mx;
    input.mouseDY += my;
    input.lastMoveDX = mx;
    input.lastMoveDY = my;
  });
}

async function startGame() {
  if (!player.alive) restartArena();
  audio.ensure();
  audio.warmCombat();
  warmFirstHitPath(true);
  warmFirstHitAudioOnly();
  running = true;
  pausedByLock = false;
  dom.overlay.classList.add('hidden');
  renderer.domElement.requestPointerLock();
  if (!stageState.started) startStage(1);
}

function resetPlayer(soft = false) {
  player.pos.set(0, 0.05, 11);
  player.vel.set(0, 0, 0);
  player.yaw = 0;
  player.pitch = 0;
  player.grounded = false;
  player.jumpsUsed = 0;
  player.dashCharges = 2;
  player.dashRegen = 0;
  player.dashCooldown = 0;
  player.health = 100;
  player.armor = 50;
  player.ammo.shells = 18;
  player.ammo.bullets = 110;
  player.chainsawFuel = 1;
  player.chainsawRegen = 0;
  player.gloryCharges = player.gloryMax;
  player.gloryRegen = 0;
  player.flameCd = 0;
  player.flameActive = 0;
  player.lavaTick = 0;
  player.alive = true;
  player.deathTimer = 0;
  player.hurtFlash = 0;
  hook.active = false;
  hook.cooldown = 0;
  execution.active = false;
  execution.target = null;
  if (!soft) {
    player.score = 0;
    player.kills = 0;
  }
}


function restartArena() {
  for (const e of enemies) releaseEnemyMesh(e);
  enemies.length = 0;
  for (const p of projectiles) releaseProjectileMesh(p.mesh);
  projectiles.length = 0;
  releaseAllPickups();
  if (particleFX) particleFX.clear();
  if (tracerFX) tracerFX.clear();
  if (lightFX) lightFX.clear();
  if (decalFX) decalFX.clear();
  resetPlayer(false);
  clockTime = 0;
  stageState.index = 0;
  stageState.endless = false;
  stageState.pending.length = 0;
  stageState.spawnTimer = 0;
  stageState.betweenTimer = 0;
  stageState.started = false;
  stageState.stageKills = 0;
  stageState.spawnedThisStage = 0;
  spawnPickup('armor', new THREE.Vector3(-6.0, 3.65, 0), 14, false);
  spawnPickup('health', new THREE.Vector3(6.0, 3.65, 0), 18, false);
  spawnPickup('ammo', new THREE.Vector3(0, 6.55, -30), 26, false);
  dom.overlay.classList.add('hidden');
  startStage(1);
  setStatus('Arena reset. Stage 1 armed.', 1.2);
}

function loop(tMs) {
  requestAnimationFrame(loop);
  const t = tMs * 0.001;
  const dtRaw = lastFrame ? Math.min(0.05, t - lastFrame) : 0.016;
  if (lastFrame) {
    const realFrameMs = (t - lastFrame) * 1000;
    if (realFrameMs > 80) perfEvent('LONG_FRAME', `${realFrameMs.toFixed(1)}ms running=${running && !pausedByLock} enemies=${enemies.length} pickups=${pickups.length} projectiles=${projectiles.length}`);
  }
  lastFrame = t;
  const dt = slowMo > 0 ? dtRaw * 0.42 : dtRaw;
  clockTime += dtRaw;
  if (slowMo > 0) slowMo -= dtRaw;

  if (running && !pausedByLock) update(dt, dtRaw);
  render(dtRaw);
  updatePerfOverlay();
}

function update(dt, realDt) {
  audio.updateListener();
  updateWorld(dt, realDt);
  updateInputActions(dt);
  updatePlayer(dt);
  updateHook(dt);
  updateWeapons(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updatePickups(dt);
  updateParticles(dt);
  spawnDirector(dt);
  updateHUD(dt);
  input.justPressed.clear();
  input.mouseDX = input.mouseDY = 0;
  input.lastMoveDX = 0;
  input.lastMoveDY = 0;
}

function updateInputActions(dt) {
  if (!player.alive || execution.active) return;
  if (input.justPressed.has('Space')) tryJump();
  if (input.justPressed.has('ShiftLeft') || input.justPressed.has('ShiftRight')) tryDash();
  if (input.justPressed.has('KeyE')) tryGloryKill();
  if (input.justPressed.has('KeyC')) tryChainsaw();
  if (input.justPressed.has('KeyF')) tryFlameBelch();
}

function keyDown(code) { return input.keys.has(code); }
function justPressed(code) { return input.justPressed.has(code); }

function getForward() {
  return new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
}
function getRight() {
  return new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
}
function getAimDir() {
  return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ')).normalize();
}
function getCameraPos(out = new THREE.Vector3()) {
  return out.copy(player.pos).add(new THREE.Vector3(0, player.eye, 0));
}

function updatePlayer(dt) {
  if (!player.alive) {
    player.deathTimer += dt;
    if (player.deathTimer > 0.5) dom.status.textContent = 'You got torn apart. Press R to restart.';
    return;
  }

  player.coyote = player.grounded ? 0.12 : Math.max(0, player.coyote - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  player.padCooldown = Math.max(0, player.padCooldown - dt);
  player.flameCd = Math.max(0, player.flameCd - dt);
  player.flameActive = Math.max(0, player.flameActive - dt);
  player.hurtFlash = Math.max(0, player.hurtFlash - dt * 1.9);
  player.recoil = lerp(player.recoil, 0, 1 - Math.pow(0.0005, dt));
  player.recoilYaw = lerp(player.recoilYaw, 0, 1 - Math.pow(0.0007, dt));
  player.shake = Math.max(0, player.shake - dt * 4.2);

  if (player.dashCharges < player.dashMax) {
    player.dashRegen += dt;
    if (player.dashRegen >= 0.88) {
      player.dashCharges++;
      player.dashRegen = 0;
      audio.pickup('armor');
    }
  } else player.dashRegen = 0;

  if (player.chainsawFuel < player.chainsawMax) {
    player.chainsawRegen += dt;
    if (player.chainsawRegen > 4.6) {
      player.chainsawFuel = Math.min(player.chainsawMax, player.chainsawFuel + 1);
      player.chainsawRegen = 0;
      audio.pickup('ammo');
      setStatus('Chainsaw fuel recharged.', 0.75);
    }
  } else player.chainsawRegen = 0;

  if (player.gloryCharges < player.gloryMax) {
    player.gloryRegen += dt;
    if (player.gloryRegen > 4.2) {
      player.gloryCharges = Math.min(player.gloryMax, player.gloryCharges + 1);
      player.gloryRegen = 0;
      audio.pickup('power');
      setStatus('Glory charge ready.', 0.75);
    }
  } else player.gloryRegen = 0;

  if (execution.active) {
    updateExecution(dt);
    const exSpeedFov = execution.kind === 'chainsaw' ? 4 : 2;
    camera.fov = lerp(camera.fov, cameraBaseFov + exSpeedFov, 1 - Math.pow(0.0001, dt));
    camera.updateProjectionMatrix();
    updateCameraTransform();
    return;
  }

  const fwd = getForward();
  const right = getRight();
  const wish = new THREE.Vector3();
  if (keyDown('KeyW')) wish.add(fwd);
  if (keyDown('KeyS')) wish.sub(fwd);
  if (keyDown('KeyD')) wish.add(right);
  if (keyDown('KeyA')) wish.sub(right);
  if (wish.lengthSq() > 0.0001) wish.normalize();

  const speed = player.grounded ? 9.2 : 8.8;
  const accel = player.grounded ? 60 : 23;
  const wishVel = wish.multiplyScalar(speed);
  player.vel.x = accelerateAxis(player.vel.x, wishVel.x, accel, dt);
  player.vel.z = accelerateAxis(player.vel.z, wishVel.z, accel, dt);

  if (player.grounded && wishVel.lengthSq() < 0.01 && !hook.active) {
    const fr = Math.pow(0.0008, dt);
    player.vel.x *= fr;
    player.vel.z *= fr;
  }

  if (!hook.active) player.vel.y -= 23.5 * dt;
  player.vel.y = Math.max(player.vel.y, -46);

  const oldY = player.pos.y;
  moveHorizontal(dt);
  player.pos.y += player.vel.y * dt;
  resolveVertical(oldY);
  checkJumpPads();
  checkLava(dt);

  const horizSpeed = Math.hypot(player.vel.x, player.vel.z);
  player.bob += dt * (player.grounded ? clamp(horizSpeed * 1.8, 0, 18) : 2.6);
  const speedFov = clamp(horizSpeed / 24, 0, 1);
  const hookFov = hook.active ? 1 : 0;
  camera.fov = lerp(camera.fov, cameraBaseFov + speedFov * 7 + hookFov * 8, 1 - Math.pow(0.0001, dt));
  camera.updateProjectionMatrix();

  updateCameraTransform();
}

function accelerateAxis(current, target, accel, dt) {
  const delta = target - current;
  const maxDelta = accel * dt;
  return current + clamp(delta, -maxDelta, maxDelta);
}

function moveHorizontal(dt) {
  player.pos.x += player.vel.x * dt;
  resolveAxis('x');
  player.pos.z += player.vel.z * dt;
  resolveAxis('z');
}

function resolveAxis(axis) {
  const hits = overlappingBoxes();
  if (!hits.length) return;
  for (const b of hits) {
    // Low steps are climbable without eating velocity.
    if (b.max.y > player.pos.y + 0.04 && b.max.y - player.pos.y <= player.stepHeight && player.vel.y <= 0.5) {
      player.pos.y = b.max.y;
      player.vel.y = Math.max(0, player.vel.y);
      player.grounded = true;
      player.jumpsUsed = 0;
      continue;
    }
    if (axis === 'x') {
      if (player.vel.x > 0) player.pos.x = b.min.x - player.radius - 0.001;
      else if (player.vel.x < 0) player.pos.x = b.max.x + player.radius + 0.001;
      player.vel.x = 0;
    } else {
      if (player.vel.z > 0) player.pos.z = b.min.z - player.radius - 0.001;
      else if (player.vel.z < 0) player.pos.z = b.max.z + player.radius + 0.001;
      player.vel.z = 0;
    }
  }
}

function overlappingBoxes(pos = player.pos, radius = player.radius, height = player.height) {
  const arr = [];
  const yMin = pos.y + 0.06;
  const yMax = pos.y + height;
  for (const b of world.boxes) {
    if (yMax <= b.min.y + 0.06 || yMin >= b.max.y - 0.04) continue;
    if (pos.x + radius > b.min.x && pos.x - radius < b.max.x && pos.z + radius > b.min.z && pos.z - radius < b.max.z) arr.push(b);
  }
  return arr;
}

function resolveVertical(oldY) {
  player.grounded = false;
  if (player.vel.y <= 0) {
    let best = null;
    for (const f of world.floors) {
      if (player.pos.x + player.radius * 0.65 < f.minX || player.pos.x - player.radius * 0.65 > f.maxX || player.pos.z + player.radius * 0.65 < f.minZ || player.pos.z - player.radius * 0.65 > f.maxZ) continue;
      if (oldY >= f.top - 0.06 && player.pos.y <= f.top + 0.04) {
        if (!best || f.top > best.top) best = f;
      }
    }
    if (best) {
      player.pos.y = best.top;
      player.vel.y = 0;
      player.grounded = true;
      player.jumpsUsed = 0;
    }
  }
  if (player.pos.y < -8) {
    damagePlayer(35, player.pos);
    player.pos.set(0, 1.5, 11);
    player.vel.set(0, 4, 0);
  }
}

function checkJumpPads() {
  if (player.padCooldown > 0) return;
  for (const pad of world.jumpPads) {
    const dx = player.pos.x - pad.pos.x;
    const dz = player.pos.z - pad.pos.z;
    const dy = Math.abs(player.pos.y - pad.pos.y);
    if (dx * dx + dz * dz < pad.radius * pad.radius && dy < 0.75) {
      player.vel.copy(pad.boost);
      player.grounded = false;
      player.jumpsUsed = 0;
      player.padCooldown = 0.65;
      player.shake = Math.max(player.shake, 0.35);
      audio.pad(pad.pos);
      spawnRingParticles(pad.pos.clone().add(new THREE.Vector3(0, 0.35, 0)), 0x71ff76, 28, 9, 0.55);
      setStatus(`Jump pad: ${pad.label}`, 0.9);
      break;
    }
  }
}

function checkLava(dt) {
  player.inLava = false;
  player.lavaTick = Math.max(0, player.lavaTick - dt);
  for (const l of world.lavaPlanes) {
    if (player.pos.x > l.minX && player.pos.x < l.maxX && player.pos.z > l.minZ && player.pos.z < l.maxZ && player.pos.y < 0.4) {
      player.inLava = true;
      if (player.lavaTick <= 0) {
        damagePlayer(8, player.pos, true);
        audio.lava();
        player.lavaTick = 1.0;
        setStatus('Lava burns — route out, no bounce save.', 0.65);
      }
      break;
    }
  }
  if (!player.inLava) player.lavaTick = 0;
}

function updateCameraTransform() {
  const eye = getCameraPos(tmpV1);
  const jitter = player.shake > 0 ? player.shake * 0.026 : 0;
  const jx = (Math.sin(clockTime * 71.3) + Math.sin(clockTime * 133.7) * 0.45) * jitter;
  const jy = (Math.sin(clockTime * 83.1 + 1.7) + Math.sin(clockTime * 151.9) * 0.35) * jitter;
  const jz = (Math.sin(clockTime * 67.9 + 2.4) + Math.sin(clockTime * 119.1) * 0.4) * jitter;
  camera.position.set(eye.x + jx, eye.y + jy, eye.z + jz);
  camera.rotation.y = player.yaw + player.recoilYaw * 0.20;
  camera.rotation.x = player.pitch + player.recoil;
  camera.rotation.z = Math.sin(clockTime * 91.7) * jitter * 0.18;
}

function tryJump() {
  if (!player.alive || execution.active) return;
  if (player.grounded || player.coyote > 0) {
    player.vel.y = 10.7;
    player.grounded = false;
    player.coyote = 0;
    player.jumpsUsed = 1;
    audio.jump(false);
    spawnDust(player.pos, 0xd6b48a, 10);
  } else if (player.jumpsUsed < 2) {
    player.vel.y = Math.max(player.vel.y, 9.9);
    player.jumpsUsed = 2;
    audio.jump(true);
    player.shake = Math.max(player.shake, 0.12);
    spawnRingParticles(player.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0x8be8ff, 16, 3.2, 0.28);
  }
}

function tryDash() {
  if (!player.alive || execution.active || player.dashCooldown > 0 || player.dashCharges <= 0) return;
  const fwd = getForward();
  const right = getRight();
  const dir = new THREE.Vector3();
  if (keyDown('KeyW')) dir.add(fwd);
  if (keyDown('KeyS')) dir.sub(fwd);
  if (keyDown('KeyD')) dir.add(right);
  if (keyDown('KeyA')) dir.sub(right);
  if (dir.lengthSq() < 0.001) dir.copy(fwd);
  dir.normalize();
  player.vel.x += dir.x * 18.2;
  player.vel.z += dir.z * 18.2;
  if (!player.grounded) player.vel.y = Math.max(player.vel.y, 1.1);
  player.dashCharges--;
  player.dashCooldown = 0.16;
  player.dashRegen = 0;
  player.shake = Math.max(player.shake, 0.28);
  audio.dash();
  spawnDashTrail(getCameraPos(tmpV1), dir);
}

function switchWeapon(index) {
  if (execution.active) return;
  index = clamp(index, 0, weapons.length - 1);
  if (index === player.weapon) return;
  player.previousWeapon = player.weapon;
  player.weapon = index;
  weaponState.switchT = 0.22;
  ssgModel.visible = index === 0;
  heavyModel.visible = index === 1;
  if (hook.active) cancelHook(0.2);
}

function updateWeapons(dt) {
  weaponState.fireCd = Math.max(0, weaponState.fireCd - dt);
  weaponState.heavyCd = Math.max(0, weaponState.heavyCd - dt);
  weaponState.missileCd = Math.max(0, weaponState.missileCd - dt);
  weaponState.switchT = Math.max(0, weaponState.switchT - dt);
  weaponState.muzzleT = Math.max(0, weaponState.muzzleT - dt);
  weaponState.ssgPumpT = Math.max(0, weaponState.ssgPumpT - dt);

  if (!execution.active) {
    if (player.weapon === 1 && input.fireHeld) tryFireHeavy(false);
    if (player.weapon === 1 && input.altHeld) tryFireHeavy(true);
  }

  if (ssgModel) ssgModel.visible = !execution.active && player.weapon === 0;
  if (heavyModel) heavyModel.visible = !execution.active && player.weapon === 1;

  weaponState.spin += dt * (!execution.active && player.weapon === 1 && (input.fireHeld || input.altHeld) ? 28 : 8);
  for (const child of heavyModel.children) if (child.userData.spinBarrel) {
    const r = Math.hypot(child.position.x, child.position.y - 0.02);
    const base = Math.atan2(child.position.y - 0.02, child.position.x);
    const a = base + dt * (!execution.active && (input.fireHeld || input.altHeld) ? 18 : 4);
    child.position.x = Math.cos(a) * r;
    child.position.y = Math.sin(a) * r + 0.02;
  }

  const bobY = Math.sin(player.bob) * 0.025 + Math.sin(player.bob * 0.5) * 0.014;
  const bobX = Math.sin(player.bob * 0.5) * 0.025;
  const recoilZ = weaponState.muzzleT > 0 ? -0.04 * (weaponState.muzzleT / 0.08) : 0;
  const switchDrop = weaponState.switchT > 0 ? Math.sin((weaponState.switchT / 0.22) * Math.PI) * -0.28 : 0;
  weaponRoot.position.set(0.38 + bobX - input.lastMoveDX * 0.00025, -0.38 + bobY + switchDrop + input.lastMoveDY * 0.0002, -0.78 + recoilZ);
  weaponRoot.rotation.set(-player.recoil * 0.55 + input.lastMoveDY * 0.00022, input.lastMoveDX * 0.00028, Math.sin(player.bob * 0.5) * 0.025 - input.lastMoveDX * 0.0004);

  for (const m of muzzleFlash.children) {
    m.material.opacity = clamp(weaponState.muzzleT / 0.07, 0, 1);
    m.scale.setScalar(0.55 + Math.random() * 0.25 + weaponState.muzzleT * 8);
  }

  updateFlameVisual(dt);
  updateFinisherVisual(dt);
}

function easeOutCubic(t) {
  t = clamp(t, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * t;
}

function startExecution(kind, target) {
  if (execution.active || !target || !target.alive || target.dead) return false;
  perfEvent('EXEC_START', `kind=${kind} type=${target.type}`);
  cancelHook(0.35);
  execution.active = true;
  execution.kind = kind;
  execution.target = target;
  execution.t = 0;
  execution.duration = kind === 'chainsaw' ? 1.05 : 0.78;
  execution.impactTime = kind === 'chainsaw' ? 0.50 : 0.30;
  execution.impactDone = false;
  execution.startPos.copy(player.pos);
  execution.startYaw = player.yaw;
  execution.startPitch = player.pitch;
  target.inExecution = true;
  target.staggered = false;
  target.vel.set(0, 0, 0);
  target.attackCd = Math.max(target.attackCd, execution.duration + 0.4);
  const flatAway = player.pos.clone().sub(target.pos).setY(0);
  if (flatAway.lengthSq() < 0.02) flatAway.copy(getForward()).multiplyScalar(-1);
  flatAway.normalize();
  execution.targetPos.copy(target.pos).addScaledVector(flatAway, target.data.radius + 1.08);
  execution.targetPos.y = Math.max(target.pos.y, Math.min(player.pos.y, target.pos.y + 0.45));
  execution.lookPos.copy(target.pos).add(new THREE.Vector3(0, target.data.height * 0.72, 0));
  player.vel.set(0, 0, 0);
  player.grounded = false;
  input.fireHeld = false;
  input.altHeld = false;
  weaponState.fireCd = Math.max(weaponState.fireCd, execution.duration * 0.55);
  if (kind === 'chainsaw') {
    audio.chainsaw();
    setStatus('Chainsaw execution — invulnerable while ripping. Ammo payout on impact.', execution.duration);
  } else {
    audio.glory();
    setStatus('Glory kill — invulnerable finisher. Health payout on impact.', execution.duration);
  }
  return true;
}

function updateExecution(dt) {
  if (!execution.active) return;
  const e = execution.target;
  execution.t += dt;
  player.vel.set(0, 0, 0);
  if (!e || (e.dead && !execution.impactDone)) {
    execution.active = false;
    parkFinisherVisual();
    return;
  }

  // Magnet into a readable finisher pose. After the impact has removed the enemy,
  // hold the last pose briefly so the chainsaw/blade animation feels earned.
  const moveT = easeOutCubic(execution.t / Math.max(0.1, execution.impactTime * 0.82));
  player.pos.lerpVectors(execution.startPos, execution.targetPos, moveT);

  if (e && !e.dead) {
    execution.lookPos.copy(e.pos).add(new THREE.Vector3(0, e.data.height * 0.72, 0));
    const cam = getCameraPos(tmpV1);
    const lookDir = execution.lookPos.clone().sub(cam).normalize();
    const targetYaw = Math.atan2(-lookDir.x, -lookDir.z);
    const targetPitch = clamp(Math.asin(lookDir.y), -1.25, 1.25);
    const lookT = clamp(dt * 10, 0, 1);
    player.yaw = lerpAngle(player.yaw, targetYaw, lookT);
    player.pitch = lerp(player.pitch, targetPitch, lookT);

    e.mesh.rotation.y = lerpAngle(e.mesh.rotation.y, Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z), clamp(dt * 8, 0, 1));
    e.mesh.scale.setScalar((e.mesh.userData.baseScale || 1) * (1 + Math.sin(clockTime * 42) * 0.018 + (execution.kind === 'chainsaw' ? 0.035 : 0.0)));
    if (!execution.impactDone && execution.t >= execution.impactTime) finishExecutionImpact(e);
  } else if (execution.impactDone) {
    const cam = getCameraPos(tmpV1);
    const lookDir = execution.lookPos.clone().sub(cam).normalize();
    if (Number.isFinite(lookDir.x)) {
      player.yaw = lerpAngle(player.yaw, Math.atan2(-lookDir.x, -lookDir.z), clamp(dt * 5, 0, 1));
      player.pitch = lerp(player.pitch, clamp(Math.asin(lookDir.y), -1.25, 1.25), clamp(dt * 5, 0, 1));
    }
  }

  if (execution.t >= execution.duration) {
    if (!execution.impactDone && e && e.alive && !e.dead) finishExecutionImpact(e);
    execution.active = false;
    if (e && !e.dead) e.inExecution = false;
    parkFinisherVisual();
    ssgModel.visible = player.weapon === 0;
    heavyModel.visible = player.weapon === 1;
    player.shake = Math.max(player.shake, 0.16);
  }
}

function finishExecutionImpact(e) {
  if (!e || e.dead) return;
  execution.impactDone = true;
  const pos = e.pos.clone().add(new THREE.Vector3(0, e.data.height * 0.62, 0));
  if (execution.kind === 'chainsaw') {
    killEnemy(e, 'chainsaw');
    spawnAmmoBurst(pos, e.type === 'bruiser' ? 15 : 9);
    for (let i = 0; i < 3; i++) spawnArmorShard(pos.clone().add(new THREE.Vector3(rand(-0.35, 0.35), rand(0, 0.5), rand(-0.35, 0.35))), 1, true);
    player.shake = Math.max(player.shake, 0.78);
    slowMo = Math.max(slowMo, 0.10);
    setStatus('+Ammo from Chainsaw. You were invulnerable during the rip.', 0.9);
  } else {
    killEnemy(e, 'glory');
    player.health = Math.min(player.maxHealth, player.health + 38);
    spawnHealthBurst(pos, 10);
    player.shake = Math.max(player.shake, 0.62);
    slowMo = Math.max(slowMo, 0.12);
    setStatus('+Health from Glory Kill. Glory charge consumed.', 0.9);
  }
  spawnRingParticles(pos, execution.kind === 'chainsaw' ? 0xffb02a : 0x63fff0, execution.kind === 'chainsaw' ? 30 : 22, 5.5, 0.45);
}

function updateFinisherVisual(dt) {
  if (!finisherGroup) return;
  if (!execution.active) {
    parkFinisherVisual();
    return;
  }
  finisherGroup.visible = true;
  finisherGroup.scale.setScalar(1);
  const t = clamp(execution.t / Math.max(0.001, execution.duration), 0, 1);
  const impactPulse = Math.max(0, 1 - Math.abs(execution.t - execution.impactTime) / 0.12);
  const lunge = Math.sin(clamp(execution.t / execution.impactTime, 0, 1) * Math.PI) * 0.36;
  finisherGroup.position.set(-0.08 + lunge * 0.12, -0.08 + impactPulse * 0.03, -0.18 - lunge * 0.52);
  finisherGroup.rotation.set(-0.22 - impactPulse * 0.28, 0.28 + Math.sin(t * Math.PI) * 0.16, -0.22 - impactPulse * 0.18);
  if (finisherBlade) finisherBlade.visible = true;
  if (finisherSaw) finisherSaw.visible = true;
  if (finisherArm) finisherArm.visible = true;
  if (execution.kind === 'chainsaw') {
    finisherBlade.scale.setScalar(0.0001);
    finisherSaw.scale.setScalar(1);
    sawSpin += dt * 42;
    finisherSaw.rotation.z = -0.08 + Math.sin(sawSpin) * 0.08;
    finisherSaw.position.z = -0.18 - Math.sin(clockTime * 24) * 0.025;
  } else {
    finisherSaw.scale.setScalar(0.0001);
    finisherBlade.scale.set(1, 1, 1.0 + impactPulse * 0.32);
    finisherBlade.rotation.y = Math.sin(t * Math.PI) * 0.35;
  }
  finisherSpark.intensity = execution.kind === 'chainsaw' ? 1.0 + impactPulse * 2.3 : impactPulse * 1.2;
}

function parkFinisherVisual() {
  if (!finisherGroup) return;
  finisherGroup.visible = true;
  finisherGroup.position.set(0, -999, 0);
  finisherGroup.rotation.set(0, 0, 0);
  finisherGroup.scale.setScalar(0.0001);
  if (finisherArm) finisherArm.visible = true;
  if (finisherBlade) {
    finisherBlade.visible = true;
    finisherBlade.scale.setScalar(1);
    finisherBlade.rotation.y = 0.02;
  }
  if (finisherSaw) {
    finisherSaw.visible = true;
    finisherSaw.scale.setScalar(1);
    finisherSaw.position.z = -0.18;
    finisherSaw.rotation.z = -0.08;
  }
  if (finisherSpark) {
    finisherSpark.visible = true;
    finisherSpark.intensity = 0;
  }
}

function tryFireSSG() {
  if (!player.alive || execution.active || player.weapon !== 0 || weaponState.fireCd > 0) return;
  const shotT0 = perfNowMs();
  perfEvent('SSG_START', `shells=${player.ammo.shells} enemies=${enemies.length} pickups=${pickups.length}`);
  const w = weapons[0];
  if (player.ammo.shells < w.ammoCost) {
    setStatus('Need shells — chainsaw a demon for ammo.', 1.2);
    audio.negativeClick();
    return;
  }
  player.ammo.shells -= w.ammoCost;
  weaponState.fireCd = w.fireDelay;
  weaponState.muzzleT = 0.07;
  weaponState.ssgPumpT = 0.42;
  player.recoil += 0.095;
  player.recoilYaw += rand(-0.045, 0.045);
  player.shake = Math.max(player.shake, 0.42);
  perfSpan('audio.shotgun', () => audio.shotgun(), 1);
  perfSpan('spawnMuzzleSparks', () => spawnMuzzleSparks(0xffc76a, 16), 1);

  const origin = getCameraPos(tmpV1).clone();
  const aim = getAimDir();
  const right = getRight();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  let didHit = false;
  const hookedEnemy = hook.active && hook.targetKind === 'enemy' ? hook.target : null;
  const pelletHits = new Map();
  let impactBudget = 6;

  for (let i = 0; i < w.pellets; i++) {
    let dir = aim.clone();
    dir.addScaledVector(right, rand(-w.spread, w.spread));
    dir.addScaledVector(up, rand(-w.spread, w.spread));
    dir.normalize();
    const hit = raycastEnemies(origin, dir, w.range, 0.12, hookedEnemy);
    if (hit) {
      didHit = true;
      const distMul = hit.distance < 5 ? w.closeBonus : hit.distance < 10 ? 1.0 : 0.78;
      const hookMul = hookedEnemy && hit.enemy === hookedEnemy ? 1.22 : 1;
      let rec = pelletHits.get(hit.enemy);
      if (!rec) {
        rec = { damage: 0, close: false, ix: 0, iy: 0, iz: 0, impulses: 0 };
        pelletHits.set(hit.enemy, rec);
      }
      rec.damage += w.baseDamage * distMul * hookMul;
      rec.close = rec.close || hit.distance < 4.8;
      rec.ix += dir.x * 7.5; rec.iy += dir.y * 7.5; rec.iz += dir.z * 7.5; rec.impulses++;
      if (impactBudget-- > 0) perfSpan('spawnImpact', () => spawnImpact(hit.point, 0xff5d30, 2.2), 1);
    } else if (i < 5) {
      perfSpan('spawnTracer', () => spawnTracer(origin, dir, 14 + Math.random() * 7, 0xffd08a, 0.06), 1);
    }
  }

  for (const [enemy, rec] of pelletHits) {
    const inv = 1 / Math.max(1, rec.impulses);
    perfSpan(`damageEnemy.${enemy.type}`, () => damageEnemy(enemy, rec.damage, origin, tmpV2.set(rec.ix * inv, rec.iy * inv, rec.iz * inv), { source: 'ssg', close: rec.close }), 1);
  }
  if (!didHit) setStatus('Boom. Get closer, hook higher.', 0.6);
  perfEvent('SSG_END', `${(perfNowMs() - shotT0).toFixed(1)}ms hits=${pelletHits.size}`);
}

function tryFireHeavy(missileMode) {
  if (!player.alive || execution.active || player.weapon !== 1) return;
  if (missileMode) {
    if (weaponState.missileCd > 0) return;
    if (player.ammo.bullets < 4) { setStatus('Need bullets — chainsaw for ammo.', 1.0); return; }
    weaponState.missileCd = 0.19;
    player.ammo.bullets -= 4;
    const lock = findLockTarget(35, 0.18, false, true);
    spawnPlayerMissile(lock && lock.kind === 'enemy' ? lock.target : null);
    player.recoil += 0.018;
    player.shake = Math.max(player.shake, 0.12);
    audio.missile();
    weaponState.muzzleT = 0.045;
    return;
  }
  const w = weapons[1];
  if (weaponState.heavyCd > 0) return;
  if (player.ammo.bullets < w.ammoCost) { setStatus('Need bullets — chainsaw for ammo.', 1.0); return; }
  weaponState.heavyCd = w.fireDelay;
  player.ammo.bullets -= w.ammoCost;
  player.recoil += 0.012;
  player.recoilYaw += rand(-0.012, 0.012);
  player.shake = Math.max(player.shake, 0.08);
  weaponState.muzzleT = 0.04;
  audio.cannon();
  spawnMuzzleSparks(0x9fe7ff, 4);

  const origin = getCameraPos(tmpV1).clone();
  let dir = getAimDir();
  const right = getRight();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  dir = dir.addScaledVector(right, rand(-w.spread, w.spread)).addScaledVector(up, rand(-w.spread, w.spread)).normalize();
  const hit = raycastEnemies(origin, dir, w.range, 0.08, null);
  if (hit) {
    damageEnemy(hit.enemy, w.baseDamage, origin, dir.clone().multiplyScalar(2.0), { source: 'heavy' });
    spawnImpact(hit.point, 0x78dfff, 1.2);
  }
  spawnTracer(origin, dir, hit ? hit.distance : w.range, 0x85dfff, 0.035);
}

function startHook() {
  if (!player.alive || execution.active || player.weapon !== 0 || hook.cooldown > 0 || hook.active) return;
  const lock = findLockTarget(hook.maxDistance, 0.19, true, true);
  if (!lock) {
    setStatus('No hook lock — aim at a demon or purple node.', 0.6);
    return;
  }
  hook.active = true;
  hook.target = lock.target;
  hook.targetKind = lock.kind;
  hook.chainT = 0;
  hook.locked = lock;
  hook.targetPoint.copy(lock.point);
  hook.cooldown = 0.18;
  chainLine.visible = true;
  audio.hookStart();
  player.shake = Math.max(player.shake, 0.1);
  if (lock.kind === 'enemy') {
    lock.target.burning = Math.max(lock.target.burning, 4.2);
    lock.target.alert = 1;
    setStatus('Flaming hook: shoot for armor shards.', 1.0);
  } else setStatus('Hook node slingshot.', 0.8);
}

function updateHook(dt) {
  hook.cooldown = Math.max(0, hook.cooldown - dt);
  hook.scanTimer -= dt;
  if (hook.scanTimer <= 0 || hook.active) {
    hook.locked = findLockTarget(hook.maxDistance, 0.20, true, true);
    hook.scanTimer = hook.active ? 0.028 : 0.055;
  }
  if (hook.locked) {
    hook.lastLockKind = hook.locked.kind;
    hook.lockStrength = lerp(hook.lockStrength, 1, 1 - Math.pow(0.003, dt));
  } else hook.lockStrength = lerp(hook.lockStrength, 0, 1 - Math.pow(0.003, dt));

  if (!hook.active) {
    chainLine.visible = false;
    return;
  }

  if (!hook.target || (hook.targetKind === 'enemy' && (!hook.target.alive || hook.target.dead))) {
    cancelHook(0.6);
    return;
  }

  const targetPos = getHookTargetPosition(hook.target, hook.targetKind, tmpV1);
  const camPos = getCameraPos(tmpV2);
  const to = targetPos.clone().sub(camPos);
  const dist = to.length();
  if (dist > hook.maxDistance + 7 || (hook.targetKind === 'enemy' && hook.target.staggered && dist < 2.2)) {
    cancelHook(0.45);
    return;
  }
  const dir = to.multiplyScalar(1 / Math.max(0.0001, dist));
  const right = getRight();
  let strafe = 0;
  if (keyDown('KeyA')) strafe -= 1;
  if (keyDown('KeyD')) strafe += 1;
  const upAssist = dist > 6 ? 1.15 : 0.2;
  const desired = dir.clone().multiplyScalar(26.8).addScaledVector(right, strafe * 6.4).addScaledVector(UP, upAssist);
  player.vel.lerp(desired, clamp(11.5 * dt, 0, 0.92));
  player.grounded = false;
  player.jumpsUsed = Math.min(player.jumpsUsed, 1); // keeps double jump available after a hook entry.
  hook.chainT += dt;

  if (hook.targetKind === 'enemy') {
    hook.target.burning = Math.max(hook.target.burning, 4.0);
    if (Math.random() < dt * 6) spawnArmorShard(getHookTargetPosition(hook.target, hook.targetKind, tmpV3), 1, true);
  }

  const start = camPos.clone().add(getRight().multiplyScalar(0.25)).add(new THREE.Vector3(0, -0.22, 0));
  chainLine.geometry.setFromPoints([start, targetPos]);
  chainLine.material.opacity = 0.65 + Math.sin(clockTime * 34) * 0.18;

  if (dist < (hook.targetKind === 'node' ? 2.0 : 1.85) || !input.altHeld && hook.chainT > 0.18) {
    // Preserve and sweeten momentum on release so hook nodes become true navigation tools.
    player.vel.addScaledVector(dir, 7.5);
    player.vel.y += 1.35;
    cancelHook(0.52);
    audio.hookPull();
  }
}

function cancelHook(cd = 0.6) {
  hook.active = false;
  hook.target = null;
  hook.cooldown = Math.max(hook.cooldown, cd);
  chainLine.visible = false;
}

function getHookTargetPosition(target, kind, out = new THREE.Vector3()) {
  if (kind === 'node') return out.copy(target.pos);
  return out.copy(target.pos).add(new THREE.Vector3(0, target.data.height * 0.65, 0));
}

function findLockTarget(maxDist, maxAngle, includeNodes = true, enemiesOnly = false) {
  const origin = getCameraPos(tmpV1).clone();
  const aim = getAimDir();
  const cosMax = Math.cos(maxAngle);
  let best = null;

  for (const e of enemies) {
    if (!e.alive || e.dead || e.inExecution) continue;
    const p = e.pos.clone().add(new THREE.Vector3(0, e.data.height * 0.58, 0));
    const v = p.clone().sub(origin);
    const d = v.length();
    if (d > maxDist || d < 0.5) continue;
    const dir = v.multiplyScalar(1 / d);
    const dot = aim.dot(dir);
    if (dot < cosMax) continue;
    if (!hasLineOfSight(origin, p)) continue;
    const score = dot * 2.2 - d / maxDist * 0.55 + (e.staggered ? 0.15 : 0);
    if (!best || score > best.score) best = { kind: 'enemy', target: e, point: p, distance: d, dot, score };
  }

  if (includeNodes && !enemiesOnly) {
    for (const n of world.hookNodes) {
      const v = n.pos.clone().sub(origin);
      const d = v.length();
      if (d > maxDist + 5 || d < 1) continue;
      const dir = v.multiplyScalar(1 / d);
      const dot = aim.dot(dir);
      if (dot < Math.cos(maxAngle * 1.25)) continue;
      if (!hasLineOfSight(origin, n.pos)) continue;
      const score = dot * 1.7 - d / (maxDist + 5) * 0.35 - 0.08;
      if (!best || score > best.score) best = { kind: 'node', target: n, point: n.pos.clone(), distance: d, dot, score };
    }
  }
  return best;
}

function hasLineOfSight(a, b) {
  // Cheap segment-vs-block test. Ignores low cover if the segment is above it.
  const dir = b.clone().sub(a);
  const len = dir.length();
  if (len < 0.001) return true;
  dir.multiplyScalar(1 / len);
  for (const box of world.boxes) {
    if (box.name.includes('wall') || box.name.includes('cover') || box.name.includes('catwalk') || box.name.includes('ledge') || box.name.includes('bailout') || box.name.includes('pillar')) {
      const hit = rayAabb(a, dir, len, box);
      if (hit && hit > 0.2 && hit < len - 0.4) return false;
    }
  }
  return true;
}

function rayAabb(origin, dir, maxDist, box) {
  let tmin = 0, tmax = maxDist;
  for (const axis of ['x', 'y', 'z']) {
    const o = origin[axis];
    const d = dir[axis];
    const min = box.min[axis], max = box.max[axis];
    if (Math.abs(d) < 1e-6) {
      if (o < min || o > max) return null;
    } else {
      const inv = 1 / d;
      let t1 = (min - o) * inv;
      let t2 = (max - o) * inv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

function raycastEnemies(origin, dir, maxDist, extraRadius = 0, priorityEnemy = null) {
  let bestEnemy = null;
  let bestT = Infinity;
  let bestAdjusted = Infinity;

  const test = (e, priorityBoost = 0) => {
    if (!e.alive || e.dead || e.inExecution) return;
    const cx = e.pos.x;
    const cy = e.pos.y + e.data.height * 0.54;
    const cz = e.pos.z;
    const ocx = cx - origin.x;
    const ocy = cy - origin.y;
    const ocz = cz - origin.z;
    const t = ocx * dir.x + ocy * dir.y + ocz * dir.z;
    if (t < 0 || t > maxDist) return;
    const px = origin.x + dir.x * t;
    const py = origin.y + dir.y * t;
    const pz = origin.z + dir.z * t;
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const r = e.data.radius + extraRadius + (e.staggered ? 0.22 : 0);
    if (dx * dx + dy * dy + dz * dz <= r * r) {
      const adjusted = Math.max(0, t - priorityBoost);
      if (adjusted < bestAdjusted) { bestAdjusted = adjusted; bestT = t; bestEnemy = e; }
    }
  };

  if (priorityEnemy) test(priorityEnemy, 1.4);
  for (const e of enemies) test(e, 0);
  if (!bestEnemy) return null;
  return { enemy: bestEnemy, distance: bestT, point: new THREE.Vector3(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT), adjusted: bestAdjusted };
}

function spawnPlayerMissile(target) {
  const origin = getCameraPos(tmpV1).clone().add(getRight().multiplyScalar(0.25)).add(new THREE.Vector3(0, -0.18, 0));
  const dir = getAimDir();
  const mesh = acquireProjectileMesh('playerMissile', 1);
  if (!mesh) return;
  mesh.position.copy(origin);
  mesh.quaternion.setFromUnitVectors(UP, dir);
  projectiles.push({ type: 'playerMissile', owner: 'player', pos: origin, vel: dir.clone().multiplyScalar(23), mesh, target, radius: 0.22, damage: 42, splash: 3.2, life: 2.2, trailColor: 0x78e8ff });
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    if (p.life <= 0) { removeProjectile(i); continue; }

    if (p.type === 'playerMissile' && p.target && p.target.alive && !p.target.dead && !p.target.inExecution) {
      const desired = p.target.pos.clone().add(new THREE.Vector3(0, p.target.data.height * 0.55, 0)).sub(p.pos).normalize().multiplyScalar(29);
      p.vel.lerp(desired, clamp(dt * 5.2, 0, 0.5));
    }

    p.pos.addScaledVector(p.vel, dt);
    p.mesh.position.copy(p.pos);
    if (p.vel.lengthSq() > 0.1) p.mesh.quaternion.setFromUnitVectors(UP, p.vel.clone().normalize());
    if (Math.random() < dt * 25) spawnParticle(p.pos.clone(), new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.5), p.trailColor || 0xff8a30, 0.22, 0.065, true);

    if (p.owner === 'enemy') {
      if (p.pos.distanceToSquared(getCameraPos(tmpV1)) < 0.85) {
        explodeProjectile(p, i, true);
        damagePlayer(p.damage, p.pos);
        continue;
      }
    } else {
      let hitEnemy = null;
      for (const e of enemies) {
        if (!e.alive || e.dead || e.inExecution) continue;
        const c = e.pos.clone().add(new THREE.Vector3(0, e.data.height * 0.5, 0));
        const r = e.data.radius + p.radius;
        if (p.pos.distanceToSquared(c) < r * r) { hitEnemy = e; break; }
      }
      if (hitEnemy) {
        explodeProjectile(p, i, false);
        for (const e of enemies) {
          const d = e.pos.distanceTo(p.pos);
          if (d < p.splash) damageEnemy(e, p.damage * (1 - d / p.splash * 0.55), p.pos, e.pos.clone().sub(p.pos).normalize().multiplyScalar(6), { source: 'missile', explosive: true });
        }
        continue;
      }
    }

    // World impact: mostly against walls/high blocks.
    if (p.pos.y < 0.02 || p.pos.x < -world.bounds || p.pos.x > world.bounds || p.pos.z < -world.bounds || p.pos.z > world.bounds) {
      explodeProjectile(p, i, p.owner === 'enemy');
    }
  }
}

function explodeProjectile(p, index, enemyOwned) {
  spawnExplosion(p.pos, enemyOwned ? 0xff6820 : 0x85e8ff);
  audio.explosion(p.pos);
  removeProjectile(index);
}

function removeProjectile(index) {
  const p = projectiles[index];
  if (p && p.mesh) releaseProjectileMesh(p.mesh);
  projectiles.splice(index, 1);
}

function spawnTracer(origin, dir, length, color, life) {
  if (tracerFX) tracerFX.emit(origin, dir, length, color, life);
}

function spawnMuzzleSparks(color, count) {
  const origin = getCameraPos(tmpV1).clone().add(getAimDir().multiplyScalar(0.7));
  const aim = getAimDir();
  count = Math.min(count, 10);
  for (let i = 0; i < count; i++) {
    spawnParticleXYZ(
      origin.x, origin.y, origin.z,
      aim.x * rand(3, 8) + rand(-1.5, 1.5),
      aim.y * rand(3, 8) + rand(-1, 1),
      aim.z * rand(3, 8) + rand(-1.5, 1.5),
      color, rand(0.08, 0.18), rand(0.03, 0.07), true
    );
  }
}

function spawnImpact(pos, color, count) {
  const n = Math.min(12, Math.max(3, Math.floor(count * 3)));
  for (let i = 0; i < n; i++) {
    spawnParticleXYZ(pos.x, pos.y, pos.z, rand(-2, 2), rand(0.5, 3.5), rand(-2, 2), color, rand(0.16, 0.34), rand(0.04, 0.09), true);
  }
}

function tryFlameBelch() {
  if (!player.alive || execution.active || player.flameCd > 0) return;
  player.flameCd = 14.0;
  player.flameActive = 0.86;
  audio.flame();
  setStatus('Flame belch: burning demons drop armor when damaged.', 1.1);
  applyFlameCone(true);
}

function applyFlameCone(burst = false) {
  const origin = getCameraPos(tmpV1).clone();
  const aim = getAimDir();
  const range = 10.5;
  const cos = Math.cos(0.46);
  for (const e of enemies) {
    if (!e.alive || e.dead || e.inExecution) continue;
    const target = e.pos.clone().add(new THREE.Vector3(0, e.data.height * 0.48, 0));
    const v = target.sub(origin);
    const d = v.length();
    if (d > range) continue;
    if (aim.dot(v.normalize()) > cos) {
      e.burning = Math.max(e.burning, 5.8);
      e.alert = 1;
      if (burst) spawnArmorShard(e.pos.clone().add(new THREE.Vector3(0, 1, 0)), 2, true);
    }
  }
}

function updateFlameVisual(dt) {
  if (player.flameActive <= 0) return;
  applyFlameCone(false);
  const origin = getCameraPos(tmpV1).clone().add(getAimDir().multiplyScalar(0.6));
  const aim = getAimDir();
  const right = getRight();
  const up = tmpV4.set(0, 1, 0).applyQuaternion(camera.quaternion);
  for (let i = 0; i < 3; i++) {
    const sx = rand(-0.35, 0.35), sy = rand(-0.22, 0.22);
    let dx = aim.x + right.x * sx + up.x * sy;
    let dy = aim.y + right.y * sx + up.y * sy;
    let dz = aim.z + right.z * sx + up.z * sy;
    const inv = 1 / Math.max(0.001, Math.hypot(dx, dy, dz));
    const sp = rand(8, 14);
    spawnParticleXYZ(origin.x, origin.y, origin.z, dx * inv * sp, dy * inv * sp, dz * inv * sp, Math.random() < 0.6 ? 0xff7a21 : 0xffd258, rand(0.22, 0.42), rand(0.08, 0.16), true);
  }
}

function tryGloryKill() {
  if (!player.alive || execution.active) return;
  if (player.gloryCharges <= 0) {
    setStatus('Glory charges recharging — keep moving, hook, and thin the wave.', 0.9);
    audio.negativeClick();
    return;
  }
  const target = nearestEnemy({ maxDist: 3.35, staggeredOnly: true, mustFace: false });
  if (!target) { setStatus('Glory kill requires a staggered flashing demon up close.', 0.8); audio.negativeClick(); return; }
  player.gloryCharges--;
  player.gloryRegen = 0;
  startExecution('glory', target);
}

function tryChainsaw() {
  if (!player.alive || execution.active) return;
  const target = nearestEnemy({ maxDist: 3.15, staggeredOnly: false, mustFace: true });
  if (!target) { setStatus('Chainsaw needs a demon in your face.', 0.7); audio.negativeClick(); return; }
  const cost = target.data.fuelCost;
  if (player.chainsawFuel < cost) { setStatus(`Need ${cost} fuel for ${target.data.label}. Fodder costs 1.`, 1.2); audio.negativeClick(); return; }
  player.chainsawFuel -= cost;
  player.chainsawRegen = 0;
  startExecution('chainsaw', target);
}

function nearestEnemy({ maxDist = 3, staggeredOnly = false, mustFace = false }) {
  const origin = player.pos.clone().add(new THREE.Vector3(0, 0.9, 0));
  const aim = getAimDir();
  let best = null, bestScore = Infinity;
  for (const e of enemies) {
    if (!e.alive || e.dead || e.inExecution) continue;
    if (staggeredOnly && !e.staggered) continue;
    const target = e.pos.clone().add(new THREE.Vector3(0, e.data.height * 0.45, 0));
    const v = target.clone().sub(origin);
    const d = v.length();
    if (d > maxDist) continue;
    if (mustFace && aim.dot(v.normalize()) < 0.25) continue;
    if (d < bestScore) { bestScore = d; best = e; }
  }
  return best;
}

function spawnEnemy(type = null, pos = null) {
  if (!type) {
    const t = Math.random();
    const difficulty = Math.min(1, clockTime / 160);
    type = t < 0.46 - difficulty * 0.1 ? 'husk' : t < 0.73 ? 'imp' : t < 0.90 ? 'revenant' : 'bruiser';
  }
  const data = enemyTypes[type];
  pos = pos ? pos.clone() : chooseSpawnPoint();
  pos.y += 0.05;
  const group = acquireEnemyMesh(type, data);
  if (!group) return null;
  group.position.copy(pos);
  const e = {
    type, data, mesh: group, pos, vel: new THREE.Vector3(), hp: data.hp, maxHp: data.hp,
    alive: true, dead: false, staggered: false, staggerT: 0, burning: 0, burnTick: 0,
    pain: 0, alert: 0, attackCd: rand(0.3, data.cooldown), leapCd: rand(1, 4), strafe: Math.random() < 0.5 ? -1 : 1, grounded: false,
    spawnT: 0.8, lastGrowl: rand(1, 5), armorDropCd: 0, lastHitSound: -99, emissiveMeshes: []
  };
  group.traverse(o => { if (o.isMesh && o.material && o.material.emissive) e.emissiveMeshes.push(o); });
  enemies.push(e);
  spawnRingParticles(pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xff5720, 18, 3.5, 0.6);
  audio.spawn(pos);
  return e;
}

function createRuntimeEnemyMesh(type, data) {
  if (type !== 'husk' || !characterAssets.emberRunt) return null;
  const asset = characterAssets.emberRunt;
  const group = SkeletonUtils.clone(asset.scene);
  cloneMaterialInstances(group);
  const modelScale = data.height / Math.max(0.001, asset.height);
  group.scale.setScalar(modelScale);
  group.rotation.y = Math.PI;
  group.userData.poolType = type;
  group.userData.runtimeCharacter = 'ember-runt';
  group.userData.baseScale = modelScale;
  group.userData.mixer = new THREE.AnimationMixer(group);
  group.userData.action = null;
  if (asset.animations.length) {
    const action = group.userData.mixer.clipAction(asset.animations[0]);
    action.enabled = true;
    action.play();
    group.userData.action = action;
  }
  group.traverse((o) => {
    o.frustumCulled = false;
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = true;
    }
  });
  return group;
}

function createEnemyMesh(type, data) {
  const runtimeMesh = createRuntimeEnemyMesh(type, data);
  if (runtimeMesh) return runtimeMesh;

  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: data.color, emissive: data.emissive, emissiveIntensity: 0.2, roughness: 0.64, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x150d0d, roughness: 0.78, metalness: 0.06 });
  const bone = materials.bone || new THREE.MeshStandardMaterial({ color: 0xd2b48a, roughness: 0.58, metalness: 0.02 });
  const armor = materials.enemyArmor || new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.38, metalness: 0.75 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xffd46a, emissive: 0xff5a10, emissiveIntensity: 1.35, roughness: 0.2 });
  const mouthGlow = new THREE.MeshStandardMaterial({ color: 0xff6130, emissive: 0xff2500, emissiveIntensity: 1.1, roughness: 0.3 });

  const cap = (r, len, mat, pos, rot = [0, 0, 0], seg = 10) => {
    const geo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(r, len, 5, seg) : new THREE.CylinderGeometry(r, r, len + r * 2, seg);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    group.add(m);
    return m;
  };
  const box = (size, mat, pos, rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    group.add(m);
    return m;
  };
  const cone = (r, h, mat, pos, rot = [0, 0, 0], seg = 7) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    group.add(m);
    return m;
  };

  const scaleType = type === 'bruiser' ? 1.1 : type === 'revenant' ? 1.04 : type === 'imp' ? 1.0 : 0.92;
  const torso = cap(data.radius * 0.55, data.height * 0.42, bodyMat, [0, data.height * 0.48, 0], [0.05, 0, 0], 14);
  torso.scale.set(1.0 * scaleType, type === 'bruiser' ? 1.08 : 1, type === 'husk' ? 0.92 : 1.05);

  // Chest/abdomen armor makes hits read better from distance.
  box([data.radius * 0.82, data.height * 0.16, data.radius * 0.18], armor, [0, data.height * 0.58, data.radius * 0.48], [-0.06, 0, 0]);
  box([data.radius * 0.62, data.height * 0.10, data.radius * 0.13], armor, [0, data.height * 0.39, data.radius * 0.50], [-0.12, 0, 0]);

  const head = new THREE.Mesh(new THREE.SphereGeometry(data.radius * (type === 'bruiser' ? 0.46 : 0.42), 20, 14), bodyMat);
  head.position.set(0, data.height * 0.86, data.radius * 0.16);
  head.scale.set(type === 'husk' ? 1.08 : 1, type === 'bruiser' ? 0.9 : 1, type === 'imp' ? 1.08 : 1);
  group.add(head);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(data.radius * 0.22, 12, 8), dark);
  snout.position.set(0, data.height * 0.82, data.radius * 0.48);
  snout.scale.set(1.25, 0.45, 0.82);
  group.add(snout);
  box([data.radius * 0.34, data.radius * 0.06, data.radius * 0.12], mouthGlow, [0, data.height * 0.78, data.radius * 0.56]);

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(data.radius * 0.07, 8, 6), glow);
    eye.position.set(sx * data.radius * 0.15, data.height * 0.9, data.radius * 0.48);
    group.add(eye);
    cone(data.radius * 0.14, data.radius * (type === 'bruiser' ? 0.58 : 0.44), bone, [sx * data.radius * 0.28, data.height * 1.04, data.radius * 0.02], [0.25, 0.0, sx * 0.54], 7);
    cone(data.radius * 0.105, data.radius * 0.34, bone, [sx * data.radius * 0.45, data.height * 0.93, -data.radius * 0.12], [-0.2, 0.2 * sx, sx * 0.82], 6);

    const arm = cap(data.radius * 0.13, data.height * 0.42, dark, [sx * data.radius * 0.74, data.height * 0.50, data.radius * 0.07], [0.25, 0.0, sx * 0.55], 9);
    arm.scale.set(1, type === 'bruiser' ? 1.2 : 1, 1);
    cap(data.radius * 0.10, data.height * 0.26, bodyMat, [sx * data.radius * 0.88, data.height * 0.31, data.radius * 0.31], [0.98, 0, sx * 0.22], 8);
    for (let c = 0; c < 3; c++) cone(data.radius * 0.035, data.radius * 0.20, bone, [sx * (data.radius * 0.86 + c * data.radius * 0.04), data.height * 0.21, data.radius * 0.55], [Math.PI / 2, 0, sx * 0.12], 5);

    cap(data.radius * 0.15, data.height * 0.30, dark, [sx * data.radius * 0.34, data.height * 0.13, -data.radius * 0.05], [0.1, 0, sx * 0.16], 8);
  }

  if (type === 'husk') {
    // Fodder: lower, toothier, reads as fast melee pressure.
    for (let i = 0; i < 6; i++) {
      const a = (i - 2.5) * 0.13;
      cone(data.radius * 0.035, data.radius * 0.18, bone, [a, data.height * 0.73, data.radius * 0.62], [Math.PI / 2, 0, 0], 5);
    }
    for (const sx of [-1, 1]) for (const z of [-0.32, 0.24]) {
      cap(data.radius * 0.08, data.height * 0.28, dark, [sx * data.radius * 0.54, data.height * 0.24, z * data.radius], [0.65, 0, sx * 0.45], 7);
    }
  }

  if (type === 'imp') {
    // Caster: tall silhouette, spines, tail, glowing hands.
    for (let i = 0; i < 7; i++) {
      cone(0.075 + i * 0.006, 0.34 + i * 0.025, bone, [(i - 3) * 0.055, data.height * (0.55 + i * 0.055), -data.radius * 0.46], [-0.78, 0, 0], 6);
    }
    const tail = cap(data.radius * 0.07, data.height * 0.52, dark, [0, data.height * 0.34, -data.radius * 0.70], [1.16, 0, 0], 8);
    tail.scale.z = 0.7;
    for (const sx of [-1, 1]) {
      const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(data.radius * 0.13, 1), materials.orangeGlow);
      fire.position.set(sx * data.radius * 0.98, data.height * 0.28, data.radius * 0.52);
      group.add(fire);
    }
  }

  if (type === 'revenant') {
    // Revenant: pale skeletal midweight with shoulder pods and blue jump jets.
    torso.scale.set(0.82, 1.12, 0.78);
    box([data.radius * 0.72, data.height * 0.11, data.radius * 0.14], bone, [0, data.height * 0.67, data.radius * 0.42], [-0.05, 0, 0]);
    for (const sx of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(data.radius * 0.30, data.radius * 0.22, data.radius * 0.58), armor);
      pod.position.set(sx * data.radius * 0.72, data.height * 0.82, data.radius * 0.43);
      pod.rotation.z = sx * 0.08;
      group.add(pod);
      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.11, 10), materials.blueGlow);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(sx * data.radius * 0.72, data.height * 0.82, data.radius * 0.78);
      group.add(muzzle);
      const jet = new THREE.Mesh(new THREE.ConeGeometry(data.radius * 0.12, data.radius * 0.34, 7), materials.blueGlow);
      jet.position.set(sx * data.radius * 0.32, data.height * 0.12, -data.radius * 0.22);
      jet.rotation.x = Math.PI;
      group.add(jet);
      for (let r = 0; r < 3; r++) {
        cap(data.radius * 0.035, data.height * 0.32, bone, [sx * data.radius * (0.13 + r * 0.11), data.height * 0.47, data.radius * 0.02], [0.14, 0, sx * 0.12], 6);
      }
    }
    for (let i = 0; i < 6; i++) {
      box([data.radius * 0.42, data.radius * 0.035, data.radius * 0.05], bone, [0, data.height * (0.42 + i * 0.045), data.radius * 0.43], [0.02, 0, 0]);
    }
  }

  if (type === 'bruiser') {
    // Heavy: rounded demon mass, shoulder cannons, armor plates, huge horns.
    const belly = new THREE.Mesh(new THREE.SphereGeometry(data.radius * 0.72, 20, 14), bodyMat);
    belly.scale.set(1.18, 0.85, 1.04);
    belly.position.set(0, data.height * 0.42, 0.05);
    group.add(belly);
    box([data.radius * 1.05, data.height * 0.12, data.radius * 0.22], armor, [0, data.height * 0.72, data.radius * 0.46], [-0.06, 0, 0]);
    for (const sx of [-1, 1]) {
      const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.72, 14), materials.darkMetal);
      cannon.rotation.x = Math.PI / 2;
      cannon.position.set(sx * data.radius * 0.70, data.height * 0.78, data.radius * 0.66);
      group.add(cannon);
      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 14), materials.orangeGlow);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(sx * data.radius * 0.70, data.height * 0.78, data.radius * 1.04);
      group.add(muzzle);
      cone(data.radius * 0.18, data.radius * 0.72, bone, [sx * data.radius * 0.34, data.height * 1.08, -data.radius * 0.04], [0.04, 0, sx * 0.62], 8);
      box([data.radius * 0.34, data.radius * 0.18, data.radius * 0.22], armor, [sx * data.radius * 0.58, data.height * 0.62, data.radius * 0.26], [0.08, 0, sx * 0.2]);
    }
  }

  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

function chooseSpawnPoint() {
  let best = null;
  for (let i = 0; i < 9; i++) {
    const p = world.spawnPoints[randInt(0, world.spawnPoints.length - 1)].clone();
    if (!best || p.distanceToSquared(player.pos) > best.distanceToSquared(player.pos)) best = p;
  }
  return best || new THREE.Vector3(rand(-world.bounds + 5, world.bounds - 5), 0, rand(-world.bounds + 5, world.bounds - 5));
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) {
      releaseEnemyMesh(e);
      enemies.splice(i, 1);
      continue;
    }
    updateEnemy(e, dt);
  }
}

function updateEnemy(e, dt) {
  e.spawnT = Math.max(0, e.spawnT - dt);
  e.pain = Math.max(0, e.pain - dt * 3);
  e.alert = Math.max(0, e.alert - dt);
  e.attackCd = Math.max(0, e.attackCd - dt);
  e.leapCd = Math.max(0, e.leapCd - dt);
  e.burning = Math.max(0, e.burning - dt);
  e.lastGrowl -= dt;
  e.armorDropCd = Math.max(0, e.armorDropCd - dt);
  if (e.lastGrowl <= 0 && e.pos.distanceToSquared(player.pos) < 250) {
    audio.noise({ duration: 0.25, volume: e.type === 'bruiser' ? 0.12 : 0.055, filter: e.type === 'bruiser' ? 400 : 900, q: 1.8, type: 'bandpass', pos: e.pos });
    e.lastGrowl = rand(4, 9);
  }

  if (e.inExecution) {
    e.vel.set(0, 0, 0);
    e.mesh.position.copy(e.pos);
    e.mesh.rotation.z = Math.sin(clockTime * 34) * 0.04;
    facePlayer(e, dt, 8);
    return;
  }

  if (e.burning > 0) {
    e.burnTick -= dt;
    if (e.burnTick <= 0) {
      e.burnTick = 0.55;
      spawnArmorShard(e.pos.clone().add(new THREE.Vector3(rand(-0.4, 0.4), rand(0.6, 1.5), rand(-0.4, 0.4))), 1, true);
    }
  }

  if (e.staggered) {
    e.staggerT -= dt;
    e.mesh.rotation.z = Math.sin(clockTime * 14) * 0.08;
    e.mesh.scale.setScalar((e.mesh.userData.baseScale || 1) * (1 + Math.sin(clockTime * 18) * 0.025));
    if (e.staggerT <= 0) {
      e.staggered = false;
      e.hp = Math.max(e.hp, e.data.staggerHp);
      e.mesh.scale.setScalar(e.mesh.userData.baseScale || 1);
    }
    facePlayer(e, dt, 4);
    return;
  }

  if (!player.alive) return;
  const toPlayer = player.pos.clone().sub(e.pos);
  const dist = Math.max(0.001, toPlayer.length());
  const flat = toPlayer.setY(0);
  const dir = flat.lengthSq() > 0.001 ? flat.normalize() : new THREE.Vector3(0, 0, 1);
  facePlayer(e, dt, e.type === 'bruiser' ? 3 : 5.5);

  if (e.type === 'husk') {
    e.vel.x = lerp(e.vel.x, dir.x * e.data.speed, clamp(dt * 3.0, 0, 1));
    e.vel.z = lerp(e.vel.z, dir.z * e.data.speed, clamp(dt * 3.0, 0, 1));
    if (dist < 1.5 && e.attackCd <= 0) enemyMelee(e);
    if (dist > 6 && dist < 12 && e.leapCd <= 0) {
      e.vel.addScaledVector(dir, 5.5); e.vel.y = 5.2; e.leapCd = rand(3, 5);
    }
  } else if (e.type === 'imp') {
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(e.strafe);
    const desired = dir.clone().multiplyScalar(dist > 9 ? e.data.speed : dist < 5 ? -e.data.speed * 0.8 : 0).addScaledVector(side, 1.35);
    e.vel.x = lerp(e.vel.x, desired.x, clamp(dt * 2.2, 0, 1));
    e.vel.z = lerp(e.vel.z, desired.z, clamp(dt * 2.2, 0, 1));
    if (e.attackCd <= 0 && dist < 18) enemyShoot(e, 1);
    if (Math.random() < dt * 0.25) e.strafe *= -1;
  } else if (e.type === 'revenant') {
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(e.strafe);
    const desired = dir.clone().multiplyScalar(dist > 13 ? e.data.speed * 1.05 : dist < 7 ? -e.data.speed * 0.55 : e.data.speed * 0.12).addScaledVector(side, 2.15);
    e.vel.x = lerp(e.vel.x, desired.x, clamp(dt * 2.8, 0, 1));
    e.vel.z = lerp(e.vel.z, desired.z, clamp(dt * 2.8, 0, 1));
    if (e.grounded && e.leapCd <= 0 && dist > 5) {
      e.vel.addScaledVector(dir, 3.4);
      e.vel.y = 8.6;
      e.leapCd = rand(2.2, 3.8);
      spawnRingParticles(e.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), 0x63dfff, 10, 2.7, 0.26);
    }
    if (e.attackCd <= 0 && dist < 24) enemyShoot(e, 2);
    if (Math.random() < dt * 0.45) e.strafe *= -1;
  } else if (e.type === 'bruiser') {
    const desired = dir.clone().multiplyScalar(dist > 7 ? e.data.speed : dist < 3 ? -e.data.speed * 0.4 : 0);
    e.vel.x = lerp(e.vel.x, desired.x, clamp(dt * 1.7, 0, 1));
    e.vel.z = lerp(e.vel.z, desired.z, clamp(dt * 1.7, 0, 1));
    if (e.attackCd <= 0 && dist < 20) enemyShoot(e, 3);
    if (dist < 2.3 && e.attackCd <= 0.7) enemyMelee(e);
  }

  e.vel.y -= 20 * dt;
  e.grounded = false;
  moveEnemy(e, dt);
  animateEnemyMesh(e, dt);
}

function facePlayer(e, dt, speed = 5) {
  const dx = player.pos.x - e.pos.x;
  const dz = player.pos.z - e.pos.z;
  const targetYaw = Math.atan2(dx, dz);
  let delta = targetYaw - e.mesh.rotation.y;
  while (delta > Math.PI) delta -= TAU;
  while (delta < -Math.PI) delta += TAU;
  e.mesh.rotation.y += clamp(delta, -speed * dt, speed * dt);
}

function moveEnemy(e, dt) {
  e.pos.x += e.vel.x * dt;
  e.pos.z += e.vel.z * dt;
  const b = world.bounds - 1.4;
  e.pos.x = clamp(e.pos.x, -b, b);
  e.pos.z = clamp(e.pos.z, -b, b);
  const oldY = e.pos.y;
  e.pos.y += e.vel.y * dt;
  let best = null;
  for (const f of world.floors) {
    const r = e.data.radius * 0.5;
    if (e.pos.x + r < f.minX || e.pos.x - r > f.maxX || e.pos.z + r < f.minZ || e.pos.z - r > f.maxZ) continue;
    if (oldY >= f.top - 0.08 && e.pos.y <= f.top + 0.05) if (!best || f.top > best.top) best = f;
  }
  if (best && e.vel.y <= 0) {
    e.pos.y = best.top;
    e.vel.y = 0;
    e.grounded = true;
  }
  e.mesh.position.copy(e.pos);
}

function animateEnemyMesh(e, dt) {
  const burnPulse = e.burning > 0 ? (0.35 + Math.sin(clockTime * 18) * 0.22) : 0;
  const painScale = e.pain > 0 ? 1 + e.pain * 0.08 : 1;
  const baseScale = e.mesh.userData.baseScale || 1;
  if (e.mesh.userData.mixer) {
    const animRate = e.staggered ? 0.25 : e.inExecution ? 0.08 : e.type === 'husk' ? 1.15 : 1;
    e.mesh.userData.mixer.update(dt * animRate);
  }
  e.mesh.scale.setScalar(baseScale * (painScale + burnPulse * 0.03));
  e.mesh.position.y = e.pos.y + Math.sin(clockTime * (e.type === 'husk' ? 9 : 5) + e.pos.x) * 0.035;
  const emissiveIntensity = (e.burning > 0 ? 0.9 + burnPulse : 0.22) + (e.staggered ? 1.8 : 0) + e.pain * 0.8;
  const emissiveHex = e.staggered ? 0x40ff38 : e.data.emissive;
  for (const o of e.emissiveMeshes) {
    const base = o.material.userData.baseEmissiveIntensity || 0.22;
    o.material.emissiveIntensity = Math.max(base, emissiveIntensity);
    o.material.emissive.setHex(emissiveHex);
  }
}

function enemyMelee(e) {
  e.attackCd = e.data.cooldown;
  if (e.pos.distanceTo(player.pos) < 2.0) {
    damagePlayer(e.data.melee, e.pos);
    e.vel.addScaledVector(player.pos.clone().sub(e.pos).setY(0).normalize(), -1.8);
  }
  spawnImpact(e.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff6a23, 2);
}

function enemyShoot(e, count = 1) {
  e.attackCd = e.data.cooldown + rand(-0.2, 0.35);
  const origin = e.pos.clone().add(new THREE.Vector3(0, e.data.height * 0.72, 0));
  const baseDir = getCameraPos(tmpV1).clone().sub(origin).normalize();
  audio.enemyFire(origin);
  for (let i = 0; i < count; i++) {
    const dir = baseDir.clone();
    const spread = count > 1 ? (i - (count - 1) / 2) * 0.1 : rand(-0.035, 0.035);
    dir.applyAxisAngle(UP, spread).normalize();
    const mesh = acquireProjectileMesh('fireball', e.type === 'bruiser' ? 0.22 : 0.17);
    if (!mesh) continue;
    mesh.position.copy(origin);
    projectiles.push({ type: 'fireball', owner: 'enemy', pos: origin.clone(), vel: dir.multiplyScalar(e.type === 'bruiser' ? 11 : 13.5), mesh, radius: 0.32, damage: e.data.projectile || 12, life: 3.0, trailColor: 0xff6a20 });
  }
}

function damageEnemy(e, amount, origin, impulse, opts = {}) {
  const damageT0 = perfNowMs();
  if (!e || !e.alive || e.dead || e.inExecution) return;
  if (e.spawnT > 0.1) amount *= 0.7;
  e.hp -= amount;
  e.pain = 1;
  e.alert = 1;
  if (impulse) e.vel.addScaledVector(impulse, 1 / Math.max(45, e.data.hp));
  if ((!warmup.active || warmup.audio) && (clockTime - e.lastHitSound > (opts.source === 'ssg' ? 0.085 : 0.035) || opts.explosive)) {
    perfSpan('audio.hit', () => audio.hit(e.pos, opts.source === 'ssg' || opts.explosive), 1);
    e.lastHitSound = clockTime;
  }

  // V3 could spawn two armor models per shotgun pellet while a hooked enemy was
  // burning: a single SSG blast could activate 20-30 modeled pickups. Gate it
  // per enemy and pay out in small clumps instead.
  if (e.burning > 0 && e.armorDropCd <= 0) {
    const amount = opts.source === 'ssg' ? 3 : Math.random() < 0.55 ? 1 : 0;
    if (amount > 0) perfSpan('spawnArmorShard.hit', () => spawnArmorShard(tmpV1.set(e.pos.x + rand(-0.4, 0.4), e.pos.y + rand(0.6, 1.4), e.pos.z + rand(-0.4, 0.4)).clone(), amount, true), 1);
    e.armorDropCd = opts.source === 'ssg' ? 0.24 : 0.40;
  }

  if (e.hp <= 0) {
    const overkill = -e.hp;
    if (opts.close || opts.explosive || overkill > e.data.hp * 0.22 || e.type === 'husk' && opts.source === 'ssg') perfSpan(`killEnemy.${e.type}`, () => killEnemy(e, opts.explosive ? 'explosive' : 'gib'), 1);
    else staggerEnemy(e);
  } else if (!e.staggered && e.hp < e.data.staggerHp && Math.random() < 0.65) {
    staggerEnemy(e);
  }
  const damageDt = perfNowMs() - damageT0;
  if (damageDt >= 1) perfEvent('damageEnemy.total', `${damageDt.toFixed(1)}ms type=${e.type} hp=${e.hp.toFixed(1)}`);
}

function staggerEnemy(e) {
  if (e.staggered || e.dead) return;
  e.staggered = true;
  e.staggerT = 6.2;
  e.hp = Math.max(1, e.data.staggerHp * 0.45);
  e.vel.multiplyScalar(0.25);
  setStatus('Staggered! Press E up close for Glory Kill.', 1.1);
  spawnRingParticles(e.pos.clone().add(new THREE.Vector3(0, e.data.height * 0.65, 0)), 0x54ff46, 16, 2.5, 0.45);
}

function killEnemy(e, mode = 'gib') {
  const killT0 = perfNowMs();
  if (!e.alive || e.dead) return;
  e.alive = false;
  e.dead = true;
  if (e.mesh) e.mesh.visible = false;
  if (!warmup.active) {
    player.kills++;
    player.score += e.data.score + (mode === 'glory' ? 35 : mode === 'chainsaw' ? 25 : 0);
  }
  if (hook.target === e) cancelHook(0.35);
  const pos = e.pos.clone().add(new THREE.Vector3(0, e.data.height * 0.55, 0));
  const color = mode === 'chainsaw' ? 0xffd45a : mode === 'glory' ? 0x55fff0 : 0xff4b21;
  perfSpan('spawnGibs', () => spawnGibs(pos, e.data.radius, color, mode), 1);
  if ((!warmup.active || warmup.audio) && clockTime - lastGoreSoundAt > 0.055) { perfSpan('audio.gore', () => audio.gore(pos), 1); lastGoreSoundAt = clockTime; }
  if (mode === 'gib' || mode === 'explosive') {
    if (Math.random() < 0.55) perfSpan('spawnHealthBurst', () => spawnHealthBurst(pos, e.data.dropHealth), 1);
    if (e.burning > 0) {
      const armorTotal = e.data.armorOnBurn + 2;
      const bundles = Math.min(3, Math.max(1, Math.ceil(armorTotal / 2)));
      perfSpan('spawnArmorBundles.kill', () => {
        for (let i = 0; i < bundles; i++) spawnArmorShard(tmpV1.set(pos.x + rand(-0.35, 0.35), pos.y + rand(-0.2, 0.45), pos.z + rand(-0.35, 0.35)).clone(), Math.ceil(armorTotal / bundles), true);
      }, 1);
    }
  }
  const killDt = perfNowMs() - killT0;
  if (killDt >= 1) perfEvent('killEnemy.total', `${killDt.toFixed(1)}ms type=${e.type} mode=${mode} pickups=${pickups.length}`);
}

function damagePlayer(amount, sourcePos = null, dot = false) {
  if (!player.alive || execution.active) return;
  const armorUse = Math.min(player.armor, amount * 0.65);
  player.armor -= armorUse;
  const healthDamage = amount - armorUse * 0.72;
  player.health -= healthDamage;
  player.hurtFlash = Math.max(player.hurtFlash, dot ? 0.32 : 0.82);
  player.shake = Math.max(player.shake, dot ? 0.18 : 0.45);
  if (!dot) audio.hurt();
  if (sourcePos) {
    const away = player.pos.clone().sub(sourcePos).setY(0).normalize();
    player.vel.addScaledVector(away, 1.8);
  }
  if (player.health <= 0) {
    player.health = 0;
    player.alive = false;
    cancelHook(0.5);
    dom.overlay.classList.remove('hidden');
    dom.overlay.querySelector('h1').textContent = 'Ripped Apart';
    dom.overlay.querySelector('p').textContent = 'Press R to restart, or click Resume after pressing R.';
    dom.startButton.textContent = 'Resume';
  }
}

function startStage(stageNum) {
  stageState.started = true;
  stageState.endless = stageNum > finiteStages.length;
  stageState.index = stageNum;
  stageState.pending.length = 0;
  stageState.spawnedThisStage = 0;
  stageState.stageKills = 0;
  stageState.killsAtStart = player.kills;
  stageState.spawnTimer = 0.25;
  stageState.betweenTimer = 0;
  stageState.endlessTimer = 1.8;

  if (stageState.endless) {
    stageState.endlessSpawnDelay = 1.65;
    setStatus('ENDLESS HORDE: survive the pressure, keep moving, keep burning.', 3.0);
    audio.stageStart();
    stageReward(true);
    return;
  }

  const stage = finiteStages[stageNum - 1];
  stageState.pending.push(...stage.enemies);
  setStatus(`${stage.name} — ${stage.intro}`, 3.1);
  audio.stageStart();
  stageReward(stageNum > 1);
}

function stageReward(minor = true) {
  const center = new THREE.Vector3(0, 1.25, 0);
  if (minor) {
    spawnPickup('health', center.clone().add(new THREE.Vector3(rand(-1.2, 1.2), 0.5, rand(-1.2, 1.2))), 18, true);
    spawnPickup('ammo', center.clone().add(new THREE.Vector3(rand(-1.2, 1.2), 0.5, rand(-1.2, 1.2))), 26, true);
    spawnPickup('armor', center.clone().add(new THREE.Vector3(rand(-1.2, 1.2), 0.5, rand(-1.2, 1.2))), 14, true);
  }
}

function aliveEnemyCount() {
  return enemies.filter(e => e.alive && !e.dead).length;
}

function spawnDirector(dt) {
  if (!stageState.started || !player.alive) return;

  if (stageState.endless) {
    const alive = aliveEnemyCount();
    const cap = clamp(7 + Math.floor((player.kills - stageState.killsAtStart) / 10), 7, 15);
    stageState.endlessTimer -= dt;
    if (stageState.endlessTimer <= 0 && alive < cap) {
      const difficulty = clamp((player.kills - stageState.killsAtStart) / 42, 0, 1);
      const r = Math.random();
      const type = r < 0.38 - difficulty * 0.10 ? 'husk' : r < 0.68 ? 'imp' : r < 0.88 ? 'revenant' : 'bruiser';
      spawnEnemy(type);
      stageState.spawnedThisStage++;
      stageState.endlessSpawnDelay = clamp(stageState.endlessSpawnDelay * 0.992, 0.85, 1.65);
      stageState.endlessTimer = rand(stageState.endlessSpawnDelay * 0.75, stageState.endlessSpawnDelay * 1.35);
    }
    return;
  }

  const stage = finiteStages[stageState.index - 1];
  stageState.spawnTimer -= dt;
  const alive = aliveEnemyCount();
  if (stageState.pending.length && stageState.spawnTimer <= 0) {
    const openingAllowed = stageState.spawnedThisStage < stage.opening;
    const canAdd = openingAllowed || alive < clamp(4 + Math.floor(stageState.index / 2), 4, 8);
    if (canAdd) {
      const type = stageState.pending.shift();
      spawnEnemy(type);
      stageState.spawnedThisStage++;
      stageState.spawnTimer = openingAllowed ? 0.25 : stage.interval;
    } else {
      stageState.spawnTimer = 0.35;
    }
  }

  stageState.stageKills = player.kills - stageState.killsAtStart;
  if (!stageState.pending.length && alive === 0 && stageState.betweenTimer <= 0) {
    stageState.betweenTimer = 2.75;
    setStatus(`${stage.name} cleared. Breathe. Next stage in 3…`, 2.6);
    audio.stageClear();
    stageReward(true);
    player.health = Math.min(player.maxHealth, player.health + 12);
    player.armor = Math.min(player.maxArmor, player.armor + 10);
  }

  if (stageState.betweenTimer > 0) {
    stageState.betweenTimer -= dt;
    if (stageState.betweenTimer <= 0) startStage(stageState.index + 1);
  }
}

function updatePickups(dt) {
  const pcx = player.pos.x;
  const pcy = player.pos.y + 0.9;
  const pcz = player.pos.z;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt;
    const tx = pcx - p.pos.x, ty = pcy - p.pos.y, tz = pcz - p.pos.z;
    const d = Math.max(0.0001, Math.hypot(tx, ty, tz));
    if (d < 5.2) {
      const pull = dt * (20 / Math.max(1.2, d)) / d;
      p.vel.x += tx * pull; p.vel.y += ty * pull; p.vel.z += tz * pull;
    }
    p.vel.y -= 8 * dt;
    p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.pos.z += p.vel.z * dt;
    if (p.pos.y < 0.25) { p.pos.y = 0.25; p.vel.y = Math.abs(p.vel.y) * 0.35; p.vel.x *= 0.8; p.vel.z *= 0.8; }
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.x += dt * p.spin.x;
    p.mesh.rotation.y += dt * p.spin.y;
    if (d < 0.9) {
      collectPickup(p);
      releasePickupMesh(p.mesh);
      pickups.splice(i, 1);
      continue;
    }
    if (p.life <= 0) {
      releasePickupMesh(p.mesh);
      pickups.splice(i, 1);
    }
  }
}

function createPickupMesh(type) {
  const group = new THREE.Group();
  const add = (geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    m.scale.set(scale[0], scale[1], scale[2]);
    m.castShadow = false;
    m.receiveShadow = false;
    group.add(m);
    return m;
  };

  if (type === 'health') {
    // Fluorescent teal floating med-core with a readable plus silhouette.
    add(sharedGeometries.pickupHalo, materials.health, [0, 0, 0], [Math.PI / 2, 0, 0]);
    add(sharedGeometries.pickupSmallHalo, materials.healthDark, [0, 0, 0], [0.25, 0.4, 0.2]);
    add(sharedGeometries.pickupHealthCore, materials.health, [0, 0, 0], [0, 0, 0], [0.86, 0.86, 0.86]);
    add(sharedGeometries.pickupBar, materials.pickupWhite, [0, 0, 0.02], [Math.PI / 2, 0, 0], [0.78, 1.0, 1.0]);
    add(sharedGeometries.pickupBar, materials.pickupWhite, [0, 0, 0.025], [Math.PI / 2, 0, Math.PI / 2], [0.78, 1.0, 1.0]);
  } else if (type === 'armor') {
    // Deep army-green armor shard: chunkier, plated, less neon than health.
    add(sharedGeometries.pickupHalo, materials.armorDark, [0, 0, 0], [Math.PI / 2, 0, 0], [0.9, 0.9, 0.9]);
    add(sharedGeometries.pickupArmorCore, materials.armor, [0, 0.02, 0], [0.25, 0.35, 0.15], [1.2, 1.2, 1.2]);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      add(sharedGeometries.pickupPlate, materials.armorDark, [Math.cos(a) * 0.22, -0.03, Math.sin(a) * 0.22], [0.18, a, 0.06], [0.82, 0.9, 0.9]);
    }
    add(sharedGeometries.pickupSmallHalo, materials.armor, [0, 0.02, 0], [0.9, 0.2, 0.45], [0.78, 0.78, 0.78]);
  } else {
    // Fiery orange ammo brick with visible shell/bullet cylinders.
    add(sharedGeometries.pickupAmmoBox, materials.ammoDark, [0, 0, 0], [0, 0, 0], [1.1, 1.0, 1.0]);
    add(sharedGeometries.pickupPlate, materials.ammo, [0, 0.18, 0], [0, 0, 0], [1.18, 0.78, 0.92]);
    add(sharedGeometries.pickupPlate, materials.ammo, [0, -0.18, 0], [0, 0, 0], [1.18, 0.78, 0.92]);
    for (let i = -1; i <= 1; i++) {
      add(sharedGeometries.pickupShell, materials.ammo, [i * 0.13, 0.03, 0.23], [Math.PI / 2, 0, 0], [1, 1, 1]);
      add(sharedGeometries.pickupShell, materials.pickupWhite, [i * 0.13, -0.06, -0.23], [Math.PI / 2, 0, 0], [0.85, 0.85, 0.85]);
    }
    add(sharedGeometries.pickupHalo, materials.ammo, [0, 0, 0], [Math.PI / 2, 0, 0], [0.88, 0.88, 0.88]);
  }

  // Pickup meshes rely on emissive materials/halo geometry in V5. Per-pickup
  // point lights were expensive when several dozen resource drops spawned at once.
  return group;
}

let lastPickupSoundAt = 0;
let lastGoreSoundAt = -99;
function spawnPickup(type, pos, amount = 1, burst = true) {
  const pickupT0 = perfNowMs();
  if (pickups.length >= PERF.maxPickups) {
    // Merge into an existing transient pickup instead of creating/activating more scene nodes.
    const existing = pickups.find(q => q.type === type && q.life < 998) || pickups.find(q => q.life < 998);
    if (existing) {
      existing.amount += amount;
      existing.life = Math.max(existing.life, burst ? 8 : existing.life);
      existing.vel.y = Math.max(existing.vel.y, burst ? 3.5 : 0);
      spawnRingParticles(pos, type === 'health' ? 0x43fff2 : type === 'armor' ? 0x6a9e35 : 0xff8b24, 5, 1.8, 0.14);
    }
    return;
  }
  const mesh = acquirePickupMesh(type);
  if (!mesh) return;
  mesh.visible = true;
  mesh.position.copy(pos);
  mesh.rotation.set(0, 0, 0);
  const vel = burst ? new THREE.Vector3(rand(-2.1, 2.1), rand(2.4, 5.4), rand(-2.1, 2.1)) : new THREE.Vector3();
  pickups.push({ type, amount, pos: pos.clone(), vel, mesh, life: burst ? 9 : 999, spin: new THREE.Vector3(rand(-4, 4), rand(-4, 4), rand(-4, 4)) });
  const dt = perfNowMs() - pickupT0;
  if (dt >= 1) perfEvent('spawnPickup', `${dt.toFixed(1)}ms type=${type} pool=${pickupPools[type]?.length ?? 0} active=${pickups.length}`);
}

function collectPickup(p) {
  if (p.type === 'health') player.health = Math.min(player.maxHealth, player.health + p.amount);
  else if (p.type === 'armor') player.armor = Math.min(player.maxArmor, player.armor + p.amount);
  else if (p.type === 'ammo') {
    player.ammo.shells = Math.min(player.ammoMax.shells, player.ammo.shells + Math.ceil(p.amount * 0.22));
    player.ammo.bullets = Math.min(player.ammoMax.bullets, player.ammo.bullets + p.amount);
  }
  if (clockTime - lastPickupSoundAt > 0.045) { audio.pickup(p.type); lastPickupSoundAt = clockTime; }
  const ringColor = p.type === 'health' ? 0x43fff2 : p.type === 'armor' ? 0x6a9e35 : 0xff8b24;
  spawnRingParticles(p.pos, ringColor, 8, 2.2, 0.18);
}

function spawnHealthBurst(pos, count) {
  const n = Math.min(4, Math.max(1, Math.ceil(count / 3)));
  const amount = Math.max(6, Math.ceil((count * 6) / n));
  for (let i = 0; i < n; i++) spawnPickup('health', tmpV1.set(pos.x + rand(-0.55, 0.55), pos.y + rand(0, 0.5), pos.z + rand(-0.55, 0.55)).clone(), amount, true);
}
function spawnAmmoBurst(pos, count) {
  const n = Math.min(5, Math.max(2, Math.ceil(count / 3)));
  const amount = Math.max(10, Math.ceil((count * 9) / n));
  for (let i = 0; i < n; i++) spawnPickup('ammo', tmpV1.set(pos.x + rand(-0.55, 0.55), pos.y + rand(0, 0.5), pos.z + rand(-0.55, 0.55)).clone(), amount, true);
}
function spawnArmorShard(pos, amount = 1, burst = true) { spawnPickup('armor', pos, amount, burst); }

function spawnParticle(pos, vel, color, life, size, emissive = false) {
  if (!particleFX) return;
  particleFX.emit(pos, vel, color, life, size, emissive);
}

function spawnParticleXYZ(x, y, z, vx, vy, vz, color, life, size, emissive = false) {
  if (!particleFX) return;
  particleFX.emitXYZ(x, y, z, vx, vy, vz, color, life, size, emissive);
}

function updateParticles(dt) {
  if (particleFX) particleFX.update(dt);
  if (tracerFX) tracerFX.update(dt);
  if (decalFX) decalFX.update(dt);
  if (lightFX) lightFX.update(dt);

  // Legacy arrays are kept only for compatibility with older code paths. In V5
  // the hot paths use fixed GPU buffers/pools, so these normally stay empty.
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      if (p.ownGeometry && p.mesh.geometry) p.mesh.geometry.dispose();
      if (p.ownMaterial && p.mesh.material) p.mesh.material.dispose();
      particles.splice(i, 1);
    }
  }
}

function spawnExplosion(pos, color) {
  const count = 12;
  for (let i = 0; i < count; i++) {
    let x = rand(-1, 1), y = rand(-0.2, 1.2), z = rand(-1, 1);
    const inv = 1 / Math.max(0.001, Math.hypot(x, y, z));
    const speed = rand(3, 10);
    spawnParticleXYZ(pos.x, pos.y, pos.z, x * inv * speed, y * inv * speed, z * inv * speed, color, rand(0.25, 0.6), rand(0.07, 0.17), true);
  }
  flashLight(pos, color, 2.2, 0.13, 8);
}

function flashLight(pos, color, intensity, life, distance = 7) {
  if (lightFX) lightFX.flash(pos, color, intensity, life, distance);
}

function spawnGibs(pos, radius, color, mode) {
  const count = mode === 'chainsaw' ? 16 : mode === 'glory' ? 14 : 10;
  for (let i = 0; i < count; i++) {
    spawnParticleXYZ(
      pos.x + rand(-radius, radius), pos.y + rand(-0.4, 0.5), pos.z + rand(-radius, radius),
      rand(-4, 4), rand(1, 7), rand(-4, 4),
      color, rand(0.36, 0.95), rand(0.06, 0.16), false
    );
  }
  // A second glow pass keeps kills juicy without needing physical mesh gibs.
  for (let i = 0; i < 5; i++) {
    spawnParticleXYZ(pos.x, pos.y, pos.z, rand(-2.6, 2.6), rand(0.6, 4.4), rand(-2.6, 2.6), color, rand(0.16, 0.36), rand(0.08, 0.17), true);
  }
  addBloodDecal(pos);
  flashLight(pos, 0xff3719, 1.25, 0.10, 5.5);
}

function addBloodDecal(pos) {
  if (decalFX) decalFX.add(pos);
}

function spawnRingParticles(pos, color, count, speed, life) {
  count = Math.min(count, 22);
  for (let i = 0; i < count; i++) {
    const a = i / count * TAU;
    let vx = Math.cos(a), vy = rand(0.1, 0.55), vz = Math.sin(a);
    const inv = 1 / Math.max(0.001, Math.hypot(vx, vy, vz));
    const sp = speed * rand(0.65, 1.2);
    spawnParticleXYZ(pos.x, pos.y, pos.z, vx * inv * sp, vy * inv * sp, vz * inv * sp, color, life * rand(0.7, 1.2), rand(0.04, 0.11), true);
  }
}

function spawnDust(pos, color, count) {
  count = Math.min(count, 12);
  for (let i = 0; i < count; i++) {
    spawnParticleXYZ(pos.x + rand(-0.4, 0.4), pos.y + 0.1, pos.z + rand(-0.4, 0.4), rand(-1.5, 1.5), rand(0.4, 1.6), rand(-1.5, 1.5), color, rand(0.25, 0.5), rand(0.04, 0.09), false);
  }
}

function spawnDashTrail(pos, dir) {
  const rightX = -dir.z, rightZ = dir.x;
  for (let i = 0; i < 16; i++) {
    const side = rand(-0.6, 0.6);
    spawnParticleXYZ(
      pos.x + rightX * side,
      pos.y + rand(-0.55, 0.2),
      pos.z + rightZ * side,
      dir.x * rand(-8, -2) + rand(-1, 1),
      rand(-0.5, 0.7),
      dir.z * rand(-8, -2) + rand(-1, 1),
      0x8ee7ff, rand(0.18, 0.36), rand(0.03, 0.075), true
    );
  }
}

function updateWorld(dt, realDt) {
  if (lavaMaterial) lavaMaterial.uniforms.time.value = clockTime;
  for (const d of world.decorations) {
    if (d.shader && d.shader.uniforms.time) d.shader.uniforms.time.value = clockTime;
    if (d.spin) d.mesh.rotation.y += d.spin * dt;
    if (d.bob !== undefined) d.mesh.position.y += Math.sin(clockTime * 2.0 + d.bob) * 0.002;
  }
  for (const m of world.movers) {
    const box = m.box;
    const floor = m.floor;
    const oldTop = box.max.y;
    const oldX = m.mesh.position.x;
    const oldZ = m.mesh.position.z;
    const wave = Math.sin(clockTime * m.speed + m.phase) * m.amp;
    let nx = m.base.x, ntop = m.base.y, nz = m.base.z;
    if (m.axis === 'x') nx += wave;
    else if (m.axis === 'z') nz += wave;
    else ntop += wave;
    const dx = nx - oldX;
    const dz = nz - oldZ;
    const dy = ntop - oldTop;
    const onTop = player.grounded && player.pos.y >= oldTop - 0.07 && player.pos.y <= oldTop + 0.09 && player.pos.x > box.min.x - player.radius && player.pos.x < box.max.x + player.radius && player.pos.z > box.min.z - player.radius && player.pos.z < box.max.z + player.radius;
    m.mesh.position.set(nx, ntop - m.h / 2, nz);
    box.min.x += dx; box.max.x += dx; box.min.z += dz; box.max.z += dz;
    box.max.y = ntop; box.min.y = ntop - m.h;
    if (floor) { floor.minX = box.min.x; floor.maxX = box.max.x; floor.minZ = box.min.z; floor.maxZ = box.max.z; floor.top = ntop; }
    if (onTop) {
      player.pos.x += dx;
      player.pos.z += dz;
      player.pos.y += dy;
    }
    m.prevTop = ntop;
  }
  for (const pad of world.jumpPads) {
    pad.ring.rotation.z += dt * 2.4;
    pad.group.scale.setScalar(1 + Math.sin(clockTime * 4 + pad.pos.x) * 0.025);
  }
  for (const node of world.hookNodes) {
    node.group.rotation.y += dt * 1.1;
    node.group.rotation.x += dt * 0.34;
    const locked = hook.locked && hook.locked.target === node;
    node.group.scale.setScalar(locked ? 1.22 + Math.sin(clockTime * 18) * 0.05 : 1 + Math.sin(clockTime * 2 + node.pos.x) * 0.04);
  }
}

function updateHUD(dt = 0.016) {
  hudRefreshTimer -= dt;
  const doText = hudRefreshTimer <= 0;
  if (doText) {
    hudRefreshTimer = 0.075;
    dom.health.textContent = Math.ceil(player.health);
    dom.armor.textContent = Math.ceil(player.armor);
    dom.shells.textContent = player.ammo.shells;
    dom.bullets.textContent = player.ammo.bullets;
    dom.weapon.textContent = weapons[player.weapon].name;
    dom.dash.textContent = '◆'.repeat(player.dashCharges) + '◇'.repeat(player.dashMax - player.dashCharges);
    if (dom.jump) dom.jump.textContent = player.grounded ? '2/2' : `${Math.max(0, 2 - player.jumpsUsed)}/2`;
    dom.fuel.textContent = '▰'.repeat(Math.floor(player.chainsawFuel)) + '▱'.repeat(Math.max(0, player.chainsawMax - Math.floor(player.chainsawFuel)));
    if (dom.glory) dom.glory.textContent = '✚'.repeat(player.gloryCharges) + '·'.repeat(player.gloryMax - player.gloryCharges);
    dom.flame.textContent = player.flameCd <= 0 ? 'READY' : `${player.flameCd.toFixed(1)}s`;
    if (dom.stage) dom.stage.textContent = stageState.endless ? `HORDE ${aliveEnemyCount()}` : `${stageState.index || 1}/10`;
    dom.score.textContent = `${player.score} / ${player.kills}`;
    dom.ammo.textContent = player.weapon === 0 ? `${player.ammo.shells} shells` : `${player.ammo.bullets} bullets`;
  }
  const locked = hook.locked;
  dom.crosshair.classList.toggle('locked', !!locked);
  dom.crosshair.classList.toggle('node', !!locked && locked.kind === 'node');
  dom.crosshair.classList.toggle('stagger', !!locked && locked.kind === 'enemy' && locked.target.staggered);
  dom.lockHint.textContent = locked ? (locked.kind === 'node' ? 'MEATHOOK NODE' : locked.target.staggered ? 'STAGGER: E' : 'HOOK LOCK') : '';
  if (player.hurtFlash > 0) damageOverlay.style.opacity = clamp(player.hurtFlash, 0, 0.78).toFixed(3);
  else damageOverlay.style.opacity = '0';
  vignetteOverlay.style.opacity = (0.35 + clamp(player.vel.length() / 32, 0, 0.28) + (hook.active ? 0.18 : 0)).toFixed(3);
  updateMiniMap(dt);
}

let statusTimer = 0;
function setStatus(text, time = 1) {
  dom.status.textContent = text;
  statusTimer = time;
}

function updateMiniMap(dt = 0.016) {
  if (!dom.minimap || dom.minimap.classList.contains('hidden')) return;
  miniMapRefreshTimer -= dt;
  if (miniMapRefreshTimer > 0) return;
  miniMapRefreshTimer = 0.10;
  const c = dom.minimap;
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,120,40,.5)'; ctx.strokeRect(4, 4, w - 8, h - 8);
  const sx = x => (x / world.mapScale + 0.5) * w;
  const sz = z => (z / world.mapScale + 0.5) * h;
  for (const e of enemies) {
    if (!e.alive || e.dead) continue;
    ctx.fillStyle = e.staggered ? '#69ff53' : e.type === 'bruiser' ? '#ff3a20' : e.type === 'revenant' ? '#70dfff' : '#ffa04c';
    ctx.beginPath(); ctx.arc(sx(e.pos.x), sz(e.pos.z), e.type === 'bruiser' ? 4 : 3, 0, TAU); ctx.fill();
  }
  for (const n of world.hookNodes) { ctx.fillStyle = '#a46cff'; ctx.fillRect(sx(n.pos.x) - 2, sz(n.pos.z) - 2, 4, 4); }
  ctx.fillStyle = '#70e8ff'; ctx.beginPath(); ctx.arc(sx(player.pos.x), sz(player.pos.z), 4, 0, TAU); ctx.fill();
  const f = getForward(); ctx.strokeStyle = '#70e8ff'; ctx.beginPath(); ctx.moveTo(sx(player.pos.x), sz(player.pos.z)); ctx.lineTo(sx(player.pos.x + f.x * 3), sz(player.pos.z + f.z * 3)); ctx.stroke();
}

function render(dt) {
  const renderT0 = perfNowMs();
  updateCameraTransform();
  if (composer && PERF.postprocess) composer.render();
  else renderer.render(scene, camera);
  const renderDt = perfNowMs() - renderT0;
  if (renderDt > 16) perfEvent('render', `${renderDt.toFixed(1)}ms firefox=${browserInfo.firefox} calls=${renderer.info?.render?.calls ?? '?'} tris=${renderer.info?.render?.triangles ?? '?'}`);
  if (statusTimer > 0) {
    statusTimer -= dt;
    if (statusTimer <= 0) dom.status.textContent = defaultStatus();
  }
}

function defaultStatus() {
  if (!player.alive) return 'Press R to restart.';
  if (stageState.endless) return 'Endless Horde — survive, route through vertical space, keep demons burning.';
  if (stageState.betweenTimer > 0) return 'Stage clear. Refill, breathe, get height.';
  if (hook.active) return 'Hook active — strafe to slingshot, release RMB to fling.';
  if (player.weapon === 0) return `Stage ${stageState.index || 1}: SSG boom + RMB Meat Hook. Burn/hook demons for armor.`;
  return `Stage ${stageState.index || 1}: Autorifle full-auto + RMB micro missiles. Chainsaw for ammo.`;
}

main();
