import fs from 'fs';

const src = fs.readFileSync('DetailScreen.tsx', 'utf8');
const start = src.indexOf('const styles = StyleSheet.create({');
const end = src.indexOf('\n});', start) + 4;
if (start < 0 || end < 0) {
  console.error('block not found');
  process.exit(1);
}
let body = src.slice(start + 'const styles = StyleSheet.create('.length, end - 2);
body = body.replace(/Theme\./g, 'c.');
body = body
  .replace(/backgroundColor: c\.background,/g, 'backgroundColor: c.background,')
  .replace(/borderColor: c\.border,/g, 'borderColor: c.border,')
  .replace(/borderWidth: 2,\n    borderColor: c\.border,/g, 'borderWidth: c.profileCardBorderWidth,\n    borderColor: c.profileCardBorderColor,')
  .replace(
    /hero: \{\n    backgroundColor: c\.card,/,
    'hero: {\n    backgroundColor: c.heroBackground,'
  )
  .replace(
    /heroPhotoInitial: \{\n    width: 132,\n    height: 132,\n    borderRadius: Radius\.md,\n    backgroundColor: c\.background,\n    borderWidth: 1\.5,\n    borderColor: c\.border,/,
    'heroPhotoInitial: {\n    width: 132,\n    height: 132,\n    borderRadius: Radius.md,\n    backgroundColor: c.heroPhotoInitialBg,\n    borderWidth: 1.5,\n    borderColor: c.heroPhotoInitialBorder,'
  )
  .replace(
    /heroPhotoInitialText: \{\n    fontSize: 48,\n    fontWeight: '500',\n    color: c\.textSecondary,/,
    "heroPhotoInitialText: {\n    fontSize: 48,\n    fontWeight: '500',\n    color: c.heroPhotoInitialText,"
  )
  .replace(
    /heroByTag: \{\n    fontSize: 10,\n    color: c\.textSecondary,/,
    'heroByTag: {\n    fontSize: 10,\n    color: c.heroByTagText,'
  )
  .replace(/tabPane: \{\n    backgroundColor: c\.card,/g, 'tabPane: {\n    backgroundColor: c.tabPaneBackground,')
  .replace(
    /multiValueCard: \{\n    backgroundColor: c\.card,/,
    'multiValueCard: {\n    backgroundColor: c.multiValueCardBackground,'
  )
  .replace(/backgroundColor: c\.accent,/g, 'backgroundColor: c.primaryButtonBg,')
  .replace(/color: c\.onAccent,/g, 'color: c.primaryButtonText,')
  .replace(/backgroundColor: c\.btnPrimaryBg/g, 'backgroundColor: c.primaryButtonBg')
  .replace(/color: c\.btnPrimaryText/g, 'color: c.primaryButtonText')
  .replace(/backgroundColor: c\.accentLight,/g, 'backgroundColor: c.modalOptionSelectedBg,')
  .replace(/backgroundColor: c\.border,\n    borderRadius: Radius\.sm,\n    paddingHorizontal: 14,\n    paddingVertical: 10,\n  \},\n  backButtonText:/g, 'backgroundColor: c.modalCloseButtonBg,\n    borderRadius: Radius.sm,\n    paddingHorizontal: 14,\n    paddingVertical: 10,\n  },\n  backButtonText:');

const header = `import { StyleSheet } from 'react-native';
import { Radius, Spacing, Typography } from '@/constants/theme';
import type { DetailThemeColors } from '@/constants/detailThemes';

const EPISODE_PICKER_GAP = 6;

export function createDetailStyles(c: DetailThemeColors) {
  return StyleSheet.create(${body});
}
`;

fs.writeFileSync('utils/detailStyles.ts', header);
console.log('ok', header.length);
