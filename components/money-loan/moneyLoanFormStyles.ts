import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import type { AppThemeContentColorFields } from '@/constants/appThemes/contentColors';
import { Radius, Spacing, Theme, Typography } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useContentColors } from '@/utils/useContentColors';

export const MONEY_LOAN_FORM_LABEL_WIDTH = 72;

export function createMoneyLoanFormStyles(
  c: AppThemeContentColorFields,
  onBaseText: string = Theme.topBarText
) {
  return StyleSheet.create({
    formCard: {
      backgroundColor: c.contentCard,
      borderWidth: 1,
      borderColor: c.contentBorder,
      borderRadius: Radius.md,
      padding: Spacing.md,
      gap: 6,
    },
    sectionTitleOnCard: {
      fontSize: 16,
      fontWeight: '700',
      color: c.contentText,
      marginBottom: 2,
    },
    sectionTitleOnBase: {
      fontSize: 16,
      fontWeight: '700',
      color: onBaseText,
    },
    formRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    formLabel: {
      width: MONEY_LOAN_FORM_LABEL_WIDTH,
      fontSize: Typography.sm,
      fontWeight: '600',
      color: c.contentText,
    },
    fieldSectionLabel: {
      fontSize: Typography.sm,
      fontWeight: '700',
      color: c.contentText,
      marginTop: 4,
    },
    textInput: {
      flex: 1,
      minWidth: 0,
      backgroundColor: c.contentInputBg,
      borderColor: c.contentSearchFieldBorder,
      borderWidth: 1,
      borderRadius: Radius.md,
      color: c.contentText,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 6,
      fontSize: 13,
      minHeight: 34,
    },
    modeRow: {
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      minWidth: 0,
    },
    modeButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.contentSearchFieldBorder,
      borderRadius: Radius.md,
      backgroundColor: c.contentInputBg,
      paddingVertical: 8,
      alignItems: 'center',
    },
    modeButtonSelected: {
      borderColor: c.contentText,
      backgroundColor: c.contentPersonTagBg,
    },
    modeButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.contentText,
    },
    modeButtonTextSelected: {
      color: c.contentText,
    },
    splitPreview: {
      fontSize: 12,
      color: c.contentText,
      fontWeight: '600',
    },
    splitPreviewIndented: {
      fontSize: 12,
      color: c.contentText,
      fontWeight: '600',
      marginLeft: MONEY_LOAN_FORM_LABEL_WIDTH + 8,
    },
    participantRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    addParticipantButton: {
      flex: 1,
      minWidth: 0,
      backgroundColor: c.contentInputBg,
      borderColor: c.contentSearchFieldBorder,
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      alignItems: 'center',
    },
    addParticipantButtonText: {
      color: c.contentText,
      fontSize: 12,
      fontWeight: '700',
    },
    selectedEntryTagArea: {
      marginLeft: MONEY_LOAN_FORM_LABEL_WIDTH + 8,
      borderColor: c.contentSearchFieldBorder,
      borderWidth: 1,
      borderRadius: Radius.md,
      backgroundColor: c.contentInputBg,
      padding: 8,
    },
    selectedEntryEmptyText: {
      fontSize: 13,
      color: c.contentTextSecondary,
    },
    selectedEntryHint: {
      fontSize: 11,
      color: c.contentTextSecondary,
      marginTop: 4,
    },
    individualSection: {
      gap: 8,
    },
    individualRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: c.contentBorder,
      borderRadius: Radius.md,
      backgroundColor: c.contentCard,
      padding: 8,
    },
    individualName: {
      width: 72,
      fontSize: 13,
      fontWeight: '600',
      color: c.contentText,
    },
    individualAmountInput: {
      flex: 1,
      minWidth: 0,
      backgroundColor: c.contentInputBg,
      borderColor: c.contentSearchFieldBorder,
      borderWidth: 1,
      borderRadius: Radius.sm,
      color: c.contentText,
      paddingHorizontal: 8,
      paddingVertical: 6,
      fontSize: 13,
      minHeight: 34,
    },
    individualDirectionRow: {
      flexDirection: 'row',
      gap: 4,
    },
    individualDirectionButton: {
      borderWidth: 1,
      borderColor: c.contentSearchFieldBorder,
      borderRadius: Radius.sm,
      backgroundColor: c.contentInputBg,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    individualDirectionButtonSelected: {
      borderColor: c.contentText,
      backgroundColor: c.contentPersonTagBg,
    },
    individualDirectionText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.contentTextSecondary,
    },
    individualDirectionTextSelected: {
      color: c.contentText,
    },
    formError: {
      fontSize: 12,
      color: '#b91c1c',
    },
    primaryButton: {
      marginTop: 4,
      backgroundColor: c.contentText,
      borderRadius: Radius.md,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: c.contentCard,
      fontWeight: '700',
      fontSize: 14,
    },
    emptyTextOnBase: {
      fontSize: 13,
      color: onBaseText,
      textAlign: 'center',
      paddingVertical: 12,
    },
    recentCounterpartySection: {
      gap: 6,
      marginTop: 2,
      marginLeft: MONEY_LOAN_FORM_LABEL_WIDTH + 8,
    },
    recentCounterpartyLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: c.contentTextSecondary,
    },
  });
}

/** @deprecated Prefer useMoneyLoanFormStyles() for theme-aware colors */
export const moneyLoanFormStyles = createMoneyLoanFormStyles(
  {
    contentCard: Theme.card,
    contentBorder: Theme.border,
    contentText: Theme.textPrimary,
    contentTextSecondary: Theme.textSecondary,
    contentPersonTagBg: '#F7F7F8',
    contentSearchArea: Theme.searchAreaBase,
    contentSearchFieldBorder: Theme.searchFieldBorder,
    contentInputBg: Theme.card,
    contentPhotoInnerBorder: Theme.homeCardPhotoInnerBorder,
    contentPhotoPlaceholder: Theme.homeCardPhotoPlaceholder,
    contentPhotoPlaceholderText: Theme.homeCardPhotoPlaceholderText,
    contentCardName: Theme.homeCardName,
    contentCalendarInMonth: '#f1f5f9',
    contentCalendarOutMonth: Theme.card,
    contentDivider: Theme.border,
  },
  Theme.topBarText
);

export function useMoneyLoanFormStyles() {
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const onBaseText = appTheme?.colors.topBarText ?? Theme.topBarText;
  return useMemo(() => createMoneyLoanFormStyles(content, onBaseText), [content, onBaseText]);
}
