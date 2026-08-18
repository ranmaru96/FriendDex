import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
};

type SharedHeaderChromeContextValue = {
  detailHeader: SharedDetailHeaderConfig | null;
  setDetailHeader: (config: SharedDetailHeaderConfig | null) => void;
  subToolHeader: SharedSubToolHeaderConfig | null;
  setSubToolHeader: (config: SharedSubToolHeaderConfig | null) => void;
  /** 入力フォーム表示中など、パスに関係なくボトムナビを隠す */
  suppressBottomNav: boolean;
  setSuppressBottomNav: (hide: boolean) => void;
};

const SharedHeaderChromeContext = createContext<SharedHeaderChromeContextValue | null>(null);

export function SharedHeaderChromeProvider({ children }: { children: ReactNode }) {
  const [detailHeader, setDetailHeaderState] = useState<SharedDetailHeaderConfig | null>(null);
  const [subToolHeader, setSubToolHeaderState] = useState<SharedSubToolHeaderConfig | null>(null);
  const [suppressBottomNav, setSuppressBottomNavState] = useState(false);

  const setDetailHeader = useCallback((config: SharedDetailHeaderConfig | null) => {
    setDetailHeaderState(config);
  }, []);

  const setSubToolHeader = useCallback((config: SharedSubToolHeaderConfig | null) => {
    setSubToolHeaderState(config);
  }, []);

  const setSuppressBottomNav = useCallback((hide: boolean) => {
    setSuppressBottomNavState(hide);
  }, []);

  const value = useMemo(
    () => ({
      detailHeader,
      setDetailHeader,
      subToolHeader,
      setSubToolHeader,
      suppressBottomNav,
      setSuppressBottomNav,
    }),
    [
      detailHeader,
      setDetailHeader,
      subToolHeader,
      setSubToolHeader,
      suppressBottomNav,
      setSuppressBottomNav,
    ]
  );

  return (
    <SharedHeaderChromeContext.Provider value={value}>{children}</SharedHeaderChromeContext.Provider>
  );
}

export function useSharedHeaderChrome(): SharedHeaderChromeContextValue {
  const ctx = useContext(SharedHeaderChromeContext);
  if (!ctx) {
    throw new Error('useSharedHeaderChrome must be used within SharedHeaderChromeProvider');
  }
  return ctx;
}

export function useSharedHeaderChromeOptional(): SharedHeaderChromeContextValue | null {
  return useContext(SharedHeaderChromeContext);
}
