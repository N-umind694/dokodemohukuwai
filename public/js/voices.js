// 台詞の一覧。素材が決まったらここに足す（file は public/assets/audio/ 以下のパス、label は中身のメモ）

// パーツが出たときにランダムで鳴らす台詞
export const VOICES = [];

// パーツを置いた（着地した）ときにランダムで鳴らす声
export const LAND_VOICES = [];

// 結果画面でだけ鳴らす台詞
export const RESULT_ONLY_VOICES = [];

// 結果画面で点数と称号が出たときに鳴らす台詞。点数の高い順に並べ、min 点以上で最初に当てはまった組から選ぶ。
// special は特殊称号のとき
export const RESULT_VOICES = [
  { min: 0, files: [] },
];
export const SPECIAL_RESULT_VOICES = [];
