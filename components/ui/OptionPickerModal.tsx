import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Theme } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useContentColors } from '@/utils/useContentColors';

export type OptionPickerItem = {
  label: string;
  value: string;
};

type OptionPickerModalProps = {
  visible: boolean;
  label: string;
  value: string;
  options: OptionPickerItem[];
  onValueChange: (value: string) => void;
  onClose: () => void;
  /** 先頭のクリア行ラベル。null で非表示 */
  clearLabel?: string | null;
};

/** 一覧検索の所属／経験選択と同じ見た目の選択肢モーダル */
export function OptionPickerModal({
  visible,
  label,
  value,
  options,
  onValueChange,
  onClose,
  clearLabel = '指定なし',
}: OptionPickerModalProps) {
  const content = useContentColors();
  const appTheme = useAppThemeOptional();

  const modalStyles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: appTheme?.colors.overlay ?? Theme.overlay,
          justifyContent: 'center',
          padding: 24,
        },
        card: {
          backgroundColor: content.contentCard,
          borderColor: content.contentBorder,
          borderWidth: 1,
          borderRadius: Radius.md,
          padding: 16,
          maxHeight: '70%',
        },
        titleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        },
        titleTag: {
          flexShrink: 1,
          backgroundColor: content.contentPersonTagBg,
          borderColor: content.contentBorder,
          borderWidth: 1,
          borderRadius: Radius.sm,
          paddingHorizontal: 10,
          paddingVertical: 4,
        },
        titleTagText: {
          fontSize: 13,
          fontWeight: '700',
          color: content.contentText,
        },
        closeIconButton: {
          width: 32,
          height: 32,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: Radius.sm,
          borderWidth: 1,
          borderColor: content.contentBorder,
          backgroundColor: content.contentPersonTagBg,
        },
        options: {
          maxHeight: 320,
        },
        option: {
          paddingVertical: 12,
          paddingHorizontal: 8,
          borderRadius: 8,
        },
        optionSelected: {
          backgroundColor: content.contentInputBg,
          borderWidth: 1,
          borderColor: content.contentText,
        },
        optionDivider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: content.contentDivider,
          marginLeft: 8,
        },
        clearOptionDivider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: content.contentBorder,
          marginVertical: 2,
        },
        optionText: {
          fontSize: 15,
          color: content.contentText,
        },
        clearOptionText: {
          fontSize: 15,
          color: content.contentTextSecondary,
          fontWeight: '500',
        },
      }),
    [appTheme?.colors.overlay, content]
  );

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={modalStyles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityLabel="閉じる"
          accessibilityRole="button"
        />
        <View style={modalStyles.card}>
          <View style={modalStyles.titleRow}>
            <View style={modalStyles.titleTag}>
              <Text style={modalStyles.titleTagText}>{label}</Text>
            </View>
            <Pressable
              style={modalStyles.closeIconButton}
              onPress={onClose}
              accessibilityLabel="閉じる"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name="close-outline" size={20} color={content.contentText} />
            </Pressable>
          </View>
          <ScrollView style={modalStyles.options} keyboardShouldPersistTaps="handled">
            {clearLabel != null ? (
              <>
                <Pressable
                  style={[modalStyles.option, !value ? modalStyles.optionSelected : null]}
                  onPress={() => {
                    onValueChange('');
                    onClose();
                  }}
                >
                  <Text style={modalStyles.clearOptionText}>{clearLabel}</Text>
                </Pressable>
                <View style={modalStyles.clearOptionDivider} />
              </>
            ) : null}
            {options.map((option, index) => (
              <View key={option.value}>
                {index > 0 ? <View style={modalStyles.optionDivider} /> : null}
                <Pressable
                  style={[
                    modalStyles.option,
                    option.value === value ? modalStyles.optionSelected : null,
                  ]}
                  onPress={() => {
                    onValueChange(option.value);
                    onClose();
                  }}
                >
                  <Text style={modalStyles.optionText}>{option.label}</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
