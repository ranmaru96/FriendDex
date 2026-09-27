import { adoptAuthUserOnThisDevice } from '@/lib/deviceAuthBind';
import { upsertMyselfIdentityProfile } from '@/lib/identityProfileSync';
import {
  restoreOwnedPersonEpisodeCalendar,
  type OwnedRestoreResult,
} from '@/lib/ownedDataRestore';
import { syncAllOwnedEpisodes } from '@/lib/ownedEpisodeSync';
import { syncAllOwnedEvents } from '@/lib/ownedEventSync';
import { syncAllOwnedMoneyLoans } from '@/lib/ownedMoneyLoanSync';
import { syncAllOwnedPersonCards } from '@/lib/ownedPersonCardSync';
import { syncAllOwnedSettlementRooms } from '@/lib/ownedSettlementSync';
import { pullSharedMoneyLoans } from '@/lib/sharedMoneyLoanSync';
import { pullSharedSettlementRooms } from '@/lib/sharedSettlementSync';
import { getSupabaseSession } from '@/lib/supabase';

export type OwnedLoginSideEffects = {
  restore: OwnedRestoreResult | null;
  syncError: string | null;
  rejected: boolean;
};

/** ログイン／新規登録後。空端末は先に書き戻してから送る。 */
export async function runOwnedLoginSideEffects(
  mode: 'signin' | 'signup'
): Promise<OwnedLoginSideEffects> {
  const session = await getSupabaseSession();
  const adopted = await adoptAuthUserOnThisDevice(session?.user.id ?? '');
  if (!adopted.ok) {
    return { restore: null, syncError: adopted.errorMessage, rejected: true };
  }
  const restore = mode === 'signin' ? await restoreOwnedPersonEpisodeCalendar() : null;
  const sharedLoans = await pullSharedMoneyLoans();
  const sharedRooms = await pullSharedSettlementRooms();
  const sync = await upsertMyselfIdentityProfile();
  const owned = await syncAllOwnedPersonCards();
  const events = await syncAllOwnedEvents();
  const episodes = await syncAllOwnedEpisodes();
  const moneyLoans = await syncAllOwnedMoneyLoans();
  const settlement = await syncAllOwnedSettlementRooms();
  const syncError =
    sharedLoans.errorMessage ??
    sharedRooms.errorMessage ??
    sync.errorMessage ??
    owned.errorMessage ??
    events.errorMessage ??
    episodes.errorMessage ??
    moneyLoans.errorMessage ??
    settlement.errorMessage;
  return { restore, syncError, rejected: false };
}
