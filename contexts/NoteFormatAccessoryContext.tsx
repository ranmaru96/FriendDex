import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  NOTE_FORMAT_TOOLBAR_HEIGHT,
  NoteFormatToolbar,
} from '@/components/ui/NoteFormatToolbar';
import { useKeyboardBottomInset } from '@/utils/useKeyboardBottomInset';
import type { NoteBlockKind } from '@/utils/noteBlocks';

export type NoteFormatAccessorySession = {
  id: string;
  activeKind?: NoteBlockKind;
  applyKind: (kind: NoteBlockKind) => void;
};

type NoteFormatAccessoryContextValue = {
  session: NoteFormatAccessorySession | null;
  present: (session: NoteFormatAccessorySession) => void;
  release: (id: string) => void;
  /** キーボード直上バーの分だけ本文を上げる */
  bottomPad: number;
};

const NoteFormatAccessoryContext = createContext<NoteFormatAccessoryContextValue | null>(null);

export function NoteFormatAccessoryProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<NoteFormatAccessorySession | null>(null);
  const keyboardInset = useKeyboardBottomInset();
  const showOverlay = Platform.OS !== 'web' && session != null && keyboardInset > 0;
  const applyKindRef = useRef<NoteFormatAccessorySession['applyKind']>(() => undefined);
  const stableApplyKind = useCallback((kind: NoteBlockKind) => {
    applyKindRef.current(kind);
  }, []);

  const present = useCallback(
    (next: NoteFormatAccessorySession) => {
      applyKindRef.current = next.applyKind;
      setSession((current) => {
        if (current?.id === next.id && current?.activeKind === next.activeKind) {
          return current;
        }
        return {
          id: next.id,
          activeKind: next.activeKind,
          applyKind: stableApplyKind,
        };
      });
    },
    [stableApplyKind]
  );

  const release = useCallback((id: string) => {
    setSession((current) => (current?.id === id ? null : current));
  }, []);

  const bottomPad = showOverlay ? NOTE_FORMAT_TOOLBAR_HEIGHT : 0;

  const value = useMemo(
    () => ({ session, present, release, bottomPad }),
    [session, present, release, bottomPad]
  );

  return (
    <NoteFormatAccessoryContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {showOverlay ? (
          <View pointerEvents="box-none" style={styles.host}>
            <View style={[styles.barWrap, { bottom: keyboardInset }]}>
              <NoteFormatToolbar activeKind={session.activeKind} onApplyKind={session.applyKind} />
            </View>
          </View>
        ) : null}
      </View>
    </NoteFormatAccessoryContext.Provider>
  );
}

export function useNoteFormatAccessory(): NoteFormatAccessoryContextValue | null {
  return useContext(NoteFormatAccessoryContext);
}

export function useNoteFormatAccessoryBottomPad(): number {
  return useContext(NoteFormatAccessoryContext)?.bottomPad ?? 0;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  host: {
    ...StyleSheet.absoluteFill,
    zIndex: 2000,
    elevation: 2000,
  },
  barWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
