import * as THREE from '../vendor/three/three.module.min.js';

const deg = THREE.MathUtils.degToRad;

// 完成演出は「正月の朝」（assets/audio/bgm_title.mp3）を、曲がいちばん盛り上がる区間の頭から流し、
// その拍にカットの区切りを合わせる。曲は約 153 BPM で、MUSIC_OFFSET は区間の頭の小節の 1 拍目
export const MUSIC_OFFSET = 93.139; // 演出で流し始める曲の位置 (秒)
export const BEAT = 60 / 153.23; // 1 拍の長さ (秒)

// カットの区切り (秒)。4 拍 / 4 拍 / 4 拍 / 1 拍×3 / 4 拍 で切り替え、着地の 3 拍後に称号を出す
export const CUES = {
  start: 0,
  cut2: BEAT * 4,
  hit: BEAT * 8, // 3 カット目（小節の頭）
  cut4: BEAT * 12, // 部位のカットを畳みかける（1 拍ずつ）
  cut4b: BEAT * 13,
  cut4c: BEAT * 14,
  rise: BEAT * 15, // 真上へ上がり始める
  land: BEAT * 19, // 真上の完成画に着地し、評価を出し始める
  reveal: BEAT * 22, // 称号を出す
  end: BEAT * 23,
};

// カット割り。各カットは at から次のカットの at まで続き、最後のカットは CUES.land で終わる
// （CUES.land からの 6 カット目は結果画面の真上の完成画）。
// focus はパーツの key か 'face'（顔の中心）で、実際に置かれた位置を映す。
// focusTo を書くと、カットの中で注視点がそこへ移る。
// from / to は注視点からの距離 r・真上からの傾き phi・水平方向の角度 theta・画面の傾き roll・画角 fov。
// from / to に tx・tz（注視点の座標）・ty（注視点の高さ）を書くと focus より優先する。
// to に書かなかった値は from のまま。to が 'result' のカットは結果画面のカメラ位置へ降りる。
// 土台を回すとパーツの位置が崩れるので、土台が回って見えるカットもカメラの側を回している
export const SHOTS = [
  // 1: 土台を写真立てのように立て、床すれすれから見上げる。左下の角に寄ったところから、
  //    左から右へ回り込みながら引いて全体を見せる（upright のカットは土台を立て、座標は床の上の座標）
  { at: CUES.start, focus: 'face', upright: true, ease: 'inOut', from: { tx: -1.7, ty: 1.2, tz: 2.8, r: 3.4, phi: deg(100), theta: deg(-22), roll: 0.06, fov: 70 }, to: { tx: 0, ty: 2.6, tz: 2.3, r: 14, phi: deg(98), theta: deg(10), roll: 0, fov: 50 } },
  // 2: 真上から 60° 回りながら、減速しつつ土台へ寄り、画面の上で 10° 傾いた（まっすぐではない）角度で止まる
  { at: CUES.cut2, focus: 'face', ease: 'decel', from: { r: 19, phi: deg(2), theta: deg(-70), fov: 44 }, to: { r: 12.5, phi: deg(4), theta: deg(-10), fov: 42 } },
  // 3: 土台の上の辺の側（おでこ側）から真上を通り、下の辺の側（あご側）へ弧を描いて回り込む。
  //    phi が負の値は上の辺の側から見る向き（画面の上下はそのまま）
  { at: CUES.hit, focus: 'face', ease: 'decel', from: { r: 16, phi: deg(-58), theta: 0, fov: 50 }, to: { r: 13.5, phi: deg(58), theta: 0, fov: 48 } },
  // 4: 部位を順に、ゆっくり寄りながら見せる
  { at: CUES.cut4, focus: 'eye_left', focusTo: 'eye_right', from: { r: 2.6, phi: deg(68), theta: deg(-40), roll: 0.1 }, to: { r: 1.7, theta: deg(-15), roll: 0.02 } },
  { at: CUES.cut4b, focus: 'nose', focusTo: 'mouth', from: { r: 2.6, phi: deg(62), theta: deg(30), roll: -0.1 }, to: { r: 1.6, theta: deg(40), roll: -0.02 } },
  { at: CUES.cut4c, focus: 'brow_left', focusTo: 'brow_right', from: { r: 1.9, phi: deg(68), theta: deg(-25), roll: 0.08 }, to: { r: 1.0, theta: 0, roll: 0 } },
  // 5: 斜めから真上へ上がり、6 カット目の完成画に着地する
  { at: CUES.rise, focus: 'face', ease: 'inOut', from: { r: 3.2, phi: deg(72), theta: deg(-45) }, to: 'result' },
];

const easings = {
  // ゆっくり動き出し、ゆっくり止まる（なめらかな S 字）
  out: (t) => (1 - Math.cos(Math.PI * t)) / 2,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  // カットの終わりまで動き続けながら、なめらかに減速する
  decel: (t) => 1 - (1 - t) ** 2,
};

// 経過時間 time のカットと、その中での進み具合を返す
export function shotAt(time) {
  let index = 0;
  for (let i = 0; i < SHOTS.length; i++) {
    if (time >= SHOTS[i].at) index = i;
  }
  const shot = SHOTS[index];
  const end = SHOTS[index + 1]?.at ?? CUES.land;
  const t = THREE.MathUtils.clamp((time - shot.at) / (end - shot.at), 0, 1);
  return { index, shot, progress: easings[shot.ease ?? 'out'](t) };
}

// 風に揺れるような、ごくゆっくりした画面の傾き (rad)
export function handheld(time) {
  return Math.sin(time * 0.9) * 0.008 + Math.sin(time * 1.4 + 1) * 0.004;
}

// カットの開始・終了のカメラ位置を、注視点の座標と結果画面のカメラ位置から組み立てる。
// focuses は focus 名 → 座標 (x, z)
export function shotPoses(shot, focuses, resultPose) {
  const focus = focuses[shot.focus];
  const from = { tx: focus.x, tz: focus.z, roll: 0, ...shot.from };
  if (shot.to === 'result') return { from, to: resultPose };
  const target = shot.focusTo ? focuses[shot.focusTo] : { x: from.tx, z: from.tz };
  return { from, to: { ...from, tx: target.x, tz: target.z, ...shot.to } };
}
