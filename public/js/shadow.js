import * as THREE from '../vendor/three/three.module.min.js';
import { PX } from './config.js';

// パーツの落ち影。光は左上から差すので、影は右下（+x, +z）へ落とす
const LIGHT_DIR = new THREE.Vector2(0.6, 0.8);
const BLUR = 5; // 影のぼかし (px)
const PAD = BLUR * 2; // ぼかしではみ出す分の余白 (px)
const REST_OFFSET = 0.02; // 置いたパーツの影のずれ
const OFFSET_PER_HEIGHT = 0.12; // 高さ 1 あたりの影のずれ
const MAX_OFFSET = 0.45;
const OPACITY = 0.3;
const SHADOW_Y = 0.0008; // 土台の上面すれすれ

// パーツ画像の不透明な部分をぼかした、黒い影の画像を作る
function createShadowTexture(image) {
  const w = image.width + PAD * 2;
  const h = image.height + PAD * 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, PAD, PAD);
  const img = g.getImageData(0, 0, w, h);
  let alpha = new Float32Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = img.data[i * 4 + 3] / 255;
  // 横・縦のボックスぼかしを 2 回ずつかけて、ガウスぼかしに近づける
  for (let pass = 0; pass < 2; pass++) {
    alpha = boxBlur(alpha, w, h, BLUR, 1, w);
    alpha = boxBlur(alpha, w, h, BLUR, w, 1);
  }
  for (let i = 0; i < alpha.length; i++) {
    img.data[i * 4] = 0;
    img.data[i * 4 + 1] = 0;
    img.data[i * 4 + 2] = 0;
    img.data[i * 4 + 3] = Math.round(alpha[i] * 255);
  }
  g.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// step 方向に radius px のボックスぼかしをかける（stride はもう一方の軸の進み幅）
function boxBlur(src, w, h, radius, step, stride) {
  const out = new Float32Array(src.length);
  const lines = step === 1 ? h : w;
  const length = step === 1 ? w : h;
  const size = radius * 2 + 1;
  for (let line = 0; line < lines; line++) {
    const base = line * stride;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[base + clampIndex(k, length) * step];
    for (let i = 0; i < length; i++) {
      out[base + i * step] = sum / size;
      sum += src[base + clampIndex(i + radius + 1, length) * step] - src[base + clampIndex(i - radius, length) * step];
    }
  }
  return out;
}

function clampIndex(i, length) {
  return Math.min(length - 1, Math.max(0, i));
}

// 土台の上に寝かせた影の板を作る
export function createShadowMesh(def) {
  const geometry = new THREE.PlaneGeometry((def.w + PAD * 2) * PX, (def.h + PAD * 2) * PX);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    map: createShadowTexture(def.texture.image),
    transparent: true,
    depthWrite: false,
    opacity: OPACITY,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;
  return mesh;
}

// パーツの位置 (x, z)・底面の高さ height・水平の回転 yaw に合わせて影を置く。
// 高いほど影を遠く・大きく・薄くする。visibility は向きなどで影を薄めるときの割合
export function placeShadow(mesh, x, z, height, yaw, visibility = 1) {
  const h = Math.max(0, height);
  const offset = Math.min(REST_OFFSET + h * OFFSET_PER_HEIGHT, MAX_OFFSET);
  mesh.position.set(x + LIGHT_DIR.x * offset, SHADOW_Y, z + LIGHT_DIR.y * offset);
  mesh.rotation.y = yaw;
  mesh.scale.setScalar(1 + h * 0.12);
  mesh.material.opacity = OPACITY * Math.exp(-h / 3) * visibility;
}
