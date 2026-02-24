# 現行実装に影響を与えない拡張プラン

あすけん・Strong 以外のデータソースや複数ユーザーに対応するための**追加のみ**の拡張。既存の動作・API・データは変えない。

---

## 1. 拡張できる機能一覧

| # | 拡張内容 | やること | 既存への影響 |
|---|----------|----------|--------------|
| 1 | **データの所有者（ownerId）** | DailyData / AiEvaluation / SyncLog に `ownerId String?` を追加。既存行は null のまま＝「default」として扱う。読み書きは今まで通り（ownerId を付けない）。 | なし。クエリは変更しない。 |
| 2 | **連携ソースの登録** | 新テーブル `Integration`（userId, sourceType, config）を追加。どのユーザーがどのソース（asken / strong / 他）を使うか将来格納するだけ。現状は未使用。 | なし。 |
| 3 | **データソースの抽象化** | 栄養・トレーニング取得を「プロバイダー interface」で表現。syncData はその interface を呼ぶだけにし、中身は既存のあすけん・Strong のまま。 | なし。振る舞いは同一。 |
| 4 | **認証情報の取得方法** | `getAskenCredentials(userId?)` のようなヘルパーを用意。現状は userId が default のときだけ env から読む。将来は DB から読むように差し替え可能。 | なし。sync は今まで通り env を参照。 |
| 5 | **利用可能ソースの一覧 API** | GET /api/integrations/sources で「あすけん」「Strong」などを返す。フロントは未使用でもよい。他アプリ対応時に「どのソースを選べるか」の土台。 | なし。新規エンドポイントのみ。 |

---

## 2. 実装方針（既存に影響を出さないため）

- **スキーマ**: 追加するカラムはすべて **nullable** または **default 付き**。既存レコードはマイグレーションでそのまま。
- **クエリ**: 既存の `findMany` / `findUnique` / `upsert` には **ownerId 条件を付けない**。ownerId は「将来のユーザー分離用」としてスキーマに用意するだけ。
- **syncData**: 内部を「プロバイダー呼び出し」にリファクタするが、**入出力・処理内容は現状と同じ**。
- **API**: 既存エンドポイントのリクエスト/レスポンスは変更しない。新規 API は追加するだけ。

---

## 3. スキーマ変更案

```prisma
// DailyData: 将来のユーザー分離用。null = default ユーザー。
ownerId  String?  // 追加。既存は null。index のみ追加。

// AiEvaluation
ownerId  String?  // 同上。

// SyncLog: 現状 id=1 の1件のみ。将来はユーザーごとにレコードを持つ想定。
ownerId  String?  // 追加。既存は null。

// 新規: ユーザーがどのデータソースを利用するかの登録用（未使用）
model Integration {
  id         String   @id @default(cuid())
  userId     String
  sourceType String   // "asken" | "strong" | "manual" | 将来の "myfitnesspal" など
  config     Json?    // 認証情報は別途暗号化等を検討
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@unique([userId, sourceType])
  @@index([userId])
}
```

---

## 4. データソース抽象レイヤー（型のみ・挙動は既存のまま）

- **栄養データ**: `INutritionSource.fetchForDate(date: string)` → 既存のあすけんスクレイピング結果と同じ型。
- **トレーニングデータ**: `ITrainingSource.fetchForDateRange(dates: string[])` → 既存の Strong パース結果と同じ型（Map<date, StrongDayData>）。
- syncData は「あすけんプロバイダー」「Strong プロバイダー」を呼び、結果を今まで通り DailyData に upsert する。

---

## 5. 認証情報ヘルパー

- `getAskenCredentials(userId?: string): Promise<{ email: string; password: string } | null>`
  - 現状: `userId` が未指定または `"default"` のとき、`process.env.ASKEN_EMAIL` / `ASKEN_PASSWORD` を返す。それ以外は null。
  - 将来: Integration や暗号化ストアから取得するように差し替え。

---

## 6. 実装後の状態

- 既存: 同期・履歴・ダッシュボード・AI 評価は**すべてこれまで通り**。
- 追加されているだけのもの:
  - DB の nullable `ownerId` と `Integration` テーブル
  - データソースの interface と既存処理のラップ
  - 認証情報取得のヘルパー
  - （任意）GET /api/integrations/sources

複数ユーザーや他アプリ対応するときは、この土台の上で「ownerId を付けて書き込む」「ownerId でフィルタして読む」「Integration から認証を読む」を有効にしていく。

---

## 7. 実装済み（対応日）

| 項目 | 対応内容 |
|------|----------|
| スキーマ | DailyData / AiEvaluation / SyncLog に `ownerId String?` 追加。`Integration` テーブル追加。マイグレーション `add_owner_id_and_integration` 適用済み。 |
| データソース抽象 | `src/lib/sources/types.ts`（型・interface）、`asken.ts`（fetchNutritionForDate）、`strong.ts`（fetchTrainingForDateRange, parseTxtContent, buildStrongData, parseStrongFiles）。 |
| 認証ヘルパー | `src/lib/sources/credentials.ts` の `getAskenCredentials(userId?)`。現状は default のみ env から取得。 |
| 同期 | `syncData.ts` は `sources/asken` と `sources/strong` を呼ぶ形にリファクタ。`parseTxtContent` / `buildStrongData` / `parseStrongFiles` は syncData から re-export して既存 API は変更なし。 |
| API | GET `/api/integrations/sources` で利用可能ソース一覧（あすけん・Strong）を返す。 |
