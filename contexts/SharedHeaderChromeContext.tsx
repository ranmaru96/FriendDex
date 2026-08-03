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

type SharedHeaderChromeContextValue = {
  detailHeader: SharedDetailHeaderConfig | null;
  setDetailHeader: (config: SharedDetailHeaderConfig | null) => void;
};

const SharedHeaderChromeContext = createContext<SharedHeaderChromeContextValue | null>(null);

export function SharedHeaderChromeProvider({ children }: { children: ReactNode }) {
  const [detailHeader, setDetailHeaderState] = useState<SharedDetailHeaderConfig | null>(null);

  const setDetailHeader = useCallback((config: SharedDetailHeaderConfig | null) => {
    setDetailHeaderState(config);
  }, []);

  const value = useMemo(
    () => ({
      detailHeader,
      setDetailHeader,
    }),
    [detailHeader, setDetailHeader]
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
