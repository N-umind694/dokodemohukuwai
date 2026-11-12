# MediaPipe Tasks Vision

- パッケージ: @mediapipe/tasks-vision 1.2.3（npm）
- 使っているファイル: vision_bundle.mjs、wasm/vision_wasm_internal.js、wasm/vision_wasm_internal.wasm
- モデル: face_landmarker.task（float16 / 1、https://storage.googleapis.com/mediapipe-models/ から取得）
- ライセンス: Apache License 2.0（https://www.apache.org/licenses/LICENSE-2.0）
- 提供: Google（https://github.com/google-ai-edge/mediapipe）

写真の顔の点を見つけるのに使う。写真を選んだときに初めて読み込み、処理はすべて端末の中で行う。
