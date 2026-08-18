import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { FormRow } from '@/components/ui/FormRow';
import { PickerDoneOverlay } from '@/components/ui/PickerDoneOverlay';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentDateTimePickerProps,
  contentInputStyle,
  contentMutedTextStyle,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import {
  DEFAULT_REMIND_TIME,
  MAX_REMIND_DAYS_BEFORE,
  clampRemindTimeToNow,
  dateToRemindTime,
  formatRemindDaysLabel,
  formatRemindTimeLabel,
  remindTimePickerBounds,
  remindTimeToDate,
} from '@/utils/taskNotifications';

type TaskRemindFieldsProps = {
  mode: 'temporary' | 'time-only';
  enabled: boolean;
  daysBefore: number;
  time: string;
  onEnabledChange: (enabled: boolean) => void;
  onDaysBeforeChange: (days: number) => void;
  onTimeChange: (time: string) => void;
  hint?: string;
};

export function TaskRemindFields({
  mode,
  enabled,
  daysBefore,
  time,
  onEnabledChange,
  onDaysBeforeChange,
  onTimeChange,
  hint,
}: TaskRemindFieldsProps) {
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const dateTimePickerProps = contentDateTimePickerProps(appTheme?.variant);
  const resolvedTime = time || DEFAULT_REMIND_TIME;
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [draftTime, setDraftTime] = useState(resolvedTime);
  const pickerBounds = remindTimePickerBounds();

  const commitTime = (next: string) => {
    const clamped = clampRemindTimeToNow(next);
    onTimeChange(clamped);
    setDraftTime(clamped);
  };

  const pickerValue = (() => {
    const raw = remindTimeToDate(draftTime);
    if (raw.getTime() < pickerBounds.minimumDate.getTime()) {
      return pickerBounds.minimumDate;
    }
    if (raw.getTime() > pickerBounds.maximumDate.getTime()) {
      return pickerBounds.maximumDate;
    }
    return raw;
  })();

  return (
    <>
      <FormRow label="リマインド">
        <View style={styles.switchWrap}>
          <Switch
            value={enabled}
            onValueChange={(value) => {
              onEnabledChange(value);
              if (value) {
                onTimeChange(clampRemindTimeToNow(time || DEFAULT_REMIND_TIME));
              }
            }}
            trackColor={{ false: content.contentBorder, true: content.contentText }}
            thumbColor="#ffffff"
          />
        </View>
      </FormRow>
      {enabled ? (
        <>
          {mode === 'temporary' ? (
            <FormRow label="何日前">
              <View style={styles.stepper}>
                <Pressable
                  style={[styles.stepperBtn, contentTagStyle(content)]}
                  onPress={() => onDaysBeforeChange(Math.max(0, daysBefore - 1))}
                  accessibilityLabel="1日減らす"
                >
                  <Text style={contentTextStyle(content)}>−</Text>
                </Pressable>
                <Text style={[styles.stepperValue, contentTextStyle(content)]}>
                  {formatRemindDaysLabel(daysBefore)}
                </Text>
                <Pressable
                  style={[styles.stepperBtn, contentTagStyle(content)]}
                  onPress={() =>
                    onDaysBeforeChange(Math.min(MAX_REMIND_DAYS_BEFORE, daysBefore + 1))
                  }
                  accessibilityLabel="1日増やす"
                >
                  <Text style={contentTextStyle(content)}>＋</Text>
                </Pressable>
              </View>
            </FormRow>
          ) : null}
          <FormRow label="時刻">
            <Pressable
              style={[styles.pickerButton, contentInputStyle(content)]}
              onPress={() => {
                setDraftTime(clampRemindTimeToNow(resolvedTime));
                setShowTimePicker(true);
              }}
            >
              <Text style={[styles.pickerButtonText, contentTextStyle(content)]}>
                {formatRemindTimeLabel(resolvedTime)}
              </Text>
            </Pressable>
          </FormRow>
          {showTimePicker ? (
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={pickerValue}
                mode="time"
                display="spinner"
                locale="ja-JP"
                is24Hour
                minuteInterval={1}
                style={styles.picker}
                {...dateTimePickerProps}
                {...pickerBounds}
                onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                  if (!selected) {
                    return;
                  }
                  const next = clampRemindTimeToNow(dateToRemindTime(selected));
                  setDraftTime(next);
                  if (Platform.OS !== 'ios') {
                    commitTime(next);
                    setShowTimePicker(false);
                  }
                }}
              />
              <PickerDoneOverlay
                style={contentTagStyle(content)}
                textStyle={contentTextStyle(content)}
                onPress={() => {
                  commitTime(draftTime);
                  setShowTimePicker(false);
                }}
              />
            </View>
          ) : null}
        </>
      ) : null}
      {hint ? (
        <Text style={[styles.hint, contentMutedTextStyle(content)]}>{hint}</Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  switchWrap: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  stepperBtn: {
    minWidth: 36,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 56,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
  },
  pickerButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  pickerButtonText: {
    fontSize: 15,
  },
  pickerWrap: {
    marginTop: 8,
    alignItems: 'stretch',
  },
  picker: {
    height: 216,
    alignSelf: 'stretch',
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
});
