import * as THREE from '../vendor/three/three.module.min.js';
import { PX } from './config.js';
import { createPartMesh } from './partMesh.js';
import { createShadowMesh, placeShadow } from './shadow.js';

// プレイ中のパーツの厚み（タイトル画面のパーツより薄くする）
const THICKNESS = 0.02;

const BASE_Y = 0.002; // 土台の上面と重ならないようにわずかに浮かせる
const STACK_GAP = 0.002; // 先に置いたパーツの上に乗るときのすき間

// 落下・着地の物理パラメータ（長さの単位は 1px = 0.01）
const PHYS = {
  gravity: 38,
  restitution: 0.32, // 跳ね返り係数
  minBounceSpeed: 1.2, // これより遅い衝突では跳ねずに滑りへ移る
  slideCarry: 0.12, // 着地時、浮遊中に進んでいた方向へ滑り出す速さ（移動速度に対する比）
  impactKick: 0.004, // 着地の衝撃でランダムな方向へずれる強さ（衝突速度に対する比）
  friction: 2.2, // 滑りの減速
  wallDamping: 0.5, // 土台の端で跳ね返るときの減衰
  wobbleKick: 0.05, // 着地の衝撃でぐらつく強さ
  wobbleSpring: 120,
  wobbleDamping: 9,
};

// 浮いている間のランダム移動。経由点を曲線でつなぎ、ときどき正解の位置を経由する
const WANDER = {
  minSpeed: 1.0,
  maxSpeed: 1.6,
  minLeg: 0.8, // ランダムな経由点を前の経由点からこれ以上離す
  between: [1, 2], // 正解の位置を経由するまでに挟むランダムな経由点の数（最小, 最大）
  bank: 0.12, // 進む方向へ傾く量（速度に対する比）
  maxBank: 0.25,
  bobAmp: 0.04, // 上下の揺れ（浮遊高さに対する割合）
  bobFreq: 2.4,
};

// スワイプで加えた水平方向の回転
const SPIN = {
  max: 12, // 回転速度の上限 (rad/s)
  friction: 10, // 着地後の回転の減速 (rad/s^2)。空中では減速しない
};

const SPAWN_TIME = 0.25;

function easeOutBack(t) {
  const c = 1.70158;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

const tmp = new THREE.Vector3();

export class Part {
  constructor(def, order, home) {
    this.key = def.key;
    this.label = def.label;
    this.order = order;
    this.mask = def.mask;
    this.halfW = (def.w * PX) / 2;
    this.halfD = (def.h * PX) / 2;
    // layout.json 上の元の位置（パーツ中心）
    this.home = home;

    this.group = createPartMesh(def, order, THICKNESS);
    this.shadow = createShadowMesh(def);
    // 傾きは画面基準、水平回転はパーツ自身の向きにかかるよう、回転の適用順を X → Z → Y にする
    this.group.rotation.order = 'XZY';

    this.pos = new THREE.Vector2(); // 土台上の位置 (x, z)
    this.vel = new THREE.Vector2();
    this.travel = new THREE.Vector2(); // 落とす直前の移動速度
    this.points = []; // 浮遊中の経由点
    this.tilt = new THREE.Vector2(); // (x 軸回りの傾き, z 軸回りの傾き)
    this.tiltVel = new THREE.Vector2();
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.concealed = false;
    this.group.visible = false;
    this.shadow.visible = false;
    this.landed = false;
    this.vel.set(0, 0);
    this.vy = 0;
    this.y = 0;
    this.tilt.set(0, 0);
    this.tiltVel.set(0, 0);
    this.spin = 0; // 水平方向の回転角。正の値で画面上の反時計回り
    this.spinVel = 0;
  }

  spawn(ctx) {
    const zone = this.wanderLimits(ctx);
    this.pos.set(randomRange(zone.minX, zone.maxX), randomRange(zone.minZ, zone.maxZ));
    this.speed = randomRange(WANDER.minSpeed, WANDER.maxSpeed);
    this.vel.set(0, 0);
    this.startPath(ctx);

    this.state = 'hover';
    this.age = 0;
    this.landed = false;
    this.y = ctx.hoverHeight;
    this.group.visible = true;
    this.group.scale.setScalar(0.001);
    this.applyTransform(ctx);
  }

  drop() {
    if (this.state !== 'hover') return false;
    this.state = 'air';
    this.vy = 0;
    // 真下に落とし、着地してから進んでいた方向へ少し滑らせる
    this.travel.copy(this.vel);
    this.vel.set(0, 0);
    this.group.scale.setScalar(1);
    return true;
  }

  // 目隠しモード：完成演出まで見えなくする
  conceal() {
    this.concealed = true;
    this.group.visible = false;
    this.shadow.visible = false;
  }

  reveal() {
    if (!this.concealed) return;
    this.concealed = false;
    this.group.visible = true;
    this.shadow.visible = true;
  }

  // 落としたあとに回転を加える。まだ止まっていないパーツにだけ効く
  addSpin(velocity) {
    if (this.state === 'idle' || this.state === 'hover' || this.isResting()) return;
    this.spinVel = THREE.MathUtils.clamp(this.spinVel + velocity, -SPIN.max, SPIN.max);
  }

  // 元の位置にそのまま置く（確認用）
  placeHome(ctx, below) {
    this.pos.set(this.home.x, this.home.z);
    this.vel.set(0, 0);
    this.landed = true;
    this.y = this.groundHeight(below);
    this.state = 'settled';
    this.group.visible = true;
    this.group.scale.setScalar(1);
    this.applyTransform(ctx);
  }

  isResting() {
    return this.state === 'settled' && this.tilt.lengthSq() === 0 && this.spinVel === 0;
  }

  // below: このパーツより先に置くパーツ（その上に乗ることがある）。
  // 初めて着地したフレームだけ true を返す
  update(dt, ctx, below) {
    let firstLanding = false;

    switch (this.state) {
      case 'hover': {
        this.age += dt;
        this.wander(dt, ctx);
        const bob = Math.sin(this.age * WANDER.bobFreq * Math.PI) * WANDER.bobAmp;
        this.y = ctx.hoverHeight * (1 + bob);
        const s = Math.min(this.age / SPAWN_TIME, 1);
        this.group.scale.setScalar(Math.max(easeOutBack(s), 0.001));
        // 進む方向へ少し傾ける
        const bank = new THREE.Vector2(this.vel.y, -this.vel.x).multiplyScalar(WANDER.bank);
        if (bank.length() > WANDER.maxBank) bank.setLength(WANDER.maxBank);
        this.tilt.lerp(bank, Math.min(1, 6 * dt));
        break;
      }
      case 'air': {
        this.vy -= PHYS.gravity * dt;
        this.y += this.vy * dt;
        this.pos.addScaledVector(this.vel, dt);
        this.keepOnBoard(ctx);

        const ground = this.groundHeight(below);
        if (this.y <= ground) {
          this.y = ground;
          const impact = -this.vy;
          if (!this.landed) {
            this.landed = true;
            firstLanding = true;
            const angle = Math.random() * Math.PI * 2;
            const kick = impact * PHYS.impactKick;
            this.vel.copy(this.travel).multiplyScalar(PHYS.slideCarry);
            this.vel.x += Math.cos(angle) * kick;
            this.vel.y += Math.sin(angle) * kick;
          }
          this.kickWobble(impact);
          if (impact > PHYS.minBounceSpeed) {
            this.vy = impact * PHYS.restitution;
          } else {
            this.vy = 0;
            this.state = 'slide';
          }
        }
        break;
      }
      case 'slide': {
        const speed = this.vel.length();
        const next = Math.max(0, speed - PHYS.friction * dt);
        if (next === 0) {
          this.vel.set(0, 0);
          this.state = 'settled';
        } else {
          this.vel.multiplyScalar(next / speed);
          this.pos.addScaledVector(this.vel, dt);
          this.keepOnBoard(ctx);
        }
        this.followGround(below);
        break;
      }
      case 'settled':
        this.followGround(below);
        break;
    }

    if (this.state !== 'hover' && this.state !== 'idle') {
      this.updateWobble(dt);
      this.updateSpin(dt);
    }
    if (this.state !== 'idle') this.applyTransform(ctx);
    return firstLanding;
  }

  // 下のパーツが滑って支えを失ったら落ち、下に潜り込まれたら持ち上がる
  followGround(below) {
    const ground = this.groundHeight(below);
    if (this.y > ground + STACK_GAP) {
      this.state = 'air';
      this.vy = 0;
    } else {
      this.y = ground;
    }
  }

  groundHeight(below) {
    let ground = BASE_Y;
    for (const other of below) {
      if (other.landed && other.overlaps(this)) {
        ground = Math.max(ground, other.y + THICKNESS + STACK_GAP);
      }
    }
    return ground;
  }

  // 両方のパーツの不透明部分が 1 点でも重なっているか
  overlaps(other) {
    const a = this.extents();
    const b = other.extents();
    const minX = Math.max(this.pos.x - a.x, other.pos.x - b.x);
    const maxX = Math.min(this.pos.x + a.x, other.pos.x + b.x);
    const minZ = Math.max(this.pos.y - a.z, other.pos.y - b.z);
    const maxZ = Math.min(this.pos.y + a.z, other.pos.y + b.z);
    if (minX >= maxX || minZ >= maxZ) return false;
    const step = 2 * PX;
    for (let z = minZ + PX / 2; z < maxZ; z += step) {
      for (let x = minX + PX / 2; x < maxX; x += step) {
        if (this.solidAt(x, z) && other.solidAt(x, z)) return true;
      }
    }
    return false;
  }

  solidAt(x, z) {
    const { w, h, data } = this.mask;
    // 回転を戻してパーツ自身の座標に直す
    const dx = x - this.pos.x;
    const dz = z - this.pos.y;
    const cos = Math.cos(this.spin);
    const sin = Math.sin(this.spin);
    const i = Math.floor((dx * cos - dz * sin) / PX + w / 2);
    const j = Math.floor((dx * sin + dz * cos) / PX + h / 2);
    if (i < 0 || j < 0 || i >= w || j >= h) return false;
    return data[j * w + i] === 1;
  }

  // 回転を含めた、パーツを囲む軸平行な矩形の半分の大きさ
  extents() {
    const cos = Math.abs(Math.cos(this.spin));
    const sin = Math.abs(Math.sin(this.spin));
    return {
      x: cos * this.halfW + sin * this.halfD,
      z: sin * this.halfW + cos * this.halfD,
    };
  }

  updateSpin(dt) {
    if (this.spinVel === 0) return;
    if (this.state === 'slide' || this.state === 'settled') {
      const speed = Math.max(0, Math.abs(this.spinVel) - SPIN.friction * dt);
      this.spinVel = Math.sign(this.spinVel) * speed;
    }
    this.spin += this.spinVel * dt;
  }

  kickWobble(impact) {
    const angle = Math.random() * Math.PI * 2;
    const k = impact * PHYS.wobbleKick;
    this.tiltVel.x += Math.cos(angle) * k;
    this.tiltVel.y += Math.sin(angle) * k;
  }

  updateWobble(dt) {
    this.tiltVel
      .addScaledVector(this.tilt, -PHYS.wobbleSpring * dt)
      .multiplyScalar(Math.max(0, 1 - PHYS.wobbleDamping * dt));
    this.tilt.addScaledVector(this.tiltVel, dt);
    if (this.state === 'settled' && this.tilt.lengthSq() < 1e-6 && this.tiltVel.lengthSq() < 1e-4) {
      this.tilt.set(0, 0);
      this.tiltVel.set(0, 0);
    }
  }

  // 経由点を centripetal Catmull-Rom 曲線でなめらかにつなぎ、その上を進む。
  // 経由点に正解の位置を定期的に混ぜて、必ずその上を通過させる
  startPath(ctx) {
    this.untilHome = randomInt(0, WANDER.between[1] - 1);
    const start = this.pos.clone();
    this.points = [this.randomPoint(ctx, start), start];
    this.points.push(this.nextWaypoint(ctx, start));
    this.points.push(this.nextWaypoint(ctx, this.points[2]));
    this.buildSegment();
  }

  nextWaypoint(ctx, from) {
    if (this.untilHome <= 0) {
      this.untilHome = randomInt(WANDER.between[0], WANDER.between[1]);
      return new THREE.Vector2(this.home.x, this.home.z);
    }
    this.untilHome -= 1;
    return this.randomPoint(ctx, from);
  }

  randomPoint(ctx, from) {
    const zone = this.wanderLimits(ctx);
    const p = new THREE.Vector2();
    for (let i = 0; i < 8; i++) {
      p.set(randomRange(zone.minX, zone.maxX), randomRange(zone.minZ, zone.maxZ));
      if (p.distanceTo(from) >= WANDER.minLeg) break;
    }
    return p;
  }

  // 4 つの経由点で曲線を作り、中央の区間（points[1] → points[2]）を進む
  buildSegment() {
    this.curve = new THREE.CatmullRomCurve3(
      this.points.map((p) => new THREE.Vector3(p.x, 0, p.y)),
      false,
      'centripetal',
    );
    const a = this.curve.getPoint(1 / 3);
    let length = 0;
    for (let i = 1; i <= 8; i++) {
      this.curve.getPoint(1 / 3 + i / 24, tmp);
      length += a.distanceTo(tmp);
      a.copy(tmp);
    }
    this.segLength = Math.max(length, 1e-3);
    this.segU = 0;
  }

  wander(dt, ctx) {
    this.segU += (this.speed * dt) / this.segLength;
    while (this.segU >= 1) {
      const over = (this.segU - 1) * this.segLength;
      this.points.shift();
      this.points.push(this.nextWaypoint(ctx, this.points[2]));
      this.buildSegment();
      this.segU = over / this.segLength;
    }
    this.curve.getPoint(1 / 3 + this.segU / 3, tmp);
    this.vel.set(tmp.x - this.pos.x, tmp.z - this.pos.y).divideScalar(Math.max(dt, 1e-6));
    this.pos.set(tmp.x, tmp.z);
  }

  // パーツの中心が動ける範囲。パーツが土台からはみ出さない範囲に収める
  wanderLimits(ctx) {
    const board = this.boardLimits(ctx);
    const zone = ctx.wanderZone;
    return {
      minX: Math.max(zone.minX, -board.x),
      maxX: Math.min(zone.maxX, board.x),
      minZ: Math.max(zone.minZ, -board.z),
      maxZ: Math.min(zone.maxZ, board.z),
    };
  }

  // パーツが土台からはみ出さないよう、端で跳ね返す
  keepOnBoard(ctx) {
    const lim = this.boardLimits(ctx);
    if (Math.abs(this.pos.x) > lim.x) {
      this.pos.x = Math.sign(this.pos.x) * lim.x;
      this.vel.x *= -PHYS.wallDamping;
    }
    if (Math.abs(this.pos.y) > lim.z) {
      this.pos.y = Math.sign(this.pos.y) * lim.z;
      this.vel.y *= -PHYS.wallDamping;
    }
  }

  boardLimits(ctx) {
    const ext = this.extents();
    return {
      x: Math.max(ctx.boardHalfW - ext.x, 0),
      z: Math.max(ctx.boardHalfD - ext.z, 0),
    };
  }

  applyTransform(ctx) {
    ctx.project(this.pos.x, this.pos.y, this.y, this.group.position);
    this.group.rotation.set(this.tilt.x, this.spin, this.tilt.y);
    if (this.concealed) this.group.visible = false;
    this.shadow.visible = this.group.visible;
    placeShadow(this.shadow, this.pos.x, this.pos.y, this.y, this.spin, this.group.scale.x);
  }
}
