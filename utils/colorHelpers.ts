/** #RGB / #RRGGBB にアルファを乗せる */
export const withAlpha = (hex: string, alpha: number): string => {
  const raw = hex.trim().replace('#', '');
  const normalized =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
    return hex;
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

/** タブ非選択時のカテゴリ色の薄さ */
export const INACTIVE_TAB_COLOR_ALPHA = 0.35;
