import * as THREE from '../vendor/three/three.module.min.js';

const Z_AXIS = new THREE.Vector3(0, 0, 1);
import { PX } from './config.js';

export const FOV = 35;
const BOARD_THICKNESS = 0.3;
const BOARD_SIDE_COLOR = 0xeee6db;
const BOARD_MARGIN = 0.3;
// HUD と、ヒント・結果表示の分だけ、土台を画面の上下から離す (CSS px)
const TOP_RESERVE = 88;
const BOTTOM_RESERVE = 96;
// 浮いているパーツの高さ（カメラの高さに対する割合）
const HOVER_RATIO = 0.2;
// タイトル画面で注視点の周りに収めたい範囲（幅, 高さ）
const TITLE_VIEW = { w: 6.3, h: 12 };

// 完成演出のスポットライト。注視点のまわりを明るく残し、外側をこの明るさまで落とす
const SPOT_DARK = 0.22;
const SPOT_FADE = 2.5; // 点く・消えるときの速さ（1 秒あたり）

// 完成演出で土台を写真立てのように立てるときの床と脚
const STAND = {
  angle: THREE.MathUtils.degToRad(76), // 床から起こす角度（90 度で垂直）
  floorColor: 0x5a463d,
  legWidth: 0.35,
  legThickness: 0.08,
  legAttach: 0.55, // 脚を付ける位置（土台の下の辺から上の辺までの割合）
  legSpread: 1.9, // 脚の先を土台の下の辺からどれだけ後ろに置くか
};

const IMPACT_TIME = 0.4;
const SHAKE_TIME = 0.18;
const SHAKE_RATIO = 0.004; // 揺れ幅（カメラ距離に対する割合）

export class Stage {
  constructor(canvasEl, canvasSize) {
    this.canvasSize = canvasSize;
    this.boardW = canvasSize.w * PX;
    this.boardD = canvasSize.h * PX;

    // 背景は CSS で描くので、3D の背景は透明にする
    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xfff4e6, 0x6b5148, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(-4, 8, 3);
    this.scene.add(sun);

    // 土台とその上のもの（パーツ・影・タイトルのパーツ）はすべて world に入れる。
    // world は rig の子で、rig は土台の下の辺（画像の下側, +z）を軸に回して土台を立てるのに使う
    this.rig = new THREE.Group();
    this.rig.position.z = this.boardD / 2;
    this.world = new THREE.Group();
    this.world.position.z = -this.boardD / 2;
    this.rig.add(this.world);
    this.scene.add(this.rig);
    this.initStand();

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.2, 200);
    // カメラは注視点 (tx, 0, tz) からの距離 r・真上からの傾き phi・水平方向の角度 theta で表す。
    // 完成演出では画面の傾き roll (rad) と画角 fov (度) も使う。
    // 注視点の高さ ty を書くとその高さを狙い、upright のときは画面の上方向を真上にそろえる。
    // theta = 0 で画像の下側から見る向き。playPose はプレイ中の真上固定カメラで、pose が null の間はこれを使う
    this.playPose = { tx: 0, tz: 0, r: 10, phi: 0, theta: 0 };
    this.pose = null;
    this.titleDistance = 20;
    this.shakeTime = 0;
    this.shakeStrength = 1;
    this.shakeDuration = SHAKE_TIME;

    this.spot = {
      uSpotCenter: { value: new THREE.Vector2() },
      uSpotRadius: { value: new THREE.Vector2(1, 3) }, // ここまでは明るいまま, ここで暗くなりきる
      uSpotStrength: { value: 0 },
      uSpotSpace: { value: new THREE.Matrix4() }, // 土台の座標に直す行列
    };
    this.spotTarget = 0;

    this.effects = [];
    this.ringGeometry = new THREE.RingGeometry(0.88, 1, 48);
    this.ringGeometry.rotateX(-Math.PI / 2);

    this.ctx = {
      boardHalfW: this.boardW / 2,
      boardHalfD: this.boardD / 2,
      hoverHeight: 1,
      wanderZone: { minX: -this.boardW / 2, maxX: this.boardW / 2, minZ: -this.boardD / 2, maxZ: this.boardD / 2 },
      project: (x, z, y, out) => this.projectToHeight(x, z, y, out),
    };
  }

  setBoard(texture) {
    // 2 回目からは、上面の画像だけを差し替える
    if (this.board) {
      const top = this.board.material[2];
      top.map.dispose();
      top.map = texture;
      top.needsUpdate = true;
      return;
    }
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const side = new THREE.MeshStandardMaterial({ color: BOARD_SIDE_COLOR, roughness: 1 });
    // 写真の色をそのまま出すため、上面はライティングの影響を受けない素材にする
    const top = new THREE.MeshBasicMaterial({ map: texture });
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(this.boardW, BOARD_THICKNESS, this.boardD),
      [side, side, top, side, side, side],
    );
    board.position.y = -BOARD_THICKNESS / 2;
    this.world.add(board);
    this.board = board;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

    this.playPose = this.topDownPose(TOP_RESERVE, BOTTOM_RESERVE);
    this.ctx.hoverHeight = this.playPose.r * HOVER_RATIO;
    this.titleDistance = Math.max(
      TITLE_VIEW.w / (2 * tanHalf * this.camera.aspect),
      TITLE_VIEW.h / (2 * tanHalf),
    );
  }

  // 真上から見て、土台が画面の上下 top / bottom (CSS px) を避けた領域に収まるカメラ位置
  // 真上から見て、土台が画面上の枠 rect（CSS px の left, top, right, bottom）にちょうど収まるカメラ位置
  framePose(rect, margin = 0) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const boxW = Math.max(rect.right - rect.left, 1);
    const boxH = Math.max(rect.bottom - rect.top, 1);
    // 1 CSS px あたりの長さ。土台が枠の幅と高さの両方に収まる大きいほう
    const unit = Math.max((this.boardW + margin) / boxW, (this.boardD + margin) / boxH);
    const viewD = unit * h;
    return {
      tx: -((rect.left + rect.right) / 2 - w / 2) * unit,
      tz: -((rect.top + rect.bottom) / 2 - h / 2) * unit,
      r: viewD / (2 * tanHalf),
      phi: 0,
      theta: 0,
    };
  }

  topDownPose(top, bottom) {
    const h = window.innerHeight;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const usableH = Math.max(h - top - bottom, h * 0.4);
    const viewD = Math.max(
      (this.boardD + BOARD_MARGIN) * h / usableH,
      (this.boardW + BOARD_MARGIN) / this.camera.aspect,
    );
    const offset = ((top - bottom) / 2) * viewD / h;
    return { tx: 0, tz: -offset, r: viewD / (2 * tanHalf), phi: 0, theta: 0 };
  }

  // 地面上の点 (x, z) とプレイ用カメラを結ぶ線上で、高さ y の位置を返す。
  // 浮いているパーツが真上から見て着地点と同じ場所に見えるようにするため
  projectToHeight(x, z, y, out) {
    const { tx, tz, r } = this.playPose;
    const t = (r - y) / r;
    return out.set(tx + (x - tx) * t, y, tz + (z - tz) * t);
  }

  spawnImpact(x, y, z, radius) {
    const ring = new THREE.Mesh(
      this.ringGeometry,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    ring.position.set(x, y + 0.002, z);
    ring.renderOrder = 50;
    ring.userData = { age: 0, radius };
    this.world.add(ring);
    this.effects.push(ring);
  }

  // 床と、写真立ての脚・接地影を作る。土台を立てたときだけ見せる
  initStand() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: STAND.floorColor, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;

    // 接地影：中心ほど濃い楕円をぼかした画像
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const g = canvas.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(0,0,0,0.75)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.scale.set(this.boardW * 1.35, 3.2, 1);
    contact.position.set(0, 0.005, this.boardD / 2 - 1.0);

    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(STAND.legWidth, STAND.legThickness, 1),
      new THREE.MeshStandardMaterial({ color: 0x1a120f, roughness: 0.9 }),
    );
    this.stand = new THREE.Group();
    this.stand.add(floor, contact, leg);
    this.stand.visible = false;
    this.standLeg = leg;
    this.scene.add(this.stand);
  }

  // 土台を写真立てのように立てる・寝かせる
  setUpright(on) {
    if (this.upright === on) return;
    this.upright = on;
    this.rig.rotation.x = on ? STAND.angle : 0;
    this.stand.visible = on;
    this.rig.updateMatrixWorld(true);
    if (!on) return;
    // 後ろへもたれた土台は裏面の下の辺で床に着く。床をその高さに合わせる
    const floorY = -BOARD_THICKNESS * Math.cos(STAND.angle);
    this.stand.position.y = floorY;
    // 脚：土台の裏面の上のほうから、後ろの床へ斜めに渡す（stand の中の座標で置く）
    const top = new THREE.Vector3(0, -BOARD_THICKNESS, this.boardD / 2 - this.boardD * STAND.legAttach);
    this.world.localToWorld(top);
    top.y -= floorY;
    const foot = new THREE.Vector3(0, 0, top.z - STAND.legSpread);
    const leg = this.standLeg;
    leg.position.copy(top).add(foot).multiplyScalar(0.5);
    leg.scale.set(1, 1, top.distanceTo(foot));
    leg.lookAt(foot.x, foot.y + floorY, foot.z);
  }

  // 土台の上の点（world の座標）に直す。立てているときのスポットライトの中心に使う
  toBoard(x, y, z) {
    this.rig.updateMatrixWorld(true);
    return this.world.worldToLocal(new THREE.Vector3(x, y, z));
  }

  // いまシーンにある土台・パーツ・影の素材に、スポットライトの明暗を足す。床と脚には足さない
  applySpotlight() {
    this.world.traverse((obj) => {
      if (!obj.isMesh) return;
      for (const material of [].concat(obj.material)) patchSpot(material, this.spot);
    });
  }

  // スポットライトを点ける・消す。center は照らす中心 (x, z)、radius は明るく残す半径の目安
  setSpotlight(on, center = null, radius = 1) {
    this.spotTarget = on ? 1 : 0;
    if (center) {
      this.spot.uSpotCenter.value.set(center.x, center.z);
      this.spot.uSpotRadius.value.set(radius * 0.3, radius * 1.1);
    }
  }

  // strength は揺れ幅の倍率
  shake(strength = 1, duration = SHAKE_TIME) {
    this.shakeTime = duration;
    this.shakeDuration = duration;
    this.shakeStrength = strength;
  }

  update(dt) {
    this.rig.updateMatrixWorld(true);
    this.spot.uSpotSpace.value.copy(this.world.matrixWorld).invert();
    const strength = this.spot.uSpotStrength;
    const step = SPOT_FADE * dt;
    strength.value += THREE.MathUtils.clamp(this.spotTarget - strength.value, -step, step);

    for (const ring of this.effects) {
      ring.userData.age += dt;
      const t = Math.min(ring.userData.age / IMPACT_TIME, 1);
      ring.scale.setScalar(ring.userData.radius * (0.6 + 0.8 * (1 - (1 - t) ** 3)));
      ring.material.opacity = 0.6 * (1 - t);
    }
    this.effects = this.effects.filter((ring) => {
      if (ring.userData.age < IMPACT_TIME) return true;
      this.world.remove(ring);
      ring.material.dispose();
      return false;
    });

    const pose = this.pose ?? this.playPose;
    const s = Math.sin(pose.phi);
    const ty = pose.ty ?? 0;
    const target = new THREE.Vector3(pose.tx, ty, pose.tz);
    this.camera.position.set(
      pose.r * s * Math.sin(pose.theta),
      pose.r * Math.cos(pose.phi),
      pose.r * s * Math.cos(pose.theta),
    );
    // lean は横から覗き込む角度。画面の向きは変えずに、カメラを土台の右（正の値）・左へ倒す
    if (pose.lean) this.camera.position.applyAxisAngle(Z_AXIS, -pose.lean);
    this.camera.position.add(target);
    // 画面の上方向は、カメラから見て奥（水平方向）にそろえる。真上から見たときも向きが連続する。
    // 立てた土台を正面から見るときは真上にそろえる
    if (pose.upright) this.camera.up.set(0, 1, 0);
    else this.camera.up.set(-Math.sin(pose.theta), 0, -Math.cos(pose.theta));
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const amp = pose.r * SHAKE_RATIO * this.shakeStrength * (this.shakeTime / this.shakeDuration);
      const offset = new THREE.Vector3((Math.random() - 0.5) * 2 * amp, 0, (Math.random() - 0.5) * 2 * amp);
      this.camera.position.add(offset);
      target.add(offset);
    }
    this.camera.lookAt(target);
    if (pose.roll) this.camera.rotateZ(pose.roll);
    const fov = pose.fov ?? FOV;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

// 素材のシェーダーに、スポットライトの明暗（中心からの距離で暗くする）を足す
function patchSpot(material, uniforms) {
  if (material.userData.spot) return;
  material.userData.spot = true;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `uniform mat4 uSpotSpace;\nvarying vec2 vSpotXZ;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n  vSpotXZ = (uSpotSpace * modelMatrix * vec4(transformed, 1.0)).xz;',
    );
    shader.fragmentShader = `uniform vec2 uSpotCenter;
uniform vec2 uSpotRadius;
uniform float uSpotStrength;
varying vec2 vSpotXZ;
${shader.fragmentShader}`.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
  float spotFalloff = smoothstep(uSpotRadius.x, uSpotRadius.y, distance(vSpotXZ, uSpotCenter));
  gl_FragColor.rgb *= mix(1.0, mix(1.0, ${SPOT_DARK.toFixed(2)}, spotFalloff), uSpotStrength);`,
    );
  };
  material.customProgramCacheKey = () => 'spot';
  material.needsUpdate = true;
}
