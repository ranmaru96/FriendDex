import { useMemo, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Theme } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useSearchAreaStyles } from '@/utils/useSearchAreaStyles';
import { useContentColors } from '@/utils/useContentColors';

type SearchAreaProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type SearchAreaRowProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type SearchAreaSelectTriggerProps = {
  label: string;
  value: string;
  displayText: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

type SearchAreaSelectFieldProps = {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onValueChange: (value: string) => void;
  style?: StyleProp<ViewStyle>;
};

type SearchAreaTextInputFieldProps = TextInputProps & {
  label: string;
  value: string;
  style?: StyleProp<ViewStyle>;
};

export function SearchArea({ children, style }: SearchAreaProps) {
  const styles = useSearchAreaStyles();
  return <View style={[styles.area, style]}>{children}</View>;
}

export function SearchAreaRow({ children, style }: SearchAreaRowProps) {
  const styles = useSearchAreaStyles();
  return <View style={[styles.row, style]}>{children}</View>;
}

export function SearchAreaDivider() {
  const styles = useSearchAreaStyles();
  const kit = useUiKit();
  if (kit.searchAreaStyle === 'singleBorder') {
    return (
      <View style={styles.areaDividerFlatWrap}>
        <View style={styles.areaDividerFlatLine} />
      </View>
    );
  }
  return <View style={styles.areaDivider} />;
}

export function SearchAreaField({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const kit = useUiKit();
  const styles = useSearchAreaStyles();
  return (
    <View style={[styles.fieldContainer, style]}>
      {kit.searchAreaShowFieldLabels ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      {children}
    </View>
  );
}

function SearchAreaChevron() {
  const kit = useUiKit();
  const content = useContentColors();
  if (kit.searchAreaShowFieldLabels) {
    return <Ionicons name="chevron-down" size={14} color={content.contentTextSecondary} />;
  }
  return <Text style={{ fontSize: 10, color: content.contentTextSecondary, marginLeft: 4 }}>▼</Text>;
}

export function SearchAreaSelectTrigger({
  label,
  value,
  displayText,
  onPress,
  style,
}: SearchAreaSelectTriggerProps) {
  const kit = useUiKit();
  const styles = useSearchAreaStyles();
  const hasValue = Boolean(value);
  const showPlaceholder = kit.searchAreaShowFieldLabels ? !hasValue : !displayText;

  return (
    <SearchAreaField label={label} style={style}>
      <Pressable
        style={[styles.selectButton, hasValue ? styles.selectButtonActive : null]}
        onPress={onPress}
      >
        <Text
          style={showPlaceholder ? styles.selectPlaceholder : styles.selectValue}
          numberOfLines={1}
        >
          {kit.searchAreaShowFieldLabels
            ? hasValue
              ? displayText
              : '選択'
            : displayText || label}
        </Text>
        <SearchAreaChevron />
      </Pressable>
    </SearchAreaField>
  );
}

export function SearchAreaSelectField({
  label,
  value,
  options,
  onValueChange,
  style,
}: SearchAreaSelectFieldProps) {
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const [visible, setVisible] = useState(false);
  const displayText = useMemo(() => {
    if (!value) return '';
    return options.find((item) => item.value === value)?.label ?? value;
  }, [options, value]);
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
        title: {
          fontSize: 16,
          fontWeight: '700',
          color: content.contentText,
          marginBottom: 10,
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
        optionText: {
          fontSize: 15,
          color: content.contentText,
        },
        closeButton: {
          marginTop: 12,
          alignItems: 'center',
          paddingVertical: 10,
        },
        closeButtonText: {
          fontSize: 15,
          color: content.contentTextSecondary,
          fontWeight: '600',
        },
      }),
    [appTheme?.colors.overlay, content]
  );

  return (
    <>
      <SearchAreaSelectTrigger
        label={label}
        value={value}
        displayText={displayText}
        onPress={() => setVisible(true)}
        style={style}
      />
      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={modalStyles.backdrop}>
          <View style={modalStyles.card}>
            <Text style={modalStyles.title}>{label}</Text>
            <ScrollView style={modalStyles.options}>
              <Pressable
                style={[modalStyles.option, !value && modalStyles.optionSelected]}
                onPress={() => {
                  onValueChange('');
                  setVisible(false);
                }}
              >
                <Text style={modalStyles.optionText}>指定なし</Text>
              </Pressable>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[modalStyles.option, option.value === value && modalStyles.optionSelected]}
                  onPress={() => {
                    onValueChange(option.value);
                    setVisible(false);
                  }}
                >
                  <Text style={modalStyles.optionText}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={modalStyles.closeButton} onPress={() => setVisible(false)}>
              <Text style={modalStyles.closeButtonText}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function SearchAreaTextInputField({
  label,
  value,
  style: fieldStyle,
  ...textInputProps
}: SearchAreaTextInputFieldProps) {
  const kit = useUiKit();
  const styles = useSearchAreaStyles();
  const content = useContentColors();
  const hasValue = Boolean(value.trim());

  return (
    <SearchAreaField label={label} style={fieldStyle}>
      <TextInput
        {...textInputProps}
        value={value}
        placeholder={kit.searchAreaShowFieldLabels ? '入力' : label}
        placeholderTextColor={content.contentTextSecondary}
        style={[styles.textInput, hasValue ? styles.textInputActive : null]}
      />
    </SearchAreaField>
  );
}
