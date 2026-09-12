import { StyleSheet, Text, View } from 'react-native';
import { FRIENDEX_GOOGLE_CALENDAR_SUMMARY } from '@/constants/googleCalendar';
import { isMonochromeAppTheme } from '@/constants/appThemes';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { OffsetCard } from '@/components/ui/OffsetCard';
import { Radius, Theme, Typography } from '@/constants/theme';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { isGoogleCalendarAuthConfigured } from '@/lib/googleAuth';
import { isGoogleCalendarNativeAvailable } from '@/lib/googleNativeAvailability';

type ThemedStyles = {
  sectionHeader: object | null;
  hint: object | null;
  rowLabel: object | null;
  group: object | null;
  separator: object | null;
};

function GoogleCalendarConnectLazy({ themed }: { themed: ThemedStyles }) {
  const { GoogleCalendarConnectControls } =
    require('./GoogleCalendarConnectControls') as typeof import('./GoogleCalendarConnectControls');
  return <GoogleCalendarConnectControls themed={themed} />;
}

export function GoogleCalendarSettingsSection({ themed }: { themed: ThemedStyles }) {
  const { variant, colors, patternId } = useAppTheme();
  const isMonochrome = isMonochromeAppTheme(variant);
  const nativeReady = isGoogleCalendarNativeAvailable();
  const configured = isGoogleCalendarAuthConfigured();
  const isCodex = usesOffsetChrome(patternId);

  const body = !nativeReady ? (
    <View style={styles.row}>
      <Text style={[styles.emptyText, themed.hint]}>
        このビルドでは接続できません
      </Text>
    </View>
  ) : configured ? (
    <GoogleCalendarConnectLazy themed={themed} />
  ) : (
    <View style={styles.row}>
      <Text style={[styles.emptyText, themed.hint]}>
        Google Cloud の OAuth クライアント ID が未設定です
      </Text>
    </View>
  );

  const group = isCodex ? (
    <OffsetCard style={{ marginHorizontal: 16 }}>{body}</OffsetCard>
  ) : (
    <View style={[styles.group, themed.group]}>{body}</View>
  );

  return (
    <>
      <Text
        style={[
          styles.sectionHeader,
          themed.sectionHeader,
          isMonochrome && { color: colors.onScreenText },
        ]}
      >
        Google カレンダー
      </Text>
      {group}
      <Text style={[styles.hint, themed.hint]}>
        {!nativeReady
          ? `アプリの予定を Google の「${FRIENDEX_GOOGLE_CALENDAR_SUMMARY}」専用カレンダーへ送る機能です。このビルドでは接続用モジュールを外しているため、今は使えません。`
          : configured
            ? `アプリの予定を Google の「${FRIENDEX_GOOGLE_CALENDAR_SUMMARY}」専用カレンダーへ送ります。接続後に作成・更新・削除した予定も自動で反映します。`
            : `使うには Google Cloud で Calendar API を有効化し、このアプリ用の OAuth クライアント ID（iOS / Android）を発行してください。\nEAS の production に EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID と EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID を入れてからビルドしてください。`}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: Typography.base,
    fontWeight: '600',
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  group: {
    marginHorizontal: 16,
    borderRadius: Radius.md,
    backgroundColor: Theme.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  emptyText: {
    fontSize: 15,
    color: '#64748b',
  },
  hint: {
    marginTop: 12,
    marginHorizontal: 16,
    fontSize: Typography.base,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
});
