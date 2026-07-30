/**
 * Phase 0〜1: 精算ルームのデータソース切替。
 * Phase 0 では常に local。Phase 1 で remoteSettlementEnabled を true にし API URL を設定。
 */
export const settlementConfig = {
  /** true のとき SettlementRepository はリモート実装を使う */
  remoteSettlementEnabled: false,
  /** Phase 1 API ベース URL（例: https://api.example.com） */
  settlementApiBaseUrl: '',
  /** リモート未実装時にローカル MoneyLoan へフォールバックするか */
  fallbackToLocalMoneyLoan: true,
} as const;
