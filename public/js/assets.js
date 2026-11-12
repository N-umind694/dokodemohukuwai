import * as THREE from '../vendor/three/three.module.min.js';
import { PART_ORDER, PARTS_DIR, BASE_IMAGE } from './config.js';

async function loadTexture(loader, url) {
  try {
    const texture = await loader.loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch {
    throw new Error(`画像を読み込めませんでした: ${url}`);
  }
}

// 不透明度 50% 以上のピクセルを 1 とするマスク。パーツ同士の重なり判定に使う
function buildMask(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0);
  const { data } = g.getImageData(0, 0, canvas.width, canvas.height);
  const mask = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  return { w: canvas.width, h: canvas.height, data: mask };
}

export async function loadAssets() {
  const res = await fetch(PARTS_DIR + 'layout.json');
  if (!res.ok) throw new Error(`layout.json を読み込めませんでした (${res.status})`);
  const layout = await res.json();

  for (const { key } of PART_ORDER) {
    if (!layout.parts?.[key]) throw new Error(`layout.json に ${key} がありません`);
  }

  const loader = new THREE.TextureLoader();
  const [baseTexture, ...partTextures] = await Promise.all([
    loadTexture(loader, BASE_IMAGE),
    ...PART_ORDER.map(({ key }) => loadTexture(loader, PARTS_DIR + layout.parts[key].file)),
  ]);

  const parts = PART_ORDER.map((entry, i) => ({
    ...entry,
    ...layout.parts[entry.key],
    texture: partTextures[i],
    mask: buildMask(partTextures[i].image),
  }));

  return { canvas: layout.canvas, baseTexture, parts };
}
