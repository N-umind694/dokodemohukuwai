import * as THREE from '../vendor/three/three.module.min.js';
import * as CANNON from '../vendor/cannon-es/cannon-es.min.js';
import { PX } from './config.js';
import { createPartMesh, THICKNESS } from './partMesh.js';
import { createShadowMesh, placeShadow } from './shadow.js';

// タイトル画面で、パーツを積み木のように土台へ落とす
const DROP = {
  startDelay: 0.5, // タイトル表示から最初のパーツが落ち始めるまで（秒）
  interval: 0.12, // パーツごとの落下開始のずれ（秒）
  height: [11, 15], // 落とし始める高さ
  spread: { x: 1.1, z: 1.3 }, // 落とす位置の範囲（土台中心から）
  maxTilt: 1.0, // 落とし始めの傾きの最大 (rad)
  maxSpin: 6, // 落とし始めの回転速度の最大 (rad/s)
  gravity: 30,
};
// 「はじめる」で吹き飛ばす
const BLOW = {
  duration: 0.5,
  speed: [4, 6],
  lift: [6, 9],
  spin: 10,
};
// 空中では空気抵抗をほぼ無くし、最初に何かへぶつかってからは強める。
// 着地後に滑りすぎて土台から落ちたり、平らなままいつまでも回り続けたりしないようにするため
const DAMPING = {
  air: { linear: 0.05, angular: 0.08 },
  landed: { linear: 0.45, angular: 0.6 },
};
// 着地後の横方向の速さの上限。ぶつかった勢いで土台の外まで転がっていかないようにする
const MAX_SLIDE_SPEED = 2.5;
// 重なったパーツ同士が小刻みに揺れ続けないよう、着地から少したってほぼ止まっていれば静止させる
const SETTLE = { after: 2.5, speed: 0.5, spin: 1.5 };
const COLLIDER_SCALE = 0.85; // 透明な角で浮いて見えないよう、当たり判定は見た目より少し小さくする
const COLLIDER_THICKNESS = 0.08;
const FALL_LIMIT = -15; // 土台から落ちたパーツをここで消す
const STEP = 1 / 120;

const rand = (min, max) => min + Math.random() * (max - min);
const tmpEuler = new THREE.Euler();
const tmpUp = new THREE.Vector3();

function limitSlide(velocity) {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed <= MAX_SLIDE_SPEED) return;
  const k = MAX_SLIDE_SPEED / speed;
  velocity.x *= k;
  velocity.z *= k;
}

export class TitleShow {
  constructor(scene, partDefs, boardHalfW, boardHalfD, sound) {
    this.sound = sound;
    this.boardHalfW = boardHalfW;
    this.boardHalfD = boardHalfD;
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -DROP.gravity, 0) });
    this.world.allowSleep = true;
    this.world.solver.iterations = 15;

    const partMaterial = new CANNON.Material('part');
    const boardMaterial = new CANNON.Material('board');
    this.world.addContactMaterial(new CANNON.ContactMaterial(partMaterial, boardMaterial, { friction: 0.8, restitution: 0.15 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(partMaterial, partMaterial, { friction: 0.6, restitution: 0.1 }));

    // 速く落ちてきた薄いパーツがすり抜けないよう、土台の当たり判定は下に厚く取る
    const board = new CANNON.Body({
      mass: 0,
      material: boardMaterial,
      shape: new CANNON.Box(new CANNON.Vec3(boardHalfW, 2, boardHalfD)),
    });
    board.position.set(0, -2, 0);
    this.world.addBody(board);

    this.items = partDefs.map((def, i) => {
      // 物理の中心（厚みの中央）に見た目の中心を合わせる
      const mesh = createPartMesh(def, i);
      mesh.position.y = -THICKNESS / 2;
      const holder = new THREE.Group();
      holder.add(mesh);
      holder.visible = false;
      scene.add(holder);

      const body = new CANNON.Body({
        mass: 1,
        material: partMaterial,
        shape: new CANNON.Box(new CANNON.Vec3(
          ((def.w * PX) / 2) * COLLIDER_SCALE,
          COLLIDER_THICKNESS / 2,
          ((def.h * PX) / 2) * COLLIDER_SCALE,
        )),
        sleepSpeedLimit: 0.3,
        sleepTimeLimit: 0.5,
      });
      const shadow = createShadowMesh(def);
      shadow.visible = false;
      scene.add(shadow);
      const item = { holder, body, shadow, dropAt: 0, active: false, touched: false, touchedAt: 0 };
      body.addEventListener('collide', (e) => this.onCollide(item, e));
      return item;
    });
    this.elapsed = 0;
    this.blowTime = -1;
    this.lastKnock = 0;
  }

  // 3D の画面と物理から取り除く（素材を作り直すとき）
  dispose(scene) {
    this.hide();
    for (const item of this.items) scene.remove(item.holder, item.shadow);
  }

  start() {
    this.hide();
    this.elapsed = 0;
    this.blowTime = -1;
    // 落ちてくる順番は毎回ばらばらにする
    const order = this.items.map((_, i) => i).sort(() => Math.random() - 0.5);
    order.forEach((index, k) => {
      this.items[index].dropAt = DROP.startDelay + k * DROP.interval;
    });
  }

  hide() {
    for (const item of this.items) {
      if (item.active) this.world.removeBody(item.body);
      item.active = false;
      item.dropAt = Infinity;
      item.holder.visible = false;
      item.holder.scale.setScalar(1);
      item.shadow.visible = false;
    }
  }

  drop(item) {
    const { body } = item;
    body.position.set(rand(-DROP.spread.x, DROP.spread.x), rand(...DROP.height), rand(-DROP.spread.z, DROP.spread.z));
    const tilt = new CANNON.Quaternion().setFromEuler(
      rand(-DROP.maxTilt, DROP.maxTilt),
      rand(0, Math.PI * 2),
      rand(-DROP.maxTilt, DROP.maxTilt),
    );
    body.quaternion.copy(tilt);
    body.velocity.set(0, -2, 0);
    body.angularVelocity.set(
      rand(-DROP.maxSpin, DROP.maxSpin),
      rand(-DROP.maxSpin, DROP.maxSpin),
      rand(-DROP.maxSpin, DROP.maxSpin),
    );
    body.linearDamping = DAMPING.air.linear;
    body.angularDamping = DAMPING.air.angular;
    body.wakeUp();
    this.world.addBody(body);
    item.active = true;
    item.touched = false;
    item.holder.visible = true;
    item.shadow.visible = true;
    item.holder.scale.setScalar(1);
  }

  // 散らばったパーツを外側へはじき飛ばしながら小さくして消す
  blowAway() {
    this.blowTime = 0;
    for (const item of this.items) {
      if (!item.active) {
        item.dropAt = Infinity;
        continue;
      }
      const { body } = item;
      const dir = new THREE.Vector2(body.position.x, body.position.z);
      if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, Math.random() - 0.5);
      dir.setLength(rand(...BLOW.speed));
      body.wakeUp();
      body.velocity.set(dir.x, rand(...BLOW.lift), dir.y);
      body.angularVelocity.set(rand(-BLOW.spin, BLOW.spin), rand(-BLOW.spin, BLOW.spin), rand(-BLOW.spin, BLOW.spin));
    }
  }

  onCollide(item, event) {
    if (!item.touched) {
      item.touched = true;
      item.touchedAt = this.elapsed;
      item.body.linearDamping = DAMPING.landed.linear;
      item.body.angularDamping = DAMPING.landed.angular;
    }
    if (this.blowTime >= 0) return;
    const speed = Math.abs(event.contact.getImpactVelocityAlongNormal());
    if (speed < 3 || this.elapsed - this.lastKnock < 0.04) return;
    this.lastKnock = this.elapsed;
    this.sound?.play('knock', Math.min(speed / 25, 1));
  }

  update(dt) {
    this.elapsed += dt;
    for (const item of this.items) {
      if (!item.active && this.elapsed >= item.dropAt) this.drop(item);
    }
    this.world.step(STEP, dt, 10);
    if (this.blowTime < 0) {
      for (const item of this.items) {
        if (!item.active || !item.touched) continue;
        const { body } = item;
        limitSlide(body.velocity);
        if (
          body.sleepState !== CANNON.Body.SLEEPING
          && this.elapsed - item.touchedAt > SETTLE.after
          && body.velocity.length() < SETTLE.speed
          && body.angularVelocity.length() < SETTLE.spin
        ) {
          body.sleep();
        }
      }
    }

    let shrink = 1;
    if (this.blowTime >= 0) {
      this.blowTime += dt;
      shrink = Math.max(0, 1 - this.blowTime / BLOW.duration);
    }
    for (const item of this.items) {
      if (!item.active) continue;
      const { body, holder } = item;
      if (body.position.y < FALL_LIMIT || shrink === 0) {
        this.world.removeBody(body);
        item.active = false;
        item.dropAt = Infinity; // 土台から落ちたパーツをもう一度降らせない
        holder.visible = false;
        item.shadow.visible = false;
        continue;
      }
      holder.position.copy(body.position);
      holder.quaternion.copy(body.quaternion);
      holder.scale.setScalar(shrink);
      // 影は水平の向きだけ合わせ、立っているほど細く薄くなるので傾きに応じて薄める
      tmpEuler.setFromQuaternion(holder.quaternion, 'YXZ');
      tmpUp.set(0, 1, 0).applyQuaternion(holder.quaternion);
      const height = body.position.y - COLLIDER_THICKNESS / 2;
      placeShadow(item.shadow, body.position.x, body.position.z, height, tmpEuler.y, Math.abs(tmpUp.y) * shrink);
      // 土台の外へ転げ落ちたら、影は宙に浮いて見えるので出さない
      item.shadow.visible = Math.abs(body.position.x) < this.boardHalfW && Math.abs(body.position.z) < this.boardHalfD && body.position.y > -0.2;
    }
  }
}
