import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Theme } from '@/constants/theme';
import { useContentColors } from '@/utils/useContentColors';
import { dismissKeyboardFocus } from '@/utils/dismissKeyboardFocus';

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
  /** 候補にない値を入力して選択できるようにする */
  allowCustomValue?: boolean;
  customInputPlaceholder?: string;
  customActionLabel?: string;
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
  allowCustomValue = false,
  customInputPlaceholder = '新しい項目を入力',
  customActionLabel = '使う',
}: OptionPickerModalProps) {
  const content = useContentColors();
  const [customValue, setCustomValue] = useState('');
  const normalizedCustomValue = customValue.trim();

  useEffect(() => {
    if (visible) {
      setCustomValue('');
    }
  }, [visible]);

  // 自由入力欄にフォーカスが残ったまま閉じると呼び出し元画面でキーボードが残る
  const closePicker = () => {
    dismissKeyboardFocus();
    onClose();
  };

  const applyCustomValue = () => {
    if (!normalizedCustomValue) {
      return;
    }
    onValueChange(normalizedCustomValue);
    closePicker();
  };

  const modalStyles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: Theme.overlay,
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
        customInputRow: {
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: 8,
          marginBottom: 10,
        },
        customInput: {
          flex: 1,
          minHeight: 42,
          borderWidth: 1,
          borderColor: content.contentBorder,
          backgroundColor: content.contentInputBg,
          color: content.contentText,
          borderRadius: Radius.sm,
          paddingHorizontal: 10,
          fontSize: 15,
        },
        customAction: {
          minWidth: 62,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: Radius.sm,
          backgroundColor: content.contentPersonTagBg,
          borderWidth: 1,
          borderColor: content.contentBorder,
          paddingHorizontal: 12,
        },
        customActionDisabled: {
          opacity: 0.45,
        },
        customActionText: {
          color: content.contentText,
          fontSize: 14,
          fontWeight: '700',
        },
      }),
    [content]
  );

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={closePicker}>
      <KeyboardAvoidingView
        style={modalStyles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={closePicker}
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
              onPress={closePicker}
              accessibilityLabel="閉じる"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name="close-outline" size={20} color={content.contentText} />
            </Pressable>
          </View>
          {allowCustomValue ? (
            <View style={modalStyles.customInputRow}>
              <TextInput
                value={customValue}
                onChangeText={setCustomValue}
                style={modalStyles.customInput}
                placeholder={customInputPlaceholder}
                placeholderTextColor={content.contentTextSecondary}
                accessibilityLabel={customInputPlaceholder}
                returnKeyType="done"
                onSubmitEditing={applyCustomValue}
              />
              <Pressable
                style={[
                  modalStyles.customAction,
                  !normalizedCustomValue ? modalStyles.customActionDisabled : null,
                ]}
                onPress={applyCustomValue}
                disabled={!normalizedCustomValue}
                accessibilityLabel={`入力した${label}を${customActionLabel}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: !normalizedCustomValue }}
              >
                <Text style={modalStyles.customActionText}>{customActionLabel}</Text>
              </Pressable>
            </View>
          ) : null}
          <ScrollView style={modalStyles.options} keyboardShouldPersistTaps="handled">
            {clearLabel != null ? (
              <>
                <Pressable
                  style={[modalStyles.option, !value ? modalStyles.optionSelected : null]}
                  onPress={() => {
                    onValueChange('');
                    closePicker();
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
                    closePicker();
                  }}
                >
                  <Text style={modalStyles.optionText}>{option.label}</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
