import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { identitiesRequireEmailMigration } from '@/lib/emailAccountLink';
import { getSupabaseClient } from '@/lib/supabase';

type MigrationPhase = 'checking' | 'required' | 'clear';

const phaseFromServer = async (): Promise<MigrationPhase> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return 'clear';
  }
  const listed = await supabase.auth.getUserIdentities();
  if (listed.error || !listed.data) {
    return 'clear';
  }
  return identitiesRequireEmailMigration(listed.data.identities) ? 'required' : 'clear';
};

export function useEmailAccountMigration(session: Session | null, paused: boolean) {
  const userId = session?.user.id?.trim() ?? '';
  const [phase, setPhase] = useState<MigrationPhase>('checking');
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const request = requestId.current + 1;
    requestId.current = request;
    if (!userId) {
      setPhase('clear');
      return;
    }
    try {
      const next = await phaseFromServer();
      if (requestId.current === request) {
        setPhase(next);
      }
    } catch {
      if (requestId.current === request) {
        setPhase('clear');
      }
    }
  }, [userId]);

  useEffect(() => {
    if (paused) {
      return;
    }
    void refresh();
  }, [paused, refresh]);

  const visible = !paused && phase === 'required';

  return {
    visible,
    checking: false,
    refresh,
  };
}
