import * as THREE from 'three';
import { assetCollisionConfig, cloneEnvironmentPrefab } from './environment-runtime.js';

const DEFAULT_COLLISION_SIZE = [1, 1, 1];

function asArray3(value, fallback = [0, 0, 0]) {
  return Array.isArray(value) ? [
    Number(value[0] || 0),
    Number(value[1] || 0),
    Number(value[2] || 0)
  ] : [...fallback];
}

export function createEnvironmentInstanceFromLegacy(section, item, index) {
  if (!item || typeof item !== 'object') return null;
  if (section === 'runtimeSlabs') {
    const h = item.options?.thickness ?? item.h ?? 0.34;
    return {
      asset: item.asset,
      name: item.name || `${item.asset || 'runtime-slab'}-${index + 1}`,
      position: [item.cx || 0, item.topY || 0, item.cz || 0],
      rotation: [0, item.options?.rotationY || 0, 0],
      scale: [1, 1, 1],
      collisionKind: 'slab',
      material: item.material || 'catwalk'
    };
  }
  if (section === 'runtimeBoxes') {
    return {
      asset: item.asset,
      name: item.name || `${item.asset || 'runtime-box'}-${index + 1}`,
      position: [item.cx || 0, item.topY || 0, item.cz || 0],
      rotation: [0, item.options?.rotationY || 0, 0],
      scale: [1, 1, 1],
      collisionKind: 'box',
      material: item.material || 'wall'
    };
  }
  if (section === 'floatingPlatforms') {
    const instanceScale = item.options?.scale ?? 1;
    return {
      asset: 'floating-hell-platform',
      name: item.name || `floating-platform-${index + 1}`,
      position: [item.x || 0, item.topY || 0, item.z || 0],
      rotation: [0, item.options?.rotationY || 0, 0],
      scale: [instanceScale, instanceScale, instanceScale],
      collisionKind: 'slab',
      material: item.material || 'obsidian'
    };
  }
  if (section === 'movingPlatforms' && item.options?.prefab) {
    const h = item.options?.thickness ?? item.h ?? 0.34;
    return {
      asset: item.options.prefab,
      name: item.name || `moving-platform-${index + 1}`,
      position: [item.cx || 0, item.topY || 0, item.cz || 0],
      rotation: [0, item.options?.rotationY || 0, 0],
      scale: [1, 1, 1],
      collisionKind: 'slab',
      material: item.material || 'metal',
      moving: {
        axis: item.options.axis || 'y',
        amp: item.options.amp ?? 2,
        speed: item.options.speed ?? 0.45,
        phase: item.options.phase ?? 0
      }
    };
  }
  return null;
}

export function collectEnvironmentInstances(level = {}, { includeLegacy = true } = {}) {
  const explicit = Array.isArray(level.environmentInstances) ? level.environmentInstances : [];
  if (!includeLegacy || explicit.length) return explicit;
  const out = [];
  for (const section of ['runtimeSlabs', 'runtimeBoxes', 'floatingPlatforms', 'movingPlatforms']) {
    const items = level[section] || [];
    items.forEach((item, index) => {
      const converted = createEnvironmentInstanceFromLegacy(section, item, index);
      if (converted?.asset) out.push(converted);
    });
  }
  return out;
}

export function createLevelInstanceFromLegacy(section, item, index, subIndex = 0) {
  if (!item || typeof item !== 'object') return null;

  if (section === 'floorPlates') {
    return {
      kind: 'geometry',
      geometry: 'box',
      name: item.name || `floor-plate-${index + 1}`,
      position: [item.cx || 0, item.topY ?? 0, item.cz || 0],
      rotation: [0, item.options?.rotationY || 0, 0],
      scale: [1, 1, 1],
      collisionKind: 'floor',
      collisionSize: [item.sx || 8, item.h ?? item.options?.thickness ?? 0.25, item.sz || 8],
      material: item.material || 'floor',
      options: { ...(item.options || {}), collide: item.options?.collide ?? false, walk: item.options?.walk ?? true }
    };
  }

  if (section === 'blocks') {
    return {
      kind: 'geometry',
      geometry: 'box',
      name: item.name || `block-${index + 1}`,
      position: [item.cx || 0, item.topY || 1, item.cz || 0],
      rotation: [0, item.options?.rotationY || 0, 0],
      scale: [1, 1, 1],
      collisionKind: 'box',
      collisionSize: [item.sx || 1, item.h || 1, item.sz || 1],
      material: item.material || 'wall',
      options: { ...(item.options || {}) }
    };
  }

  if (section === 'slabs') {
    return {
      kind: 'geometry',
      geometry: 'box',
      name: item.name || `slab-${index + 1}`,
      position: [item.cx || 0, item.topY || 1, item.cz || 0],
      rotation: [0, item.options?.rotationY || 0, 0],
      scale: [1, 1, 1],
      collisionKind: 'slab',
      collisionSize: [item.sx || 4, item.h ?? item.options?.thickness ?? 0.34, item.sz || 4],
      material: item.material || 'floor',
      options: { ...(item.options || {}) }
    };
  }

  if (section === 'lavaStrips') {
    return {
      kind: 'volume',
      geometry: 'box',
      name: item.name || `lava-strip-${index + 1}`,
      position: [item.cx || 0, item.y ?? 0.045, item.cz || 0],
      rotation: [0, item.options?.rotationY || 0, 0],
      scale: [1, 1, 1],
      collisionKind: 'lava',
      collisionSize: [item.sx || 8, item.h ?? 0.08, item.sz || 3],
      material: item.material || 'lava',
      visualY: item.visualY,
      visualHeight: item.visualHeight,
      gameplay: { damage: 'lava' },
      options: { ...(item.options || {}), collide: false, walk: false }
    };
  }

  if (section === 'stairRuns') {
    const top = (item.topStart || 0.4) + subIndex * (item.topStep || 0.4);
    return {
      kind: 'geometry',
      geometry: 'box',
      name: `${item.name || 'stair'}-${subIndex}`,
      position: [
        (item.cxStart || 0) + subIndex * (item.cxStep || 0),
        top,
        (item.czStart || 0) + subIndex * (item.czStep || 0)
      ],
      rotation: [0, item.options?.rotationY || 0, 0],
      scale: [1, 1, 1],
      collisionKind: 'box',
      collisionSize: [item.sx || 1, top, item.sz || 1],
      material: item.material || 'darkMetal',
      options: { step: true, edgeOpacity: 0.13, ...(item.options || {}) }
    };
  }

  if (section === 'glassPanels') {
    return {
      kind: 'geometry',
      geometry: 'box',
      name: item.name || `rune-glass-${index + 1}`,
      position: [item.cx || 0, item.topY || 4, item.cz || 0],
      rotation: [0, item.rotationY || 0, 0],
      scale: [1, 1, 1],
      collisionKind: 'visual',
      collisionSize: [item.sx || 8, item.sz || 3, item.thickness ?? 0.12],
      material: item.material || 'runeGlass',
      options: { collide: false, walk: false, ...(item.options || {}) }
    };
  }

  const environment = createEnvironmentInstanceFromLegacy(section, item, index);
  return environment ? { kind: 'environment', ...environment } : null;
}

export function collectLevelInstances(level = {}, { includeLegacy = true } = {}) {
  const explicit = Array.isArray(level.instances) ? level.instances : [];
  if (explicit.length || !includeLegacy) return explicit;

  const out = [];
  for (const section of ['floorPlates', 'blocks', 'lavaStrips', 'slabs']) {
    const items = level[section] || [];
    items.forEach((item, index) => {
      const converted = createLevelInstanceFromLegacy(section, item, index);
      if (converted) out.push(converted);
    });
  }

  const environmentExplicit = collectEnvironmentInstances(level, { includeLegacy: false });
  if (environmentExplicit.length) {
    environmentExplicit.forEach((item) => out.push({ kind: 'environment', ...item }));
  } else {
    for (const section of ['runtimeSlabs', 'runtimeBoxes', 'floatingPlatforms', 'movingPlatforms']) {
      const items = level[section] || [];
      items.forEach((item, index) => {
        const converted = createLevelInstanceFromLegacy(section, item, index);
        if (converted?.asset) out.push(converted);
      });
    }
  }

  for (const item of level.stairRuns || []) {
    const count = item.count || 0;
    for (let i = 0; i < count; i++) {
      const converted = createLevelInstanceFromLegacy('stairRuns', item, out.length, i);
      if (converted) out.push(converted);
    }
  }

  for (const section of ['glassPanels']) {
    const items = level[section] || [];
    items.forEach((item, index) => {
      const converted = createLevelInstanceFromLegacy(section, item, index);
      if (converted) out.push(converted);
    });
  }

  return out;
}

export function instanceCollisionSize(instance, asset = null) {
  const fallback = asset ? assetCollisionConfig(asset).size || DEFAULT_COLLISION_SIZE : DEFAULT_COLLISION_SIZE;
  if (asset) return asArray3(fallback, DEFAULT_COLLISION_SIZE);
  return asArray3(instance.collisionSize, fallback);
}

export function instanceScale(instance) {
  const value = instance.scale;
  if (Array.isArray(value)) return asArray3(value, [1, 1, 1]);
  const scalar = Number(value ?? 1);
  return [scalar, scalar, scalar];
}

export function instanceTransformMatrix(instance) {
  const position = asArray3(instance.position, [0, 0, 0]);
  const rotation = asArray3(instance.rotation, [0, instance.rotationY || 0, 0]);
  const scale = instanceScale(instance);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(position[0], position[1], position[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2])),
    new THREE.Vector3(scale[0], scale[1], scale[2])
  );
}

export function visualLocalMatrixForInstance(instance, asset) {
  const collision = assetCollisionConfig(asset);
  const visual = collision.visual || {};
  const visualPos = visual.position || [visual.x ?? 0, visual.y ?? 0, visual.z ?? 0];
  const visualRot = visual.rotation || [visual.rotationX ?? 0, visual.rotationY ?? 0, visual.rotationZ ?? 0];
  const visualScale = visual.scale ?? 1;
  const position = new THREE.Vector3(
    visualPos[0] || 0,
    -collision.localTop + (visualPos[1] || 0),
    visualPos[2] || 0
  );
  const rotation = new THREE.Euler(0, 0, 0);
  const scale = new THREE.Vector3(1, 1, 1);

  rotation.set(visualRot[0] || 0, visualRot[1] || 0, visualRot[2] || 0);
  scale.setScalar(visualScale);

  return new THREE.Matrix4().compose(
    position,
    new THREE.Quaternion().setFromEuler(rotation),
    scale
  );
}

function sourceMeshesForAsset(asset) {
  const meshes = [];
  if (!asset?.scene) return meshes;
  asset.scene.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(asset.scene.matrixWorld).invert();
  const localMatrix = new THREE.Matrix4();
  asset.scene.traverse((child) => {
    if (!child.isMesh || !child.geometry || !child.material) return;
    localMatrix.multiplyMatrices(rootInverse, child.matrixWorld);
    meshes.push({
      geometry: child.geometry,
      material: child.material,
      matrix: localMatrix.clone(),
      castShadow: child.castShadow,
      receiveShadow: child.receiveShadow,
      name: child.name || 'mesh'
    });
  });
  return meshes;
}

export function createInstancedEnvironmentVisuals(instances, assets, {
  mode = 'full',
  includeMoving = false
} = {}) {
  const root = new THREE.Group();
  root.name = 'environment-instanced-visuals';
  const visible = mode === 'full' || mode === 'both';
  if (!visible) {
    return { root, refresh() {}, updateInstance() {}, instancedMeshes: [] };
  }

  const byAsset = new Map();
  instances.forEach((instance, index) => {
    if (!includeMoving && instance.moving) return;
    const asset = assets?.[instance.asset];
    if (!asset?.scene) return;
    if (!byAsset.has(instance.asset)) byAsset.set(instance.asset, []);
    byAsset.get(instance.asset).push({ instance, index, asset });
  });

  const records = [];
  const tmp = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const world = new THREE.Matrix4();

  for (const [assetId, items] of byAsset) {
    const asset = items[0].asset;
    for (const source of sourceMeshesForAsset(asset)) {
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, items.length);
      mesh.name = `${assetId}-${source.name}-instances`;
      mesh.frustumCulled = false;
      mesh.castShadow = source.castShadow;
      mesh.receiveShadow = source.receiveShadow;
      mesh.userData.assetId = assetId;
      mesh.userData.environmentInstanceSlots = items.map(item => item.index);
      root.add(mesh);
      records.push({ mesh, source, items });
    }
  }

  function refresh() {
    for (const record of records) {
      record.items.forEach(({ instance, asset }, slot) => {
        tmp.copy(instanceTransformMatrix(instance));
        local.copy(visualLocalMatrixForInstance(instance, asset));
        world.multiplyMatrices(tmp, local).multiply(record.source.matrix);
        record.mesh.setMatrixAt(slot, world);
      });
      record.mesh.instanceMatrix.needsUpdate = true;
      record.mesh.computeBoundingSphere();
    }
  }

  function updateInstance(index) {
    let touched = false;
    for (const record of records) {
      const slot = record.items.findIndex(item => item.index === index);
      if (slot === -1) continue;
      const { instance, asset } = record.items[slot];
      tmp.copy(instanceTransformMatrix(instance));
      local.copy(visualLocalMatrixForInstance(instance, asset));
      world.multiplyMatrices(tmp, local).multiply(record.source.matrix);
      record.mesh.setMatrixAt(slot, world);
      record.mesh.instanceMatrix.needsUpdate = true;
      touched = true;
    }
    return touched;
  }

  refresh();
  return { root, refresh, updateInstance, instancedMeshes: records.map(record => record.mesh) };
}

function generatedGeometryKind(instance) {
  if (instance.geometry === 'cylinder' || instance.collisionKind === 'cylinder') return 'cylinder';
  return 'box';
}

function generatedMaterialKey(material) {
  return material?.uuid || material?.name || 'default';
}

function tileBoxGeometryUv(geo, sx, h, sz, tile = 16.0) {
  const uv = geo.attributes.uv;
  if (!uv || !geo.index || !geo.groups?.length) return;
  const dims = [
    [sz, h], [sz, h],
    [sx, sz], [sx, sz],
    [sx, h], [sx, h]
  ];
  for (let g = 0; g < geo.groups.length; g++) {
    const [uScale, vScale] = dims[g] || [sx, sz];
    const group = geo.groups[g];
    const touched = new Set();
    for (let i = group.start; i < group.start + group.count; i++) {
      const idx = geo.index.getX(i);
      if (touched.has(idx)) continue;
      touched.add(idx);
      uv.setXY(idx, uv.getX(idx) * Math.max(1, uScale / tile), uv.getY(idx) * Math.max(1, vScale / tile));
    }
  }
  uv.needsUpdate = true;
}

function generatedUvSizeKey(instance) {
  const size = instanceCollisionSize(instance);
  return size.map(value => Number(value || 0).toFixed(3)).join('x');
}

function createGeneratedGeometry(kind, size = DEFAULT_COLLISION_SIZE, tileSize = 16.0) {
  if (kind === 'cylinder') {
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1, false);
    geometry.userData.editorOwned = true;
    return geometry;
  }
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  tileBoxGeometryUv(geometry, size[0] || 1, size[1] || 1, size[2] || 1, tileSize);
  geometry.userData.editorOwned = true;
  return geometry;
}

function generatedLocalMatrixForInstance(instance, asset = null) {
  const size = instanceCollisionSize(instance, asset);
  const position = new THREE.Vector3(0, -size[1] * 0.5, 0);
  const scale = new THREE.Vector3(Math.max(0.001, size[0]), Math.max(0.001, size[1]), Math.max(0.001, size[2]));
  return new THREE.Matrix4().compose(position, new THREE.Quaternion(), scale);
}

export function createDefaultLevelMaterial({ name = 'Default_Blockout' } = {}) {
  let map = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#777777';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillRect(64, 64, 64, 64);
    ctx.strokeStyle = '#202020';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 128; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 128);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(128, i);
      ctx.stroke();
    }
    map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 2);
    map.needsUpdate = true;
  }
  const material = new THREE.MeshStandardMaterial({
    name,
    map,
    color: map ? 0xffffff : 0x8a8a8a,
    roughness: 0.78,
    metalness: 0.02,
    envMapIntensity: 0.55
  });
  return material;
}

export function createInstancedLevelVisuals(instances, assets, {
  mode = 'full',
  includeMoving = false,
  materialResolver = null,
  defaultMaterial = null
} = {}) {
  const root = new THREE.Group();
  root.name = 'level-instanced-visuals';
  const visible = mode === 'full' || mode === 'both';
  if (!visible) {
    return { root, refresh() {}, updateInstance() {}, instancedMeshes: [] };
  }

  const fallbackMaterial = defaultMaterial || createDefaultLevelMaterial();
  const environment = createInstancedEnvironmentVisuals(instances, assets, { mode, includeMoving });
  root.add(environment.root);

  const byGenerated = new Map();
  instances.forEach((instance, index) => {
    if (instance.asset && assets?.[instance.asset]?.scene) return;
    if (!includeMoving && instance.moving) return;
    const kind = generatedGeometryKind(instance);
    const material = materialResolver?.(instance.material, instance) || fallbackMaterial;
    const sizeKey = generatedUvSizeKey(instance);
    const tileSize = instance.options?.tileSize || 16.0;
    const key = `${kind}:${generatedMaterialKey(material)}:${sizeKey}:tile${tileSize}`;
    if (!byGenerated.has(key)) byGenerated.set(key, { kind, material, size: instanceCollisionSize(instance), tileSize, items: [] });
    byGenerated.get(key).items.push({ instance, index });
  });

  const records = [];
  const tmp = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const world = new THREE.Matrix4();

  for (const record of byGenerated.values()) {
    const mesh = new THREE.InstancedMesh(createGeneratedGeometry(record.kind, record.size, record.tileSize), record.material, record.items.length);
    mesh.name = `generated-${record.kind}-${generatedMaterialKey(record.material)}-instances`;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.environmentInstanceSlots = record.items.map(item => item.index);
    root.add(mesh);
    records.push({ mesh, ...record });
  }

  function refresh() {
    environment.refresh();
    for (const record of records) {
      record.items.forEach(({ instance }, slot) => {
        tmp.copy(instanceTransformMatrix(instance));
        local.copy(generatedLocalMatrixForInstance(instance));
        world.multiplyMatrices(tmp, local);
        record.mesh.setMatrixAt(slot, world);
      });
      record.mesh.instanceMatrix.needsUpdate = true;
      record.mesh.computeBoundingSphere();
    }
  }

  function updateInstance(index) {
    let touched = environment.updateInstance(index);
    for (const record of records) {
      const slot = record.items.findIndex(item => item.index === index);
      if (slot === -1) continue;
      const { instance } = record.items[slot];
      tmp.copy(instanceTransformMatrix(instance));
      local.copy(generatedLocalMatrixForInstance(instance));
      world.multiplyMatrices(tmp, local);
      record.mesh.setMatrixAt(slot, world);
      record.mesh.instanceMatrix.needsUpdate = true;
      touched = true;
    }
    return touched;
  }

  refresh();
  return {
    root,
    refresh,
    updateInstance,
    instancedMeshes: [...environment.instancedMeshes, ...records.map(record => record.mesh)]
  };
}

export function createEnvironmentInstanceObject(instance, assets, {
  mode = 'full',
  proxyMaterial = null,
  selectedMaterial = null
} = {}) {
  const asset = assets?.[instance.asset];
  const group = new THREE.Group();
  group.name = instance.name || instance.asset || 'environment-instance';
  group.userData.environmentInstance = instance;
  group.userData.assetId = instance.asset;
  group.userData.selectable = true;

  const position = asArray3(instance.position, [0, 0, 0]);
  const rotation = asArray3(instance.rotation, [0, instance.rotationY || 0, 0]);
  const scale = instanceScale(instance);
  group.position.set(position[0], position[1], position[2]);
  group.rotation.set(rotation[0], rotation[1], rotation[2]);
  group.scale.set(scale[0], scale[1], scale[2]);

  const collisionSize = instanceCollisionSize(instance, asset);
  const collision = assetCollisionConfig(asset);
  const showProxy = mode === 'proxy' || mode === 'both' || !asset;
  const showFull = mode === 'full' || mode === 'both';

  if (showFull && asset) {
    const visual = cloneEnvironmentPrefab(asset);
    if (visual) {
      visual.userData.selectableRoot = group;
      const matrix = visualLocalMatrixForInstance(instance, asset);
      matrix.decompose(visual.position, visual.quaternion, visual.scale);
      group.add(visual);
    }
  }

  if (showProxy) {
    const mat = proxyMaterial || new THREE.MeshBasicMaterial({ color: 0x9ce8ff, wireframe: true, transparent: true, opacity: 0.45 });
    const proxyGeometry = new THREE.BoxGeometry(collisionSize[0], collisionSize[1], collisionSize[2]);
    proxyGeometry.userData.editorOwned = true;
    const proxy = new THREE.Mesh(proxyGeometry, mat);
    proxy.name = `${group.name}-proxy`;
    proxy.position.y = -collisionSize[1] * 0.5;
    proxy.userData.selectableRoot = group;
    group.add(proxy);
  }

  if (selectedMaterial) {
    const helper = new THREE.BoxHelper(group, 0xffffff);
    helper.material = selectedMaterial;
    helper.geometry.userData.editorOwned = true;
    helper.visible = false;
    helper.renderOrder = 50;
    helper.userData.selectionHelper = true;
    group.userData.selectionHelper = helper;
    group.add(helper);
  }

  return group;
}

export function createLevelInstanceObject(instance, assets, {
  mode = 'full',
  proxyMaterial = null,
  selectedMaterial = null,
  materialResolver = null,
  defaultMaterial = null
} = {}) {
  if (instance.asset && assets?.[instance.asset]?.scene) {
    return createEnvironmentInstanceObject(instance, assets, { mode, proxyMaterial, selectedMaterial });
  }

  const group = new THREE.Group();
  group.name = instance.name || instance.asset || 'level-instance';
  group.userData.environmentInstance = instance;
  group.userData.assetId = instance.asset || null;
  group.userData.selectable = true;

  const position = asArray3(instance.position, [0, 0, 0]);
  const rotation = asArray3(instance.rotation, [0, instance.rotationY || 0, 0]);
  const scale = instanceScale(instance);
  group.position.set(position[0], position[1], position[2]);
  group.rotation.set(rotation[0], rotation[1], rotation[2]);
  group.scale.set(scale[0], scale[1], scale[2]);

  const size = instanceCollisionSize(instance);
  const showProxy = mode === 'proxy' || mode === 'both';
  const showFull = mode === 'full' || mode === 'both';
  if (showFull) {
    const kind = generatedGeometryKind(instance);
    const material = materialResolver?.(instance.material, instance) || defaultMaterial || createDefaultLevelMaterial();
    const geometry = kind === 'cylinder'
      ? new THREE.CylinderGeometry(Math.max(0.05, size[0] * 0.5), Math.max(0.05, size[2] * 0.5), Math.max(0.05, size[1]), 24, 1, false)
      : new THREE.BoxGeometry(Math.max(0.05, size[0]), Math.max(0.05, size[1]), Math.max(0.05, size[2]));
    if (kind !== 'cylinder') tileBoxGeometryUv(geometry, size[0] || 1, size[1] || 1, size[2] || 1, instance.options?.tileSize || 16.0);
    geometry.userData.editorOwned = true;
    const visual = new THREE.Mesh(geometry, material);
    visual.name = `${group.name}-generated`;
    visual.position.y = -size[1] * 0.5;
    visual.castShadow = true;
    visual.receiveShadow = true;
    visual.userData.selectableRoot = group;
    group.add(visual);
  }

  if (showProxy) {
    const mat = proxyMaterial || new THREE.MeshBasicMaterial({ color: 0x9ce8ff, wireframe: true, transparent: true, opacity: 0.45 });
    const proxyGeometry = new THREE.BoxGeometry(Math.max(0.1, size[0]), Math.max(0.1, size[1]), Math.max(0.1, size[2]));
    proxyGeometry.userData.editorOwned = true;
    const proxy = new THREE.Mesh(proxyGeometry, mat);
    proxy.name = `${group.name}-proxy`;
    proxy.position.y = -size[1] * 0.5;
    proxy.userData.selectableRoot = group;
    group.add(proxy);
  }

  if (selectedMaterial) {
    const helper = new THREE.BoxHelper(group, 0xffffff);
    helper.material = selectedMaterial;
    helper.geometry.userData.editorOwned = true;
    helper.visible = false;
    helper.renderOrder = 50;
    helper.userData.selectionHelper = true;
    group.userData.selectionHelper = helper;
    group.add(helper);
  }

  return group;
}

export function writeObjectTransformToInstance(object, instance) {
  instance.position = [
    Number(object.position.x.toFixed(4)),
    Number(object.position.y.toFixed(4)),
    Number(object.position.z.toFixed(4))
  ];
  instance.rotation = [
    Number(object.rotation.x.toFixed(4)),
    Number(object.rotation.y.toFixed(4)),
    Number(object.rotation.z.toFixed(4))
  ];
  instance.scale = [
    Number(object.scale.x.toFixed(4)),
    Number(object.scale.y.toFixed(4)),
    Number(object.scale.z.toFixed(4))
  ];
}

export function defaultEnvironmentInstance(assetId = 'catwalk-center-hub', index = 1) {
  return {
    kind: 'environment',
    asset: assetId,
    name: `${assetId}-${index}`,
    position: [0, 3, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    collisionKind: 'slab',
    material: 'catwalk'
  };
}

export function defaultLevelInstance(assetId = 'catwalk-center-hub', index = 1) {
  return defaultEnvironmentInstance(assetId, index);
}
