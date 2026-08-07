import { useMemo, useState, type ReactNode } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { OptionPickerModal } from '@/components/ui/OptionPickerModal';
import { useSearchAreaStyles } from '@/utils/useSearchAreaStyles';
import { useContentColors } from '@/utils/useContentColors';
import { dismissKeyboardFocus } from '@/utils/dismissKeyboardFocus';

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
        onPress={() => {
          dismissKeyboardFocus();
          onPress();
        }}
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
  const [visible, setVisible] = useState(false);
  const displayText = useMemo(() => {
    if (!value) return '';
    return options.find((item) => item.value === value)?.label ?? value;
  }, [options, value]);

  return (
    <>
      <SearchAreaSelectTrigger
        label={label}
        value={value}
        displayText={displayText}
        onPress={() => setVisible(true)}
        style={style}
      />
      <OptionPickerModal
        visible={visible}
        label={label}
        value={value}
        options={options}
        onValueChange={onValueChange}
        onClose={() => setVisible(false)}
      />
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
