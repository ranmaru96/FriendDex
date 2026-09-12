import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { DIAGNOSTIC_EMPTY_DB_NAME } from '@/constants/diagnosticLaunch';
import {
  DB_NAME,
  diagnosticCountDefaultFriends,
  diagnosticOpenDatabase,
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

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>診断（ビルド25）</Text>
      <Text style={styles.lead}>
        上から順に1つずつ押す。落ちた段が原因。データは削除しない。
      </Text>

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

      <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
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
  log: {
    flex: 1,
    marginTop: 8,
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
  },
  logContent: {
    padding: 12,
  },
  logLine: {
    color: '#c8f5d4',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
  },
});
