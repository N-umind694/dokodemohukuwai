# どこでも福笑い（仮）

スマートフォン縦画面向けの 3D 福笑いブラウザゲーム（制作中）。Three.js 製で、ビルド工程なしの静的ファイルだけで動く。

読み込んだ写真から顔のパーツ（眉・目・鼻・口）を切り出し、それを使って福笑いをする予定。写真は端末の中だけで処理し、どこにも送らない。

## 遊び方

- タイトル画面ではサンプルの顔（絵）で遊べる。
- 「写真をえらぶ」で写真を選ぶと、顔を見つけて眉・目・鼻・口を切り出し、切り出した跡を周りの肌の色で埋めた土台を作る。以後はその顔で遊ぶ。
- 写っている顔が複数あるときは、いちばん大きい顔を使う。顔が見つからなければ、その旨を表示する。
- 写真はこの端末の中だけで使い、どこにも送らない。

## 現状

- 効果音・BGM・台詞の素材はまだ入っていない（鳴らないだけで遊べる）。
- 画面の文言・称号・コメントは「（仮）」のまま。

## 顔の切り出し（`public/js/faceAssets.js`）

1. 写真を長い辺 1600px までに縮めて読み、MediaPipe Face Landmarker で顔の点（478 か所）を見つける。
2. 顔の輪郭が土台（540×600）の真ん中に、高さの 6 割ほどで収まるように切り出す。
3. 眉・目・鼻・口の点を囲む形を少し広げ、縁をぼかして切り抜く。
4. 切り抜いた跡は、まわりの色を粗い解像度で集めて細かい解像度に戻す方法で、なめらかに埋める。

## 構成

```
public/                公開するファイル一式
  index.html
  style.css
  js/                  ゲームの仕組み
  vendor/three/        Three.js 0.186.1（MIT License）
  vendor/cannon-es/    cannon-es 0.20.0（MIT License）
  vendor/mediapipe/    MediaPipe Tasks Vision 1.2.3 と顔の点のモデル（Apache License 2.0）
```

## ローカルで動かす

```
npx http-server public -p 8080 -c-1 -a 127.0.0.1
```

## 公開

Cloudflare Pages（Build command: なし、Build output directory: `public`）。検索エンジンには載せない（`index.html` の `noindex` と `robots.txt`）。

## 使用ライブラリ

- Three.js — MIT License（`public/vendor/three/LICENSE`）
- cannon-es — MIT License（`public/vendor/cannon-es/LICENSE`）
- MediaPipe Tasks Vision（Google）— Apache License 2.0（`public/vendor/mediapipe/README.md`）
