import * as THREE from '../vendor/three/three.module.min.js';
import { buildAssets } from './assets.js';
import { CANVAS, makeSampleFace, makePhotoFace } from './faceAssets.js';
import { layoutToWorld, faceZone, WANDER_MARGIN } from './config.js';
import { Stage, FOV } from './stage.js';
import { Part } from './part.js';
import { TitleShow } from './title.js';
import { renderFace, toPngBlob, imageFileName, saveImage } from './capture.js';
import { createResultCard } from './resultCard.js';
import { loadSettings, saveSettings, canVibrate, vibrate } from './settings.js';
import { Sound } from './audio.js';
import { evaluate, SPECIAL_WART } from './scoring.js';
import { RESULT_VOICES, SPECIAL_RESULT_VOICES } from './voices.js';
import { CUES, SHOTS, MUSIC_OFFSET, shotAt, shotPoses, handheld } from './finale.js';

const deg = THREE.MathUtils.degToRad;

// タイトル画面：斜め上から土台の周りをゆっくり一周する。
// 画像が逆さに見える後ろ側は早めに通り過ぎ、正面付近ではゆっくり回る
const TITLE = {
  tilt: deg(50),
  period: 18, // 一周の秒数
  frontBias: 0.9, // 0 で等速。1 に近いほど正面でゆっくり、後ろ側で速くなる（1 未満）
};
// 「はじめる」を押してから：正面を向く → 真上に降りる
const TO_GAME = { face: 0.6, descend: 0.9 };
// 「タイトルへ」：パーツを消しながら真上から斜めへ戻る
const TO_TITLE = { shrink: 0.3, duration: 1.0 };

// 前のパーツが着地してから次のパーツが出るまで（秒）
const SPAWN_DELAY = 0.25;
// 最後のパーツが止まってから完成演出を始めるまで（秒）。この間に BGM をフェードアウトする
const FINALE_DELAY = 1.0;
// 結果画面で点数を数え上げる時間（秒）。完成演出から続くときは SE の締めの一打に合わせる
const COUNT_UP_TIME = 0.8;
// 保存用の画像を作り始めるまで（秒）。作る間は画面が一瞬止まるので、称号が出たあとにする
const CAPTURE_DELAY = 1.0;
// 保存画像の倍率（layout.json の 540×600 に対して）
const SAVE_SCALE = 2;
// 落とした指をそのまま横に払うと回転がかかる
const SWIPE = {
  minDistance: 24, // これより短い横移動は回転させない (CSS px)
  sampleMs: 100, // 指を離す直前のこの時間の動きから払う速さを測る
  gain: 3, // 払う速さ（画面の短辺/秒）を回転速度 (rad/s) に変換する倍率
};

// 完成画の拡大表示
const VIEWER = {
  ease: 0.4, // 開く・閉じるときにカメラが移る時間（秒）
  margin: 16, // 土台のまわりに空ける幅 (CSS px)
  hintSpace: 64, // 上下に空ける幅。下の操作の案内と重ならないようにする (CSS px)
  tilt: 0.006, // 1px 払ったときに傾ける角度 (rad)
  maxTilt: 1.1, // 真上から上下・左右にどこまで傾けるか (rad)
  minZoom: 0.4,
  maxZoom: 1.3,
  tapSlop: 8, // これより動かなければタップとみなして閉じる (CSS px)
};

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $('stage'),
  grade: $('grade'),
  veil: $('veil'),
  sheen: $('sheen'),
  flash: $('flash'),
  hud: $('hud'),
  hudCount: $('hud-count'),
  hudTotal: $('hud-total'),
  hudDots: $('hud-dots'),
  hudName: $('hud-name'),
  hint: $('hint'),
  title: $('title-screen'),
  titleActions: $('title-actions'),
  modeSelect: $('mode-select'),
  modeNormal: $('mode-normal'),
  modeBlind: $('mode-blind'),
  modeBack: $('mode-back'),
  start: $('start-btn'),
  photo: $('photo-btn'),
  photoInput: $('photo-input'),
  photoStatus: $('photo-status'),
  noPhoto: $('no-photo'),
  noPhotoChoose: $('no-photo-choose'),
  noPhotoPlay: $('no-photo-play'),
  privacy: $('privacy'),
  privacyAgree: $('privacy-agree'),
  privacyBack: $('privacy-back'),
  settingsBtn: $('settings-btn'),
  result: $('result-screen'),
  resultBand: $('result-band'),
  resultPoints: $('result-points'),
  resultRank: $('result-rank'),
  resultComment: $('result-comment'),
  resultWindow: $('result-window'),
  resultParts: $('result-parts'),
  resultActions: $('result-actions'),
  resultMode: $('result-mode'),
  saveChoice: $('save-choice'),
  saveCard: $('save-card'),
  saveFace: $('save-face'),
  saveBack: $('save-back'),
  save: $('save-btn'),
  saveLabel: $('save-label'),
  retry: $('retry-btn'),
  toTitle: $('to-title-btn'),
  pause: $('pause'),
  pauseBtn: $('pause-btn'),
  pauseResume: $('pause-resume'),
  pauseRetry: $('pause-retry'),
  pauseTitle: $('pause-title'),
  settings: $('settings'),
  settingsClose: $('settings-close'),
  vibrationRow: $('vibration-row'),
  viewer: $('viewer'),
};

const settings = loadSettings();
let mode = 'normal'; // normal | blind
let faceImage = null; // 顔だけの画像
const sound = new Sound(settings);

let stage;
let parts = [];
let titleShow;
let face;
let phase = 'loading'; // loading | title | toGame | playing | finale | result | toTitle
let titleTime = 0;
let transition = null;
let current = -1;
let spawnTimer = -1;
let finaleDelay = -1;
let finale = null; // { time, audioStart, shot, focus, resultPose, frozen }
let scoreAnim = null; // { time, duration, score, shown, revealed, quiet }
let savedImage = null;
let captureToken = 0;
let lastTime = 0;
let swipe = null; // 落とした指の軌跡 { id, part, points: [{ x, y, t }] }
let paused = false; // プレイ中の一時停止
let photoFaceReady = false; // 選んだ画像の顔で遊べる状態か
let viewer = null; // 完成画の拡大表示 { phi, lean, zoom, time, from, closing, pointers, moved, pinch }

// 土台とパーツを、与えた素材で作る（2 回目からは前のものを取り除いて作り直す）
function setupFace(assets) {
  if (parts.length) {
    for (const part of parts) stage.world.remove(part.group, part.shadow);
    titleShow.dispose(stage.world);
  }
  stage.setBoard(assets.baseTexture);
  face = faceZone(assets.canvas, assets.parts, WANDER_MARGIN);
  stage.ctx.wanderZone = face;
  parts = assets.parts.map((def, i) => {
    const home = layoutToWorld(assets.canvas, def.x + def.w / 2, def.y + def.h / 2);
    const part = new Part(def, i, home);
    stage.world.add(part.group, part.shadow);
    return part;
  });
  titleShow = new TitleShow(stage.world, assets.parts, stage.boardW / 2, stage.boardD / 2, sound);
  stage.applySpotlight();
  ui.hudTotal.textContent = parts.length;
  ui.hudDots.replaceChildren(...parts.map(() => document.createElement('i')));
}

async function init() {
  stage = new Stage(ui.canvas, CANVAS);
  setupFace(buildAssets(makeSampleFace()));

  stage.resize();
  window.addEventListener('resize', () => {
    stage.resize();
    if (phase === 'result' && !viewer) fitResultCamera();
    // 演出中に画面の大きさが変わったら（アプリ内ブラウザの高さが変わるなど）、降りる先の完成画の位置を測り直す
    if (phase === 'finale') finale.resultPose = measureResultPose(finale.result);
  });
  ui.canvas.addEventListener('pointerdown', onPointerDown);
  ui.canvas.addEventListener('pointermove', onPointerMove);
  ui.canvas.addEventListener('pointerup', onPointerUp);
  ui.canvas.addEventListener('pointercancel', () => {
    swipe = null;
  });
  // 長押しのメニュー・文字選択・画像のドラッグ・ピンチでの拡大を止める
  for (const type of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart']) {
    document.addEventListener(type, (e) => e.preventDefault());
  }
  // ブラウザは画面に触れるまで音を鳴らさせないので、最初に触れたときに音を使えるようにする。
  // タイトル画面の BGM もそこから流れ始める
  for (const type of ['pointerup', 'click', 'keydown']) {
    window.addEventListener(type, () => sound.unlock(), { capture: true });
  }
  ui.start.addEventListener('click', onStart);
  ui.photo.addEventListener('click', () => {
    if (phase !== 'title') return;
    sound.unlock();
    sound.play('tap');
    ui.privacy.hidden = false;
  });
  // 画像の取り扱いに同意したら、画像を選ぶ画面を開く（押した流れのまま開かないと、スマホで開けないことがある）
  ui.privacyAgree.addEventListener('click', () => {
    sound.play('tap');
    ui.privacy.hidden = true;
    ui.photoInput.click();
  });
  ui.privacyBack.addEventListener('click', () => {
    sound.play('tap');
    ui.privacy.hidden = true;
  });
  ui.noPhotoChoose.addEventListener('click', () => {
    sound.play('tap');
    ui.noPhoto.hidden = true;
    ui.privacy.hidden = false;
  });
  ui.noPhotoPlay.addEventListener('click', () => {
    sound.play('tap');
    ui.noPhoto.hidden = true;
    openModeSelect();
  });
  ui.photoInput.addEventListener('change', onPhotoChosen);
  ui.modeNormal.addEventListener('click', () => chooseMode('normal'));
  ui.modeBlind.addEventListener('click', () => chooseMode('blind'));
  ui.modeBack.addEventListener('click', closeModeSelect);
  ui.saveCard.addEventListener('click', () => saveChosen(savedImage, ''));
  ui.saveFace.addEventListener('click', () => saveChosen(faceImage, '-face'));
  ui.saveBack.addEventListener('click', () => {
    sound.play('tap');
    showSaveChoice(false);
  });
  ui.resultWindow.addEventListener('click', openViewer);
  ui.viewer.addEventListener('pointerdown', onViewerDown);
  ui.viewer.addEventListener('pointermove', onViewerMove);
  ui.viewer.addEventListener('pointerup', onViewerUp);
  ui.viewer.addEventListener('pointercancel', onViewerUp);
  ui.viewer.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (viewer && !viewer.closing) viewer.zoom = clampZoom(viewer.zoom * Math.exp(e.deltaY * 0.001));
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeViewer();
    if (paused) closePause();
    else openPause();
  });
  ui.settingsBtn.addEventListener('click', openSettings);
  ui.settingsClose.addEventListener('click', closeSettings);
  ui.settings.addEventListener('click', (e) => {
    if (e.target === ui.settings) closeSettings();
  });
  for (const input of ui.settings.querySelectorAll('input[data-key]')) {
    input.addEventListener('change', () => onSettingChange(input));
  }
  ui.retry.addEventListener('click', () => {
    sound.play('tap');
    startGame();
  });
  ui.toTitle.addEventListener('click', onToTitle);
  ui.pauseBtn.addEventListener('click', () => openPause());
  ui.pauseResume.addEventListener('click', closePause);
  ui.pauseRetry.addEventListener('click', () => {
    closePause();
    startGame();
  });
  ui.pauseTitle.addEventListener('click', () => {
    closePause({ quiet: true });
    onToTitle();
  });
  // プレイ中にほかのアプリやタブへ移ったら、一時停止しておく
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) openPause({ quiet: true });
  });
  ui.save.addEventListener('click', onSave);

  // ?debug=layout で全パーツを layout.json の元の位置に並べて結果を出す（座標確認用）。
  // ?debug=finale で同じ並びから完成演出を流す。&at=秒 を付けるとその時刻で止める
  const params = new URLSearchParams(location.search);
  const debug = params.get('debug');
  if (debug === 'layout' || debug === 'finale') {
    parts.forEach((p, i) => p.placeHome(stage.ctx, parts.slice(0, i)));
    ui.title.hidden = true;
    if (debug === 'layout') {
      enterResult();
    } else {
      current = parts.length - 1;
      startFinale();
      if (params.has('at')) finale.frozen = Number(params.get('at'));
    }
  } else {
    enterTitle();
    ui.start.disabled = false;
    ui.start.textContent = 'はじめる';
  }

  requestAnimationFrame((t) => {
    lastTime = t;
    requestAnimationFrame(tick);
  });
}

// ---- タイトル ----

// 経過時間から一周の中の角度を求める。角度 θ までにかかる時間を
// (θ + b·sinθ) / 2π とし（b = frontBias）、これを θ について二分法で解く
function orbitTheta(time) {
  const target = 2 * Math.PI * ((time / TITLE.period) % 1);
  let lo = 0;
  let hi = 2 * Math.PI;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (mid + TITLE.frontBias * Math.sin(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function titlePose(theta) {
  return { tx: 0, tz: 0, r: stage.titleDistance, phi: TITLE.tilt, theta };
}

function enterTitle() {
  phase = 'title';
  sound.wantBgm('title');
  titleTime = 0;
  stage.pose = titlePose(0);
  titleShow.start();
  ui.title.hidden = false;
  ui.title.classList.remove('leaving');
}

function updateTitle(dt) {
  titleTime += dt;
  stage.pose = titlePose(orbitTheta(titleTime));
  titleShow.update(dt);
}

// 選んだ画像から顔を切り出して、土台とパーツを作り直す
async function onPhotoChosen() {
  const file = ui.photoInput.files?.[0];
  ui.photoInput.value = '';
  if (!file || phase !== 'title') return;
  ui.start.disabled = true;
  ui.photo.disabled = true;
  setPhotoStatus('顔をさがしています…');
  try {
    const photoFace = await makePhotoFace(file);
    if (phase !== 'title') return;
    setupFace(buildAssets(photoFace));
    titleShow.start();
    photoFaceReady = true;
    setPhotoStatus('選んだ画像の顔で遊べます');
  } catch (err) {
    console.error(err);
    setPhotoStatus(err.message === 'no-face'
      ? '顔が見つかりませんでした。正面を向いた明るい画像を選んでください'
      : '画像を読み込めませんでした', true);
  } finally {
    ui.start.disabled = false;
    ui.photo.disabled = false;
  }
}

function setPhotoStatus(text, error = false) {
  ui.photoStatus.textContent = text;
  ui.photoStatus.classList.toggle('error', error);
}

// 通常モードと目隠しモードのどちらで遊ぶか、先に選ばせる
// 顔の画像をまだ選んでいなければ、先にそのことを知らせる
function onStart() {
  if (phase !== 'title') return;
  sound.unlock();
  if (!photoFaceReady) {
    sound.play('tap');
    ui.noPhoto.hidden = false;
    return;
  }
  openModeSelect();
}

function openModeSelect() {
  ui.titleActions.hidden = true;
  ui.modeSelect.hidden = false;
}

function chooseMode(selected) {
  if (phase !== 'title') return;
  sound.play('tap');
  beginGame(selected);
}

function closeModeSelect() {
  sound.play('tap');
  ui.modeSelect.hidden = true;
  ui.titleActions.hidden = false;
}

function beginGame(selected) {
  mode = selected;
  const theta = orbitTheta(titleTime);
  // 近いほうの正面（0 か 2π）へ向き直る
  transition = { time: 0, from: theta, to: theta > Math.PI ? 2 * Math.PI : 0 };
  phase = 'toGame';
  ui.title.classList.add('leaving');
  titleShow.blowAway();
}

function updateToGame(dt) {
  transition.time += dt;
  titleShow.update(dt);
  const { time, from, to } = transition;
  if (time < TO_GAME.face) {
    stage.pose = titlePose(THREE.MathUtils.lerp(from, to, easeInOut(time / TO_GAME.face)));
    return;
  }
  const t = time - TO_GAME.face;
  if (t < TO_GAME.descend) {
    stage.pose = lerpPose(titlePose(to), { ...stage.playPose, theta: to }, easeInOut(t / TO_GAME.descend));
    return;
  }
  titleShow.hide();
  ui.title.hidden = true;
  ui.modeSelect.hidden = true;
  ui.titleActions.hidden = false;
  startGame();
}

function onToTitle() {
  if (phase !== 'result' && phase !== 'playing') return;
  sound.play('tap');
  captureToken += 1;
  resetViewer();
  ui.result.hidden = true;
  // プレイの途中（一時停止から）で戻るときは、HUD と目隠しを片付ける
  ui.hud.hidden = true;
  ui.hint.hidden = true;
  swipe = null;
  stage.board.visible = true;
  document.body.classList.remove('blind');
  transition = { time: 0, from: stage.pose ?? stage.playPose };
  phase = 'toTitle';
}

function updateToTitle(dt) {
  transition.time += dt;
  const { time } = transition;
  const s = Math.max(0, 1 - time / TO_TITLE.shrink);
  for (const part of parts) {
    if (s > 0) part.group.scale.setScalar(s);
    else part.reset();
  }
  if (time < TO_TITLE.duration) {
    stage.pose = lerpPose(transition.from, titlePose(0), easeInOut(time / TO_TITLE.duration));
    return;
  }
  enterTitle();
}

// ---- 一時停止 ----

function openPause({ quiet = false } = {}) {
  if (phase !== 'playing' || paused) return;
  if (!quiet) sound.play('tap');
  paused = true;
  swipe = null;
  ui.pause.hidden = false;
}

function closePause({ quiet = false } = {}) {
  if (!paused) return;
  if (!quiet) sound.play('tap');
  paused = false;
  ui.pause.hidden = true;
}

// ---- 設定 ----

function openSettings() {
  sound.unlock();
  sound.play('tap');
  for (const input of ui.settings.querySelectorAll('input[data-key]')) {
    input.checked = settings[input.dataset.key];
  }
  ui.vibrationRow.hidden = !canVibrate;
  ui.settings.hidden = false;
}

function closeSettings() {
  sound.play('tap');
  ui.settings.hidden = true;
}

function onSettingChange(input) {
  settings[input.dataset.key] = input.checked;
  saveSettings(settings);
  if (input.dataset.key === 'bgm') sound.updateBgm();
  if (input.dataset.key === 'vibration') vibrate(settings, 20);
  sound.play('tap');
}

// ---- プレイ ----

function startGame() {
  resetViewer();
  parts.forEach((p) => p.reset());
  current = -1;
  spawnTimer = -1;
  finaleDelay = -1;
  savedImage = null;
  captureToken += 1;
  stage.pose = null;
  ui.result.hidden = true;
  ui.hud.hidden = false;
  ui.hint.hidden = false;
  const blind = mode === 'blind';
  ui.hint.textContent = settings.swipe ? 'タップで落とす / スワイプで回転をかける' : 'タップで落とす';
  // 目隠しモードでは、持っているパーツ以外（土台と置いたパーツ）を完成演出まで見せない
  stage.board.visible = !blind;
  document.body.classList.toggle('blind', blind);
  ui.resultMode.hidden = !blind;
  // プレイ中は「正月の激しい鼓動」に切り替える（流れていればそのまま続ける）
  sound.wantBgm('play');
  phase = 'playing';
  spawnNext();
}

function spawnNext() {
  current += 1;
  const part = parts[current];
  part.spawn(stage.ctx);
  sound.playRandomVoice();
  ui.hudCount.textContent = current + 1;
  [...ui.hudDots.children].forEach((dot, i) => {
    dot.classList.toggle('done', i < current);
    dot.classList.toggle('now', i === current);
  });
  ui.hudName.textContent = part.label;
}

// 触れた瞬間に落とす。タイミングがずれないよう、回転は指を離したときに後から加える
function onPointerDown(event) {
  event.preventDefault();
  if (phase === 'playing') {
    const part = parts[current];
    if (part?.drop()) {
      sound.play('drop');
      // 目隠しモードでは、落とした瞬間から完成演出までパーツを見せない
      if (mode === 'blind') part.conceal();
      if (settings.swipe) {
        swipe = { id: event.pointerId, part, points: [pointOf(event)] };
        ui.canvas.setPointerCapture(event.pointerId);
      }
    }
  } else if (phase === 'finale') {
    skipFinale();
  }
}

function onPointerMove(event) {
  if (swipe?.id === event.pointerId) swipe.points.push(pointOf(event));
}

function onPointerUp(event) {
  if (swipe?.id !== event.pointerId) return;
  const { part, points } = swipe;
  swipe = null;
  points.push(pointOf(event));

  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  if (Math.abs(dx) < SWIPE.minDistance) return;

  // 離す直前の速さと全体の平均の速さのうち、大きいほうを使う
  const recent = points.find((p) => last.t - p.t <= SWIPE.sampleMs) ?? first;
  const recentSpeed = Math.abs(last.x - recent.x) / Math.max(last.t - recent.t, 16);
  const averageSpeed = Math.abs(dx) / Math.max(last.t - first.t, 16);
  const screen = Math.min(window.innerWidth, window.innerHeight);
  const speed = (Math.max(recentSpeed, averageSpeed) * 1000) / screen;
  // 右に払うと時計回り（回転角は反時計回りが正）
  part.addSpin(-Math.sign(dx) * speed * SWIPE.gain);
  sound.play('swish', Math.min(speed / 4, 1));
}

function pointOf(event) {
  return { x: event.clientX, y: event.clientY, t: event.timeStamp };
}

function updatePlay(dt) {
  parts.forEach((part, i) => {
    const firstLanding = part.update(dt, stage.ctx, parts.slice(0, i));
    if (firstLanding) {
      if (mode !== 'blind') {
        stage.spawnImpact(part.group.position.x, part.y, part.group.position.z, Math.max(part.halfW, part.halfD) * 1.1);
      }
      stage.shake();
      sound.playLandVoice();
      vibrate(settings, 15);
      if (i === current && current < parts.length - 1) spawnTimer = SPAWN_DELAY;
    }
  });

  if (spawnTimer >= 0) {
    spawnTimer -= dt;
    if (spawnTimer < 0) spawnNext();
  }

  const done = current === parts.length - 1 && parts.every((p) => p.isResting());
  if (done) {
    if (finaleDelay < 0) {
      finaleDelay = FINALE_DELAY;
      sound.stopBgm(FINALE_DELAY);
    }
    finaleDelay -= dt;
    if (finaleDelay <= 0) startFinale();
  }
}

// ---- 完成演出と結果 ----

// 完成 SE の拍に合わせてカメラを切り替え、最後は真上の完成画に降りて評価を出す
function startFinale() {
  phase = 'finale';
  // 目隠しモードで隠していた土台とパーツをここで見せる
  stage.board.visible = true;
  document.body.classList.remove('blind');
  for (const part of parts) part.reveal();
  ui.hud.hidden = true;
  ui.hint.textContent = 'タップでスキップ';
  ui.result.hidden = true;
  document.body.classList.add('cinema');
  sound.stopVoice();

  const focus = { face: { x: face.centerX, z: face.centerZ } };
  for (const part of parts) focus[part.key] = { x: part.pos.x, z: part.pos.y };
  // パーツはもう止まっているので、ここで採点しておく
  const result = evaluate(parts, stage.canvasSize);
  finale = {
    time: 0,
    // 「正月の朝」を盛り上がる区間の頭から流し、その再生位置を演出の時計にする
    audioStart: sound.playBgm('title', MUSIC_OFFSET),
    shot: -1,
    focus,
    result,
    resultPose: measureResultPose(result),
    frozen: null,
  };
}

// 曲が鳴っていれば曲の再生位置を、鳴っていなければ経過時間を演出の時計にする。
// タブを裏に回して音が止まっている間は、曲の再生位置のまま止める
function finaleClock(dt) {
  if (finale.frozen !== null) return finale.frozen;
  if (finale.audioStart !== null) {
    return sound.ctx.currentTime - finale.audioStart;
  }
  finale.time += dt;
  return finale.time;
}

function updateFinale(dt) {
  const time = finaleClock(dt);
  if (time >= CUES.land) {
    enterResult({ synced: true, result: finale.result });
    return;
  }
  const { index, shot, progress } = shotAt(Math.max(time, 0));
  const { from, to } = shotPoses(shot, finale.focus, finale.resultPose);
  if (index !== finale.shot) {
    finale.shot = index;
    stage.setUpright(Boolean(shot.upright));
    // カットの切り替わりは、暗がりから静かに明けるように溶け込ませる
    if (index > 0) playFx(ui.veil, { time: 0.7, flash: 0.6 });
  }
  const pose = lerpPose(from, to, progress);
  // 風に揺れるようなごくゆっくりした傾き。完成画に降りる最後のカットでは、降りきるまでに収める
  const last = index === SHOTS.length - 1;
  pose.roll += handheld(time) * (last ? 1 - progress : 1);
  pose.upright = Boolean(shot.upright);
  stage.pose = pose;
  // カメラが狙っている所を照らす。寄るほど光を小さくする
  const center = stage.toBoard(pose.tx, pose.ty, pose.tz);
  stage.setSpotlight(true, center, pose.r * 0.4 + 0.3);
}

// 閃光・暗がりの幕を最初から再生する。time は長さ（秒）、flash は始まりの濃さ
function playFx(el, { time, flash } = {}) {
  el.classList.remove('on');
  void el.offsetWidth;
  el.style.setProperty('--fx-time', `${time}s`);
  if (flash != null) el.style.setProperty('--fx-flash', flash);
  el.classList.add('on');
}

function skipFinale() {
  enterResult({ result: finale.result });
}

function lerpPose(a, b, t) {
  const lerp = THREE.MathUtils.lerp;
  return {
    tx: lerp(a.tx, b.tx, t),
    tz: lerp(a.tz, b.tz, t),
    r: lerp(a.r, b.r, t),
    phi: lerp(a.phi, b.phi, t),
    theta: lerp(a.theta, b.theta, t),
    lean: lerp(a.lean ?? 0, b.lean ?? 0, t),
    ty: lerp(a.ty ?? 0, b.ty ?? 0, t),
    roll: lerp(a.roll ?? 0, b.roll ?? 0, t),
    fov: lerp(a.fov ?? FOV, b.fov ?? FOV, t),
  };
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// 真上から完成品を見せ、評価と保存・リトライを出す。
// synced のときは曲の拍で称号が出るように数え上げの長さを合わせ、数え上げの音は鳴らさない
async function enterResult({ synced = false, result = evaluate(parts, stage.canvasSize) } = {}) {
  phase = 'result';
  // 評価の画面では、完成演出から流れている「正月の朝」をそのまま続ける
  sound.wantBgm('title');
  stage.setSpotlight(false);
  stage.setUpright(false);
  ui.canvas.classList.remove('punch', 'cut');
  document.body.classList.remove('cinema');
  ui.canvas.classList.remove('mono');
  ui.grade.style.opacity = '';
  if (synced) {
    // 完成画に着地した瞬間、光の筋を一度だけゆっくり走らせる
    ui.sheen.classList.remove('on');
    void ui.sheen.offsetWidth;
    ui.sheen.classList.add('on');
  }
  ui.hint.hidden = true;
  ui.hud.hidden = true;
  ui.result.hidden = false;
  showScore(result, synced ? CUES.reveal - CUES.land : COUNT_UP_TIME, synced);
  ui.resultActions.hidden = false;
  fitResultCamera();

  // ポストは文だけ（画像は「画像を保存」で保存してから各自で付けてもらう）なので、すぐ押せる
  const url = location.origin + location.pathname;
  // 共有シートはタップ直後でないと開けない端末があるため、保存する画像は先に作っておく
  savedImage = null;
  faceImage = null;
  showSaveChoice(false);
  ui.save.disabled = true;
  ui.saveLabel.textContent = '準備中…';
  const token = ++captureToken;
  await new Promise((resolve) => setTimeout(resolve, CAPTURE_DELAY * 1000));
  if (token !== captureToken) return;
  try {
    const face = renderFace(stage, SAVE_SCALE);
    const rows = result.details.map((d) => ({ label: parts.find((p) => p.key === d.key).label, accuracy: d.accuracy }));
    const card = await createResultCard({ face, result, rows, blind: mode === 'blind', url });
    const [blob, faceBlob] = await Promise.all([toPngBlob(card), toPngBlob(face)]);
    if (token !== captureToken) return;
    savedImage = blob;
    faceImage = faceBlob;
    ui.save.disabled = false;
    ui.saveLabel.textContent = '画像を保存';
  } catch (err) {
    console.error(err);
    if (token === captureToken) ui.saveLabel.textContent = '保存できません';
  }
}

// スマホでは共有シートで結果カードと文をまとめて渡す（X を選べばそのまま画像付きでポストできる）。
// 画像を渡せない環境では、X の投稿画面を文だけで開く
function showScore(result, duration, quiet) {
  ui.resultBand.hidden = false;
  ui.resultBand.classList.remove('revealed');
  ui.resultPoints.textContent = '0';
  ui.resultRank.textContent = `「${result.title}」`;
  setLines(ui.resultComment, result.comment);
  ui.resultParts.replaceChildren(...result.details.map((d) => {
    const pct = Math.round(d.accuracy * 100);
    const li = document.createElement('li');
    li.innerHTML = '<span class="name"></span><span class="bar"><i></i></span><span class="pct"></span>';
    li.querySelector('.name').textContent = parts.find((p) => p.key === d.key).label;
    li.querySelector('.bar i').style.setProperty('--p', `${pct}%`);
    li.querySelector('.pct').textContent = `${pct}%`;
    return li;
  }));
  scoreAnim = { time: 0, duration, score: result.score, result, shown: 0, revealed: false, quiet };
}

// コメントは決めておいた位置（\n）でだけ改行する
function setLines(el, text) {
  el.replaceChildren(...text.split('\n').map((line) => {
    const span = document.createElement('span');
    span.className = 'line';
    span.textContent = line;
    return span;
  }));
}

function updateResult(dt) {
  if (!scoreAnim || scoreAnim.revealed) return;
  scoreAnim.time += dt;
  const t = Math.min(scoreAnim.time / scoreAnim.duration, 1);
  const shown = Math.round(scoreAnim.score * (1 - (1 - t) ** 3));
  if (shown !== scoreAnim.shown) {
    scoreAnim.shown = shown;
    ui.resultPoints.textContent = String(shown);
    if (!scoreAnim.quiet) sound.play('count');
  }
  if (t >= 1) {
    scoreAnim.revealed = true;
    ui.resultBand.classList.add('revealed');
    if (!scoreAnim.quiet) sound.play('rank');
    // 点数と称号が出たら、点数に合った台詞からランダムに 1 つ鳴らす
    playResultVoice(scoreAnim.result);
  }
}

function playResultVoice(result) {
  if (result.title === SPECIAL_WART.title) {
    sound.playVoiceFrom('result-special', SPECIAL_RESULT_VOICES);
    return;
  }
  const group = RESULT_VOICES.find((g) => result.score >= g.min);
  sound.playVoiceFrom(`result-${group.min}`, group.files);
}

// シートの窓に完成画がちょうど収まるようにカメラを置く
function fitResultCamera() {
  stage.pose = stage.framePose(ui.resultWindow.getBoundingClientRect());
}

// ---- 完成画の拡大表示 ----

function openViewer() {
  if (phase !== 'result' || viewer) return;
  sound.play('tap');
  viewer = { phi: 0, lean: 0, zoom: 1, time: 0, from: stage.pose, closing: false, pointers: new Map(), moved: 0, pinch: null };
  ui.result.hidden = true;
  ui.viewer.hidden = false;
}

function closeViewer() {
  if (!viewer || viewer.closing) return;
  sound.play('tap');
  viewer.from = viewerPose();
  viewer.closing = true;
  viewer.time = 0;
  ui.viewer.hidden = true;
  ui.result.hidden = false;
}

// 閉じる途中でほかの画面に移るときは、拡大表示の状態を捨てる
function resetViewer() {
  viewer = null;
  ui.viewer.hidden = true;
}

// 土台が画面いっぱい（上下は操作の案内のぶん空ける）に収まる真上の位置から、上下・左右の傾きと寄り引きを加えたカメラ位置
function viewerPose() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const m = VIEWER.margin;
  const base = stage.framePose({ left: m, right: w - m, top: VIEWER.hintSpace, bottom: h - VIEWER.hintSpace });
  return { tx: 0, tz: 0, r: base.r * viewer.zoom, phi: viewer.phi, theta: 0, lean: viewer.lean };
}

function updateViewer(dt) {
  viewer.time += dt;
  const t = easeInOut(Math.min(viewer.time / VIEWER.ease, 1));
  if (viewer.closing) {
    fitResultCamera();
    stage.pose = lerpPose(viewer.from, stage.pose, t);
    if (t >= 1) viewer = null;
    return;
  }
  stage.pose = lerpPose(viewer.from, viewerPose(), t);
}

function clampZoom(zoom) {
  return THREE.MathUtils.clamp(zoom, VIEWER.minZoom, VIEWER.maxZoom);
}

function pinchDistance() {
  const [a, b] = [...viewer.pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function onViewerDown(event) {
  if (!viewer || viewer.closing) return;
  ui.viewer.setPointerCapture(event.pointerId);
  viewer.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (viewer.pointers.size === 1) viewer.moved = 0;
  if (viewer.pointers.size === 2) viewer.pinch = { distance: pinchDistance(), zoom: viewer.zoom };
}

function onViewerMove(event) {
  const prev = viewer?.pointers.get(event.pointerId);
  if (!prev || viewer.closing) return;
  const dx = event.clientX - prev.x;
  const dy = event.clientY - prev.y;
  prev.x = event.clientX;
  prev.y = event.clientY;
  viewer.moved += Math.abs(dx) + Math.abs(dy);
  if (viewer.pointers.size >= 2 && viewer.pinch) {
    // 2 本指は寄り引きだけ。指を広げると寄る
    viewer.zoom = clampZoom(viewer.pinch.zoom * viewer.pinch.distance / Math.max(pinchDistance(), 1));
    viewer.moved += VIEWER.tapSlop;
  } else {
    // 土台をつかんで倒すように動かす。下に払うと上の辺が手前に来て上側から、右に払うと左側から見る
    const max = VIEWER.maxTilt;
    viewer.phi = THREE.MathUtils.clamp(viewer.phi - dy * VIEWER.tilt, -max, max);
    viewer.lean = THREE.MathUtils.clamp(viewer.lean - dx * VIEWER.tilt, -max, max);
  }
}

function onViewerUp(event) {
  if (!viewer?.pointers.has(event.pointerId)) return;
  viewer.pointers.delete(event.pointerId);
  if (viewer.pointers.size < 2) viewer.pinch = null;
  // 指を動かさずに離したら閉じる
  if (viewer.pointers.size === 0 && event.type === 'pointerup' && viewer.moved < VIEWER.tapSlop) closeViewer();
}

// 完成演出の最後に降りる先として、結果画面のカメラ位置を先に測っておく。
// 評価のカードを見えないまま一瞬だけ配置して測り、すぐ隠す
function measureResultPose(result) {
  const before = stage.pose;
  ui.result.style.visibility = 'hidden';
  ui.result.hidden = false;
  ui.resultBand.hidden = false;
  ui.resultActions.hidden = false;
  showScore(result, COUNT_UP_TIME, true);
  fitResultCamera();
  const pose = stage.pose;
  ui.result.hidden = true;
  ui.result.style.visibility = '';
  scoreAnim = null;
  stage.pose = before;
  return pose;
}

// 「画像を保存」は、結果カードと顔だけの画像のどちらを保存するか選ばせる
function onSave() {
  if (!savedImage) return;
  sound.play('tap');
  showSaveChoice(true);
}

function showSaveChoice(on) {
  ui.saveChoice.hidden = !on;
  ui.resultActions.hidden = on;
}

function saveChosen(blob, suffix) {
  if (!blob) return;
  sound.play('tap');
  showSaveChoice(false);
  saveImage(blob, imageFileName().replace('.png', `${suffix}.png`));
}

function tick(time) {
  // タブ復帰時などに大きく飛ばないよう上限を設ける
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  // 一時停止中は止まった画を描き続けるだけにする
  if (paused) {
    stage.render();
    requestAnimationFrame(tick);
    return;
  }
  switch (phase) {
    case 'title':
      updateTitle(dt);
      break;
    case 'toGame':
      updateToGame(dt);
      break;
    case 'playing':
      updatePlay(dt);
      break;
    case 'finale':
      updateFinale(dt);
      break;
    case 'result':
      updateResult(dt);
      if (viewer) updateViewer(dt);
      break;
    case 'toTitle':
      updateToTitle(dt);
      break;
  }
  stage.update(dt);
  stage.render();
  requestAnimationFrame(tick);
}

init();
