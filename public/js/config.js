// layout.json のピクセル座標を 3D 空間の長さに換算する倍率（1px = 0.01）
export const PX = 0.01;

// 配置順。後に置いたパーツほど手前に重なる
export const PART_ORDER = [
  { key: 'brow_left', label: '左眉' },
  { key: 'brow_right', label: '右眉' },
  { key: 'eye_left', label: '左目' },
  { key: 'eye_right', label: '右目' },
  { key: 'nose', label: '鼻' },
  { key: 'mouth', label: '口' },
  { key: 'wart', label: 'イボ' },
];

export const PARTS_DIR = './assets/parts/';
export const BASE_IMAGE = './assets/base/dodai.png';

// パーツが動き回る範囲。layout.json の全パーツを囲む範囲にこの余白 (px) を足す
export const WANDER_MARGIN = { x: 60, y: 50 };

// layout.json の座標（左上原点・下向き y）を土台中心原点の (x, z) に変換する。
// 画像の上側が画面の上（-z）に来る
export function layoutToWorld(canvas, px, py) {
  return {
    x: (px - canvas.w / 2) * PX,
    z: (py - canvas.h / 2) * PX,
  };
}

// 全パーツを囲む範囲を余白付きで world 座標にして返す
export function faceZone(canvas, parts, margin) {
  const left = Math.min(...parts.map((p) => p.x)) - margin.x;
  const right = Math.max(...parts.map((p) => p.x + p.w)) + margin.x;
  const top = Math.min(...parts.map((p) => p.y)) - margin.y;
  const bottom = Math.max(...parts.map((p) => p.y + p.h)) + margin.y;
  const min = layoutToWorld(canvas, left, top);
  const max = layoutToWorld(canvas, right, bottom);
  return {
    minX: min.x,
    maxX: max.x,
    minZ: min.z,
    maxZ: max.z,
    centerX: (min.x + max.x) / 2,
    centerZ: (min.z + max.z) / 2,
  };
}
