import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { BorderWidth, Radius, Spacing, Typography } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useContentColors } from '@/utils/useContentColors';

/** 一覧・エピソードなど、タブ画面上部の検索エリア（UiKit 連動） */
export function useSearchAreaStyles() {
  const kit = useUiKit();
  const content = useContentColors();
  const appTheme = useAppThemeOptional();

  return useMemo(() => {
    const isFlat = kit.searchAreaStyle === 'singleBorder';
    // ホワイトは画面(#F2)の上でカード／絞り込みを真っ白に寄せる
    const fieldBg =
      appTheme?.variant === 'white' ? content.contentCard : content.contentInputBg;
    const searchAreaBg =
      appTheme?.variant === 'white' ? content.contentCard : content.contentSearchArea;

    return StyleSheet.create({
      area: {
        backgroundColor: isFlat ? 'transparent' : searchAreaBg,
        borderColor: content.contentBorder,
        borderWidth: isFlat ? 0 : 1,
        borderRadius: isFlat ? 0 : Radius.md,
        padding: kit.searchAreaPadding,
        gap: kit.searchAreaFieldGap,
        marginBottom: 0,
      },
      areaDivider: {
        height: 1,
        backgroundColor: content.contentCard,
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
        backgroundColor: content.contentDivider,
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
        color: content.contentTextSecondary,
        marginBottom: 4,
      },
      textInput: {
        backgroundColor: fieldBg,
        borderColor: content.contentSearchFieldBorder,
        borderWidth: BorderWidth.input,
        borderRadius: kit.searchAreaFieldBorderRadius,
        color: content.contentText,
        paddingHorizontal: Spacing.sm,
        paddingVertical: kit.searchAreaShowFieldLabels ? 6 : Spacing.sm,
        fontSize: Typography.base,
        minHeight: kit.searchAreaShowFieldLabels ? 34 : 38,
      },
      textInputActive: {
        borderColor: content.contentText,
        backgroundColor: fieldBg,
      },
      selectButton: {
        flex: 1,
        backgroundColor: fieldBg,
        borderColor: content.contentSearchFieldBorder,
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
        borderColor: content.contentText,
        backgroundColor: fieldBg,
      },
      selectValue: {
        fontSize: Typography.base,
        color: content.contentText,
        flex: 1,
      },
      selectPlaceholder: {
        fontSize: Typography.base,
        color: content.contentTextSecondary,
        flex: 1,
      },
      tagField: {
        opacity: 0.72,
      },
      tagPlaceholder: {
        borderColor: content.contentSearchFieldBorder,
        borderWidth: BorderWidth.input,
        borderRadius: kit.searchAreaFieldBorderRadius,
        backgroundColor: fieldBg,
        paddingHorizontal: Spacing.sm,
        paddingVertical: kit.searchAreaShowFieldLabels ? 6 : Spacing.sm,
        minHeight: kit.searchAreaShowFieldLabels ? 34 : 38,
        justifyContent: 'center',
      },
      tagPlaceholderText: {
        fontSize: Typography.base,
        color: content.contentTextSecondary,
      },
    });
  }, [appTheme?.variant, content, kit]);
}
