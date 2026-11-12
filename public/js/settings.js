const STORAGE_KEY = 'fukuwarai-settings';

export const DEFAULT_SETTINGS = {
  bgm: true,
  se: true,
  swipe: true,
  vibration: true,
};

// 端末に保存できない環境（プライベートブラウズなど）でも初期値で動くようにする
export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 保存できなくても、このページを開いている間は設定が効く
  }
}

export const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

// ブラウザは一度も画面に触れていないページの振動を拒否するので、そのときは何もしない
export function vibrate(settings, pattern) {
  if (!settings.vibration || !canVibrate) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  navigator.vibrate(pattern);
}
