import type { DesignPattern } from './types';

/**
 * コーデックス
 * 「あなたの～は？」で試作した図鑑／SFカード。
 * ネオブルータルのずらし影 + コーナーブラケット + マゼンタ／シアン。
 */
export const codexDesignPattern: DesignPattern = {
  id: 'codex',
  label: 'コーデックス',
  summary: '図鑑・SF。角ばった枠、ずらした影、Q番号、マゼンタ／シアン。',
  shape: {
    cardBorderRadius: 6,
    cardBorderWidth: 2,
    cardPadding: 14,
    offsetDistance: 2.5,
    cornerBrackets: true,
    bracketSize: 12,
    innerRadius: 4,
    kickerLetterSpacing: 2,
  },
  tones: {
    light: {
      id: 'light',
      label: '紙',
      colors: {
        screen: '#F2F2F2',
        card: '#FFF8EC',
        cardInk: '#1B1233',
        cardMuted: '#6B5E7A',
        accent: '#E11D8F',
        accentSoft: 'rgba(225,29,143,0.12)',
        cyan: '#0E8F9A',
        gold: '#C98900',
        offset: '#1B1233',
        headerBg: '#FFF8EC',
        headerBorder: '#1B1233',
        chipBg: '#F3E7D4',
        chipOn: '#1B1233',
        chipOnInk: '#FFF8EC',
        logBg: '#FFF1D6',
        quote: '#E11D8F',
        addBtn: '#E11D8F',
        addBtnInk: '#FFF8EC',
      },
    },
    dark: {
      id: 'dark',
      label: 'HUD',
      colors: {
        screen: '#070A14',
        card: '#14182B',
        cardInk: '#F4F0FF',
        cardMuted: '#9AA3C7',
        accent: '#FF4FD8',
        accentSoft: 'rgba(255,79,216,0.16)',
        cyan: '#3EF0F5',
        gold: '#F5C542',
        offset: '#3EF0F5',
        headerBg: '#101428',
        headerBorder: '#3EF0F5',
        chipBg: '#1C2140',
        chipOn: '#FF4FD8',
        chipOnInk: '#140016',
        logBg: '#0C1020',
        quote: '#3EF0F5',
        addBtn: '#FF4FD8',
        addBtnInk: '#140016',
      },
    },
  },
};

export function formatCodexIndex(index: number): string {
  return `Q-${String(index + 1).padStart(2, '0')}`;
}
