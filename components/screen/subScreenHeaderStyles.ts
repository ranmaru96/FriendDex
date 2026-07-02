import { StyleSheet } from 'react-native';
import { Spacing, Theme } from '@/constants/theme';

/** hideNav サブ画面の共通トップバー（背景＝screenBase、白文字、薄い下線） */
export const subScreenHeaderStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    minHeight: 48,
    backgroundColor: Theme.screenBase,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.topBarBorder,
  },
  sideBack: {
    minWidth: 64,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  side: {
    minWidth: 64,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: Theme.topBarText,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: Theme.topBarText,
    textAlign: 'center',
  },
  titleLeft: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Theme.topBarText,
  },
});
