export const GAME_MATERIAL_TEXTURE_ROUTES = {
  catwalk: 'argent-catwalk',
  floor: 'hell-floor',
  wall: 'hell-wall',
  metal: 'hell-metal',
  darkMetal: 'hell-metal',
  redMetal: 'hell-metal',
  runeMetal: 'hell-rune',
  obsidian: 'hell-wall'
};

export function textureLabMaterialId(materialId) {
  return GAME_MATERIAL_TEXTURE_ROUTES[materialId] || materialId || '';
}

export function editRouteForLevelInstance(instance) {
  if (!instance) return null;
  if (instance.asset) {
    return {
      href: `runtime_asset_lab.html?asset=${encodeURIComponent(instance.asset)}`,
      label: 'Edit Runtime Asset',
      kind: 'runtime-asset'
    };
  }
  const material = textureLabMaterialId(instance.material);
  if (material) {
    return {
      href: `texture_lab.html?material=${encodeURIComponent(material)}&shape=box`,
      label: 'Edit Material',
      kind: 'texture-material'
    };
  }
  return null;
}
