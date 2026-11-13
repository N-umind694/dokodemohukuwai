import { VOICES, LAND_VOICES, RESULT_ONLY_VOICES } from './voices.js';

const SE_VOLUME = 0.6;
const BGM_VOLUME = 0.45;
// 台詞が鳴っている間は BGM をこの割合まで下げる
const BGM_DUCK = 0.45;
// 台詞は音源ごとに声の大きさがばらばらなので、鳴らすときにいちばん大きい音がこのくらいになるよう音量をそろえる
const VOICE_PEAK = 0.6;
const VOICE_GAIN_RANGE = [0.7, 2.5];
// 音源ファイル。どれも Web Audio で鳴らす
const CLIPS = {
  // BGM。title は「正月の朝」（タイトル画面・完成演出・結果画面）、play は「正月の激しい鼓動」（プレイ中）
  bgm_title: { url: './assets/audio/bgm_title.mp3', volume: BGM_VOLUME },
  bgm_play: { url: './assets/audio/bgm_play.mp3', volume: BGM_VOLUME },
  ...Object.fromEntries(VOICES.map((v, i) => [`voice${i}`, { url: v.file, volume: 1, voice: true }])),
  ...Object.fromEntries(LAND_VOICES.map((v, i) => [`land${i}`, { url: v.file, volume: 1, voice: true }])),
  ...Object.fromEntries(RESULT_ONLY_VOICES.map((v, i) => [`result${i}`, { url: v.file, volume: 1, voice: true }])),
};
const VOICE_NAMES = VOICES.map((_, i) => `voice${i}`);
const LAND_NAMES = LAND_VOICES.map((_, i) => `land${i}`);
// ファイルから、読み込んだ音源の名前を引く（結果画面の台詞はファイルで指す）
const NAME_BY_FILE = new Map([
  ...VOICES.map((v, i) => [v.file, VOICE_NAMES[i]]),
  ...LAND_VOICES.map((v, i) => [v.file, LAND_NAMES[i]]),
  ...RESULT_ONLY_VOICES.map((v, i) => [v.file, `result${i}`]),
]);
// これより小さい音は無音とみなす（BGM のループ範囲や、台詞の頭の無音を飛ばすのに使う）
const SILENCE = 0.003;
const VOICE_SILENCE = 0.01;

// 音源の頭と終わりの無音を除いた、音が聞こえる範囲 (秒) と、いちばん大きい音の大きさを返す
function analyze(buffer, threshold) {
  const channels = [...Array(buffer.numberOfChannels).keys()].map((c) => buffer.getChannelData(c));
  const loud = (i) => channels.some((ch) => Math.abs(ch[i]) >= threshold);
  let first = 0;
  while (first < buffer.length && !loud(first)) first++;
  let last = buffer.length - 1;
  while (last > first && !loud(last)) last--;
  let peak = 0;
  for (const ch of channels) for (let i = first; i <= last; i++) peak = Math.max(peak, Math.abs(ch[i]));
  return { start: first / buffer.sampleRate, end: (last + 1) / buffer.sampleRate, peak };
}

// 短い効果音は Web Audio で合成し、完成演出の SE・BGM・台詞は音源ファイルを鳴らす
export class Sound {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.clips = {}; // name → { buffer, start, end, gain }
    this.playing = null; // 再生中の完成 SE { source, gain }
    this.bgm = null; // 再生中の BGM { source, gain, name }
    this.bgmWanted = false; // いまの場面で BGM を流すか
    this.bgmName = 'title'; // いまの場面で流す BGM（'title' か 'play'）
    this.bgmOffset = null; // 次に鳴らし始める曲の位置 (秒)。null なら曲の頭から
    this.voice = null; // 再生中の台詞 { source, gain, kind, endsAt }
    this.bags = {}; // まだ鳴らしていない台詞（一巡するまで同じ台詞を出さない）
    // 裏に回ったら音を止め、戻ったら再開する
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
    // ボタンを押した瞬間に鳴らせるよう、音源はページを開いた時点で読み込んでおく
    this.loadClips();
  }

  // ブラウザの制限で、音はユーザー操作の中で初めて鳴らせるようになる
  unlock() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.ctx = new AudioContextClass();
      this.master = this.ctx.createGain();
      this.master.gain.value = SE_VOLUME;
      this.master.connect(this.ctx.destination);
      this.noise = this.createNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.updateBgm();
  }

  // 音源の読み込みと解析は、鳴らすための AudioContext を作る前でもできるよう別の文脈で行う
  async loadClips() {
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContext) return;
    const decoder = new OfflineContext(1, 1, 44100);
    await Promise.all(Object.entries(CLIPS).map(async ([name, clip]) => {
      try {
        const data = await (await fetch(clip.url)).arrayBuffer();
        const buffer = await decoder.decodeAudioData(data);
        const range = analyze(buffer, clip.voice ? VOICE_SILENCE : SILENCE);
        const gain = clip.voice
          ? clamp(VOICE_PEAK / Math.max(range.peak, 1e-3), ...VOICE_GAIN_RANGE)
          : 1;
        this.clips[name] = { buffer, start: range.start, end: range.end, gain: clip.volume * gain };
      } catch (err) {
        console.error(`音源を読み込めませんでした: ${clip.url}`, err);
      }
    }));
    // 読み込みより先に BGM を流す場面になっていたら、ここで流し始める
    this.updateBgm();
  }

  ready() {
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  // 完成 SE を鳴らし、鳴らし始めた時刻（AudioContext の時計）を返す。
  // 演出の時間合わせに使うので頭の無音は飛ばさない。効果音が OFF のときや、まだ読み込めていないときは null
  playClip(name) {
    const clip = this.clips[name];
    if (!this.settings.se || !clip || !this.ready()) return null;
    this.stopClip(0);
    const startAt = this.ctx.currentTime + 0.02;
    this.playing = this.startSource(clip, { when: startAt, offset: 0 });
    return startAt;
  }

  // fade 秒かけて完成 SE を消す
  stopClip(fade = 0.25) {
    fadeOut(this.ctx, this.playing, fade);
    this.playing = null;
  }

  // 台詞を鳴らす。kind は 'line'（パーツが出たときなど）か 'land'（置いたとき）。
  // 前の台詞は短く消してから鳴らすが、置いたときの声は最後まで聞かせ、次の 'line' はその後に鳴らす。
  // 鳴っている間は BGM を少し下げる
  playVoice(name, kind = 'line') {
    const clip = this.clips[name];
    if (!this.settings.se || !clip || !this.ready()) return;
    const now = this.ctx.currentTime;
    let when = now;
    if (kind === 'line' && this.voice?.kind === 'land' && this.voice.endsAt > now) {
      when = this.voice.endsAt + 0.05;
    } else {
      fadeOut(this.ctx, this.voice, 0.08);
    }
    const length = clip.end - clip.start;
    const voice = this.startSource(clip, { when, offset: Math.max(0, clip.start - 0.02) });
    this.voice = { ...voice, kind, endsAt: when + length };
    this.duckBgm(when, length);
  }

  // fade 秒かけて台詞を消す
  stopVoice(fade = 0.15) {
    fadeOut(this.ctx, this.voice, fade);
    this.voice = null;
  }

  // パーツが出たときの台詞をランダムに選んで鳴らす
  playRandomVoice() {
    this.playVoice(this.pick('voice', VOICE_NAMES), 'line');
  }

  // files の台詞からランダムに選んで鳴らす。key ごとに、一巡するまで同じものを選ばない
  playVoiceFrom(key, files) {
    const names = files.map((file) => NAME_BY_FILE.get(file)).filter(Boolean);
    if (names.length) this.playVoice(this.pick(key, names), 'line');
  }

  // パーツを置いたときの声をランダムに選んで鳴らす
  playLandVoice() {
    this.playVoice(this.pick('land', LAND_NAMES), 'land');
  }

  // 一巡するまで同じものを選ばないよう、袋から 1 つ取り出す。
  // 袋を詰め直したときも、直前に鳴らしたものが続けて出ないようにする
  pick(key, names) {
    const bag = this.bags[key] ?? [];
    if (bag.length === 0) {
      bag.push(...names);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.length > 1 && bag[bag.length - 1] === bag.last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    const name = bag.pop();
    bag.last = name;
    this.bags[key] = bag;
    return name;
  }

  startSource(clip, { when, offset, loop = false }) {
    const source = this.ctx.createBufferSource();
    source.buffer = clip.buffer;
    if (loop) {
      source.loop = true;
      source.loopStart = clip.start;
      source.loopEnd = clip.end;
    }
    const gain = this.ctx.createGain();
    gain.gain.value = clip.gain;
    source.connect(gain).connect(this.ctx.destination);
    source.start(when, offset);
    return { source, gain, base: clip.gain };
  }

  // 時刻 start から duration 秒のあいだ BGM を下げる
  duckBgm(start, duration) {
    if (!this.bgm) return;
    const { gain, base } = this.bgm;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(base * BGM_DUCK, Math.max(start, now) + 0.08);
    gain.gain.setValueAtTime(base * BGM_DUCK, start + duration);
    gain.gain.linearRampToValueAtTime(base, start + duration + 0.4);
  }

  // name の BGM を流す場面にする。同じ曲が流れていればそのまま続け、別の曲が流れていれば切り替える
  wantBgm(name = this.bgmName) {
    if (this.bgm && this.bgm.name !== name) {
      fadeOut(this.ctx, this.bgm, 0.8);
      this.bgm = null;
    }
    this.bgmName = name;
    this.bgmOffset = null;
    this.bgmWanted = true;
    this.updateBgm();
  }

  // name の BGM を、曲の offset 秒の位置から鳴らし直す（そのあとはループする）。
  // 鳴らし始めた時刻（AudioContext の時計）を返す。鳴らせないときは null
  playBgm(name, offset = null) {
    this.stopBgm(0.05);
    this.bgmName = name;
    this.bgmOffset = offset;
    this.bgmWanted = true;
    this.updateBgm();
    return this.bgm?.startedAt ?? null;
  }

  clipDuration(name) {
    return this.clips[name]?.buffer.duration ?? 0;
  }

  // fade 秒かけて BGM を消す
  stopBgm(fade = 0.3) {
    this.bgmWanted = false;
    fadeOut(this.ctx, this.bgm, fade);
    this.bgm = null;
  }

  // 場面と設定に合わせて BGM を流す・止める
  updateBgm() {
    const clip = this.clips[`bgm_${this.bgmName}`];
    const shouldPlay = this.bgmWanted && this.settings.bgm && clip && this.ctx;
    if (!shouldPlay) {
      if (this.bgm && !this.settings.bgm) {
        fadeOut(this.ctx, this.bgm, 0.3);
        this.bgm = null;
      }
      return;
    }
    if (this.bgm) return;
    const when = this.ctx.currentTime + 0.02;
    const offset = this.bgmOffset ?? clip.start;
    this.bgmOffset = null;
    this.bgm = { ...this.startSource(clip, { when, offset, loop: true }), name: this.bgmName, startedAt: when };
  }

  play(name, strength = 1) {
    if (!this.settings.se || !this.ready()) return;
    this[`se_${name}`]?.(this.ctx.currentTime, strength);
  }

  createNoise() {
    const length = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  tone(start, { freq, to = freq, duration, type = 'sine', volume = 0.3 }) {
    volume = Math.max(volume, 0.001);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  burst(start, { duration, filter = 'bandpass', freq, to = freq, q = 1, volume = 0.3 }) {
    volume = Math.max(volume, 0.001);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const biquad = this.ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.Q.value = q;
    biquad.frequency.setValueAtTime(freq, start);
    biquad.frequency.exponentialRampToValueAtTime(to, start + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(biquad).connect(gain).connect(this.master);
    src.start(start, Math.random() * 0.5);
    src.stop(start + duration + 0.02);
  }

  // ボタン
  se_tap(t) {
    this.tone(t, { freq: 880, to: 620, duration: 0.07, volume: 0.22 });
  }

  // パーツを落とした瞬間
  se_drop(t) {
    this.tone(t, { freq: 900, to: 320, duration: 0.12, type: 'triangle', volume: 0.12 });
  }

  // タイトル画面でパーツが土台やほかのパーツに当たったとき
  se_knock(t, s) {
    this.burst(t, { duration: 0.05, freq: 1100, q: 1.5, volume: 0.35 * s });
    this.tone(t, { freq: 190, to: 90, duration: 0.07, volume: 0.4 * s });
  }

  // スワイプで回転をかけたとき
  se_swish(t, s) {
    this.burst(t, { duration: 0.18, freq: 600, to: 2400, q: 0.8, volume: 0.25 * s });
  }

  // 称号が出たとき
  se_rank(t) {
    this.tone(t, { freq: 1318.5, duration: 0.5, type: 'triangle', volume: 0.18 });
    this.tone(t + 0.06, { freq: 1975.5, duration: 0.6, type: 'triangle', volume: 0.12 });
    this.tone(t, { freq: 160, to: 80, duration: 0.15, volume: 0.35 });
  }

  // 点数の数え上げ
  se_count(t) {
    this.tone(t, { freq: 1500, duration: 0.03, type: 'square', volume: 0.04 });
  }
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// 再生中の音 { source, gain } を fade 秒かけて消して止める
function fadeOut(ctx, sound, fade) {
  if (!ctx || !sound) return;
  const { source, gain } = sound;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + fade);
  source.stop(now + fade + 0.02);
}
