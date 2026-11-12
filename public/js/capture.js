import * as THREE from '../vendor/three/three.module.min.js';

// 土台を真上から正射影で撮り、canvas で返す。scale は layout.json の座標に対する倍率
export function renderFace(stage, scale) {
  const width = stage.canvasSize.w * scale;
  const height = stage.canvasSize.h * scale;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);

  const camera = new THREE.OrthographicCamera(
    -stage.boardW / 2, stage.boardW / 2, stage.boardD / 2, -stage.boardD / 2, 0.1, 100,
  );
  camera.up.set(0, 0, -1);
  camera.position.set(0, 50, 0);
  camera.lookAt(0, 0, 0);

  // 着地の波紋は写さない
  for (const ring of stage.effects) ring.visible = false;
  renderer.render(stage.scene, camera);
  for (const ring of stage.effects) ring.visible = true;

  // WebGL の canvas は捨てるので、2D の canvas に写しておく
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  out.getContext('2d').drawImage(canvas, 0, 0);
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}

export async function toPngBlob(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('画像を作れませんでした');
  return blob;
}

export function imageFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `fukuwarai-${stamp}.png`;
}

// スマホでは共有シートから写真に保存できるようにし、それ以外はダウンロードする
export async function saveImage(blob, name) {
  const file = new File([blob], name, { type: 'image/png' });
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      // 開けなかったとき（許可がない）だけダウンロードで代わりにする。閉じた・二重に押したときは何もしない
      if (err.name !== 'NotAllowedError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
