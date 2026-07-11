import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { BorderWidth, Radius, Spacing, Theme, Typography } from '@/constants/theme';
import { useUiKit } from '@/contexts/UiPreviewContext';

/** 一覧・エピソードなど、タブ画面上部の検索エリア（UiKit 連動） */
export function useSearchAreaStyles() {
  const kit = useUiKit();

  return useMemo(() => {
    const isFlat = kit.searchAreaStyle === 'singleBorder';

    return StyleSheet.create({
      area: {
        backgroundColor: isFlat ? 'transparent' : Theme.searchAreaBase,
        borderColor: Theme.border,
        borderWidth: isFlat ? 0 : 1,
        borderRadius: isFlat ? 0 : Radius.md,
        padding: kit.searchAreaPadding,
        gap: kit.searchAreaFieldGap,
        marginBottom: 0,
      },
      areaDivider: {
        height: 1,
        backgroundColor: Theme.card,
        marginTop: 10,
        marginBottom: 10,
      },
      areaDividerFlatWrap: {
        width: '100%',
        paddingTop: kit.searchAreaDividerGapBefore,
        paddingBottom: kit.searchAreaBottomGap,
      },
      areaDividerFlatLine: {
        height: 1,
        backgroundColor: Theme.border,
        alignSelf: 'stretch',
      },
      row: {
        flexDirection: 'row',
        gap: kit.searchAreaRowGap,
        alignItems: kit.searchAreaShowFieldLabels ? 'flex-end' : 'stretch',
      },
      fieldContainer: {
        flex: 1,
      },
      fieldLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: Theme.textSecondary,
        marginBottom: 4,
      },
      textInput: {
        backgroundColor: Theme.card,
        borderColor: Theme.searchFieldBorder,
        borderWidth: BorderWidth.input,
        borderRadius: kit.searchAreaFieldBorderRadius,
        color: Theme.textPrimary,
        paddingHorizontal: Spacing.sm,
        paddingVertical: kit.searchAreaShowFieldLabels ? 6 : Spacing.sm,
        fontSize: Typography.base,
        minHeight: kit.searchAreaShowFieldLabels ? 34 : 38,
      },
      textInputActive: {
        borderColor: Theme.accent,
        backgroundColor: Theme.accentLight,
      },
      selectButton: {
        flex: 1,
        backgroundColor: Theme.card,
        borderColor: Theme.searchFieldBorder,
        borderWidth: BorderWidth.input,
        borderRadius: kit.searchAreaFieldBorderRadius,
        paddingHorizontal: Spacing.sm,
        paddingVertical: kit.searchAreaShowFieldLabels ? 6 : Spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: kit.searchAreaShowFieldLabels ? 34 : 38,
      },
      selectButtonActive: {
        borderColor: Theme.accent,
        backgroundColor: Theme.accentLight,
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
      tagField: {
        opacity: 0.72,
      },
      tagPlaceholder: {
        borderColor: Theme.searchFieldBorder,
        borderWidth: BorderWidth.input,
        borderRadius: kit.searchAreaFieldBorderRadius,
        backgroundColor: Theme.card,
        paddingHorizontal: Spacing.sm,
        paddingVertical: kit.searchAreaShowFieldLabels ? 6 : Spacing.sm,
        minHeight: kit.searchAreaShowFieldLabels ? 34 : 38,
        justifyContent: 'center',
      },
      tagPlaceholderText: {
        fontSize: Typography.base,
        color: Theme.textSecondary,
      },
    });
  }, [kit]);
}
