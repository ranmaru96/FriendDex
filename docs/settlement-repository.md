# Phase 0〜1: Repository / Settlement 骨格

FriendDex サーバ化（最終 B: 共同編集）に向けたクライアント側の下地。
**既存画面はまだ `db.ts` 直参照のまま**。新機能・移行時に Repository 経由へ寄せる。

## 構成

```
types/
  sync.ts          … 同期メタデータ・Repository エラー
  settlement.ts    … 精算ルーム（Phase 1 サーバ対象）
  identity.ts        … アカウント（Phase 2 用スタブ）

constants/
  settlementConfig.ts … remoteSettlementEnabled / API URL

repositories/
  types.ts                    … IMoneyLoanRepository
  local/moneyLoanRepository.ts … db.ts ラップ（Phase 0）
  local/friendRepository.ts    … Friend 参照（メンバー紐付け用）
  remote/settlementApiClient.ts … API 契約・fetch クライアント
  remote/settlementRepository.ts … リモート実装 + Stub
  index.ts                    … getRepositories()

utils/
  settlementEngine.ts   … ネット残高・精算案（pure function）
  settlementMigration.ts … 旧 MoneyLoan → Settlement 対応表
```

## Phase 0（今）

```ts
import { getRepositories } from '@/repositories';

const { moneyLoan } = getRepositories();
const sessions = moneyLoan.listSessions();
```

- お金貸し借り画面は従来どおり `db.ts` でも可
- `LocalMoneyLoanRepository` が同じ API を提供

## Phase 1（精算ルーム API 接続時）

1. `constants/settlementConfig.ts` を更新:

```ts
remoteSettlementEnabled: true,
settlementApiBaseUrl: 'https://api.example.com',
```

2. 利用:

```ts
const { settlement } = getRepositories({ getAccessToken: () => token });
const room = await settlement.createRoom({
  title: '北海道旅行',
  ownerDisplayName: '自分',
  ownerLocalFriendId: myselfId,
});
const balances = await settlement.getMemberBalances(room.id);
const transfers = await settlement.getSettlementTransfers(room.id);
```

## API エンドポイント（サーバ実装参照）

`repositories/remote/settlementApiClient.ts` の `settlementApiRoutes` を参照。

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/v1/settlement/rooms` | ルーム一覧 |
| POST | `/api/v1/settlement/rooms` | ルーム作成 |
| POST | `/api/v1/settlement/rooms/join` | 招待参加 |
| GET | `/api/v1/settlement/rooms/:id/expenses` | 支出一覧 |
| POST | `/api/v1/settlement/rooms/:id/expenses` | 支出登録 |
| GET | `/api/v1/settlement/rooms/:id/balances` | ネット残高 |
| GET | `/api/v1/settlement/rooms/:id/transfers` | 精算案 |

## データ境界

| 載せる（Phase 1） | 載せない（当面ローカル） |
|-------------------|--------------------------|
| ルーム・支出・金額 | Detail / 習性 / 彼曰く |
| メンバー displayName | 非公開プロフィール |
| userId（任意） | 写真・カレンダー |

## 精算エンジン

`utils/settlementEngine.ts` はサーバ・クライアント共通で使える pure function。
リモート API が balances/transfers を返さない場合、RemoteSettlementRepository がクライアント側で計算する。
