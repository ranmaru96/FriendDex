import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { listConnections } from '@/lib/connectionSync';
import { asAuthUserId } from '@/utils/linkedAuthUser';

const REFRESH_INTERVAL_MS = 60_000;

/** ヘッダーバッジ用。届いた許可（pending & 相手起点）の件数。 */
export function useIncomingFollowCount(): number {
  const { session, ready } = useAuthSession();
  const myUserId = asAuthUserId(session?.user.id)?.toLowerCase() ?? '';
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!myUserId) {
      setCount(0);
      return;
    }
    const result = await listConnections();
    if (result.errorMessage || result.skipped) {
      return;
    }
    const incoming = result.rows.filter(
      (row) => row.status === 'pending' && row.requestedBy !== myUserId
    ).length;
    setCount(incoming);
  }, [myUserId]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    void refresh();
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
      }
    });
    const timer = myUserId
      ? setInterval(() => {
          void refresh();
        }, REFRESH_INTERVAL_MS)
      : null;
    return () => {
      appSub.remove();
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [myUserId, ready, refresh]);

  return count;
}
