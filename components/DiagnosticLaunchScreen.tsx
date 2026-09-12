import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { DIAGNOSTIC_DELAY_MS, DIAGNOSTIC_EMPTY_DB_NAME } from '@/constants/diagnosticLaunch';
import {
  DB_NAME,
  diagnosticCountDefaultFriends,
  diagnosticEnableFilesystemAndRewritePhotos,
  diagnosticOpenDatabase,
  diagnosticRunInitializeDatabase,
} from '@/db';

type LogLine = {
  at: string;
  text: string;
};

const nowLabel = (): string => {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(
    date.getSeconds()
  ).padStart(2, '0')}`;
};

const logStep = (message: string): void => {
  Sentry.addBreadcrumb({
    category: 'diagnostic',
    level: 'info',
    message,
  });
};

export function DiagnosticLaunchScreen() {
  const [lines, setLines] = useState<LogLine[]>([
    { at: nowLabel(), text: '起動完了。SQLite はまだ開いていない。' },
  ]);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
      }
    };
  }, []);

  const append = useCallback((text: string) => {
    setLines((prev) => [...prev, { at: nowLabel(), text }]);
  }, []);

  const runStep = useCallback(
    (label: string, action: () => string) => {
      logStep(`start:${label}`);
      append(`開始: ${label}`);
      try {
        const detail = action();
        logStep(`ok:${label}`);
        append(`成功: ${label}${detail ? ` / ${detail}` : ''}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logStep(`error:${label}`);
        Sentry.captureException(error, { extra: { diagnosticStep: label } });
        append(`JSエラー: ${label} / ${message}`);
      }
    },
    [append]
  );

  const runDelayedStep = useCallback(
    (label: string, action: () => string) => {
      logStep(`scheduled:${label}`);
      append(`予約: ${label} / ${DIAGNOSTIC_DELAY_MS}ms 後に sqlite する（このタップでは開かない）`);
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
      }
      delayTimerRef.current = setTimeout(() => {
        delayTimerRef.current = null;
        runStep(label, action);
      }, DIAGNOSTIC_DELAY_MS);
    },
    [append, runStep]
  );

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>診断（ビルド26）</Text>
      <Text style={styles.lead}>
        上から順に1つずつ押す。4はボタンでは開かず、2秒後に開いて読む。データは削除しない。
      </Text>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Pressable
          style={styles.button}
          onPress={() =>
            runStep('1. 空の別名DBを開く', () => {
              diagnosticOpenDatabase(DIAGNOSTIC_EMPTY_DB_NAME);
              return DIAGNOSTIC_EMPTY_DB_NAME;
            })
          }
        >
          <Text style={styles.buttonText}>1. 空の別名 DB を開く（読まない）</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() =>
            runStep('2. 既存DBを開く', () => {
              diagnosticOpenDatabase(DB_NAME);
              return DB_NAME;
            })
          }
        >
          <Text style={styles.buttonText}>2. 既存 frienddex.db を開く（読まない）</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() =>
            runStep('3. 友達一覧を読む', () => {
              const count = diagnosticCountDefaultFriends();
              return `件数 ${count}`;
            })
          }
        >
          <Text style={styles.buttonText}>3. 友達一覧を読む</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() =>
            runDelayedStep('4. 2秒後に既存DBを開いて読む', () => {
              diagnosticOpenDatabase(DB_NAME);
              const count = diagnosticCountDefaultFriends();
              return `件数 ${count}`;
            })
          }
        >
          <Text style={styles.buttonText}>4. 2秒待ってから開いて読む（自動相当）</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() =>
            runStep('5. 初期化SQL', () => {
              diagnosticRunInitializeDatabase();
              return 'initializeDatabase 完了';
            })
          }
        >
          <Text style={styles.buttonText}>5. 初期化 SQL を実行</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() =>
            runStep('6. 写真FileSystem', () => {
              diagnosticEnableFilesystemAndRewritePhotos();
              return 'URI 付け替え完了';
            })
          }
        >
          <Text style={styles.buttonText}>6. 写真 FileSystem を有効化</Text>
        </Pressable>

        {lines.map((line, index) => (
          <Text key={`${line.at}-${index}`} style={styles.logLine}>
            {line.at} {line.text}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111111',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  lead: {
    color: '#dddddd',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 16,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 24,
  },
  button: {
    backgroundColor: '#2f6f5e',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  logLine: {
    color: '#c8f5d4',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
  },
});
