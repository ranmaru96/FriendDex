import type { SettlementTransfer } from '@/types/settlement';

export function buildSettlementTransferKey(
  roomId: string,
  transfer: Pick<SettlementTransfer, 'fromMemberId' | 'toMemberId' | 'amount'>
): string {
  return `${roomId}|${transfer.fromMemberId}|${transfer.toMemberId}|${transfer.amount}`;
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
