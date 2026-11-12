# どこでも福笑い（仮）

スマートフォン縦画面向けの 3D 福笑いブラウザゲーム（制作中）。Three.js 製で、ビルド工程なしの静的ファイルだけで動く。

読み込んだ写真から顔のパーツ（眉・目・鼻・口）を切り出し、それを使って福笑いをする予定。写真は端末の中だけで処理し、どこにも送らない。

## 現状

- 別に作った福笑いゲームの仕組み（パーツの移動・落下・着地、採点、完成演出、結果画面）だけを持ってきた状態。
- 画像・音声の素材は入っていないので、まだ遊べない（`public/assets/` が空）。
- 画面の文言・称号・コメントは「（仮）」のまま。

## 構成

```
public/                公開するファイル一式
  index.html
  style.css
  js/                  ゲームの仕組み
  vendor/three/        Three.js 0.186.1（MIT License）
  vendor/cannon-es/    cannon-es 0.20.0（MIT License）
```

## ローカルで動かす

```
npx http-server public -p 8080 -c-1 -a 127.0.0.1
```

## 公開

Cloudflare Pages（Build command: なし、Build output directory: `public`）。検索エンジンには載せない（`noindex`）。

## 使用ライブラリ

- Three.js — MIT License（`public/vendor/three/LICENSE`）
- cannon-es — MIT License（`public/vendor/cannon-es/LICENSE`）
