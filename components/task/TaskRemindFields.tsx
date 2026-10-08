import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Radius } from '@/constants/theme';
import { FormRow } from '@/components/ui/FormRow';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSwitchProps,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import {
  DEFAULT_REMIND_TIME,
  MAX_REMIND_DAYS_BEFORE,
  formatRemindDaysLabel,
  formatRemindHourLabel,
  normalizeRemindTime,
  remindHour,
  remindTimeFromHour,
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
  const resolvedTime = normalizeRemindTime(time) ?? DEFAULT_REMIND_TIME;
  const hour = remindHour(resolvedTime);

  const changeHour = (nextHour: number) => {
    onTimeChange(remindTimeFromHour(nextHour));
  };

  return (
    <>
      <FormRow label="リマインド" labelStyle={styles.fieldLabel}>
        <View style={styles.remindRow}>
          <Switch
            value={enabled}
            onValueChange={(value) => {
              onEnabledChange(value);
              if (value) {
                onTimeChange(remindTimeFromHour(hour));
              }
            }}
            {...contentSwitchProps(content, enabled)}
          />
          {enabled && mode === 'temporary' ? (
            <View style={styles.stepper}>
              <Pressable
                style={[styles.stepperBtn, contentTagStyle(content)]}
                onPress={() => onDaysBeforeChange(Math.max(0, daysBefore - 1))}
                accessibilityLabel="1日減らす"
              >
                <Text style={[styles.stepperGlyph, contentTextStyle(content)]}>−</Text>
              </Pressable>
              <Text style={[styles.stepperValue, contentTextStyle(content)]} numberOfLines={1}>
                {formatRemindDaysLabel(daysBefore)}
              </Text>
              <Pressable
                style={[styles.stepperBtn, contentTagStyle(content)]}
                onPress={() =>
                  onDaysBeforeChange(Math.min(MAX_REMIND_DAYS_BEFORE, daysBefore + 1))
                }
                accessibilityLabel="1日増やす"
              >
                <Text style={[styles.stepperGlyph, contentTextStyle(content)]}>＋</Text>
              </Pressable>
            </View>
          ) : null}
          {enabled ? (
            <View style={styles.stepper}>
              <Pressable
                style={[styles.stepperBtn, contentTagStyle(content)]}
                onPress={() => changeHour(hour - 1)}
                disabled={hour <= 0}
                accessibilityLabel="1時間減らす"
              >
                <Text style={[styles.stepperGlyph, contentTextStyle(content), hour <= 0 ? styles.stepperGlyphDisabled : null]}>
                  −
                </Text>
              </Pressable>
              <Text style={[styles.hourValue, contentTextStyle(content)]} numberOfLines={1}>
                {formatRemindHourLabel(resolvedTime)}
              </Text>
              <Pressable
                style={[styles.stepperBtn, contentTagStyle(content)]}
                onPress={() => changeHour(hour + 1)}
                disabled={hour >= 23}
                accessibilityLabel="1時間増やす"
              >
                <Text style={[styles.stepperGlyph, contentTextStyle(content), hour >= 23 ? styles.stepperGlyphDisabled : null]}>
                  ＋
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </FormRow>
      {hint ? (
        <Text style={[styles.hint, contentMutedTextStyle(content)]}>{hint}</Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    width: 72,
    textAlign: 'left',
  },
  remindRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
  },
  stepperBtn: {
    width: 22,
    height: 22,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
  },
  stepperGlyphDisabled: {
    opacity: 0.35,
  },
  stepperValue: {
    minWidth: 36,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  hourValue: {
    minWidth: 32,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
});
