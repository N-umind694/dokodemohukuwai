// 正月の和室（昭和の家）の 3D 背景。箱と板だけで組み、模様は canvas で描く（画像ファイルは使わない）。
// 土台は部屋の真ん中の座卓の上に置く。座標は土台の上面の中心が原点で、y が上
import * as THREE from '../vendor/three/three.module.min.js';

// 寸法（1 = 土台の 100px。土台は 5.4 × 6.0、実物の 45cm ほどとして、1 ≒ 8.3cm）
const BOARD_THICKNESS = 0.3;
const TABLE = { w: 17, d: 11, h: 4.0, top: 0.45 }; // 座卓（150 × 90cm、高さ 33cm）
const TABLE_TOP_Y = -BOARD_THICKNESS; // 座卓の天板の上面＝土台の底
const FLOOR_Y = TABLE_TOP_Y - TABLE.h; // 畳の面
const ROOM = { w: 48, d: 40, h: 28 }; // 部屋の広さと天井の高さ
const BEAM_Y = FLOOR_Y + 21; // 長押（鴨居の上の横木）の高さ

const COLOR = {
  wood: 0x3b2418,
  woodLight: 0x6a432a,
  plaster: '#c9a77a',
  felt: 0xb3121c, // 緋毛氈
};

export const ROOM_FLOOR_Y = FLOOR_Y;

// 部屋をまるごと作る。table は座卓（土台を立てる場面では隠す）、hinadan はひな壇（土台を立てる場面だけ出す）
export function buildRoom() {
  const group = new THREE.Group();
  const mats = makeMaterials();
  const hw = ROOM.w / 2;
  const hd = ROOM.d / 2;
  const cy = FLOOR_Y + ROOM.h;

  // 畳と天井。どちらも部屋の内側だけに面を向ける（部屋の外にカメラがあっても、手前の面は見えない）
  group.add(plane(ROOM.w, ROOM.d, mats.tatami, [0, FLOOR_Y, 0], [-Math.PI / 2, 0, 0]));
  group.add(plane(ROOM.w, ROOM.d, mats.ceiling, [0, cy, 0], [Math.PI / 2, 0, 0]));

  // 奥（-z）：床の間。土壁に掛け軸、床板の上に鏡餅
  group.add(wall(ROOM.w, ROOM.h, mats.plaster, [0, FLOOR_Y + ROOM.h / 2, -hd], 0));
  const toko = new THREE.Group();
  toko.add(box(16, 1.2, 6, mats.woodLight, [0, FLOOR_Y + 0.6, -hd + 3]));
  toko.add(plane(5.5, 13, mats.scroll, [0, FLOOR_Y + 10.5, -hd + 0.06], [0, 0, 0]));
  toko.add(box(6.4, 0.3, 0.3, mats.wood, [0, FLOOR_Y + 17.2, -hd + 0.15]));
  toko.add(kagamiMochi([3.8, FLOOR_Y + 1.2, -hd + 3.2]));
  toko.add(box(0.8, ROOM.h, 0.8, mats.wood, [9, FLOOR_Y + ROOM.h / 2, -hd + 0.4])); // 床柱
  group.add(toko);

  // 左（-x）：障子を開け放って庭が見える
  group.add(garden([-hw - 6, FLOOR_Y + 9, 0], Math.PI / 2, ROOM.d * 1.3, 26, mats.garden));
  group.add(box(ROOM.d, 2.2, 1.2, mats.woodLight, [-hw - 0.6, FLOOR_Y + 0.1, 0], [0, Math.PI / 2, 0])); // 縁側
  for (const z of [-hd + 3, -hd + 9.5]) group.add(shoji(z, -hw + 0.4, Math.PI / 2, mats));
  group.add(wall(ROOM.d, ROOM.h - (BEAM_Y - FLOOR_Y), mats.plaster, [-hw, (BEAM_Y + cy) / 2, 0], Math.PI / 2));

  // 右（+x）：障子を閉めている。一部だけ開けて庭を見せる
  group.add(garden([hw + 6, FLOOR_Y + 9, 0], -Math.PI / 2, ROOM.d * 1.3, 26, mats.garden));
  for (const z of [-hd + 3, -hd + 9.5, 3, 9.5, hd - 3]) group.add(shoji(z, hw - 0.4, -Math.PI / 2, mats));
  group.add(wall(ROOM.d, ROOM.h - (BEAM_Y - FLOOR_Y), mats.plaster, [hw, (BEAM_Y + cy) / 2, 0], -Math.PI / 2));

  // 手前（+z）：襖
  group.add(wall(ROOM.w, ROOM.h, mats.fusuma, [0, FLOOR_Y + ROOM.h / 2, hd], Math.PI));

  // 柱と長押
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [-hw, 0], [hw, 0]]) {
    group.add(box(1, ROOM.h, 1, mats.wood, [x, FLOOR_Y + ROOM.h / 2, z]));
  }
  group.add(box(ROOM.w, 1, 0.6, mats.wood, [0, BEAM_Y, -hd + 0.3]));
  group.add(box(ROOM.w, 1, 0.6, mats.wood, [0, BEAM_Y, hd - 0.3]));
  group.add(box(0.6, 1, ROOM.d, mats.wood, [-hw + 0.3, BEAM_Y, 0]));
  group.add(box(0.6, 1, ROOM.d, mats.wood, [hw - 0.3, BEAM_Y, 0]));

  // 座卓
  const table = new THREE.Group();
  table.add(box(TABLE.w, TABLE.top, TABLE.d, mats.table, [0, TABLE_TOP_Y - TABLE.top / 2, 0]));
  const legH = TABLE.h - TABLE.top;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      table.add(box(1.2, legH, 1.2, mats.wood, [sx * (TABLE.w / 2 - 1.4), FLOOR_Y + legH / 2, sz * (TABLE.d / 2 - 1.2)]));
    }
  }
  group.add(table);

  return { group, table, materials: Object.values(mats), tableHalf: { w: TABLE.w / 2, d: TABLE.d / 2, y: TABLE_TOP_Y } };
}

// ひな壇：赤い毛氈を掛けた 3 段。いちばん上の段（高さ topY）に土台を立て、段は手前（+z）に向かって
// floorY まで下がる。frontZ は上の段の手前の端
export function buildHinadan(topY, floorY, frontZ) {
  const group = new THREE.Group();
  const felt = new THREE.MeshStandardMaterial({ color: COLOR.felt, roughness: 1 });
  const steps = 3;
  const rise = (topY - floorY) / steps;
  const back = frontZ - 7; // どの段も奥の端はそろえる
  for (let i = 0; i < steps; i++) {
    const y = topY - rise * i; // その段の上面
    const front = frontZ + i * 3.2;
    const w = 15 + i * 3;
    group.add(box(w, y - floorY, front - back, felt, [0, (y + floorY) / 2, (front + back) / 2]));
  }
  return group;
}

// ---- 部品 ----

function plane(w, h, material, pos, rot) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  return mesh;
}

// 部屋の内側を向く壁。rotY は壁の向き（0 で +z を向く＝奥の壁）
function wall(w, h, material, pos, rotY) {
  return plane(w, h, material, pos, [0, rotY, 0]);
}

function box(w, h, d, material, pos, rot = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  return mesh;
}

// 障子 1 枚（幅 6.5、高さは鴨居まで）
function shoji(z, x, rotY, mats) {
  const h = BEAM_Y - FLOOR_Y - 0.5;
  const mesh = plane(6.4, h, mats.shoji, [x, FLOOR_Y + h / 2, z], [0, rotY, 0]);
  return mesh;
}

// 障子の外に見える庭（明るい緑の板）
function garden(pos, rotY, w, h, material) {
  return plane(w, h, material, pos, [0, rotY, 0]);
}

// 鏡餅：三方（台）の上に、大小の餅と橙
function kagamiMochi([x, y, z]) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xd9b27a, roughness: 0.8 });
  const mochi = new THREE.MeshStandardMaterial({ color: 0xfbf7ef, roughness: 0.6 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xf08a1c, roughness: 0.5 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2f7a33, roughness: 0.7 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  g.add(box(3.2, 1.6, 3.2, wood, [0, 0.8, 0]));
  g.add(box(3.6, 0.2, 3.6, paper, [0, 1.7, 0]));
  const big = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), mochi);
  big.scale.set(1, 0.55, 1);
  big.position.y = 2.4;
  const small = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 16), mochi);
  small.scale.set(1, 0.55, 1);
  small.position.y = 3.3;
  const dai = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 14), orange);
  dai.position.y = 4.2;
  const ha = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), leaf);
  ha.scale.set(1.4, 0.3, 0.7);
  ha.position.set(0.45, 4.75, 0);
  g.add(big, small, dai, ha);
  g.position.set(x, y, z);
  return g;
}

// ---- 模様（canvas） ----

function makeMaterials() {
  const std = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.95, ...extra });
  const basic = (map) => new THREE.MeshBasicMaterial({ map });
  return {
    tatami: std(tatamiTexture()),
    ceiling: std(woodTexture('#5b3a24', '#4a2e1c', 8), { side: THREE.FrontSide }),
    plaster: std(plasterTexture()),
    fusuma: std(fusumaTexture()),
    shoji: basic(shojiTexture()),
    garden: basic(gardenTexture()),
    scroll: std(scrollTexture(), { roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: COLOR.wood, roughness: 0.7 }),
    woodLight: new THREE.MeshStandardMaterial({ color: COLOR.woodLight, roughness: 0.7 }),
    table: std(woodTexture('#3d2416', '#2c190f', 14), { roughness: 0.45 }),
  };
}

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// 畳：部屋の広さ（48 × 40）に、半畳ずらしで畳を敷いた模様
function tatamiTexture() {
  return canvasTexture(1200, 1000, (g, w, h) => {
    const s = w / ROOM.w; // 1 単位あたりの px
    const mw = 10.8 * s; // 畳の短い辺
    const ml = 21.6 * s; // 長い辺
    g.fillStyle = '#bfae6a';
    g.fillRect(0, 0, w, h);
    const mat = (x, y, ww, hh, vertical) => {
      const grad = g.createLinearGradient(x, y, x + ww, y + hh);
      grad.addColorStop(0, '#c9b874');
      grad.addColorStop(1, '#b6a35d');
      g.fillStyle = grad;
      g.fillRect(x, y, ww, hh);
      g.strokeStyle = 'rgba(90, 80, 30, 0.18)';
      g.lineWidth = 1;
      for (let k = 2; k < (vertical ? ww : hh); k += 4) {
        g.beginPath();
        if (vertical) {
          g.moveTo(x + k, y);
          g.lineTo(x + k, y + hh);
        } else {
          g.moveTo(x, y + k);
          g.lineTo(x + ww, y + k);
        }
        g.stroke();
      }
      // 畳の縁（へり）は長い辺に付く
      g.fillStyle = '#1d2433';
      const b = 0.7 * s;
      if (vertical) {
        g.fillRect(x, y, ww, b);
        g.fillRect(x, y + hh - b, ww, b);
      } else {
        g.fillRect(x, y, b, hh);
        g.fillRect(x + ww - b, y, b, hh);
      }
    };
    for (let y = 0; y < h; y += mw) {
      const shift = (Math.round(y / mw) % 2) * (ml / 2);
      for (let x = -shift; x < w; x += ml) mat(x, y, ml, mw, false);
    }
  });
}

function woodTexture(base, line, count) {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = line;
    for (let i = 0; i < count * 6; i++) {
      g.globalAlpha = 0.15 + Math.random() * 0.25;
      g.lineWidth = 1 + Math.random() * 2;
      const y = Math.random() * h;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / 70 + i) * 4);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

function plasterTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = COLOR.plaster;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(120, 85, 45, 0.08)' : 'rgba(255, 240, 210, 0.08)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

function fusumaTexture() {
  return canvasTexture(1024, 600, (g, w, h) => {
    g.fillStyle = '#e8dcc0';
    g.fillRect(0, 0, w, h);
    // 金の雲の模様
    g.fillStyle = 'rgba(214, 170, 70, 0.35)';
    for (const [x, y, r] of [[160, 140, 70], [230, 150, 55], [700, 420, 80], [790, 410, 60], [480, 260, 50]]) {
      g.beginPath();
      g.ellipse(x, y, r * 1.8, r * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    // 襖 4 枚の枠と引き手
    g.strokeStyle = '#2c190f';
    g.lineWidth = 10;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo((w / 4) * i, 0);
      g.lineTo((w / 4) * i, h);
      g.stroke();
    }
    g.strokeRect(0, 0, w, h);
    g.fillStyle = '#2c190f';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc((w / 4) * i + (i % 2 ? 26 : w / 4 - 26), h * 0.5, 8, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function shojiTexture() {
  return canvasTexture(256, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#fffaf0');
    grad.addColorStop(1, '#f1e6d2');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5a3a24';
    g.lineWidth = 4;
    for (let x = 0; x <= w; x += w / 4) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 0; y <= h * 0.82; y += h / 12) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    // 下は腰板
    g.fillStyle = '#5a3a24';
    g.fillRect(0, h * 0.82, w, h * 0.18);
    g.lineWidth = 12;
    g.strokeRect(0, 0, w, h);
  });
}

function gardenTexture() {
  return canvasTexture(1024, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#dfeedc');
    sky.addColorStop(0.6, '#9cc28a');
    sky.addColorStop(1, '#5d8a4c');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    // 竹垣
    g.fillStyle = '#6b5a3c';
    g.fillRect(0, h * 0.55, w, h * 0.3);
    g.strokeStyle = 'rgba(40, 30, 15, 0.5)';
    for (let x = 0; x < w; x += 12) {
      g.beginPath();
      g.moveTo(x, h * 0.55);
      g.lineTo(x, h * 0.85);
      g.stroke();
    }
    // 木の葉（ぼかした丸）
    g.filter = 'blur(6px)';
    for (let i = 0; i < 260; i++) {
      const greens = ['#3f7a3a', '#5c9a45', '#2e5f2c', '#7fb35a'];
      g.fillStyle = greens[i % greens.length];
      g.globalAlpha = 0.55;
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h * 0.65, 14 + Math.random() * 30, 0, Math.PI * 2);
      g.fill();
    }
    g.filter = 'none';
    g.globalAlpha = 1;
    // 苔の地面
    g.fillStyle = '#4f7a3c';
    g.fillRect(0, h * 0.85, w, h * 0.15);
  });
}

// 掛け軸「迎春」
function scrollTexture() {
  return canvasTexture(256, 600, (g, w, h) => {
    g.fillStyle = '#7a5a3a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f5ecd8';
    g.fillRect(24, 50, w - 48, h - 110);
    g.fillStyle = '#1a1210';
    g.font = 'bold 92px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('迎', w / 2, 170);
    g.fillText('春', w / 2, 290);
    g.fillStyle = '#c4161c';
    g.fillRect(w / 2 - 18, 380, 36, 36);
  });
}
