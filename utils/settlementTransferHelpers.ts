import type { SettlementTransfer } from '@/types/settlement';

export function buildSettlementTransferKey(
  roomId: string,
  transfer: Pick<SettlementTransfer, 'fromMemberId' | 'toMemberId' | 'amount'>
): string {
  return `${roomId}|${transfer.fromMemberId}|${transfer.toMemberId}|${transfer.amount}`;
}

export type SettlementTransferDisplay = SettlementTransfer & {
  key: string;
  fromName: string;
  toName: string;
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
