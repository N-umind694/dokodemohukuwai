import * as THREE from '../vendor/three/three.module.min.js';
import { PX } from './config.js';

// パーツの厚みの標準（タイトル画面で降ってくるパーツ）。写真を暗くした層を重ねて側面に見せる
export const THICKNESS = 0.06;
const LAYERS = 10; // 標準の厚みのときに重ねる層の数。薄いパーツは厚みに合わせて減らす

// 底面から上に厚み thickness を持つパーツの見た目を作る。
// 最下層は裏返ったときに見える面なので、元の明るさのまま両面に描く
export function createPartMesh(def, order, thickness = THICKNESS) {
  const layers = Math.max(3, Math.round((LAYERS * thickness) / THICKNESS));
  const geometry = new THREE.PlaneGeometry(def.w * PX, def.h * PX);
  geometry.rotateX(-Math.PI / 2);
  const group = new THREE.Group();
  for (let k = 0; k < layers; k++) {
    const t = k / (layers - 1);
    const material = new THREE.MeshBasicMaterial({
      map: def.texture,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      color: new THREE.Color().setScalar(k === 0 ? 1 : 0.18 + 0.24 * t),
    });
    const layer = new THREE.Mesh(geometry, material);
    layer.position.y = thickness * t;
    group.add(layer);
  }
  // 上面は写真の色をそのまま出す
  const top = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ map: def.texture, transparent: true, depthWrite: false }),
  );
  top.position.y = thickness + 0.001;
  top.renderOrder = 10 + order;
  group.add(top);
  return group;
}
