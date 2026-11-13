import { PX } from './config.js';

// パーツごとの重み。顔の印象を大きく左右するパーツほど重くする
const WEIGHTS = {
  brow_left: 1,
  brow_right: 1,
  eye_left: 1.2,
  eye_right: 1.2,
  nose: 1.2,
  mouth: 1.2,
  wart: 0.3,
};
// 着地のときにランダムに数 px ずれるので、これ以内 (px) のずれは満点扱いにする
const POSITION_TOLERANCE = 6;
// 許容範囲を超えたずれがこれだけ (px) になると、そのパーツの評価が半分になる
const POSITION_HALF = 22;
// これ以内の回転のずれは満点扱いにする (rad)
const ANGLE_TOLERANCE = (5 * Math.PI) / 180;

// 顔の範囲（layout.json の座標での楕円）。イボがこの外にあれば「顔から外れた」とみなす
const FACE = { cx: 240, cy: 325, rx: 128, ry: 150 };
// イボが顔から外れていても、この点数以上でなければ特殊称号にしない
const SPECIAL_MIN_SCORE = 85;

// 点数の高い順に並べる。min 点以上で最初に当てはまったものを使う。
// コメントの \n は改行位置。1 行は狭い画面にも収まるよう 16 文字くらいまでにする
export const RANKS = [
  { min: 100, title: '福の神', comment: '完ぺき！\n今年はいいことがありそう' },
  { min: 90, title: 'ほぼ本人', comment: '言われなければ\n気づかないレベル' },
  { min: 70, title: 'ちょっと違う人', comment: '惜しい！\nあと少しで元通り' },
  { min: 50, title: 'よく似た他人', comment: 'どこかで見たような\n知らない人' },
  { min: 30, title: '味のある顔', comment: 'これはこれで\n縁起がいいかも' },
  { min: 0, title: '笑う門には福来る', comment: '顔はどこかへ行ったけど\n笑えたなら大成功' },
];
// 使っていない（イボのパーツがあったころの特殊称号）
export const SPECIAL_WART = {
  title: '',
  comment: '',
};

// 回転のずれを 0〜π に直す
function angleError(angle) {
  const a = Math.abs(angle) % (Math.PI * 2);
  return a > Math.PI ? Math.PI * 2 - a : a;
}

// 位置と回転のずれから、パーツ 1 つの評価を 0〜1 で出す
function partAccuracy(distancePx, angle) {
  const d = Math.max(0, distancePx - POSITION_TOLERANCE);
  const a = Math.max(0, angleError(angle) - ANGLE_TOLERANCE);
  const position = 1 / (1 + (d / POSITION_HALF) ** 2);
  const rotation = ((1 + Math.cos(a)) / 2) ** 2;
  return position * rotation;
}

// parts: { key, pos (x, z), home { x, z }, spin } の配列。canvas は layout.json のキャンバスの大きさ
export function evaluate(parts, canvas) {
  let total = 0;
  let weightSum = 0;
  const details = parts.map((part) => {
    const distancePx = Math.hypot(part.pos.x - part.home.x, part.pos.y - part.home.z) / PX;
    const accuracy = partAccuracy(distancePx, part.spin);
    const weight = WEIGHTS[part.key] ?? 1;
    total += accuracy * weight;
    weightSum += weight;
    return { key: part.key, distancePx, accuracy };
  });
  const score = Math.round((total / weightSum) * 100);

  const wart = parts.find((p) => p.key === 'wart');
  if (wart && score >= SPECIAL_MIN_SCORE && !onFace(wart.pos.x / PX + canvas.w / 2, wart.pos.y / PX + canvas.h / 2)) {
    return { score, ...SPECIAL_WART, details };
  }
  const rank = RANKS.find((r) => score >= r.min);
  return { score, title: rank.title, comment: rank.comment, details };
}

function onFace(px, py) {
  return ((px - FACE.cx) / FACE.rx) ** 2 + ((py - FACE.cy) / FACE.ry) ** 2 <= 1;
}
