import { StyleSheet } from 'react-native';
import { BorderWidth, Radius, Spacing, Theme, Typography } from '@/constants/theme';

/** 検索項目の上端〜エリア枠上端の距離（左右下も同値） */
const SEARCH_AREA_INSET = 10;

/** 一覧・エピソードなど、タブ画面上部の検索エリア共通スタイル */
export const searchAreaStyles = StyleSheet.create({
  area: {
    backgroundColor: Theme.searchAreaBase,
    borderColor: Theme.border,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: SEARCH_AREA_INSET,
    gap: 8,
    marginBottom: 0,
  },
  areaDivider: {
    height: 1,
    backgroundColor: Theme.card,
    marginTop: 10,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  fieldContainer: {
    flex: 1,
  },
  textInput: {
    backgroundColor: Theme.card,
    borderColor: Theme.searchFieldBorder,
    borderWidth: BorderWidth.input,
    borderRadius: Radius.md,
    color: Theme.textPrimary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.base,
    minHeight: 38,
  },
  selectButton: {
    flex: 1,
    backgroundColor: Theme.card,
    borderColor: Theme.searchFieldBorder,
    borderWidth: BorderWidth.input,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 38,
  },
  selectValue: {
    fontSize: Typography.base,
    color: Theme.textPrimary,
    flex: 1,
  },
  selectPlaceholder: {
    fontSize: Typography.base,
    color: Theme.textSecondary,
    flex: 1,
  },
  selectChevron: {
    fontSize: 10,
    color: Theme.textSecondary,
    marginLeft: 4,
  },
  tagField: {
    opacity: 0.72,
  },
  tagPlaceholder: {
    borderColor: Theme.searchFieldBorder,
    borderWidth: BorderWidth.input,
    borderRadius: Radius.md,
    backgroundColor: Theme.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 38,
    justifyContent: 'center',
  },
  tagPlaceholderText: {
    fontSize: Typography.base,
    color: Theme.textSecondary,
  },
});
