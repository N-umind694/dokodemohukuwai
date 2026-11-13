// 正月の和室（昭和の家）の 3D 背景。箱と板だけで組み、表面には assets/room/ の素材写真を貼る。
// 素材は継ぎ目が出ないよう、畳は 1 畳ずつ、天井は板ごとに描き分け、壁や布は端をなじませた画像を繰り返す。
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
// 部屋の素材写真を読み込む。ページを開いたときに読み込んでおく
const TEXTURE_NAMES = ['tatami', 'wood', 'shoji', 'plaster', 'fence', 'felt', 'outerwall', 'hinabamboo', 'bluecloth'];
export async function loadRoomTextures() {
  const entries = await Promise.all(TEXTURE_NAMES.map(async (name) => {
    const img = new Image();
    img.src = new URL(`../assets/room/${name}.jpg`, import.meta.url).href;
    await img.decode();
    return [name, img];
  }));
  return Object.fromEntries(entries);
}

export function buildRoom(images) {
  const group = new THREE.Group();
  const mats = makeMaterials(images);
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
export function buildHinadan(topY, floorY, frontZ, images) {
  const group = new THREE.Group();
  const feltMap = repeatTexture(images.felt, 4, 4);
  const felt = new THREE.MeshStandardMaterial({ map: feltMap, roughness: 1 });
  const side = new THREE.MeshStandardMaterial({ map: repeatTexture(images.hinabamboo, 2, 2), roughness: 0.9 });
  // 箱の面の順：+x, -x, +y, -y, +z, -z。上と手前は毛氈、横と奥はひな壇の木地
  const faces = [side, side, felt, side, felt, side];
  const steps = 3;
  const rise = (topY - floorY) / steps;
  const back = frontZ - 7; // どの段も奥の端はそろえる
  for (let i = 0; i < steps; i++) {
    const y = topY - rise * i; // その段の上面
    const front = frontZ + i * 3.2;
    const w = 15 + i * 3;
    group.add(box(w, y - floorY, front - back, faces, [0, (y + floorY) / 2, (front + back) / 2]));
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
  // 繰り返す素材は、壁の大きさに合わせて繰り返す回数を決める（同じ素材でも壁ごとに複製する）
  if (material.userData.unit) {
    const m = material.clone();
    m.map = material.map.clone();
    m.map.needsUpdate = true;
    m.map.repeat.set(w / material.userData.unit, h / material.userData.unit);
    material = m;
  }
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

// ---- 素材 ----

function makeMaterials(images) {
  const std = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, ...extra });
  const plaster = std(repeatTexture(images.plaster, 1, 1));
  plaster.userData.unit = 16; // 土壁の写真 1 枚を 16 × 16 の広さに貼る
  const woodMap = srgb(new THREE.Texture(images.wood));
  return {
    tatami: std(tatamiTexture(images.tatami)),
    ceiling: std(ceilingTexture(images.wood)),
    plaster,
    fusuma: std(fusumaTexture(images)),
    shoji: new THREE.MeshBasicMaterial({ map: shojiTexture(images) }),
    garden: new THREE.MeshBasicMaterial({ map: gardenTexture(images) }),
    scroll: std(scrollTexture(), { roughness: 0.8 }),
    wood: std(woodMap, { roughness: 0.7 }),
    woodLight: std(woodMap, { roughness: 0.7, color: 0xc9a080 }),
    table: std(woodMap, { roughness: 0.45 }),
  };
}

function srgb(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// 端をなじませた素材を repeatX × repeatY 回繰り返して貼る
function repeatTexture(image, repeatX, repeatY) {
  const texture = srgb(new THREE.Texture(image));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  return srgb(new THREE.CanvasTexture(canvas));
}

// 畳（縁なし）：半畳の正方形を、目の向きを互い違いにして敷く（市松敷き）。1 畳ずつ写真を 1 枚使うので継ぎ目が出ない
function tatamiTexture(img) {
  return canvasTexture(1536, 1280, (g, w, h) => {
    const s = w / ROOM.w;
    const size = 10.8 * s;
    let k = 0;
    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        g.save();
        g.translate(x + size / 2, y + size / 2);
        if ((Math.round(x / size) + Math.round(y / size)) % 2) g.rotate(Math.PI / 2);
        g.drawImage(img, -size / 2, -size / 2, size, size);
        // 畳ごとにわずかに色が違う
        g.fillStyle = k++ % 3 === 0 ? 'rgba(255, 245, 200, 0.06)' : 'rgba(60, 40, 0, 0.05)';
        g.fillRect(-size / 2, -size / 2, size, size);
        g.restore();
        // 畳と畳の間の細い影
        g.fillStyle = 'rgba(40, 30, 10, 0.35)';
        g.fillRect(x, y, size, 1.5);
        g.fillRect(x, y, 1.5, size);
      }
    }
  });
}

// 天井：木目の写真から帯を切り出して板として並べる。板の継ぎ目が区切りになるので、繰り返しが目立たない
function ceilingTexture(img) {
  return canvasTexture(1536, 1280, (g, w, h) => {
    const plank = 2.4 * (w / ROOM.w);
    for (let y = 0, i = 0; y < h; y += plank, i++) {
      const sy = ((i * 97) % Math.max(1, img.height - 60));
      const flip = i % 2;
      g.save();
      if (flip) {
        g.translate(w, 0);
        g.scale(-1, 1);
      }
      g.drawImage(img, 0, sy, img.width, 60, 0, y, w, plank);
      g.restore();
      g.fillStyle = 'rgba(10, 5, 0, 0.55)';
      g.fillRect(0, y, w, 2);
    }
  });
}

// 襖：青灰色の布張りを 4 枚、黒い縁と引き手
function fusumaTexture(images) {
  return canvasTexture(1536, 900, (g, w, h) => {
    const pattern = g.createPattern(images.bluecloth, 'repeat');
    g.fillStyle = pattern;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1c120c';
    g.lineWidth = 16;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo((w / 4) * i, 0);
      g.lineTo((w / 4) * i, h);
      g.stroke();
    }
    g.strokeRect(0, 0, w, h);
    g.fillStyle = '#1c120c';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.ellipse((w / 4) * i + (i % 2 ? 40 : w / 4 - 40), h * 0.5, 10, 16, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// 障子：格子の写真を格子の線の位置で縦につなぎ、外枠と下の腰板を付ける
function shojiTexture(images) {
  const img = images.shoji;
  return canvasTexture(320, 1024, (g, w, h) => {
    const frame = 14;
    const koshi = h * 0.16;
    const innerW = w - frame * 2;
    const tileH = img.height * (innerW / img.width);
    for (let y = frame; y < h - koshi; y += tileH) g.drawImage(img, frame, y, innerW, tileH);
    g.fillStyle = '#9a6538';
    g.fillRect(0, 0, w, frame);
    g.fillRect(0, 0, frame, h);
    g.fillRect(w - frame, 0, frame, h);
    // 腰板（木目）
    g.drawImage(images.wood, 0, 0, images.wood.width, images.wood.height * 0.3, 0, h - koshi, w, koshi);
    g.fillRect(0, h - koshi - frame / 2, w, frame);
    g.fillRect(0, h - frame, w, frame);
  });
}

// 庭：竹の外柵と外壁を背に、木々の緑と苔の地面
function gardenTexture(images) {
  return canvasTexture(2048, 640, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#e6efe0');
    sky.addColorStop(1, '#9cbf8a');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    // 竹の外柵（横に繰り返す）と、その下の外壁（左右反転しながら並べる）
    const fenceTop = h * 0.32;
    const fenceH = h * 0.4;
    const fw = images.fence.width * (fenceH / images.fence.height);
    for (let x = 0; x < w; x += fw) g.drawImage(images.fence, x, fenceTop, fw, fenceH);
    const wallTop = fenceTop + fenceH;
    const wallH = h * 0.14;
    const ow = images.outerwall.width * (wallH / (images.outerwall.height * 0.4));
    for (let x = 0, i = 0; x < w; x += ow, i++) {
      g.save();
      if (i % 2) {
        g.translate(x * 2 + ow, 0);
        g.scale(-1, 1);
      }
      g.drawImage(images.outerwall, 0, 0, images.outerwall.width, images.outerwall.height * 0.4, x, wallTop, ow, wallH);
      g.restore();
    }
    // 木々の緑（ぼかした葉の重なり）
    g.filter = 'blur(5px)';
    const greens = ['#3f7a3a', '#5c9a45', '#2e5f2c', '#7fb35a'];
    for (let i = 0; i < 320; i++) {
      g.fillStyle = greens[i % greens.length];
      g.globalAlpha = 0.6;
      g.beginPath();
      g.arc((i * 733) % w + Math.sin(i) * 30, ((i * 191) % (h * 0.6)), 14 + (i % 7) * 5, 0, Math.PI * 2);
      g.fill();
    }
    g.filter = 'none';
    g.globalAlpha = 1;
    // 苔の地面
    const moss = g.createLinearGradient(0, h * 0.86, 0, h);
    moss.addColorStop(0, '#5a8442');
    moss.addColorStop(1, '#3d6330');
    g.fillStyle = moss;
    g.fillRect(0, h * 0.86, w, h * 0.14);
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
