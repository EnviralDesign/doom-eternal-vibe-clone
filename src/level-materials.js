import * as THREE from 'three';
import { createDefaultLevelMaterial } from './level-runtime.js';

function anisotropyFor(renderer) {
  return Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
}

export function makeCanvasTexture(renderer, draw, size = 256, repeatX = 1, repeatY = 1, color = true) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropyFor(renderer);
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

async function loadGameTexture(renderer, path, repeatX, repeatY, color = true) {
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
  tex.anisotropy = anisotropyFor(renderer);
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

async function loadPbrTextureSet(renderer, basePath, slug, repeatX = 1, repeatY = 1, options = {}) {
  const prefix = `${basePath}/${slug}`;
  const result = {};
  const loadOptional = async (key, suffix, color = false) => {
    try {
      result[key] = await loadGameTexture(renderer, `${prefix}_${suffix}.png`, repeatX, repeatY, color);
    } catch (err) {
      console.warn(`PBR texture missing: ${prefix}_${suffix}.png`, err);
    }
  };
  await Promise.all([
    loadOptional('map', 'basecolor', true),
    loadOptional('normalMap', 'normal', false),
    loadOptional('roughnessMap', 'roughness', false),
    loadOptional('metalnessMap', 'metalness', false)
  ]);
  result.roughness = result.roughnessMap ? 1 : options.roughness ?? 0.72;
  result.metalness = result.metalnessMap ? 1 : options.metalness ?? 0.0;
  result.envMapIntensity = options.envMapIntensity;
  return result;
}

function createProceduralLevelTextures(renderer) {
  const textures = {};
  textures.floor = makeCanvasTexture(renderer, (ctx, s) => {
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

  textures.wall = makeCanvasTexture(renderer, (ctx, s) => {
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

  textures.metal = makeCanvasTexture(renderer, (ctx, s) => {
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

  textures.normalRough = makeCanvasTexture(renderer, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const nx = Math.sin(x * 0.16) * 0.5 + Math.sin((x + y) * 0.07) * 0.35 + (Math.random() - 0.5) * 0.3;
        const ny = Math.cos(y * 0.14) * 0.5 + Math.cos((x - y) * 0.05) * 0.35 + (Math.random() - 0.5) * 0.3;
        const i = (y * s + x) * 4;
        img.data[i] = THREE.MathUtils.clamp(128 + nx * 65, 0, 255);
        img.data[i + 1] = THREE.MathUtils.clamp(128 + ny * 65, 0, 255);
        img.data[i + 2] = 228;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, 256, 5, 5, false);
  return textures;
}

export function createLavaMaterial() {
  return new THREE.ShaderMaterial({
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

export async function createLevelMaterialLibrary({ renderer, loadTextures = true } = {}) {
  const textures = createProceduralLevelTextures(renderer);
  if (loadTextures) {
    try {
      const [floorSet, wallSet, metalSet, runeSet, catwalkSet] = await Promise.all([
        loadPbrTextureSet(renderer, './assets/textures/hell-floor/source', 'hell-floor', 8, 8, { roughness: 0.86, metalness: 0.02, envMapIntensity: 0.35 }),
        loadPbrTextureSet(renderer, './assets/textures/hell-wall/source', 'hell-wall', 3, 2, { roughness: 0.88, metalness: 0.015, envMapIntensity: 0.25 }),
        loadPbrTextureSet(renderer, './assets/textures/hell-metal/source', 'hell-metal', 4, 4, { roughness: 0.58, metalness: 0.28, envMapIntensity: 0.55 }),
        loadPbrTextureSet(renderer, './assets/textures/hell-rune/source', 'hell-rune', 4, 4, { roughness: 0.62, metalness: 0.18, envMapIntensity: 0.48 }),
        loadPbrTextureSet(renderer, './assets/textures/argent-catwalk/source', 'argent-catwalk', 3, 3, { roughness: 0.62, metalness: 0.65, envMapIntensity: 0.68 })
      ]);
      Object.assign(textures, {
        floorSet,
        wallSet,
        metalSet,
        runeSet,
        catwalkSet,
        floor: floorSet.map || textures.floor,
        wall: wallSet.map || textures.wall,
        metal: metalSet.map || textures.metal,
        rune: runeSet.map || textures.rune
      });
    } catch (err) {
      console.warn('Level PBR image textures unavailable; using procedural fallback.', err);
    }
  }

  const materials = {};
  materials.floor = new THREE.MeshStandardMaterial({
    map: textures.floorSet?.map || textures.floor,
    normalMap: textures.floorSet?.normalMap || textures.normalRough,
    roughnessMap: textures.floorSet?.roughnessMap,
    metalnessMap: textures.floorSet?.metalnessMap,
    normalScale: new THREE.Vector2(0.32, 0.32),
    roughness: textures.floorSet?.roughness ?? 0.86,
    metalness: textures.floorSet?.metalness ?? 0.02,
    envMapIntensity: 0.35, color: 0xfff1dc
  });
  materials.wall = new THREE.MeshStandardMaterial({
    map: textures.wallSet?.map || textures.wall,
    normalMap: textures.wallSet?.normalMap || textures.normalRough,
    roughnessMap: textures.wallSet?.roughnessMap,
    metalnessMap: textures.wallSet?.metalnessMap,
    normalScale: new THREE.Vector2(0.18, 0.18),
    roughness: textures.wallSet?.roughness ?? 0.88,
    metalness: textures.wallSet?.metalness ?? 0.015,
    color: 0xffe7d2, envMapIntensity: 0.25
  });
  materials.metal = new THREE.MeshStandardMaterial({
    map: textures.metalSet?.map || textures.metal,
    normalMap: textures.metalSet?.normalMap || textures.normalRough,
    roughnessMap: textures.metalSet?.roughnessMap,
    metalnessMap: textures.metalSet?.metalnessMap,
    normalScale: new THREE.Vector2(0.26, 0.26),
    roughness: textures.metalSet?.roughness ?? 0.58,
    metalness: textures.metalSet?.metalness ?? 0.28,
    color: 0xd2d5ce, envMapIntensity: 0.55
  });
  materials.darkMetal = new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.72, metalness: 0.18, envMapIntensity: 0.45 });
  materials.redMetal = new THREE.MeshStandardMaterial({ color: 0x7a2d25, emissive: 0x180300, emissiveIntensity: 0.08, roughness: 0.74, metalness: 0.12, envMapIntensity: 0.35 });
  materials.obsidian = new THREE.MeshStandardMaterial({ color: 0x17131a, emissive: 0x0c0206, emissiveIntensity: 0.06, roughness: 0.82, metalness: 0.04, normalMap: textures.normalRough, normalScale: new THREE.Vector2(0.22, 0.22), envMapIntensity: 0.28 });
  materials.runeMetal = new THREE.MeshStandardMaterial({
    map: textures.runeSet?.map || textures.rune || textures.metal,
    normalMap: textures.runeSet?.normalMap || textures.normalRough,
    roughnessMap: textures.runeSet?.roughnessMap,
    metalnessMap: textures.runeSet?.metalnessMap,
    color: 0xd1f2ff, emissive: 0x042236, emissiveIntensity: 0.16,
    roughness: textures.runeSet?.roughness ?? 0.62,
    metalness: textures.runeSet?.metalness ?? 0.18,
    normalScale: new THREE.Vector2(0.18, 0.18), envMapIntensity: 0.48
  });
  materials.catwalk = new THREE.MeshStandardMaterial({
    map: textures.catwalkSet?.map || textures.runeSet?.map || textures.rune || textures.metal,
    normalMap: textures.catwalkSet?.normalMap || textures.runeSet?.normalMap || textures.normalRough,
    roughnessMap: textures.catwalkSet?.roughnessMap,
    metalnessMap: textures.catwalkSet?.metalnessMap,
    color: 0xe7f7ff,
    emissive: 0x021b24,
    emissiveIntensity: 0.08,
    roughness: textures.catwalkSet?.roughness ?? 0.62,
    metalness: textures.catwalkSet?.metalness ?? 0.65,
    normalScale: new THREE.Vector2(0.16, 0.16),
    envMapIntensity: 0.68
  });
  materials.bone = new THREE.MeshStandardMaterial({ color: 0xd1b287, roughness: 0.64, metalness: 0.03, normalMap: textures.normalRough, normalScale: new THREE.Vector2(0.1, 0.1) });
  materials.enemyArmor = new THREE.MeshStandardMaterial({ color: 0x1a1b20, emissive: 0x210407, emissiveIntensity: 0.2, roughness: 0.36, metalness: 0.75 });
  materials.orangeGlow = new THREE.MeshStandardMaterial({ color: 0xff7430, emissive: 0xff4a10, emissiveIntensity: 1.15, roughness: 0.35 });
  materials.blueGlow = new THREE.MeshStandardMaterial({ color: 0x8ee7ff, emissive: 0x23bdff, emissiveIntensity: 1.35, roughness: 0.18 });
  materials.greenGlow = new THREE.MeshStandardMaterial({ color: 0x8cff5e, emissive: 0x38ff20, emissiveIntensity: 1.55, roughness: 0.2 });
  materials.purpleGlow = new THREE.MeshStandardMaterial({ color: 0xd096ff, emissive: 0x9e3dff, emissiveIntensity: 1.2, roughness: 0.18 });
  materials.blood = new THREE.MeshBasicMaterial({ color: 0x5d0702, transparent: true, opacity: 0.7, depthWrite: false });
  materials.runeGlass = new THREE.MeshStandardMaterial({ color: 0x13232b, emissive: 0x0b8fc8, emissiveIntensity: 0.85, roughness: 0.22, metalness: 0.38, transparent: true, opacity: 0.72, depthWrite: false });
  materials.default = createDefaultLevelMaterial();
  materials.health = new THREE.MeshStandardMaterial({ color: 0x43fff2, emissive: 0x18d7ff, emissiveIntensity: 1.15, roughness: 0.18, metalness: 0.08 });
  materials.healthDark = new THREE.MeshStandardMaterial({ color: 0x073942, emissive: 0x0c8fa0, emissiveIntensity: 0.55, roughness: 0.34, metalness: 0.18 });
  materials.armor = new THREE.MeshStandardMaterial({ color: 0x4d6f2f, emissive: 0x315f18, emissiveIntensity: 0.75, roughness: 0.36, metalness: 0.36 });
  materials.armorDark = new THREE.MeshStandardMaterial({ color: 0x1d2e16, roughness: 0.52, metalness: 0.42 });
  materials.ammo = new THREE.MeshStandardMaterial({ color: 0xff8b24, emissive: 0xff5e00, emissiveIntensity: 1.0, roughness: 0.28, metalness: 0.42 });
  materials.ammoDark = new THREE.MeshStandardMaterial({ color: 0x3b1a09, emissive: 0x522000, emissiveIntensity: 0.25, roughness: 0.52, metalness: 0.35 });
  materials.pickupWhite = new THREE.MeshStandardMaterial({ color: 0xfaffd6, emissive: 0xb6ffca, emissiveIntensity: 0.45, roughness: 0.24, metalness: 0.14 });
  materials.lava = createLavaMaterial();

  return { textures, materials, lavaMaterial: materials.lava };
}
