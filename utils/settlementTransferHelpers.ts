import type { SettlementTransfer } from '@/types/settlement';

export function buildSettlementTransferKey(
  roomId: string,
  transfer: Pick<SettlementTransfer, 'fromMemberId' | 'toMemberId' | 'amount'>
): string {
  return `${roomId}|${transfer.fromMemberId}|${transfer.toMemberId}|${transfer.amount}`;
}

export function parseSettlementTransferKey(key: string): {
  roomId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
} | null {
  const parts = key.split('|');
  if (parts.length < 4) {
    return null;
  }
  const roomId = parts[0]?.trim() ?? '';
  const fromMemberId = parts[1]?.trim() ?? '';
  const toMemberId = parts[2]?.trim() ?? '';
  const amount = Number(parts[3]);
  if (!roomId || !fromMemberId || !toMemberId || !Number.isInteger(amount) || amount <= 0) {
    return null;
  }
  return { roomId, fromMemberId, toMemberId, amount };
}

/** 同じ相手・同じ金額の未済行が済の行と重ならないようにする。 */
export function allocateSettlementTransferKey(
  roomId: string,
  transfer: Pick<SettlementTransfer, 'fromMemberId' | 'toMemberId' | 'amount'>,
  usedKeys: Set<string>
): string {
  const base = buildSettlementTransferKey(roomId, transfer);
  if (!usedKeys.has(base)) {
    usedKeys.add(base);
    return base;
  }
  let suffix = 2;
  let key = `${base}|${suffix}`;
  while (usedKeys.has(key)) {
    suffix += 1;
    key = `${base}|${suffix}`;
  }
  usedKeys.add(key);
  return key;
}

export function parseSettlementRoomIdFromTransferKey(key: string): string | null {
  const roomId = key.split('|')[0]?.trim() ?? '';
  return roomId.length > 0 ? roomId : null;
}

export function parseSettlementFromMemberIdFromTransferKey(key: string): string | null {
  const fromMemberId = key.split('|')[1]?.trim() ?? '';
  return fromMemberId.length > 0 ? fromMemberId : null;
}

export type SettlementTransferDisplay = SettlementTransfer & {
  key: string;
  fromName: string;
  toName: string;
  incomingFromPeer?: boolean;
};

export function buildSettlementTransferDisplays(
  roomId: string,
  transfers: SettlementTransfer[],
  nameByMemberId: Map<string, string>
): SettlementTransferDisplay[] {
  return transfers.map((transfer) => ({
    ...transfer,
    key: buildSettlementTransferKey(roomId, transfer),
    fromName: nameByMemberId.get(transfer.fromMemberId) ?? '?',
    toName: nameByMemberId.get(transfer.toMemberId) ?? '?',
  }));
}
