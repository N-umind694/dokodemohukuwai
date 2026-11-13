// 結果を共有・保存するための画像（結果カード）を作る。
// 左に完成した顔、右に評価・称号・コメントと、パーツごとに本来の位置とどれだけ合っていたかを並べる
const W = 1200;
const H = 900;
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", system-ui, sans-serif';
const COLORS = {
  bg: '#5c070c',
  bgLight: '#b81d24',
  line: 'rgba(236, 211, 160, 0.38)',
  cream: '#fff8ec',
  creamDim: 'rgba(251, 243, 230, 0.62)',
  gold: '#ffd45c',
  peach: '#ffe2b4',
  barBg: 'rgba(251, 243, 230, 0.12)',
  blind: '#2b0a0d',
};
const LOGO_URL = './assets/ui/logo.png';
// ロゴ画像の範囲（正方形のロゴをそのまま使う）
const LOGO_CROP = { x: 0, y: 0, w: 768, h: 768 };

let logoPromise = null;
function loadLogo() {
  logoPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = LOGO_URL;
  });
  return logoPromise;
}

// face: 完成した顔の canvas。result: 採点結果。rows: [{ label, accuracy }]。blind: 目隠しモードか
export async function createResultCard({ face, result, rows, blind, url }) {
  const [logo] = await Promise.all([loadLogo(), document.fonts?.ready]);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');

  // 背景：左上から光が差すマットな茶色
  const bg = g.createRadialGradient(180, 120, 40, 600, 450, 900);
  bg.addColorStop(0, COLORS.bgLight);
  bg.addColorStop(1, COLORS.bg);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = COLORS.line;
  g.lineWidth = 2;
  g.strokeRect(24, 24, W - 48, H - 48);

  // 見出し：ロゴと、目隠しモードの印
  let headerRight = 60;
  if (logo) {
    const h = 120;
    const w = (LOGO_CROP.w / LOGO_CROP.h) * h;
    g.drawImage(logo, LOGO_CROP.x, LOGO_CROP.y, LOGO_CROP.w, LOGO_CROP.h, 50, 30, w, h);
    headerRight = 54 + w + 24;
  }
  if (blind) {
    g.font = `800 26px ${FONT}`;
    const text = '目隠しモード';
    const w = g.measureText(text).width + 36;
    roundRect(g, headerRight, 70, w, 44, 22);
    g.fillStyle = COLORS.blind;
    g.fill();
    g.fillStyle = COLORS.cream;
    g.textBaseline = 'middle';
    g.fillText(text, headerRight + 18, 93);
  }

  // 左：完成した顔
  const fx = 60;
  const fy = 168;
  const fw = 486;
  const fh = 540;
  g.save();
  g.shadowColor = 'rgba(0, 0, 0, 0.45)';
  g.shadowBlur = 24;
  g.shadowOffsetY = 10;
  g.fillStyle = '#000';
  g.fillRect(fx, fy, fw, fh);
  g.restore();
  g.drawImage(face, fx, fy, fw, fh);
  g.strokeStyle = COLORS.line;
  g.strokeRect(fx - 1, fy - 1, fw + 2, fh + 2);

  // 右：評価・称号・コメント
  const rx = 600;
  const rw = W - 60 - rx;
  g.textBaseline = 'alphabetic';
  g.fillStyle = COLORS.creamDim;
  g.font = `700 24px ${FONT}`;
  g.fillText('評価', rx, 216);
  g.fillStyle = COLORS.cream;
  g.font = `800 92px ${FONT}`;
  const scoreText = String(result.score);
  g.fillText(scoreText, rx + 70, 236);
  const scoreW = g.measureText(scoreText).width;
  g.fillStyle = COLORS.creamDim;
  g.font = `700 30px ${FONT}`;
  g.fillText('点', rx + 70 + scoreW + 10, 236);

  g.fillStyle = COLORS.gold;
  fitText(g, `「${result.title}」`, rx - 14, 312, rw + 14, 900, 54);

  g.fillStyle = COLORS.peach;
  g.font = `700 24px ${FONT}`;
  result.comment.split('\n').forEach((line, i) => {
    fitText(g, line, rx, 360 + i * 36, rw, 700, 24);
  });

  // 右下：パーツごとの一致度
  const ty = 460;
  g.fillStyle = COLORS.creamDim;
  g.font = `700 20px ${FONT}`;
  g.fillText('パーツごとの一致度', rx, ty);
  g.fillStyle = COLORS.line;
  g.fillRect(rx, ty + 12, rw, 1);
  const rowH = 34;
  rows.forEach((row, i) => {
    const y = ty + 46 + i * rowH;
    const pct = Math.round(row.accuracy * 100);
    g.fillStyle = COLORS.cream;
    g.font = `700 22px ${FONT}`;
    g.fillText(row.label, rx, y);
    const bx = rx + 84;
    const bw = rw - 84 - 76;
    roundRect(g, bx, y - 15, bw, 12, 6);
    g.fillStyle = COLORS.barBg;
    g.fill();
    if (pct > 0) {
      roundRect(g, bx, y - 15, Math.max(12, (bw * pct) / 100), 12, 6);
      g.fillStyle = COLORS.gold;
      g.fill();
    }
    g.fillStyle = COLORS.cream;
    g.font = `800 22px ${FONT}`;
    g.textAlign = 'right';
    g.fillText(`${pct}%`, rx + rw, y);
    g.textAlign = 'left';
  });

  return canvas;
}

// 幅 maxWidth に収まるよう文字の大きさを下げて書く
function fitText(g, text, x, y, maxWidth, weight, size) {
  let s = size;
  g.font = `${weight} ${s}px ${FONT}`;
  while (s > 12 && g.measureText(text).width > maxWidth) {
    s -= 1;
    g.font = `${weight} ${s}px ${FONT}`;
  }
  g.fillText(text, x, y);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
