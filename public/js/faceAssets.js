// 福笑いの素材（土台の画像と、眉・目・鼻・口のパーツ画像、その元の位置）を作る。
// サンプルの顔は絵で描き、写真は顔認識で切り出す。どちらも端末の中だけで作り、どこにも送らない
import { PART_ORDER } from './config.js';

// 土台の大きさ (px)。パーツの位置はこの中の座標で持つ
export const CANVAS = { w: 540, h: 600 };

// 顔認識の部品（public/vendor/mediapipe/）。写真を選んだときに初めて読み込む
const MEDIAPIPE_DIR = new URL('../vendor/mediapipe/', import.meta.url).href;

// 顔の点の番号（MediaPipe Face Mesh）。left / right は画像の左右（写っている人から見ると逆）
const LANDMARKS = {
  brow_left: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  brow_right: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
  eye_left: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  eye_right: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
  nose: [6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 97, 326, 327, 64, 294, 48, 278, 129, 358, 115, 344, 220, 440],
  mouth: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
};
// 顔の輪郭（切り出す範囲を決めるのに使う）
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

// パーツのまわりに残す肌の幅。[横の割合, 縦の割合, 最低限の幅 (px)]（割合はパーツの幅・高さに対して）
const PART_PAD = {
  brow_left: [0.06, 0.4, 5], brow_right: [0.06, 0.4, 5],
  eye_left: [0.14, 0.5, 6], eye_right: [0.14, 0.5, 6],
  nose: [0.14, 0.06, 5],
  mouth: [0.12, 0.3, 6],
};
// パーツの縁のぼかし (px)
const FEATHER = 2.5;
// 土台の穴を埋めるとき、パーツより少し広く埋める幅 (px)
const FILL_GROW = 5;

// ---- サンプルの顔 ----

export function makeSampleFace() {
  const base = newCanvas(CANVAS.w, CANVAS.h);
  const g = base.getContext('2d');
  // 背景と顔
  const bg = g.createLinearGradient(0, 0, 0, CANVAS.h);
  bg.addColorStop(0, '#cfe3ea');
  bg.addColorStop(1, '#a9c8d3');
  g.fillStyle = bg;
  g.fillRect(0, 0, CANVAS.w, CANVAS.h);
  g.fillStyle = '#2f5d6e';
  g.beginPath();
  g.ellipse(270, 640, 230, 140, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f2c9a5';
  g.fillRect(232, 430, 76, 110);
  g.beginPath();
  g.ellipse(270, 300, 160, 200, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(112, 310, 26, 44, 0, 0, Math.PI * 2);
  g.ellipse(428, 310, 26, 44, 0, 0, Math.PI * 2);
  g.fill();
  // 髪
  g.fillStyle = '#3a2a22';
  g.beginPath();
  g.ellipse(270, 170, 172, 110, 0, Math.PI, Math.PI * 2);
  g.ellipse(270, 175, 172, 40, 0, 0, Math.PI);
  g.fill();

  // パーツは、肌の色の小判形の上に描く
  const draw = {
    brow_left: (c) => brow(c, false),
    brow_right: (c) => brow(c, true),
    eye_left: (c) => eye(c),
    eye_right: (c) => eye(c),
    nose: (c) => nose(c),
    mouth: (c) => mouth(c),
  };
  const boxes = {
    brow_left: { x: 160, y: 210, w: 96, h: 40 },
    brow_right: { x: 284, y: 210, w: 96, h: 40 },
    eye_left: { x: 162, y: 252, w: 92, h: 60 },
    eye_right: { x: 286, y: 252, w: 92, h: 60 },
    nose: { x: 236, y: 300, w: 68, h: 92 },
    mouth: { x: 200, y: 400, w: 140, h: 66 },
  };
  const parts = PART_ORDER.map((entry) => {
    const box = boxes[entry.key];
    const image = newCanvas(box.w, box.h);
    const c = image.getContext('2d');
    c.fillStyle = '#f2c9a5';
    c.beginPath();
    c.ellipse(box.w / 2, box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
    c.fill();
    draw[entry.key](c, box.w, box.h);
    return { ...entry, ...box, image };
  });
  return { canvas: CANVAS, base, parts };

  function brow(c, flip) {
    c.save();
    if (flip) {
      c.translate(96, 0);
      c.scale(-1, 1);
    }
    c.strokeStyle = '#3a2a22';
    c.lineWidth = 9;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(14, 28);
    c.quadraticCurveTo(48, 6, 82, 22);
    c.stroke();
    c.restore();
  }
  function eye(c) {
    c.fillStyle = '#fff';
    c.beginPath();
    c.ellipse(46, 30, 30, 17, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#3a2a22';
    c.beginPath();
    c.arc(46, 30, 12, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(50, 25, 4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#3a2a22';
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(46, 30, 30, 17, 0, Math.PI * 1.05, Math.PI * 1.95);
    c.stroke();
  }
  function nose(c) {
    c.strokeStyle = '#c98f6c';
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(34, 14);
    c.quadraticCurveTo(30, 52, 22, 64);
    c.quadraticCurveTo(34, 76, 46, 66);
    c.stroke();
  }
  function mouth(c) {
    c.fillStyle = '#c4545a';
    c.beginPath();
    c.moveTo(24, 26);
    c.quadraticCurveTo(70, 70, 116, 26);
    c.quadraticCurveTo(70, 40, 24, 26);
    c.fill();
  }
}

// ---- 写真から作る ----

let landmarkerPromise = null;

// 顔認識の準備（初回だけ数 MB を読み込む）
function getLandmarker() {
  landmarkerPromise ??= (async () => {
    const vision = await import(`${MEDIAPIPE_DIR}vision_bundle.mjs`);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${MEDIAPIPE_DIR}wasm`);
    return vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${MEDIAPIPE_DIR}face_landmarker.task`, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numFaces: 3,
    });
  })();
  landmarkerPromise.catch(() => {
    landmarkerPromise = null;
  });
  return landmarkerPromise;
}

// 写真のファイルから素材を作る。顔が見つからなければ Error('no-face') を投げる
export async function makePhotoFace(file) {
  const photo = await loadPhoto(file);
  const landmarker = await getLandmarker();
  const found = landmarker.detect(photo);
  const faces = found.faceLandmarks ?? [];
  if (faces.length === 0) throw new Error('no-face');

  // 写っている顔のうち、いちばん大きい顔を使う
  const toPx = (lm) => lm.map((p) => ({ x: p.x * photo.width, y: p.y * photo.height }));
  const face = faces.map(toPx).sort((a, b) => ovalArea(b) - ovalArea(a))[0];

  // 顔が土台の真ん中に、土台の高さの 6 割ほどで収まるように切り出す
  const oval = FACE_OVAL.map((i) => face[i]);
  const fb = bounds(oval);
  // ただし写真が土台いっぱいを必ず覆うように、縮めすぎず、切り出す範囲を写真の内側に収める
  // （写真の外が土台に入って、何もない所ができないようにする）
  const scale = Math.max((CANVAS.h * 0.6) / fb.h, CANVAS.w / photo.width, CANVAS.h / photo.height);
  const halfW = CANVAS.w / 2 / scale;
  const halfH = CANVAS.h / 2 / scale;
  const cx = clampTo(fb.x + fb.w / 2, halfW, photo.width - halfW);
  const cy = clampTo(fb.y + fb.h / 2, halfH, photo.height - halfH);
  const toBase = (p) => ({ x: (p.x - cx) * scale + CANVAS.w / 2, y: (p.y - cy) * scale + CANVAS.h * 0.5 });

  const photoBase = newCanvas(CANVAS.w, CANVAS.h);
  const pg = photoBase.getContext('2d');
  pg.fillStyle = '#808080';
  pg.fillRect(0, 0, CANVAS.w, CANVAS.h);
  pg.setTransform(scale, 0, 0, scale, CANVAS.w / 2 - cx * scale, CANVAS.h * 0.5 - cy * scale);
  pg.drawImage(photo, 0, 0);
  pg.setTransform(1, 0, 0, 1, 0, 0);

  // パーツを切り抜き、土台ではその跡を埋める
  const holes = [];
  const parts = PART_ORDER.map((entry) => {
    const points = LANDMARKS[entry.key].map((i) => toBase(face[i]));
    const hull = grow(convexHull(points), PART_PAD[entry.key]);
    holes.push(hull);
    return { ...entry, ...cutPart(photoBase, hull) };
  });
  const base = fillHoles(photoBase, holes);
  return { canvas: CANVAS, base, parts };
}

// 写真を、向き（EXIF）を直した状態で、長い辺 1600px までに縮めて読む
async function loadPhoto(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const limit = 1600;
  const k = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
  const canvas = newCanvas(Math.round(bitmap.width * k), Math.round(bitmap.height * k));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

// 輪郭で囲んだ部分を、縁をぼかした PNG として切り出す
function cutPart(source, polygon) {
  const box = bounds(polygon);
  const x = Math.max(0, Math.floor(box.x - FEATHER * 2));
  const y = Math.max(0, Math.floor(box.y - FEATHER * 2));
  const w = Math.min(CANVAS.w, Math.ceil(box.x + box.w + FEATHER * 2)) - x;
  const h = Math.min(CANVAS.h, Math.ceil(box.y + box.h + FEATHER * 2)) - y;
  const image = newCanvas(w, h);
  const g = image.getContext('2d');
  g.filter = `blur(${FEATHER}px)`;
  g.fillStyle = '#000';
  fillPolygon(g, polygon.map((p) => ({ x: p.x - x, y: p.y - y })));
  g.filter = 'none';
  g.globalCompositeOperation = 'source-in';
  g.drawImage(source, x, y, w, h, 0, 0, w, h);
  return { x, y, w, h, image };
}

// パーツを取った跡を、まわりの色からなめらかに埋める（粗い解像度で色を集めて、細かい解像度に戻す）
function fillHoles(source, holes) {
  const { w, h } = CANVAS;
  const maskCanvas = newCanvas(w, h);
  const mg = maskCanvas.getContext('2d');
  mg.fillStyle = '#fff';
  for (const hole of holes) fillPolygon(mg, grow(hole, [0, 0, FILL_GROW]));
  const mask = mg.getImageData(0, 0, w, h).data;
  const src = source.getContext('2d').getImageData(0, 0, w, h);

  // 一番細かい段：穴でない画素だけ重み 1
  let level = { w, h, c: new Float32Array(w * h * 3), wt: new Float32Array(w * h) };
  for (let i = 0; i < w * h; i++) {
    const known = mask[i * 4] < 128 ? 1 : 0;
    level.wt[i] = known;
    for (let k = 0; k < 3; k++) level.c[i * 3 + k] = src.data[i * 4 + k] * known;
  }
  const levels = [level];
  while (level.w > 1 || level.h > 1) {
    const nw = Math.max(1, Math.ceil(level.w / 2));
    const nh = Math.max(1, Math.ceil(level.h / 2));
    const next = { w: nw, h: nh, c: new Float32Array(nw * nh * 3), wt: new Float32Array(nw * nh) };
    for (let y = 0; y < level.h; y++) {
      for (let x = 0; x < level.w; x++) {
        const i = y * level.w + x;
        const j = (y >> 1) * nw + (x >> 1);
        next.wt[j] += level.wt[i];
        for (let k = 0; k < 3; k++) next.c[j * 3 + k] += level.c[i * 3 + k];
      }
    }
    // 重みは 1 を上限にして、色は重み付きの平均として持つ
    for (let j = 0; j < nw * nh; j++) {
      const wt = next.wt[j];
      if (wt > 0) for (let k = 0; k < 3; k++) next.c[j * 3 + k] *= Math.min(wt, 1) / wt;
      next.wt[j] = Math.min(wt, 1);
    }
    levels.push(next);
    level = next;
  }
  // 粗い段から順に、足りない色を一つ粗い段の色（なめらかに補間）で補う
  for (let n = levels.length - 2; n >= 0; n--) {
    const fine = levels[n];
    const coarse = levels[n + 1];
    for (let y = 0; y < fine.h; y++) {
      for (let x = 0; x < fine.w; x++) {
        const i = y * fine.w + x;
        const lack = 1 - fine.wt[i];
        if (lack <= 0) continue;
        const col = sample(coarse, (x + 0.5) / 2 - 0.5, (y + 0.5) / 2 - 0.5);
        for (let k = 0; k < 3; k++) fine.c[i * 3 + k] += col[k] * lack;
        fine.wt[i] = 1;
      }
    }
  }
  // 埋めた色を、穴の縁がなじむように元の写真へ重ねる
  const filled = newCanvas(w, h);
  const fg = filled.getContext('2d');
  const out = fg.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    for (let k = 0; k < 3; k++) out.data[i * 4 + k] = levels[0].c[i * 3 + k];
    out.data[i * 4 + 3] = 255;
  }
  fg.putImageData(out, 0, 0);
  const soft = newCanvas(w, h);
  const sg = soft.getContext('2d');
  sg.filter = 'blur(4px)';
  sg.drawImage(maskCanvas, 0, 0);
  sg.filter = 'none';
  sg.globalCompositeOperation = 'source-in';
  sg.drawImage(filled, 0, 0);

  const base = newCanvas(w, h);
  const bg = base.getContext('2d');
  bg.drawImage(source, 0, 0);
  bg.drawImage(soft, 0, 0);
  return base;

  function sample(lv, fx, fy) {
    const x0 = Math.max(0, Math.min(lv.w - 1, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(lv.h - 1, Math.floor(fy)));
    const x1 = Math.min(lv.w - 1, x0 + 1);
    const y1 = Math.min(lv.h - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0));
    const ty = Math.max(0, Math.min(1, fy - y0));
    const col = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const a = lv.c[(y0 * lv.w + x0) * 3 + k] * (1 - tx) + lv.c[(y0 * lv.w + x1) * 3 + k] * tx;
      const b = lv.c[(y1 * lv.w + x0) * 3 + k] * (1 - tx) + lv.c[(y1 * lv.w + x1) * 3 + k] * tx;
      col[k] = a * (1 - ty) + b * ty;
    }
    return col;
  }
}

// ---- 図形の小道具 ----

function clampTo(v, lo, hi) {
  return lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi);
}

function newCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function fillPolygon(g, points) {
  g.beginPath();
  points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.fill();
}

function bounds(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function ovalArea(face) {
  const b = bounds(FACE_OVAL.map((i) => face[i]));
  return b.w * b.h;
}

// 凸包（点の集まりを囲む、へこみのない多角形）
function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// 多角形を中心から外へ広げる。[横の割合, 縦の割合, 最低限の幅 (px)]
function grow(polygon, [ratioX, ratioY, min]) {
  const b = bounds(polygon);
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const padX = Math.max(b.w * ratioX, min);
  const padY = Math.max(b.h * ratioY, min);
  return polygon.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const sx = b.w > 0 ? (b.w / 2 + padX) / (b.w / 2) : 1;
    const sy = b.h > 0 ? (b.h / 2 + padY) / (b.h / 2) : 1;
    return { x: c.x + dx * sx, y: c.y + dy * sy };
  });
}
