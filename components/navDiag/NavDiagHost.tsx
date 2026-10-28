import { useEffect, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useNavigationContainerRef } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const ENABLED = process.env.EXPO_PUBLIC_NAV_DIAG === '1';
const ACTIVE_WINDOW_MS = 2000;
const MAX_LINES = 300;
const LOG_FILE_NAME = 'nav-diag.txt';

type NavRoute = {
  name?: string;
  key?: string;
  state?: NavState;
};

type NavState = {
  index?: number;
  routes?: NavRoute[];
};

type ActionPayload = {
  name?: unknown;
  pop?: unknown;
  params?: {
    screen?: unknown;
    pop?: unknown;
  };
};

type DiagAction = {
  type?: string;
  payload?: ActionPayload;
};

type DiagEvent = {
  data?: {
    action?: DiagAction;
    noop?: boolean;
  };
};

type ContainerRef = {
  addListener: (event: string, callback: (event: DiagEvent) => void) => () => void;
  getRootState: () => NavState | undefined;
};

const lines: string[] = [];
const lineListeners = new Set<() => void>();
let windowUntil = 0;
let lastStateLine = '';
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function stamp(date = new Date()): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function logText(): string {
  return lines.join('\n');
}

function pushLine(text: string, persist = true): void {
  lines.push(`${stamp()} ${text}`);
  if (lines.length > MAX_LINES) {
    lines.splice(0, lines.length - MAX_LINES);
  }
  lineListeners.forEach((listener) => listener());
  if (persist) {
    schedulePersist();
  }
}

function logFileUri(): string | null {
  if (!FileSystem.cacheDirectory) {
    return null;
  }
  return `${FileSystem.cacheDirectory}${LOG_FILE_NAME}`;
}

function schedulePersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistLog();
  }, 400);
}

async function persistLog(): Promise<void> {
  const uri = logFileUri();
  if (!uri) {
    return;
  }
  try {
    await FileSystem.writeAsStringAsync(uri, logText());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushLine(`file error ${message}`, false);
  }
}

function inActiveWindow(): boolean {
  return Date.now() < windowUntil;
}

function field(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '-';
}

function summarizeAction(action: DiagAction, noop: boolean | undefined): string {
  const payload = action.payload;
  const params = payload?.params;
  const pop = payload?.pop === true || params?.pop === true;
  return `action type=${field(action.type)} name=${field(payload?.name)} screen=${field(params?.screen)} pop=${pop ? '1' : '0'} noop=${noop ? '1' : '0'}`;
}

function appStack(root: NavState | undefined): NavState | undefined {
  const routes = root?.routes;
  if (!routes || routes.length === 0) {
    return undefined;
  }
  const slot = routes.find((route) => route.name === '__root') ?? routes[root?.index ?? 0];
  return slot?.state;
}

function summarizeState(root: NavState | undefined): string {
  const stack = appStack(root);
  if (!stack?.routes) {
    return 'state stack=(なし)';
  }
  const names = stack.routes.map((route) => route.name ?? '?').join(',');
  const tabs = stack.routes.find((route) => route.name === '(tabs)');
  const tabState = tabs?.state;
  const tabIndex = tabState?.index;
  const focused =
    tabState?.routes && typeof tabIndex === 'number' ? tabState.routes[tabIndex] : undefined;
  const people = tabState?.routes?.find((route) => route.name === 'people');
  return `state stackIndex=${field(stack.index)} routes=[${names}] tabsIndex=${field(tabIndex)} focus=${field(focused?.name)} peopleKey=${field(people?.key)}`;
}

function logState(root: NavState | undefined): void {
  const line = summarizeState(root);
  if (line === lastStateLine) {
    return;
  }
  lastStateLine = line;
  pushLine(line);
}

function NavDiagPanel() {
  const navigation = useNavigationContainerRef() as unknown as ContainerRef;
  const [open, setOpen] = useState(false);
  const [, setRevision] = useState(0);
  const [copyNote, setCopyNote] = useState('');

  useEffect(() => {
    const onLines = () => setRevision((current) => current + 1);
    lineListeners.add(onLines);
    pushLine('diag on');
    return () => {
      lineListeners.delete(onLines);
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      pushLine(`appstate ${nextState}`);
      if (nextState !== 'active') {
        return;
      }
      windowUntil = Date.now() + ACTIVE_WINDOW_MS;
      pushLine('window start');
      logState(navigation.getRootState());
    });
    return () => subscription.remove();
  }, [navigation]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      pushLine(`url ${event.url}`);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const unlistenAction = navigation.addListener('__unsafe_action__', (event) => {
      if (!inActiveWindow()) {
        return;
      }
      const action = event.data?.action;
      if (!action) {
        pushLine('action (なし)');
        return;
      }
      pushLine(summarizeAction(action, event.data?.noop));
    });
    const unlistenState = navigation.addListener('state', () => {
      if (!inActiveWindow()) {
        return;
      }
      logState(navigation.getRootState());
    });
    return () => {
      unlistenAction();
      unlistenState();
    };
  }, [navigation]);

  const copyLog = () => {
    void Clipboard.setStringAsync(logText()).then(
      () => setCopyNote('コピーしました'),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setCopyNote(`コピー失敗 ${message}`);
      }
    );
  };

  const shareLog = () => {
    void (async () => {
      const uri = logFileUri();
      if (!uri) {
        setCopyNote('共有失敗 cache なし');
        return;
      }
      try {
        await FileSystem.writeAsStringAsync(uri, logText());
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          setCopyNote('共有は使えません');
          return;
        }
        await Sharing.shareAsync(uri, { mimeType: 'text/plain', UTI: 'public.plain-text' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setCopyNote(`共有失敗 ${message}`);
      }
    })();
  };

  return (
    <>
      <Pressable
        style={styles.button}
        onPress={() => {
          setCopyNote('');
          setOpen(true);
        }}
        accessibilityLabel="診断ログ"
      >
        <Text style={styles.buttonText}>ログ</Text>
      </Pressable>
      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>診断ログ</Text>
            <ScrollView style={styles.scroll}>
              <Text style={styles.body} selectable>
                {logText()}
              </Text>
            </ScrollView>
            {copyNote ? <Text style={styles.note}>{copyNote}</Text> : null}
            <View style={styles.row}>
              <Pressable style={styles.action} onPress={copyLog} accessibilityLabel="診断ログをコピー">
                <Text style={styles.actionText}>コピー</Text>
              </Pressable>
              <Pressable style={styles.action} onPress={shareLog} accessibilityLabel="診断ログを共有">
                <Text style={styles.actionText}>共有</Text>
              </Pressable>
              <Pressable style={styles.action} onPress={() => setOpen(false)} accessibilityLabel="診断ログを閉じる">
                <Text style={styles.actionText}>閉じる</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function NavDiagHost() {
  if (!ENABLED) {
    return null;
  }
  return <NavDiagPanel />;
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    left: 6,
    top: '46%',
    zIndex: 50,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(20, 20, 20, 0.72)',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    maxHeight: '80%',
    borderRadius: 12,
    backgroundColor: '#111111',
    padding: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  scroll: {
    maxHeight: 420,
  },
  body: {
    color: '#e8e8e8',
    fontSize: 12,
    lineHeight: 18,
  },
  note: {
    color: '#f5d76e',
    fontSize: 12,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
  },
  actionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
