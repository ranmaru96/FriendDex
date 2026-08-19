import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FRIENDEX_GOOGLE_CALENDAR_SUMMARY } from '@/constants/googleCalendar';
import { Theme } from '@/constants/theme';
import {
  GOOGLE_CALENDAR_AUTH_SCOPES,
  getGoogleClientIds,
  getGoogleNativeRedirectUri,
  saveGoogleTokens,
  tokensFromAuthSession,
} from '@/lib/googleAuth';
import { isGoogleCalendarNativeAvailable } from '@/lib/googleNativeAvailability';
import {
  completeGoogleCalendarConnect,
  disconnectGoogleCalendar,
  getGoogleCalendarConnectionSnapshot,
  pushAllLocalEventsToGoogleCalendar,
} from '@/utils/googleCalendarSync';

let Google: typeof import('expo-auth-session/providers/google') | null = null;
try {
  if (isGoogleCalendarNativeAvailable()) {
    Google = require('expo-auth-session/providers/google') as typeof import('expo-auth-session/providers/google');
  }
} catch {
  Google = null;
}

export type GoogleCalendarSettingsThemed = {
  sectionHeader: object | null;
  hint: object | null;
  rowLabel: object | null;
  group: object | null;
  separator: object | null;
};

const formatSyncAt = (iso: string | null): string | null => {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
};

export function GoogleCalendarConnectControls({
  themed,
}: {
  themed: GoogleCalendarSettingsThemed;
}) {
  if (!Google) {
    return null;
  }
  return <GoogleCalendarConnectControlsInner themed={themed} />;
}

function GoogleCalendarConnectControlsInner({
  themed,
}: {
  themed: GoogleCalendarSettingsThemed;
}) {
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState(getGoogleCalendarConnectionSnapshot);
  const handledResponseKey = useRef<string | null>(null);

  const clientIds = useMemo(() => getGoogleClientIds(), []);
  const nativeRedirectUri = useMemo(() => getGoogleNativeRedirectUri(), []);

  const [request, response, promptAsync] = Google!.useAuthRequest(
    {
      iosClientId: clientIds.iosClientId,
      androidClientId: clientIds.androidClientId,
      webClientId: clientIds.webClientId,
      clientId: clientIds.iosClientId ?? clientIds.androidClientId ?? clientIds.webClientId,
      scopes: [...GOOGLE_CALENDAR_AUTH_SCOPES],
      extraParams: {
        access_type: 'offline',
        prompt: 'consent select_account',
      },
    },
    nativeRedirectUri ? { native: nativeRedirectUri } : undefined
  );

  const reloadSnapshot = useCallback(() => {
    setSnapshot(getGoogleCalendarConnectionSnapshot());
  }, []);

  useEffect(() => {
    reloadSnapshot();
  }, [reloadSnapshot]);

  const finishConnect = useCallback(async () => {
    setBusy(true);
    try {
      const { email, result } = await completeGoogleCalendarConnect();
      reloadSnapshot();
      const failedNote =
        result.failed > 0 ? `\n送信に失敗した予定: ${result.failed}件` : '';
      Alert.alert(
        '接続しました',
        `${FRIENDEX_GOOGLE_CALENDAR_SUMMARY} カレンダーへ既存の予定を送りました（${result.pushed}件）${failedNote}${
          email ? `\nアカウント: ${email}` : ''
        }`
      );
    } catch (error) {
      Alert.alert(
        '接続エラー',
        error instanceof Error ? error.message : 'Google カレンダーへの接続に失敗しました。'
      );
    } finally {
      setBusy(false);
      reloadSnapshot();
    }
  }, [reloadSnapshot]);

  useEffect(() => {
    if (!response) {
      return;
    }
    const responseKey =
      response.type === 'success'
        ? `success:${response.authentication?.accessToken ?? ''}`
        : `${response.type}`;
    if (handledResponseKey.current === responseKey) {
      return;
    }
    handledResponseKey.current = responseKey;

    if (response.type !== 'success' || !response.authentication?.accessToken) {
      if (response.type === 'error') {
        Alert.alert('接続エラー', response.error?.message ?? 'Google ログインに失敗しました。');
      }
      return;
    }

    void (async () => {
      await saveGoogleTokens(tokensFromAuthSession(response.authentication!));
      await finishConnect();
    })();
  }, [finishConnect, response]);

  const connected = Boolean(snapshot.calendarId);
  const lastSyncLabel = formatSyncAt(snapshot.lastSyncAt);

  const handleConnect = async () => {
    if (!request || busy) {
      return;
    }
    try {
      await promptAsync();
    } catch (error) {
      Alert.alert(
        '接続エラー',
        error instanceof Error ? error.message : 'Google ログインを開始できませんでした。'
      );
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      '接続を解除',
      `Google カレンダーとの接続を解除します。${FRIENDEX_GOOGLE_CALENDAR_SUMMARY} カレンダー自体は Google 側に残ります。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '解除',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await disconnectGoogleCalendar();
              } finally {
                setBusy(false);
                reloadSnapshot();
              }
            })();
          },
        },
      ]
    );
  };

  const handlePushExisting = () => {
    if (busy) {
      return;
    }
    void (async () => {
      setBusy(true);
      try {
        const result = await pushAllLocalEventsToGoogleCalendar();
        reloadSnapshot();
        Alert.alert(
          '送信しました',
          `Google カレンダーへ ${result.pushed}件送りました。${
            result.failed > 0 ? `\n失敗: ${result.failed}件` : ''
          }`
        );
      } catch (error) {
        Alert.alert(
          '送信エラー',
          error instanceof Error ? error.message : '既存の予定の送信に失敗しました。'
        );
      } finally {
        setBusy(false);
        reloadSnapshot();
      }
    })();
  };

  return (
    <>
      {connected ? (
        <>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, themed.rowLabel]}>接続中</Text>
              <Text style={[styles.rowMeta, themed.hint]}>
                {snapshot.email ?? `${FRIENDEX_GOOGLE_CALENDAR_SUMMARY} カレンダー`}
              </Text>
            </View>
            {busy ? <ActivityIndicator /> : null}
          </View>
          <View style={[styles.separator, themed.separator]} />
          <Pressable style={styles.row} onPress={handlePushExisting} disabled={busy}>
            <Text style={[styles.rowLabel, themed.rowLabel]}>既存の予定を再送信</Text>
          </Pressable>
          <View style={[styles.separator, themed.separator]} />
          <Pressable style={styles.row} onPress={handleDisconnect} disabled={busy}>
            <Text style={[styles.rowLabel, styles.destructive, themed.rowLabel]}>接続を解除</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={styles.row} onPress={() => void handleConnect()} disabled={!request || busy}>
          <Text style={[styles.rowLabel, themed.rowLabel]}>Google アカウントを接続</Text>
          {busy ? <ActivityIndicator /> : <Text style={[styles.rowChevron, themed.hint]}>›</Text>}
        </Pressable>
      )}
      {lastSyncLabel ? (
        <Text style={[styles.inlineHint, themed.hint]}>最終送信: {lastSyncLabel}</Text>
      ) : null}
      {snapshot.lastError ? (
        <Text style={[styles.inlineHint, styles.errorHint]}>{snapshot.lastError}</Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
  },
  rowLabel: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '500',
  },
  rowMeta: {
    marginTop: 4,
    fontSize: 13,
  },
  rowChevron: {
    fontSize: 22,
    color: '#94a3b8',
    fontWeight: '500',
  },
  destructive: {
    color: '#b91c1c',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e2e8f0',
    marginLeft: 16,
  },
  inlineHint: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  errorHint: {
    color: '#b91c1c',
  },
});
