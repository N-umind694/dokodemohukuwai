import * as THREE from '../vendor/three/three.module.min.js';

function toTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 不透明度 50% 以上のピクセルを 1 とするマスク。パーツ同士の重なり判定に使う
function buildMask(image) {
  const g = image.getContext('2d', { willReadFrequently: true });
  const { data } = g.getImageData(0, 0, image.width, image.height);
  const mask = new Uint8Array(image.width * image.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  return { w: image.width, h: image.height, data: mask };
}

// faceAssets.js が作った素材（canvas）を、3D で使える形にする
export function buildAssets(face) {
  return {
    canvas: face.canvas,
    baseTexture: toTexture(face.base),
    parts: face.parts.map((part) => ({ ...part, texture: toTexture(part.image), mask: buildMask(part.image) })),
  };
}
