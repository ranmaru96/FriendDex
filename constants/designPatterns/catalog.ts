import type { DesignPattern } from './types';

/**
 * 静かな図鑑
 * コーデックスと同じ「収蔵」だが、SF / HUD / 二色アクセント / 「」を外す。
 * インク1色、細い枠、薄いずらし影。
 */
export const catalogDesignPattern: DesignPattern = {
  id: 'catalog',
  label: '静かな図鑑',
  summary: '図鑑。番号と紙。ずらし影のみ。色はインク1色。',
  shape: {
    cardBorderRadius: 4,
    cardBorderWidth: 1,
    cardPadding: 12,
    offsetDistance: 2,
    cornerBrackets: false,
    bracketSize: 0,
    innerRadius: 3,
    kickerLetterSpacing: 1,
  },
  tones: {
    light: {
      id: 'light',
      label: '紙',
      colors: {
        screen: '#EFEBE3',
        card: '#FAF7F1',
        cardInk: '#2C281F',
        cardMuted: '#7A7368',
        accent: '#6B2E24',
        accentSoft: 'rgba(107,46,36,0.10)',
        cyan: '#2C281F',
        gold: '#8A7A4A',
        offset: '#2C281F',
        headerBg: '#FAF7F1',
        headerBorder: '#2C281F',
        chipBg: '#EFE8DC',
        chipOn: '#2C281F',
        chipOnInk: '#FAF7F1',
        logBg: '#F3EEE6',
        quote: '#6B2E24',
        addBtn: '#2C281F',
        addBtnInk: '#FAF7F1',
      },
    },
    dark: {
      id: 'dark',
      label: '夜',
      colors: {
        screen: '#141210',
        card: '#1E1B17',
        cardInk: '#F0EBE3',
        cardMuted: '#A39A8C',
        accent: '#C4786A',
        accentSoft: 'rgba(196,120,106,0.16)',
        cyan: '#C4B8A8',
        gold: '#C4B48A',
        offset: '#0A0908',
        headerBg: '#1E1B17',
        headerBorder: '#C4B8A8',
        chipBg: '#2A2620',
        chipOn: '#C4786A',
        chipOnInk: '#1A100E',
        logBg: '#181511',
        quote: '#C4786A',
        addBtn: '#C4786A',
        addBtnInk: '#1A100E',
      },
    },
  },
};

export function formatCatalogIndex(index: number): string {
  return `Q-${String(index + 1).padStart(2, '0')}`;
}
