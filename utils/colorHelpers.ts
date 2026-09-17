function parseHexRgb(color: string): { r: number; g: number; b: number } | null {
  const raw = color.trim().replace('#', '');
  const normalized =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
    return null;
  }
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

/** #RGB / #RRGGBB にアルファを乗せる */
export const withAlpha = (hex: string, alpha: number): string => {
  const rgb = parseHexRgb(hex);
  if (!rgb) {
    return hex;
  }
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
};

/** 相対輝度が高ければ true（ダーク面のインク判定） */
export function isLightHexColor(color: string): boolean {
  const rgb = parseHexRgb(color);
  if (!rgb) {
    return false;
  }
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255 >= 0.6;
}

/** タブ非選択時のカテゴリ色の薄さ */
export const INACTIVE_TAB_COLOR_ALPHA = 0.35;
