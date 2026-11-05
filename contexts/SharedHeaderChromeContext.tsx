import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type SharedDetailHeaderConfig = {
  onBack: () => void;
  prevEnabled: boolean;
  nextEnabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  activeIconColor: string;
  mutedIconColor: string;
};

export type SharedSubToolHeaderConfig = {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
  titleTrailing?: ReactNode;
  titleFramed?: boolean;
};

export type SharedHeaderChromeActions = {
  setDetailHeader: (config: SharedDetailHeaderConfig | null) => void;
  upsertSubToolHeader: (id: string, config: SharedSubToolHeaderConfig) => void;
  removeSubToolHeader: (id: string) => void;
  setSuppressBottomNav: (hide: boolean) => void;
  /** フォーム自身のバーを出しているあいだ、シェルヘッダーを隠す。重ねがけ可 */
  holdShellHeaderHidden: () => void;
  releaseShellHeaderHidden: () => void;
  /** 画面内のカードモーダル中、シェルのヘッダーと下部ナビをぼかして押せなくする。重ねがけ可 */
  holdShellChromeBlur: () => void;
  releaseShellChromeBlur: () => void;
};

type SubToolHeaderStackEntry = {
  id: string;
  config: SharedSubToolHeaderConfig;
};

type SharedHeaderChromeContextValue = SharedHeaderChromeActions & {
  detailHeader: SharedDetailHeaderConfig | null;
  subToolHeader: SharedSubToolHeaderConfig | null;
  suppressBottomNav: boolean;
};

/** Setters only — header state updates must not re-render screens. */
const SharedHeaderActionsContext = createContext<SharedHeaderChromeActions | null>(null);
const DetailHeaderStateContext = createContext<SharedDetailHeaderConfig | null>(null);
const SubToolHeaderStateContext = createContext<SharedSubToolHeaderConfig | null>(null);
const SuppressBottomNavContext = createContext(false);
const ShellHeaderHiddenContext = createContext(false);
const ShellChromeBlurContext = createContext(false);

function sameDetailHeader(
  current: SharedDetailHeaderConfig,
  next: SharedDetailHeaderConfig
): boolean {
  return (
    current.prevEnabled === next.prevEnabled &&
    current.nextEnabled === next.nextEnabled &&
    current.activeIconColor === next.activeIconColor &&
    current.mutedIconColor === next.mutedIconColor &&
    current.onBack === next.onBack &&
    current.onPrev === next.onPrev &&
    current.onNext === next.onNext
  );
}

function sameSubToolHeader(
  current: SharedSubToolHeaderConfig,
  next: SharedSubToolHeaderConfig
): boolean {
  return (
    current.title === next.title &&
    current.titleFramed === next.titleFramed &&
    current.right === next.right &&
    current.titleTrailing === next.titleTrailing &&
    current.onBack === next.onBack
  );
}

function topSubToolHeader(
  stack: SubToolHeaderStackEntry[]
): SharedSubToolHeaderConfig | null {
  return stack.length > 0 ? stack[stack.length - 1].config : null;
}

export function SharedHeaderChromeProvider({ children }: { children: ReactNode }) {
  const [detailHeader, setDetailHeaderState] = useState<SharedDetailHeaderConfig | null>(null);
  const [subToolHeaderStack, setSubToolHeaderStack] = useState<SubToolHeaderStackEntry[]>([]);
  const [suppressBottomNav, setSuppressBottomNavState] = useState(false);
  const [shellHeaderHidden, setShellHeaderHidden] = useState(false);
  const [shellChromeBlur, setShellChromeBlur] = useState(false);
  const shellHeaderHolds = useRef(0);
  const shellChromeBlurHolds = useRef(0);
  const subToolHeader = topSubToolHeader(subToolHeaderStack);

  const setDetailHeader = useCallback((config: SharedDetailHeaderConfig | null) => {
    setDetailHeaderState((current) => {
      if (current === config) {
        return current;
      }
      if (current == null || config == null) {
        return config;
      }
      return sameDetailHeader(current, config) ? current : config;
    });
  }, []);

  const upsertSubToolHeader = useCallback((id: string, config: SharedSubToolHeaderConfig) => {
    setSubToolHeaderStack((current) => {
      const index = current.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        if (sameSubToolHeader(current[index].config, config)) {
          return current;
        }
        const next = current.slice();
        next[index] = { id, config };
        return next;
      }
      return [...current, { id, config }];
    });
  }, []);

  const removeSubToolHeader = useCallback((id: string) => {
    setSubToolHeaderStack((current) => {
      if (!current.some((entry) => entry.id === id)) {
        return current;
      }
      return current.filter((entry) => entry.id !== id);
    });
  }, []);

  const setSuppressBottomNav = useCallback((hide: boolean) => {
    setSuppressBottomNavState((current) => (current === hide ? current : hide));
  }, []);

  const holdShellHeaderHidden = useCallback(() => {
    shellHeaderHolds.current += 1;
    setShellHeaderHidden(true);
  }, []);

  const releaseShellHeaderHidden = useCallback(() => {
    shellHeaderHolds.current = Math.max(0, shellHeaderHolds.current - 1);
    if (shellHeaderHolds.current === 0) {
      setShellHeaderHidden(false);
    }
  }, []);

  const holdShellChromeBlur = useCallback(() => {
    shellChromeBlurHolds.current += 1;
    setShellChromeBlur(true);
  }, []);

  const releaseShellChromeBlur = useCallback(() => {
    shellChromeBlurHolds.current = Math.max(0, shellChromeBlurHolds.current - 1);
    if (shellChromeBlurHolds.current === 0) {
      setShellChromeBlur(false);
    }
  }, []);

  const actions = useMemo(
    () => ({
      setDetailHeader,
      upsertSubToolHeader,
      removeSubToolHeader,
      setSuppressBottomNav,
      holdShellHeaderHidden,
      releaseShellHeaderHidden,
      holdShellChromeBlur,
      releaseShellChromeBlur,
    }),
    [
      setDetailHeader,
      upsertSubToolHeader,
      removeSubToolHeader,
      setSuppressBottomNav,
      holdShellHeaderHidden,
      releaseShellHeaderHidden,
      holdShellChromeBlur,
      releaseShellChromeBlur,
    ]
  );

  return (
    <SharedHeaderActionsContext.Provider value={actions}>
      <SuppressBottomNavContext.Provider value={suppressBottomNav}>
        <ShellHeaderHiddenContext.Provider value={shellHeaderHidden}>
          <ShellChromeBlurContext.Provider value={shellChromeBlur}>
            <DetailHeaderStateContext.Provider value={detailHeader}>
              <SubToolHeaderStateContext.Provider value={subToolHeader}>
                {children}
              </SubToolHeaderStateContext.Provider>
            </DetailHeaderStateContext.Provider>
          </ShellChromeBlurContext.Provider>
        </ShellHeaderHiddenContext.Provider>
      </SuppressBottomNavContext.Provider>
    </SharedHeaderActionsContext.Provider>
  );
}

export function useSharedHeaderChrome(): SharedHeaderChromeContextValue {
  const actions = useContext(SharedHeaderActionsContext);
  const detailHeader = useContext(DetailHeaderStateContext);
  const subToolHeader = useContext(SubToolHeaderStateContext);
  const suppressBottomNav = useContext(SuppressBottomNavContext);
  if (!actions) {
    throw new Error('useSharedHeaderChrome must be used within SharedHeaderChromeProvider');
  }
  return {
    ...actions,
    detailHeader,
    subToolHeader,
    suppressBottomNav,
  };
}

/** Setters only. Safe for screens — does not subscribe to header contents. */
export function useSharedHeaderChromeOptional(): SharedHeaderChromeActions | null {
  return useContext(SharedHeaderActionsContext);
}

export function useSharedHeaderVisuals(): {
  detailHeader: SharedDetailHeaderConfig | null;
  subToolHeader: SharedSubToolHeaderConfig | null;
} {
  return {
    detailHeader: useContext(DetailHeaderStateContext),
    subToolHeader: useContext(SubToolHeaderStateContext),
  };
}

export function useSuppressBottomNav(): boolean {
  return useContext(SuppressBottomNavContext);
}

export function useShellHeaderHidden(): boolean {
  return useContext(ShellHeaderHiddenContext);
}

export function useShellChromeBlur(): boolean {
  return useContext(ShellChromeBlurContext);
}
